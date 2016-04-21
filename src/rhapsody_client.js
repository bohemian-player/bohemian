'use strict';

import fetch from 'node-fetch';
import querystring from 'querystring';
import rtmpdump from 'rtmpdump';
import fs from 'fs';

const PREFERRED_FORMATS = ['aac plus', 'aac', 'mp3'];
const MIN_BUFFER_KB = 100;
const COBRAND = '40134';
const CATALOG = '101';
const CATALOG_STRING = 'US';
const LOCALE = 'en_US';
const RHAPSODY_SERVER = 'https://direct.rhapsody.com';
const JS_PATH = 'http://app.rhapsody.com/assets/webclient-cli.js';
const SWF_URL = 'http://app.rhapsody.com/player/WebclientPlayer.swf';
const SEARCH_URL = 'http://api.rhapsody.com/v1/search/typeahead';
const AUTH_URL = `${RHAPSODY_SERVER}/authserver/v3/useraccounts`;
const PLAYBACK_URL = `${RHAPSODY_SERVER}/playbackserver/v1/users`;
const ARTIST_TOP_URL = `${RHAPSODY_SERVER}/metadata/data/methods/getTopTracksForArtist.js`;
const BASIC_AUTH_REGEX = /Authorization['"]?:\s*["'](Basic [^"']+)["']/;
const NAPI_KEY_REGEX = /http:\/\/api\.rhapsody\.com[^\}]+NAPIKey["']?:\s*["']([^"']+)["']/;
const DEV_KEY_REGEX = /["']?devkey["']?:\s*["']([^"']+)["']/;
const RDS_DEV_KEY_REGEX = /['"]x\-rds\-devkey['"]:\s*['"]([^'"]+)['"]/;

export default class RhapsodyClient {
  constructor() {
    this.loggedIn = false;
  }

  checkLogin() {
    if (!this.loggedIn) throw new Error('Not logged in!');
  }

  doLogin(userName, password) {
    this.authInfo = {};
    this.clientKeys = {};

    if (userName === null || userName.length < 1 || password === null || password.length < 1) {
      return Promise.reject('You must supply a username and password');
    }

    return fetch(JS_PATH)
      .then((res) => (res.text()))
      .then((js) => {
        this.clientKeys = {
          basicAuth: js.match(BASIC_AUTH_REGEX)[1],
          napiKey: js.match(NAPI_KEY_REGEX)[1],
          devKey: js.match(DEV_KEY_REGEX)[1],
          rdsDevKey: js.match(RDS_DEV_KEY_REGEX)[1],
        };
      })
      .catch(() => {
        throw new Error('Unable to find client keys');
      })
      .then(() => fetch([AUTH_URL, querystring.stringify({ userName })].join('?'), {
        headers: {
          Accept: 'application/json',
          Authorization: this.clientKeys.basicAuth,
          'x-rds-cobrand': COBRAND,
          'x-rds-devkey': this.clientKeys.rdsDevKey,
          'x-rds-authentication': password,
        },
      }))
      .then((res) => res.json())
      .catch(() => { throw new Error('Invalid credentials'); })
      .then((json) => {
        if (!json || json.errors) throw new Error(json.errors[0].description);
        this.authInfo.auth = json;
        const headers = {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: this.clientKeys.basicAuth,
          'x-rds-devkey': this.clientKeys.rdsDevKey,
        };
        const body = JSON.stringify({ clientType: 'rhap-web' });

        return fetch(this.playbackSession({ create: true }), { headers, body, method: 'POST' })
          .then((res) => (res.json()))
          .then((sessionJson) => {
            if (!sessionJson.id) throw new Error('Unable to fetch session.');
            this.authInfo.session = sessionJson;
            this.authInfo.credentials = { username: userName, password };
            this.loggedIn = true;
            return this.authInfo;
          });
      });
  }

  search(type, q) {
    this.checkLogin();
    const headers = {
      Accept: 'application/json',
    };
    const query = querystring.stringify({
      type,
      q,
      limit: 48,
      offset: 0,
      catalog: CATALOG_STRING,
      apikey: this.clientKeys.napiKey,
    });
    return fetch([SEARCH_URL, query].join('?'), { headers })
      .then((res) => (res.json()));
  }

  getArtist(artistId) {
    this.checkLogin();
    const headers = {
      Accept: 'application/json',
    };
    const query = querystring.stringify({
      artistId,
      filterRightsKey: 2,
      start: 0,
      end: 50,
      developerKey: this.clientKeys.devKey,
      cobrandId: [COBRAND, CATALOG, LOCALE].join(':'),
    });
    return fetch([ARTIST_TOP_URL, query].join('?'), { headers })
      .then((res) => (res.json()))
      .then((json) => (json.tracks.map((t) => ({ id: t.trackId, name: t.name }))));
  }

  downloadTrack(trackId, destBase) {
    this.checkLogin();
    const headers = {
      Accept: 'application/json',
      Authorization: this.clientKeys.basicAuth,
      'x-rhapsody-access-token-v2': this.authInfo.auth.rhapsodyAccessToken,
      'x-rds-devkey': this.clientKeys.rdsDevKey,
    };
    const query = querystring.stringify({
      context: 'ON_DEMAND',
    });
    return fetch([this.playbackSession({ path: ['track', trackId] }), query].join('?'), { headers })
      .then((res) => (res.json()))
      .then((track) => {
        if (track.errors) {
          throw new Error(track.errors[0].description);
        } else if (!track.stationTrack || !track.stationTrack.medias) {
          throw new Error('Unable to load track!');
        }
        // Prefer higher bitrates, then look for preferred formats
        const selectedMedia = track.stationTrack.medias.sort((a, b) => {
          const bitrateDiff = parseInt(a.bitrate, 10) - parseInt(b.bitrate, 10);
          if (bitrateDiff === 0) {
            if (parseInt(a.bitrate, 10) === parseInt(b.bitrate, 10)) {
              if (PREFERRED_FORMATS.indexOf(a.format.toLowerCase()) < 0) return -1;
              if (PREFERRED_FORMATS.indexOf(b.format.toLowerCase()) < 0) return 1;
              if (PREFERRED_FORMATS.indexOf(a.format.toLowerCase()) <
                PREFERRED_FORMATS.indexOf(b.format.toLowerCase())) return 1;
              return -1;
            }
          }
          return bitrateDiff;
        }).reverse()[0];
        const locationComponents = selectedMedia.location.split('/');
        const extMatch = selectedMedia.location.match(/\.(\w{3,4})\?/);
        let ext = (extMatch && extMatch.length > 0) ? extMatch[1] : 'mp3';
        if (ext === 'm4a') ext = 'mp4';
        const destFile = [destBase, ext].join('.');

        return new Promise((success) => {
          const stream = rtmpdump.createStream({
            tcUrl: [locationComponents.slice(0, 5).join('/'), '/'].join(''),
            app: [locationComponents.slice(3, 5).join('/'), '/'].join(''),
            rtmp: selectedMedia.location,
            playpath: [ext, ':', locationComponents.slice(5).join('/')].join(''),
            swfVfy: SWF_URL,
            V: null,
          });

          stream.on('connected', () => {
            // We would pipe straight to mplayer, but we're using its stdin for control.
            // Also, saving to a local file may allow us to seek.
            stream.pipe(fs.createWriteStream(destFile));
          });

          let fulfilled = false;
          stream.on('progress', (kbytes) => {
            if (!fulfilled && kbytes >= MIN_BUFFER_KB) {
              fulfilled = true;
              success({ track, file: destFile });
            }
          });
          stream.on('error', () => {
            throw new Error('Encountered an error while attempting to download track.');
          });
        });
      });
  }

  playbackSession({ create = false, path = [] }) {
    const base = [PLAYBACK_URL, this.authInfo.auth.userId, 'sessions'].join('/');
    if (create) return base;
    this.checkLogin();
    return [base, this.authInfo.session.id, ...path].join('/');
  }

  logout() {
    this.loggedIn = false;
  }

}

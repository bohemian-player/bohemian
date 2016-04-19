'use strict';

import Mplayer from 'mplayer';
import EventEmitter from 'events';
import fsp from 'fs-promise';
import glob from 'glob-promise';
import path from 'path';

const TMP_DIR = path.resolve(__dirname, '..', 'tmp');
const TMP_BASE = path.resolve(TMP_DIR, 'tmptrack');

export default class Player extends EventEmitter {
  constructor(client) {
    super();
    this.playerStatus = {};
    this.client = client;
    this.player = new Mplayer();
    this.currentTime = 0;
    this.player.on('status', (status) => {
      this.playerStatus = status;
      this.emit('status', status);
    });
    this.player.on('stop', () => {
      this.emit('stop');
    });
    this.player.on('time', (time) => {
      this.currentTime = parseFloat(time);
    });
  }

  hasContent() {
    return !!(this.player && this.playerStatus.filename);
  }

  playPause() {
    if (this.hasContent()) {
      if (this.playerStatus.playing) {
        this.player.pause();
      } else {
        this.player.play();
      }
    }
  }

  playTrack(track) {
    return fsp.ensureDir(TMP_DIR)
      .then(this.client.downloadTrack(track, TMP_BASE)
      .then((info) => {
        this.player.openFile(info.file);
        this.player.play();
        return info;
      }));
  }

  seekRelative(seconds) {
    if (this.hasContent()) this.player.seek(this.currentTime + seconds);
  }

  cleanup() {
    // Clean up known tmp tracks, and remove tmp dir only if empty
    return glob(`${TMP_BASE}.*`)
      .then((tracks) => Promise.all(tracks.map((t) => fsp.unlink(t))))
      .then(() => fsp.rmdir(TMP_DIR))
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
}

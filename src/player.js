'use strict';

import Mplayer from 'mplayer';
import EventEmitter from 'events';
import fsp from 'fs-promise';
import glob from 'glob-promise';

const TMP_DIR = '.bohemian2/tmp';
const TMP_BASE_NAME = 'track';
const MAX_ATTEMPTS = 3;

export default class Player extends EventEmitter {
  constructor(client) {
    super();
    this.playerStatus = {};
    this.client = client;
    this.player = new Mplayer();
    this.currentTime = 0;
    this.isReady = false;
    this.tmpDir = [this.getUserHome(), TMP_DIR].join('/');
    this.tmpFileBase = [this.tmpDir, TMP_BASE_NAME].join('/');
    this.registerListeners();
  }

  registerListeners() {
    this.player.on('ready', () => {
      this.isReady = true;
    });
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

    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('uncaughtException', () => this.cleanup());
  }

  waitUntilReady() {
    return new Promise((success) => {
      if (this.isReady) return success(true);
      return setTimeout(() => this.waitUntilReady().then(() => success), 100);
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

  playTrack(track, attemptNumber = 0) {
    return this.cleanup()
      .then(() => fsp.ensureDir(this.tmpDir))
      .then(() => this.client.downloadTrack(track, this.tmpFileBase))
      .then((info) => this.waitUntilReady()
        .then(() => {
          this.player.openFile(info.file);
          this.player.play();
          return info;
        }))
      .catch((error) => {
        if (attemptNumber < MAX_ATTEMPTS) {
          process.stdout.write('Unable to load track. Trying again...\n');
          return new Promise((success, failure) => setTimeout(() =>
            this.playTrack(track, attemptNumber + 1).then(success, failure), 2000));
        }
        throw error;
      });
  }

  seekRelative(seconds) {
    if (this.hasContent()) this.player.seek(this.currentTime + seconds);
  }

  cleanup() {
    // Clean up known tmp tracks, and remove tmp dir only if empty
    return glob(`${this.tmpFileBase}.*`)
      .then((tracks) => Promise.all(tracks.map((t) => fsp.unlink(t))))
      .then(() => fsp.rmdir(this.tmpDir))
      .catch((error) => {
        if (error.code && ['ENOENT', 'ENOTEMPTY'].indexOf(error.code) < 0) throw error;
      });
  }

  getUserHome() {
    return process.env.HOME || process.env.USERPROFILE;
  }
}

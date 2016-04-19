'use strict';

import inquirer from 'inquirer';
import clear from 'clear';
import fsp from 'fs-promise';

const CONFIG_DIR = '.bohemian';
const CREDENTIALS_FILE = 'credentials';
const SEEK_AMOUNT = 5;

const LOGIN_QUESTIONS = [
  {
    type: 'input',
    name: 'username',
    message: 'Rhapsody username:',
  },
  {
    type: 'password',
    name: 'password',
    message: 'Rhapsody password:',
  },
];

const MAIN_QUESTION = {
  type: 'list',
  name: 'menuselect',
  message: 'What would you like to do?',
  choices: [
    { name: 'Search', value: 'search' },
    { name: 'Exit', value: 'quit' },
    { type: 'separator' },
    { name: 'Log out', value: 'logout' },
  ],
};

const SEARCH_QUESTIONS = [
  {
    type: 'input',
    name: 'artist',
    message: 'Artist:',
  },
  {
    type: 'input',
    name: 'track',
    message: 'Track:',
  },
];


export default class UI {
  constructor(client, player) {
    this.client = client;
    this.player = player;
    this.configDir = [this.getUserHome(), CONFIG_DIR].join('/');
    this.credentialsFile = [this.configDir, CREDENTIALS_FILE].join('/');
  }

  registerListeners() {
    process.stdin.on('keypress', (ch, key) => {
      if (key && key.ctrl && key.name === 'c') {
        return this.quit();
      }
      if (key && key.name === 'right') {
        this.player.seekRelative(SEEK_AMOUNT);
      }
      if (key && key.name === 'left') {
        this.player.seekRelative(-SEEK_AMOUNT);
      }
      return null;
    });
    process.stdin.setRawMode(true);
    process.stdin.resume();

    // this.player.on('status', (status) => {
    // });
    return null;
  }

  main() {
    let question = MAIN_QUESTION;
    if (this.player.hasContent()) {
      question = Object.assign({}, MAIN_QUESTION, {
        choices: [{ name: 'Play/Pause', value: 'playPause' }].concat(MAIN_QUESTION.choices),
      });
    }
    return inquirer.prompt([question]).then((answers) => this[answers.menuselect]());
  }

  showTrackList(tracks) {
    const choices = tracks.map((result) => ({
      name: `${result.name}${result.artist ? ` (${result.artist.name})` : ''}`,
      value: result.id,
    }));

    const questions = {
      choices,
      type: 'list',
      name: 'track',
      message: 'Which track:',
    };

    return inquirer.prompt(questions).then((answers) => this.playTrack(answers.track));
  }

  showArtistList(artists) {
    const choices = artists.map((result) => ({
      name: `${result.name} (${result.genre.name})`,
      value: result.id,
    }));

    const questions = {
      choices,
      type: 'list',
      name: 'artist',
      message: 'Which artist:',
    };

    return inquirer.prompt(questions).then((answers) => {
      process.stdout.write('Fetching songs for artist...\n');
      this.client.getArtist(answers.artist).then((results) => {
        clear();
        return this.showTrackList(results);
      });
    });
  }

  search() {
    return inquirer.prompt(SEARCH_QUESTIONS)
      .then((answers) => {
        if (answers.artist.length > 0 || answers.track.length > 0) {
          if (answers.track.length > 0) {
            return this.searchTrack(answers.artist, answers.track);
          }
          return this.searchArtist(answers.artist);
        }
        clear();
        process.stdout.write('Sorry - you need to enter an artist or track.\n');
        return this.main();
      });
  }

  searchTrack(artist, track) {
    const searchTerm =
      [artist, track].filter((t) => (t.length > 0)).join(' - ');
    return this.client.search('track', searchTerm).then((results) => {
      if (results.length <= 0) {
        clear();
        process.stdout.write('No matching tracks.\n');
        return this.main();
      }
      const normalizedArtistTerm = (artist && artist.length) > 0 ?
        artist.replace(/\s+/, ' ').toLowerCase() : null;
      const normalizedArtist = results.length > 0 ? results[0].artist.name.toLowerCase() : null;
      const normalizedTrackTerm = (track && track.length > 0) ?
        track.replace(/\s+/, ' ').toLowerCase() : null;
      const normalizedTrack = results.length > 0 ? results[0].name.toLowerCase() : null;
      if (normalizedTrack === normalizedTrackTerm
        && (!normalizedArtistTerm || (normalizedArtist === normalizedArtistTerm))) {
        return this.playTrack(results[0].id);
      }
      return this.showTrackList(results);
    });
  }

  searchArtist(artist) {
    if (!artist || artist.length <= 0) {
      clear();
      process.stdout.write('You must supply an artist name.\n');
      return this.main();
    }
    return this.client.search('artist', artist).then((results) => {
      if (results.length <= 0) {
        clear();
        process.stdout.write('No matching artists.\n');
        return this.main();
      }
      const normalizedArtistTerm = artist.replace(/\s+/, ' ').toLowerCase();
      const normalizedArtist = results.length > 0 ? results[0].name.toLowerCase() : '';
      if (normalizedArtist === normalizedArtistTerm) {
        return this.client.getArtist(results[0].id)
          .then((artistTracks) => {
            clear();
            return this.showTrackList(artistTracks);
          });
      }
      clear();
      return this.showArtistList(results);
    });
  }

  playTrack(trackId) {
    return this.player.playTrack(trackId)
      .then(() => {
        clear();
        process.stdout.write('Playing track...\n');
        return new Promise((success) => {
          setTimeout(() => success(this.main()), 2000);
        });
      });
  }

  playPause() {
    this.player.playPause();
    clear();
    return this.main();
  }

  getSavedCredentials() {
    return fsp.readJson(this.credentialsFile);
  }

  getUserHome() {
    return process.env.HOME || process.env.USERPROFILE;
  }

  startSession() {
    this.registerListeners();
    clear();
    return this.getSavedCredentials()
      .then(json => this.tryLogin(json),
        () => inquirer.prompt(LOGIN_QUESTIONS).then(answers => this.tryLogin(answers)))
      .catch(() => this.quit());
  }

  tryLogin({ username, password }) {
    clear();
    return this.client.doLogin(username, password)
      .then((authInfo) => (
        fsp.ensureDir(this.configDir)
          .then(() => fsp.writeJson(this.credentialsFile, authInfo.credentials))
          .then(() => this.main())
      ), (error) => {
        process.stdout.write(`Login failed: ${error}\n`);
        setTimeout(
          () => inquirer.prompt(LOGIN_QUESTIONS).then(answers => this.tryLogin(answers))
        , 1000);
      });
  }

  logout() {
    this.client.logout();
    clear();
    return fsp.unlink(this.credentialsFile)
      .then(() => inquirer.prompt(LOGIN_QUESTIONS).then(answers => this.tryLogin(answers)))
      .catch(() => inquirer.prompt(LOGIN_QUESTIONS).then(answers => this.tryLogin(answers)));
  }

  quit() {
    return this.player.cleanup().then(() => {
      process.exit(0);
    }, (error) => {
      process.stdout.write(`${error}\n`);
      process.exit(1);
    });
  }
}

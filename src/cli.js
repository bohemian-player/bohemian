'use strict';

import commandLineArgs from 'command-line-args';
import { RhapsodyClient, Player, UI } from './index';

const USAGE_INFO = {
  title: 'bohemian',
  description: 'A command-line Rhapsody music player',
  synopsis: [
    '$ bohemian -i  (interactive mode)',
    '$ bohemian -u <username> -p <password> <search terms>',
  ],
  examples: [
    {
      desc: 'Track search and play:',
      example: '$ bohemian -u myusername -p mypassword Bee Gees Stayin\\\' Alive',
    }, {
      desc: 'Track search and play (use saved credentials):',
      example: '$ bohemian Bee Gees Stayin\\\' Alive',
    }, {
      desc: 'Interactive mode:',
      example: '$ bohemian -i',
    },
  ],
};

const ARGS = [
  {
    name: 'interactive',
    alias: 'i',
    type: Boolean,
    description:
      'Interactive mode. Upon successful login, credentials are saved to ~/.bohemian/credentials.',
  }, {
    name: 'search',
    type: String,
    multiple: true,
    defaultOption: true,
    description: 'Single-play track search terms',
    typeLabel: '[search terms]',
  }, {
    name: 'username',
    alias: 'u',
    type: String,
    description: 'Rhapsody username',
  }, {
    name: 'password',
    alias: 'p',
    type: String,
    description: 'Rhapsody password',
  }, {
    name: 'help',
    alias: 'h',
    type: Boolean,
    description: 'Show basic usage help',
  },
];


const loginAndSearch = (client, player, username = '', password = '', searchTerm) => (
  client.doLogin(username, password)
  .then(() => client.search('track', searchTerm.join(' ')))
  .then((results) => {
    if (results.length > 0) {
      process.stdout.write(`Preparing to play: ${results[0].artist.name} - ${results[0].name}\n`);
      player.on('stop', () => {
        process.exit(0);
      });
      return player.playTrack(results[0].id);
    }
    process.stdout.write('No matching tracks found.\n');
    return process.exit(0);
  })
  .catch((error) => {
    process.stdout.write(`${error}\n`);
    process.exit(0);
  })
);

module.exports = () => {
  const cli = commandLineArgs(ARGS);

  const options = cli.parse();
  const client = new RhapsodyClient();
  const player = new Player(client);
  const ui = new UI(client, player);

  if (options.interactive) {
    return ui.startSession();
  } else if (options.search) {
    let credentialsPromise = ui.getSavedCredentials().catch(() => {
      process.stdout.write(
        `Unable to load saved credentials. Try the interactive mode or use the -u and -p options.\n`
      );
      process.exit(0);
    });
    if (options.username || options.password) {
      credentialsPromise = Promise.resolve(options);
    }

    return credentialsPromise
      .then((credentials) =>
        loginAndSearch(client, player, credentials.username, credentials.password, options.search));
  }

  process.stdout.write(cli.getUsage(USAGE_INFO));
  return process.exit(0);
};

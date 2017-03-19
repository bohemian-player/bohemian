# Bohemian

Bohemian is a command-line interface for playing music from [Napster](http://us.napster.com/) (previously Rhapsody). It allows you to play tracks on your local machine without needing Napster open in your web browser.

NOTE: To use this, **you must already have a paid Napster plan** with full/unlimited access (currently known as the "[premier](http://us.napster.com/pricing)" plan). This project does **not** allow you to do anything without a subscription plan (free trial should work).

It works by following the requests normally made by the Napster web client, fetching tracks with RTMPDump and sending the output to MPlayer.

At the moment, Bohemian is mostly a "proof of concept" as it only implements a basic interface to search for and play a single song at a time. In the future, it may evolve into a more complete music player.


## Requirements

- [Node.js](https://nodejs.org/) (>= 4.x) and [NPM](https://www.npmjs.com/)
- [RTMPDump](https://rtmpdump.mplayerhq.hu/)
- [MPlayer](http://www.mplayerhq.hu/)

## Installation

### 1. Install the prerequisites:

#### For Mac OS X (with [Homebrew](http://brew.sh/)):
- `brew install node mplayer rtmpdump`

#### For Ubuntu/Debian Linux:

- [Install node.js](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions) (>= 4.x) - If you install the default node.js package provided by your distro, it's probably too old, so follow the directions [here](https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions) for a newer version.
- `apt-get install mplayer rtmpdump`

### 2. Install Bohemian:

`npm install -g bohemian`


## To install as a library:

- `npm install bohemian --save`


## Usage

Once installed, run `bohemian --help` for some basic usage info.

## TODO

- Add tests and better error-handling
- Implement albums, playlists, radio, etc. in interactive mode
- Add more options to the CLI


## FAQ

### Why not just use the official Napster API?

The official API does not allow for actually *playing* music. Napster does provide [SDKs](https://developer.napster.com/sdks) for Android, iOS, and the web, but they're basically just wrappers for Napster's own players.

There's currently no other way (that I'm aware of) to do everything from the command-line.

### Is this... allowed?

Technically the web client in bohemian consumes the public resources available on the Napster website just like any other web browser. This project does *not* include any proprietary or secret information (API keys, decryption, etc). If any portion would be subject to scrutiny for "reverse engineering" proprietary/protected content, it would be [RTMPDump](https://rtmpdump.mplayerhq.hu/) - not this project.

That said, you're on your own if you decide to use this :)


## License

MIT license. See the LICENSE file for more info.

import { client } from './src/client.js';
import boxd from './src/commands/letterboxd.js';
import connections from './src/commands/connections.js';
import searchlogs from './src/commands/searchlogs.js';
import listcmds from './src/commands/listcmd.js';
import ping from './src/commands/ping.js';
import unicode from './src/commands/unicode.js';
import { timeLog, ttrim} from './src/utils.js';
import config from './config.json' with { type: 'json' };
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import movie from './src/commands/movie.js';
import namechange from './src/commands/namechange.js';
import download from './src/commands/download.js';
import { allowAutomod } from './src/eventsub.js';
import rating from './src/commands/rating.js';
import song from './src/commands/song.js';
import fortune from './src/commands/fortune.js';
import join from './src/commands/join.js';
import link from './src/commands/link.js';
import { getPrefix, getWhitelistedUsers, isOptedOut, isWhitelisted, setWhitelist, setOptOut, setPrefix } from './src/db/dbManager.js';
import db from './src/db/db.js';

const startTime = new Date();
const cooldowns = new Map();

timeLog('Bot is starting');

client.on('PRIVMSG', async (msg: PrivmsgMessage) => {
  const roomState = client.roomStateTracker?.getChannelState(msg.channelName);
  const botState = client.userStateTracker?.channelStates?.[msg.channelName];

  // ignore if bot is not mod and channel is restricted
  if (botState && roomState && !botState.isMod && (roomState.emoteOnly || roomState.subscribersOnly || roomState.followersOnlyDuration > -1)) {
    return;
  }

  const senderID = msg.senderUserID;

  // set up coooldowns (except for whitelisted users)
  const whitelist_channels = getWhitelistedUsers();
  if (!whitelist_channels.includes(msg.senderUsername)) {
    const now = Date.now();
    if (cooldowns.has(senderID)) {
      const expirationTime = cooldowns.get(senderID) + config.cooldown;
      if (now < expirationTime) {
        return;
      }
    }
    cooldowns.set(senderID, now);

    setTimeout(() => cooldowns.delete(senderID), config.cooldown);
  }

  const raw = ttrim(msg.messageText);
  let msgText = raw;

  // handle replies
  const replyBody = msg.replyParentMessageBody ?? null;
  if (replyBody && msgText.startsWith('@')) {
    msgText = msgText.replace(/^@\S+\s+/, '');
  }

  // media download stuff
  if (!isOptedOut(msg.channelID)) {
    const downloadLinkPattern = /\S*tiktok\.com\/\S+|\S*(instagram|facebook)\.com\/(reels?|p|share)\/\S+/gi;
    const mediaLink = msgText.match(downloadLinkPattern)?.[0] ?? null;

    if (mediaLink) {
      await download(msg, mediaLink);
    }
  }
  
  const prefix = getPrefix(msg.channelID);

  if (msgText.startsWith(prefix)) {
    const args = msgText.split(' ');

    // handle replies
    if (replyBody && args.length === 1) {
      args.push(replyBody);
    }

    const command = args[0].slice(prefix.length).toLowerCase();

    // COMMANDS
    switch (command) {
      case 'ping':
        await ping(msg, startTime);
        return;

      case 'part':
      case 'join':
        await join(msg, args);
        return;

      case 'link':
      case 'unlink':
        await link(msg, args);
        return;

      case 'letterboxd':
      case 'lb':
      case 'boxd':
        await boxd(msg, args);
        return;

      case 'movie':
      case 'mv':
      case 'film':
        await movie(msg, args);
        return;

      case 'review':
      case 'rating':
      case 'rt':
        await rating(msg, args);
        return;

      case 'connections':
      case 'conn':
      case 'c':
        await connections(msg, args);
        return;

      case 'listcmd':
      case 'listcmds':
      case 'lc':
        await listcmds(msg, args);
        return;

      case 'searchlogs':
      case 'sl':
        await searchlogs(msg, args);
        return;
      
      case 'unicode':
      case 'u':
        await unicode(msg, args);
        return;

      case 'namechange':
      case 'nc':
        await namechange(msg, args);
        return;

      case 'song':
      case 's':
        await song(msg, args);
        return;

      case 'fortune':
      case 'f':
      case 'cookie':
        await fortune(msg, args);
        return;

      case 'optout':
        if (isWhitelisted(msg.senderUserID)) {
          if (args[1]) {
            const optStatus = isOptedOut(args[1])
            setOptOut(args[1], !optStatus);
            return client.say(msg.channelName, `@${msg.senderUsername}, ${args[1]} is now ${!optStatus ? "opted out" : "opted in"}`);
          }
        }

      case 'setprefix':
        if (isWhitelisted(msg.senderUserID) || msg.channelID === msg.senderUserID) {
          if (args[1]) {
            if (!/^[a-z0-9_]+$/.test(args[1])) {
              return client.say(msg.channelName, `@${msg.senderUsername}, invalid prefix`);
            }
            if (args[1].length > 5) {
              return client.say(msg.channelName, `@${msg.senderUsername}, prefix must be fewer than 6 characters`);
            }
            const newPrefix = args[1].toLowerCase();
            setPrefix(msg.channelID, newPrefix);
            return client.say(msg.channelName, `prefix set to ${newPrefix}`);
          }
        } else {
          return client.say(msg.channelName, `@${msg.senderUsername}, you must be broadcaster to set prefix`);
        }

      case 'echo': {
        if (!isWhitelisted(msg.senderUserID)) {
          return client.say(msg.channelName, `@${msg.senderUsername}, you can't use this command bruh`);
        }

        let echoChannel = msg.channelName;
        let echoArgs = args.slice(1);

        const lastArg = echoArgs[echoArgs.length - 1];
        if (lastArg && lastArg.startsWith('in:')) {
          echoChannel = lastArg.slice(3).toLowerCase();
          echoArgs.pop();
        }

        const echoMsg = echoArgs.join(' ').trim();

        if (echoMsg) {
          try {
            await client.say(echoChannel, echoMsg);
          } catch (error) {
            return;
          }
        }
        return;
      }

      case 'whitelist':
        if (msg.senderUserID === "502913017") {
          if (args[1]) {
            const whitelistStatus = isWhitelisted(args[1]);
            setWhitelist(args[1], !whitelistStatus);
            return client.say(msg.channelName, `@${msg.senderUsername}, ${args[1]} is ${!whitelistStatus ? "is now whitelisted" : "no longer whitelisted"}`);
          }
        }

      case 'help':
      case 'commands': {
        return client.say(msg.channelName,`@${msg.senderUsername}, https://ploorp.com/commands`);
      }
    }
  }

  // STUFF THATS NOT REALLY A COMMAND
  if (msg.senderUserID != config.id) {
    if (msgText === 'test') {
      return client.say(msg.channelName, 'A');
    }

    if (msgText.includes(config.username)) {
      return client.say(msg.channelName, msg.senderUsername + ' hi');
    }

    if (msgText.toLowerCase() === 'gup') {
      return client.say(msg.channelName, 'gup');
    }

    if (msgText.toLowerCase() === 'prefix?') {
      return client.say(msg.channelName, `my prefix is "${getPrefix(msg.channelID)}"`);
    }
  }
});

//allowAutomod();

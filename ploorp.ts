import { client, saySafe } from './src/client.js';
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
import supibot from './src/commands/supibot.js';
import newname from './src/commands/newname.js';
import { getPrefix, getWhitelistedUsers, isOptedOut, isWhitelisted, setWhitelist, setOptOut, setPrefix } from './src/db/dbManager.js';
import { getUserId } from './src/helix.js';
import randomline from './src/commands/randomline.js';
import listen from './src/commands/listen.js';

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
  // skip cooldowns for whitelisted users (check by ID)
  if (!isWhitelisted(senderID)) {
    const now = Date.now();
    const last = cooldowns.get(senderID) ?? 0;
    if (now < last + config.cooldown) return;
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
    const downloadLinkPattern =
      /\S*(tiktok\.com\/\S+|(instagram|facebook)\.com\/(reels?|p|share)\/\S+|(x|twitter)\.com\/(?:i\/)?(?:\w+\/)?status\/\d+|(?:www\.)?youtube\.com\/(?:watch\?v=|shorts\/)\S+|youtu\.be\/\S+)/i;
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

    // supibot command
    if (command.startsWith('$') && isWhitelisted(msg.senderUserID)) {
      const preserved = args[0].slice(prefix.length);
      const supArgs = [prefix + 'supibot', preserved, ...args.slice(1)];
      await supibot(msg, supArgs);
      return;
    }

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
        await song(msg, false, args);
        return;
      
      case 'sc':
        await song(msg, true, args);
        return;

      case 'newname':
      case 'nn':
        await newname(msg, args);
        return;

      case 'supibot':
        if (!isWhitelisted(msg.senderUserID)) return;
        await supibot(msg, args);
        return;

      case 'fortune':
      case 'f':
      case 'cookie':
        await fortune(msg, args);
        return;

      case 'randomline':
      case 'rl':
        await randomline(msg, args);
        return;

      case 'listen':
        if (!isWhitelisted(msg.senderUserID)) return;
        await listen(msg, args, false);
        return;

      case 'lw':
        if (!isWhitelisted(msg.senderUserID)) return;
        await listen(msg, args, true);
        return;

      case 'unlisten':
        if (!isWhitelisted(msg.senderUserID)) return;
        await listen(msg, args, null);
        return;

      case 'optout':
        if (!isWhitelisted(msg.senderUserID)) return;
        if (args[1]) {
          const optStatus = isOptedOut(args[1])
          setOptOut(args[1], !optStatus);
          return saySafe(msg.channelName, `@${msg.senderUsername}, ${args[1]} is now ${!optStatus ? "opted out" : "opted in"}`);
        }

      case 'setprefix':
        if (isWhitelisted(msg.senderUserID) || msg.channelID === msg.senderUserID) {
          if (args[1]) {
            if (!/^[a-zA-Z0-9!@#$%^&*()\-_=+[\]{};:'",.<>?]+$/.test(args[1])) {
              return saySafe(msg.channelName, `@${msg.senderUsername}, invalid prefix`);
            }
            if (args[1].length > 5) {
              return saySafe(msg.channelName, `@${msg.senderUsername}, prefix must be fewer than 6 characters`);
            }
            const newPrefix = args[1];
            setPrefix(msg.channelID, newPrefix);
            return saySafe(msg.channelName, `prefix set to ${newPrefix}`);
          }
        } else {
          return saySafe(msg.channelName, `@${msg.senderUsername}, you must be broadcaster to set prefix`);
        }

      case 'echo': {
        if (!isWhitelisted(msg.senderUserID)) {
          return saySafe(msg.channelName, `@${msg.senderUsername}, you can't use this command bruh`);
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
            await saySafe(echoChannel, echoMsg);
          } catch (error) {
            return;
          }
        }
        return;
      }

      case 'whitelist':
        if (msg.senderUserID === "502913017") {
          if (args[1]) {
            const userID = await getUserId(args[1]);
            if (!userID) {
              return saySafe(msg.channelName, `@${msg.senderUsername}, invalid user`);
            }

            const whitelistStatus = isWhitelisted(userID);
            setWhitelist(userID, !whitelistStatus);
            return saySafe(msg.channelName, `@${msg.senderUsername}, ${args[1]} is ${!whitelistStatus ? "is now whitelisted" : "no longer whitelisted"}`);
          }
        }
        return;

      case 'help':
      case 'commands': {
        return saySafe(msg.channelName,`@${msg.senderUsername}, https://ploorp.com/commands`);
      }
    }
  }

  // STUFF THATS NOT REALLY A COMMAND
  if (msg.senderUserID != config.id) {
    if (msgText === 'test') {
      return saySafe(msg.channelName, 'A');
    }

    if (msgText.includes(config.username)) {
      return saySafe(msg.channelName, msg.senderUsername + ' hi');
    }

    if (msgText.toLowerCase() === 'gup') {
      return saySafe(msg.channelName, 'gup');
    }

    if (msgText.toLowerCase() === 'prefix?') {
      return saySafe(msg.channelName, `my prefix is "${getPrefix(msg.channelID)}"`);
    }
  }
});

//allowAutomod();

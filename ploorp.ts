import { client } from './src/client.js';
import boxd from './src/commands/letterboxd.js';
import connections from './src/commands/connections.js';
import searchlogs from './src/commands/searchlogs.js';
import listcmds from './src/commands/listcmd.js';
import ping from './src/commands/ping.js';
import unicode from './src/commands/unicode.js';
import { chatBan, chatUnban } from './src/helix.js';
import { timeLog, ttrim, getUserInfo, usernameToID} from './src/utils.js';
import config from './config.json' with { type: 'json' };
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
//import autoban from './src/autoban.js';
import movie from './src/commands/movie.js';

const startTime = new Date();
const cooldowns = new Map();
let lastBan: string | null = null;

timeLog('Bot is starting');

// client.on('JOIN', async (msg) => {
//   const botState = client.userStateTracker?.channelStates?.[msg.channelName];
//   const joinedUser = msg.joinedUsername;

//   if (!botState || !botState.isMod || joinedUser === lastBan) {
//     return;
//   }
  
//   const bannedUser = await autoban(joinedUser, lastBan, msg);

//   if (bannedUser) {
//     lastBan = bannedUser;
//   }
// });

client.on('PRIVMSG', async (msg: PrivmsgMessage) => {
  const roomState = client.roomStateTracker?.getChannelState(msg.channelName);
  const botState = client.userStateTracker?.channelStates?.[msg.channelName];

  // ignore if bot is not mod and channel is restricted
  if (botState && roomState && !botState.isMod && (roomState.emoteOnly || roomState.subscribersOnly || roomState.followersOnlyDuration > -1)) {
    return;
  }

  // ignore if message is from bot
  if (msg.senderUserID == config.id) {
    return;
  }

  const senderID = msg.senderUserID;

  // set up coooldowns (except for whitelisted users)
  if (!config.whitelist_channels.includes(msg.senderUsername)) {
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

  let msgText = msg.messageText.trim();

  // deal with reply commands
  if (msg.replyParentMessageBody) {
    let msgArr = msgText.split(' ').slice(1);
    msgArr.push(msg.replyParentMessageBody);
    msgText = msgArr.join(' ');
  }
  
  const args = msgText.split(' ');
  const command = args[0].slice(config.prefix.length);

  // COMMANDS
  if (msgText.startsWith(config.prefix)) {
    switch (command) {
      case 'ping':
        await ping(msg, startTime);
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

      case 'connections':
      case 'conn':
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
      
      case 'u':
      case 'unicode':
        await unicode(msg, args);
        return;

      case 'help':
      case 'commands': {
        const p = config.prefix;
        return client.say(
          msg.channelName,
          `@${msg.senderUsername}, commands: ${p}help, ${p}ping, ${p}boxd <username>, ${p}conn <username>, ${p}listcmd <channel>, ${p}searchlogs <channel> <username> <query>, ${p}unicode <message>`,
        );
      }
    }
  

    let banChannels = config.ban_list;
    let userInfo;
    

    // Commands only whitelisted users can use
    if (config.whitelist_channels.includes(msg.senderUsername)) {
      switch (command) {
        case 'echo': {
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

        case 'part':
          await client.part(msg.channelName);
          return;

        case 'join':
          if (args[1]?.length) {
            try {
              await client.join(args[1].toLowerCase());
            } catch (error) {
              return client.say(msg.channelName, 'error joining ' + args[1]);
            }
            return client.say(msg.channelName, 'joined ' + args[1]);
          }
          return;

        case 'adtm':
        case 'ban':
          const userToBan = args[1];
          if (!userToBan) {
            return client.say(msg.channelName, 'provide a user to ban tupid');
          }

          if (userToBan.toLowerCase() === 'ploorp') {
            return client.say(msg.channelName, '...');
          }

          userInfo = await getUserInfo(userToBan);

          const banID = await usernameToID(userInfo);
          if (!banID) {
            return client.say(msg.channelName, 'error with userID Reacting');
          }

          for (const channel of banChannels) {
            chatBan(banID, channel, 'band');
          }
          lastBan = banID; 
          return;

        case 'undo':
          const userToUndo = lastBan;
          if (!userToUndo) {
            return client.say(msg.channelName, 'nothing to undo tupid');
          }

          const undoID = await usernameToID(await getUserInfo(userToUndo));

          for (const channel of banChannels) {
            chatUnban(undoID, channel)
          }
          return;

        case 'unban':
          const userToUnban = args[1];
          if (!userToUnban) {
            return client.say(msg.channelName, 'provide a userID to ban tupid');
          }

          const unbanID = await usernameToID(await getUserInfo(userToUnban));

          if (!unbanID) {
            return client.say(msg.channelName, 'error with userID Reacting');
          }

          for (const channel of banChannels) {
            chatUnban(unbanID, channel);
          }
          return;
      }
    }
  }

  msgText = ttrim(msg.messageText);

  // STUFF THATS NOT REALLY A COMMAND
  if (msgText.includes(config.username)) {
    return client.say(msg.channelName, msg.senderUsername + ' hi');
  }

  if (msgText === 'test') {
    return client.say(msg.channelName, 'A');
  }

  if (msgText === 'gup') {
    return client.say(msg.channelName, 'gup');
  }
});

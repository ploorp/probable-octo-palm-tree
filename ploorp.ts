import { client } from './src/client.js';
import boxd from './src/commands/boxd.js';
import connections from './src/commands/connections.js';
import searchlogs from './src/commands/searchlogs.js';
import listcmds from './src/commands/listcmd.js';
import ping from './src/commands/ping.js';
import unicode from './src/commands/unicode.js';
import { chatBan, chatUnban } from './src/helix.js';
import { timeLog } from './src/utils.js';
import { ttrim } from './src/utils.js';
import config from './config.json' with { type: 'json' };
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';

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

      case 'boxd':
        await boxd(msg, args);
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
  }

  let lastBan: string = '';
  let banChannels = config.ban_list;

  // Commands only whitelisted users can use
  if (config.whitelist_channels.includes(msg.senderUsername)) {
    switch (command) {
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
        lastBan = args[1];
        for (const channel of banChannels) {
          chatBan(args[1], channel, 'band');
        }
        return;

      case 'undo':
        for (const channel of banChannels) {
          chatUnban(lastBan, channel)
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

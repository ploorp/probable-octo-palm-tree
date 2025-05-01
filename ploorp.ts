import { client } from './src/client.js';
import boxd from './commands/boxd.js';
import connections from './commands/connections.js';
import searchlogs from './commands/searchlogs.js';
import listcmds from './commands/listcmd.js';
import ping from './commands/ping.js';
import unicode from './commands/unicode.js';
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
          const channels = config.ban_list;
          for (const channel of channels) {
            //await client.say(channel, `/me ${args[1]}`);
            await client.sendRaw(`PRIVMSG #${channel} :/ban ${args[1]}`);
        }
        return;
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

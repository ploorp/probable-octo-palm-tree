import { client } from './src/client.js';
import boxd from './boxd.js';
import connections from './connections.js';
import searchlogs from './searchlogs.js';
import listcmds from './listcmds.js';
import { sleep, logToFile } from './src/utils.js';
import config from './config.json' with { type: 'json' };

const startTime = new Date();
const cooldowns = new Map();

logToFile('Bot is starting', 'config.log_file');

process.on('uncaughtException', (err) => {
  logToFile(`Uncaught Exception: ${err.stack || err.message}`, 'config.log_file');
  setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason, promise) => {
  logToFile(`Unhandled Rejection: ${reason}`, 'config.log_file');
  setTimeout(() => process.exit(1), 100);
});

// client.on("CLEARCHAT", async (msg) => {
//   if (msg.ircTags["target-user-id"] !== config.id) {
//     return client.say(msg.channelName, 'BAND');
//   }
// });

client.on('PRIVMSG', async (msg) => {
  const roomState = client.roomStateTracker?.channelStates?.[msg.channelName];
  const botState = client.userStateTracker?.channelStates?.[msg.channelName];

  if (!botState.isMod && (roomState.emoteOnly || roomState.subOnly || roomState.followersOnlyDuration > -1)) {
    return;
  }

  if (msg.senderUserID == config.id) {
    return;
  }

  const msgText = msg.messageText.trim();
  const args = msgText.split(' ');
  const command = args[0].slice(config.prefix.length);
  const senderID = msg.senderUserID;

  if (!config.whitelist_channels.includes(msg.senderUsername)) {
    const now = Date.now();
    if (cooldowns.has(senderID)) {
      const expirationTime = cooldowns.get(senderID) + 2000;
      if (now < expirationTime) {
        return;
      }
    }
    cooldowns.set(senderID, now);

    setTimeout(() => cooldowns.delete(senderID), 5000);
  }


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

  
  // COMMANDS
  if (msgText.startsWith(config.prefix)) {
    const args = msgText.split(' ');
    const command = args[0].slice(config.prefix.length);

    if (command === 'ping') {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;

      let uptimeStr = 
        days > 0 ? `${days}d ${hours}h` :
        hours > 0 ? `${hours}h ${minutes}m` :
        minutes > 0 ? `${minutes}m ${seconds}s` :
        `${seconds}s`;

      return client.say(msg.channelName, `@${msg.senderUsername}, catHop guptime: ${uptimeStr}`);
    }

    if (command === 'boxd') {
      await boxd(msg);
      return;
    }

    if (command === 'conn') {
      await connections(msg);
      return;
    }

    if (command === 'listcmd' || command === 'lc') {
      await listcmds(msg);
      return;
    }

    if (command === 'searchlogs' || command === 'sl') {
      await searchlogs(msg);
      return;
    }

    if (command === 'help') {
      const p = config.prefix;
      return client.say(msg.channelName, `@${msg.senderUsername}, commands: ${p}help, ${p}ping, ${p}boxd <username>, ${p}conn <username>, ${p}listcmd <channel>, ${p}searchlogs <channel> <username> <query>`);
    }

    // Commands only whitelisted users can use
    if (config.whitelist_channels.includes(msg.senderUsername)) {
      if (command === 'part') {
        await client.part(msg.channelName);
        return;
      }

      if (command === 'join') {
        if (args[1]?.length) {
          try {
            await client.join(args[1].toLowerCase());
          } catch (error) {
            return client.say(msg.channelName, 'error joining ' + args[1]);
          }
          return client.say(msg.channelName, 'joined ' + args[1]);
        }

        return;
      }
    }
  }
});

import { client } from './src/client.js';
import boxd from './boxd.js';
import { sleep } from './src/utils.js';
import config from './config.json' with { type: 'json' };

const startTime = new Date();

client.on("CLEARCHAT", (msg) => {
  return client.say(msg.channelName, 'BAND');
});

client.on('PRIVMSG', async (msg) => {

  // goodnight message
  // ploorpbot username 
  // send from queue of messages
  // dev commands to stop and restart 
  // pyramid and spam
  // make sure bot is modded
  // logs
  // dl command

  if (msg.messageText.startsWith('-ping')) {
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

  if (msg.messageText.startsWith('-boxd')) {
    await boxd(msg);
    return;
  }

  if (msg.messageText.startsWith('-help')) {
    return client.say(msg.channelName, `@${msg.senderUsername}, commands: -ping, -boxd <username>`);
  }

  // if (msg.senderUserID === '883453487') {
  //   if (msg.messageText.startsWith('A Raid')) {
  //     await sleep(Math.random() * 10000 + 5000);
  //     return client.say(msg.channelName, '+ed');
  //   }

  //   if (msg.messageText.includes('30 seconds')) {
  //     await sleep(Math.random() * 10000 + 5000);
  //     return client.say(msg.channelName, '+join');
  //   }

  //   return;
  // }

  // if (msg.messageText.includes('pl 00 rp')) {
  //   return client.say(msg.channelName, '00');
  // }

  // commands that could loop
  if (!msg.senderUserID === config.id) {
    if (msg.messageText.trim() === 'gup') {
      return client.say(msg.channelName, 'gup');
    }

    return;
  }

  // commands only whitelisted users can use 
  if (config.whitelist_channels.includes(msg.senderUsername)) {
    if (msg.messageText.startsWith('-part')) {
      await client.part(msg.channelName);
    }

    if (msg.messageText.startsWith('-join')) {
      const args = msg.messageText.slice(5).trim().split(' ');

      if (args[0].length) {
        await client.join(args[0]);
        return client.say(msg.channelName, 'joined ' + args[0]);
      }
    }

    return;
  }

  if (msg.messageText.includes(config.username)) {
    return client.say(msg.channelName, msg.senderUsername + ' hi');
  }

  if (msg.messageText.trim() === 'test') {
    return client.say(msg.channelName, 'A');
  }
});

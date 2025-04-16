import { client } from './src/client.js';
import boxd from './boxd.js';
import { sleep } from './src/utils.js';
import config from './config.json' with { type: 'json' };

const startTime = new Date();

client.on("CLEARCHAT", (msg) => {
  if (!msg.userID === config.id) {
    return client.say(msg.channelName, 'BAND');
  }
});

client.on('PRIVMSG', async (msg) => {
  const roomState = client.roomStateTracker?.channelStates?.[msg.channelName];
  const botState = client.userStateTracker?.channelStates?.[msg.channelName];


  if (!botState.isMod) {
      if(roomState.emoteOnly || roomState.subOnly || roomState.followersOnlyDuration > 0) {
        return;
      }
  }

  if (msg.senderUserID == config.id) {
    return;
  }

  if (msg.messageText.startsWith(config.prefix + 'ping')) {
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

  if (msg.messageText.startsWith(config.prefix + 'boxd')) {
    await boxd(msg);
    return;
  }

  if (msg.messageText.startsWith(config.prefix + 'help')) {
    const p = config.prefix;
    return client.say(msg.channelName, `@${msg.senderUsername}, commands: ${p}ping, ${p}boxd <username>, ${p}help`);

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

  // commands only whitelisted users can use 
  if (config.whitelist_channels.includes(msg.senderUsername)) {
    if (msg.messageText.startsWith(config.prefix + 'part')) {
      await client.part(msg.channelName);
    }

    if (msg.messageText.startsWith(config.prefix + 'join')) {
      const args = msg.messageText.slice(5).trim().split(' ');

      if (args[0].length) {
        await client.join(args[0]);
        return client.say(msg.channelName, 'joined ' + args[0]);
      }
    }
  }

  if (msg.messageText.includes(config.username)) {
    return client.say(msg.channelName, msg.senderUsername + ' hi');
  }

  if (msg.messageText.trim() === 'test') {
    return client.say(msg.channelName, 'A');
  }

  if (msg.messageText.trim() === 'gup') {
    return client.say(msg.channelName, 'gup');
  }
});

import { client } from './src/client.js';
import boxd from './boxd.js';
import sleep from './src/utils.js';

const startTime = new Date();

client.on('PRIVMSG', async (msg) => {
  /*
  if (!config.whitelist_channels.includes(msg.senderUsername.toLowerCase())) {
    return;
  }
  */

  if (msg.messageText.trim() === 'ping') {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`

    return client.say(msg.channelName, msg.senderUsername + ' guptime: ' + uptimeString);
  }

  if (msg.messageText.includes('pl 00 rp')) {
    return client.say(msg.channelName, '00');
  }

  if (msg.messageText.startsWith('!boxd')) {
    await boxd(msg);
    return;
  }

  if (msg.senderUserID === '883453487') {
    if (msg.messageText.startsWith('A Raid')) {
      await sleep(Math.random() * 10000 + 5000);
      return client.say(msg.channelName, '+ed');
    }

    if (msg.messageText.includes('30 seconds')) {
      await sleep(Math.random() * 10000 + 5000);
      return client.say(msg.channelName, '+join');
    }

    return;
  }

  if (msg.messageText.includes('ploorp') && msg.messageText.includes('bot')) {
    return client.say(msg.channelName, 'AA');
  }

  if (msg.messageText.trim() === 'test') {
    return client.say(msg.channelName, 'a');
  }

  if (!msg.senderUserID === '502913017') {
    if (msg.messageText.trim() === 'gup') {
      return client.say(msg.channelName, 'gup');
    }

    return;
  }
});

import { client } from './src/client.js';
import boxd from './boxd.js';

client.on('PRIVMSG', async (msg) => {
  /*
  if (!config.whitelist_channels.includes(msg.senderUsername.toLowerCase())) {
    return;
  }
  */

  if (msg.messageText.trim() === 'ping') {
    return client.say(msg.channelName, msg.senderUsername + ', pong');
  }

  if (msg.messageText.includes('pl 00 rp')) {
    return client.say(msg.channelName, '00');
  }

  if (msg.messageText.startsWith('!boxd')) {
    const message = await boxd(msg);
    return client.say(msg.channelName, message);
  }

  if (msg.messageText.startsWith('A Raid') && msg.senderUsername === 'deepdankdungeonbot') {
    return client.say(msg.channelName, '+ed');
  }

  if (msg.messageText.includes('30 seconds') && msg.senderUsername === 'deepdankdungeonbot') {
    return client.say(msg.channelName, '+join');
  }

  if (msg.messageText.includes('ploorp') && msg.messageText.includes('bot')) {
    return client.say(msg.channelName, 'AA');
  }
});

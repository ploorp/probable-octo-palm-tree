import { client } from './src/client.js';
import boxd from './boxd.js';
import { sleep } from './src/utils.js';
import config from './config.json' with { type: 'json' };

const startTime = new Date();

client.on("CLEARCHAT", async (msg) => {
  console.log(msg.ircTags["target-user-id"] + '\n' + config.id)
  if (msg.ircTags["target-user-id"] !== config.id) {
    return client.say(msg.channelName, 'BAND');
  }
});

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

  if (args[0] === config.prefix + 'ping') {
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

  if (args[0] === config.prefix + 'boxd') {
    await boxd(msg);
    return;
  }

  if (args[0] === config.prefix + 'help') {
    const p = config.prefix;
    return client.say(msg.channelName, `@${msg.senderUsername}, commands: ${p}ping, ${p}boxd <username>, ${p}follows <username>, ${p}help`);
  }

  // Commands only whitelisted users can use
  if (config.whitelist_channels.includes(msg.senderUsername)) {
    if (args[0] === config.prefix + 'part') {
      await client.part(msg.channelName);
    }

    if (args[0] === config.prefix + 'join') {
      if (args[1]?.length) {
        await client.join(args[1]);
        return client.say(msg.channelName, 'joined ' + args[1]);
      }

      return;
    }
  }

  if (msgText.includes(config.username)) {
    return client.say(msg.channelName, msg.senderUsername + ' hi');
  }

  if (msgText === 'test') {
    return client.say(msg.channelName, 'A');
  }

  if (msgText === 'gup') {
    return client.say(msg.channelName, 'gup');
  }

  if (args[0] === config.prefix + 'f' || args[0] === config.prefix + 'follows') {
    const username = args[1] ? args[1] : '';
    return client.say(msg.channelName, `@${msg.senderUsername}, https://tools.2807.eu/follows?user=${username}`);
  }
});

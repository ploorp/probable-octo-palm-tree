import { client } from './src/client.js';
import config from './config.json' with { type: 'json' };

export default async function searchlogs(msg) {
  const args = msg.messageText.trim().split(' ');
  
  // if no arguments try to use the sender's username
  if (args.length < 3) {
    return client.say(msg.channelName, `@${msg.senderUsername}, format is ${config.prefix}searchlogs <channel> <username> <query>`);
  }

  const channel = args[1].toLowerCase().replace(/^@/, '');
  const username = args[2].toLowerCase().replace(/^@/, '');
  const query = args.slice(3).join(' ').toLowerCase();

  if (!/^[a-z0-9_]+$/.test(username) || !/^[a-z0-9_]+$/.test(channel)) {
    return client.say(msg.channelName, `@${msg.senderUsername}, bad username`);
  }

  if (query.length > 100) {
    return client.say(msg.channelName, `@${msg.senderUsername}, long ass query`);
  }

  return client.say(msg.channelName, `@${msg.senderUsername}, https://logs.zonian.dev/channel/${channel}/user/${username}/search?q=${encodeURIComponent(query)}&reverse=true`);
}

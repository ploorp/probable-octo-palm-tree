import { client } from './src/client.js';
import axios from 'axios';
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
    return client.say(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
  }

  if (query.length > 100) {
    return client.say(msg.channelName, `@${msg.senderUsername}, long ass query Reacting`);
  }

  const logs = `https://logs.zonian.dev/channel/${channel}/user/${username}/search?q=${encodeURIComponent(query)}&reverse=true`
  let response;

  try {
    response = await axios.get(logs);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return client.say(msg.channelName, `@${msg.senderUsername}, no matching logs found smh`);
    }
    return client.say(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }

  return client.say(msg.channelName, `@${msg.senderUsername}, ${logs}`);
}

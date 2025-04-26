import { client } from './src/client.js';
import axios from 'axios';    

export default async function searchlogs(msg) {
  const args = msg.messageText.slice(5).trim().split(' ');

  let response;
  
  // if no arguments try to use the sender's username
  if (args.length !== 3) {
    return client.say(msg.channelName, `@${msg.senderUsername}, format is !searchlogs <channel> <username> <query>`);
  }

  const channel = args[0].toLowerCase().replace(/^@/, '');
  const username = args[1].toLowerCase().replace(/^@/, '');
  const query = args[2].toLowerCase();

  if (!/^[a-z0-9_]+$/.test(username) || !/^[a-z0-9_]+$/.test(channel)) {
    return client.say(msg.channelName, `@${msg.senderUsername}, bad username`);
  }

  return client.say(msg.channelName, `@${msg.senderUsername}, https://logs.zonian.dev/channel/${channel}/user/${username}/search?q=${query}&reverse=true`);
}

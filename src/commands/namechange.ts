import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import axios from 'axios';
import { isOptedOut } from '../db/dbManager.js';
import { getUserId } from '../helix.js';

export default async function namechange(msg: PrivmsgMessage, args: string[]) {
  let username;
  let response;
  let userId;

  const endpoint = "https://logs.zonian.dev/namehistory/login:"
  
  // if no arguments use users own username
  if (!args[1]) {
    username = msg.senderUsername.toLowerCase();
  } else {
    username = args[1].toLowerCase().replace(/^@/, '');

    if (!/^[a-z0-9_]+$/.test(username)) {
      return saySafe(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
    }
  }

  userId = await getUserId(username);
  if (!userId) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, this user does not exist Reacting`);
  }

  if (isOptedOut(userId)) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, ${username} is opted out of ts`);
  }

  try {
    response = await axios.get(endpoint + username);
  } catch (error) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }

  if (!response.data.length) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, i dont know anything about this user Reacting`);
  }

  const previousNames = [];
  
  for (let i = 0; i < response.data.length - 1; i++) {
    previousNames.push(response.data[i].user_login);
  }
  
  if (previousNames.length === 0) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, ${username} never changed their name wow`);
  }
  
  // make sure the message isnt too big
  const prefix = `@${msg.senderUsername}, previous names of ${username}: `;
  let oldUsernames = '';
  let totalLength = prefix.length;
  
  for (let i = 0; i < previousNames.length; i++) {
    const nextName = previousNames[i];
    const delimiter = i > 0 ? ', ' : '';
    const addition = delimiter + nextName;
    
    if (totalLength + addition.length + 3 > 500) {
      oldUsernames += delimiter + '...';
      break;
    }
    
    oldUsernames += addition;
    totalLength += addition.length;
  }
  
  return saySafe(msg.channelName, prefix + oldUsernames);
}

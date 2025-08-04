import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client } from '../client.js';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };

export default async function namechange(msg: PrivmsgMessage, args: string[]) {
  let username;
  let response;

  const endpoint = "https://logs.zonian.dev/namehistory/login:"
  
  // if no arguments use users own username
  if (!args[1]) {
    username = msg.senderUsername.toLowerCase();
  } else {
    username = args[1].toLowerCase().replace(/^@/, '');

    if (!/^[a-z0-9_]+$/.test(username)) {
      return client.say(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
    }
  }

  if (config.opted_out.includes(username)) {
    return client.say(msg.channelName, `@${msg.senderUsername}, ${username} is opted out of ts comamnd`);
  }

  try {
    response = await axios.get(endpoint + username);
  } catch (error) {
    return client.say(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }

  if (!response.data.length) {
    return client.say(msg.channelName, `@${msg.senderUsername}, this user does not seem to exist Reacting`);
  }

  const previousNames = [];
  
  for (let i = 0; i < response.data.length - 1; i++) {
    previousNames.push(response.data[i].user_login);
  }
  
  if (previousNames.length === 0) {
    return client.say(msg.channelName, `@${msg.senderUsername}, ${username} never changed their name wow`);
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
  
  return client.say(msg.channelName, prefix + oldUsernames);
}

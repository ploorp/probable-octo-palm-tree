import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client } from '../client.js';
import axios from 'axios';

export default async function listcmds(msg: PrivmsgMessage, args: string[]) {
  let username;
  let response;
  let userID;

  const endpoint = "https://api.potat.app/users/"
  
  // if no arguments try to use the current channel
  if (!args[1]) {
    username = msg.channelName.toLowerCase();
  } else {
    username = args[1].toLowerCase().replace(/^@/, '');

    if (!/^[a-z0-9_]+$/.test(username)) {
      return client.say(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
    }
  }

  try {
    response = await axios.get(endpoint + username);
  } catch (error) {
    return client.say(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }

  if (response.data.statusCode === 404) {
    return client.say(msg.channelName, `@${msg.senderUsername}, this user does not exist Reacting`);
  }

  try {
    userID = response.data.data[0].channel.channel_id;
  }
  catch (error) {
    return client.say(msg.channelName, `@${msg.senderUsername}, this user has never been seen Reacting`);
  }

  if (response.data.data[0].channel.commands.length === 0) {
    return client.say(msg.channelName, `@${msg.senderUsername}, this user has no commands wtf`);
  }

  return client.say(msg.channelName, `@${msg.senderUsername}, https://api.potat.app/channel/commands?id=${userID}`);
}

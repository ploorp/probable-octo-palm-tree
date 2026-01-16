import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
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
      return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
    }
  }

  try {
    response = await axios.get(endpoint + username);
  } catch (error) {
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }

  if (response.data.statusCode === 404) {
    return saySafe(msg.channelName, `this user does not exist Reacting`, msg.messageID);
  }

  try {
    userID = response.data.data[0].channel.channel_id;
  }
  catch (error) {
    return saySafe(msg.channelName, `this user has never been seen Reacting`, msg.messageID);
  }

  if (response.data.data[0].channel.commands.length === 0) {
    return saySafe(msg.channelName, `this user has no commands wtf`, msg.messageID);
  }

  return saySafe(msg.channelName, `https://api.potat.app/channel/commands?id=${userID}`, msg.messageID);
}

import { client } from './src/client.js';
import axios from 'axios';    

export default async function listcmds(msg) {
  const args = msg.messageText.slice(5).trim().split(' ');

  let username;
  let response;
  let userID;

  const endpoint = "https://api.potat.app/users/"
  
  // if no arguments try to use the sender's username
  if (!args[0].length) {
    userID = msg.channelID;
  } else {
    username = args[0].toLowerCase().replace(/^@/, '');

    if (!/^[a-z0-9_]+$/.test(username)) {
      return client.say(msg.channelName, `@${msg.senderUsername}, bad username`);
    }

    try {
      response = await axios.get(endpoint + username);
    } catch (error) {
      return client.say(msg.channelName, `@${msg.senderUsername}, error Reacting`);
    }

    if (response.data.statusCode === 404) {
      return client.say(msg.channelName, `@${msg.senderUsername}, this user has never been seen by potatbotat Reacting`);
    }

    userID = response.data.data[0].channel.channel_id;
  }

  return client.say(msg.channelName, `@${msg.senderUsername}, https://api.potat.app/channel/commands?id=${userID}`);
}

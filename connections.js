import { client } from './src/client.js';
import axios from 'axios';    

export default async function connections(msg) {
  const args = msg.messageText.slice(5).trim().split(' ');

  let username;
  let response;

  const endpoint = "https://api.potat.app/users/"

  // if no arguments try to use the sender's username
  if (!args[0].length) {
    username = msg.senderUsername;

    try {
      response = await axios.get(endpoint + username);
    } catch (error) {
      return client.say(msg.channelName, `@${msg.senderUsername}, you were never seen by potatbotat Reacting`);
    }
  } else {
    username = args[0].toLowerCase().replace(/^@/, '');

    if (!/^[a-z0-9_]+$/.test(username)) {
      return client.say(msg.channelName, `@${msg.senderUsername}, bad username`);
    }
    
    try {
      response = await axios.get(endpoint + username);
    } catch (error) {
      return client.say(msg.channelName, `@${msg.senderUsername}, this user has never been seen by potatbotat Reacting`);
    }
  }

  const connections = response.data.data[0].user.connections;
  let spotify;
  let lastfm;
  let monkeytype;

  for (let i = 0; i < connections.length; i++) {
    const platform = connections[i].platform;

    if (platform === "SPOTIFY") {
      spotify = connections[i].id;
    }
    else if (platform === "LASTFM") {
      lastfm = connections[i].id;
    }
    else if (platform === "MONKEYTYPE") {
      monkeytype = connections[i].username;
    }

  }

  if (!spotify && !lastfm && !monkeytype) {
    return client.say(msg.channelName, `@${msg.senderUsername}, ${username} hasn't connected any interesting accounts`);
  }

  const spotifyUrl = `${spotify ? `https://open.spotify.com/user/${spotify}` : ''}`;
  const lastfmUrl = `${lastfm ? `https://www.last.fm/user/${lastfm}` : ''}`;
  const monkeytypeUrl = `${monkeytype ? `https://monkeytype.com/profile/${monkeytype}` : ''}`;

  const message = `${username}'s connected accounts: ${spotifyUrl} ${lastfmUrl} ${monkeytypeUrl}`;

  return client.say(msg.channelName, `@${msg.senderUsername}, ${message}`);
}
 
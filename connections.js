import { client } from './src/client.js';
import axios from 'axios';    

export default async function connections(msg) {
  const args = msg.messageText.trim().split(' ');

  let username;
  let response;

  const endpoint = "https://api.potat.app/users/"

  // if no arguments try to use the sender's username
  if (!args[1]) {
    username = msg.senderUsername;
  } else {
    username = args[1].toLowerCase().replace(/^@/, '');

    if (!/^[a-z0-9_]+$/.test(username)) {
      return client.say(msg.channelName, `@${msg.senderUsername}, bad username`);
    }
  }

  try {
    response = await axios.get(endpoint + username);
  } catch (error) {
    return client.say(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }

  if (response.data.statusCode === 404) {
    return client.say(msg.channelName, `@${msg.senderUsername}, this user has never been seen by potatbotat Reacting`);
  }

  const connections = response.data.data[0].user.connections;
  
  let spotify;
  let lastfm;
  let monkeytype;
  let anilist;
  let steam;

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
    else if (platform === "ANILIST") {
      anilist = connections[i].username;
    } 
    else if (platform === "STEAM") {
      steam = BigInt(76561197960265728) + BigInt(connections[i].id);
    }
  }

  if (!spotify && !lastfm && !monkeytype) {
    return client.say(msg.channelName, `@${msg.senderUsername}, ${username} hasn't connected any interesting accounts`);
  };

  const spotifyUrl = `${spotify ? `https://open.spotify.com/user/${spotify}` : ''}`;
  const lastfmUrl = `${lastfm ? `https://www.last.fm/user/${lastfm}` : ''}`;
  const steamUrl = `${steam ? `https://steamcommunity.com/profiles/${steam.toString()}` : ''}`;
  const monkeytypeUrl = `${monkeytype ? `https://monkeytype.com/profile/${monkeytype}` : ''}`;
  const anilistUrl = `${anilist ? `https://anilist.co/user/${anilist}` : ''}`;

  const links = [spotifyUrl, lastfmUrl, steamUrl, monkeytypeUrl, anilistUrl].filter(Boolean).join(' • ');

  const message = `${username}'s connected accounts: ${links}`;

  return client.say(msg.channelName, `@${msg.senderUsername}, ${message}`);
}

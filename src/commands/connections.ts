import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client } from '../client.js';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };

export default async function connections(msg: PrivmsgMessage, args: string[]) {
  let username;
  let response;

  const endpoint = "https://api.potat.app/users/"

  // if no arguments try to use the sender's username
  if (!args[1]) {
    username = msg.senderUsername;
    // you havent ?#
  } else {
    username = args[1].toLowerCase().replace(/^@/, '');

    if (!/^[a-z0-9_]+$/.test(username)) {
      return client.say(msg.channelName, `@${msg.senderUsername}, bad username`);
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

  if (response.data.statusCode === 404) {
    return client.say(msg.channelName, `@${msg.senderUsername}, this user does not exist Reacting`);
  }

  const connections = response.data.data[0].user.connections;
  
  let spotify;
  let lastfm;
  let monkeytype;
  let anilist;
  let steam;
  let trakt;

  for (const connection of connections) {
    switch (connection.platform) {
      case "SPOTIFY":
        spotify = connection.id;
        break;
      case "LASTFM":
        lastfm = connection.id;
        break;
      case "MONKEYTYPE":
        monkeytype = connection.username;
        break;
      case "ANILIST":
        anilist = connection.username;
        break;
      case "STEAM":
        steam = BigInt(76561197960265728) + BigInt(connection.id);
        break;
      case "TRAKT":
        trakt = connection.username;
        break;
    }
  }

  if (!spotify && !lastfm && !monkeytype && !anilist && !steam) {
    return client.say(msg.channelName, `@${msg.senderUsername}, ${username} hasn't connected any interesting accounts`);
  };

  const spotifyUrl = `${spotify ? `https://open.spotify.com/user/${spotify}` : ''}`;
  const lastfmUrl = `${lastfm ? `https://www.last.fm/user/${lastfm}` : ''}`;
  const steamUrl = `${steam ? `https://steamcommunity.com/profiles/${steam.toString()}` : ''}`;
  const monkeytypeUrl = `${monkeytype ? `https://monkeytype.com/profile/${monkeytype}` : ''}`;
  const anilistUrl = `${anilist ? `https://anilist.co/user/${anilist}` : ''}`;
  const traktUrl = `${trakt ? `https://trakt.tv/users/${trakt}` : ''}`;

  const links = [spotifyUrl, lastfmUrl, steamUrl, monkeytypeUrl, anilistUrl, traktUrl].filter(Boolean).join(' • ');

  const message = `${username}'s connected accounts: ${links}`;

  return client.say(msg.channelName, `@${msg.senderUsername}, ${message}`);
}

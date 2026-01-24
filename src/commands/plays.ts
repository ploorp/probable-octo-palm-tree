import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import axios from 'axios';
import config from '../config/index.js';
import { getAccount } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';
import { getUserInfo } from '../utils.js';

export default async function plays(msg: PrivmsgMessage, args: string[]) {
  let lastfmUsername: string | null = null;
  let artistName: string | null = null;
  let targetUser: string | null = null;

  // args[0] is command, args[1] is user, args[2...] is artist
  if (args.length > 1) {
    targetUser = args[1];
    if (args.length > 2) {
      artistName = args.slice(2).join(' ');
    }
  } else {
    // No args, default to sender
    targetUser = `@${msg.senderUsername}`;
  }

  if (targetUser.startsWith('@')) {
    const twitchUsername = targetUser.replace(/^@/, '');
    const twitchId = await getUserId(twitchUsername);
    
    if (!twitchId) {
      return saySafe(msg.channelName, `user not found saj`, msg.messageID);
    }

    // Check DB first
    lastfmUsername = getAccount(twitchId, 'lastfm');

    // If not in DB, check Potat connections
    if (!lastfmUsername) {
      const userInfo = await getUserInfo(twitchUsername);
      if (userInfo && userInfo.data && userInfo.data[0] && userInfo.data[0].user && userInfo.data[0].user.connections) {
        const connection = userInfo.data[0].user.connections.find((c: any) => c.platform === 'LASTFM');
        if (connection) {
          lastfmUsername = connection.id;
        }
      }
    }
  } else {
    // Assume it's a Last.fm username
    lastfmUsername = targetUser;
  }

  if (!lastfmUsername) {
    return saySafe(msg.channelName, `no lastfm account found saj`, msg.messageID);
  }

  // If no artist specified, fetch recent track
  if (!artistName) {
    try {
      const recents = await axios.get('https://ws.audioscrobbler.com/2.0/', {
        headers: {
          'User-Agent': 'ploorp',
        },
        params: {
          method: 'user.getrecenttracks',
          user: lastfmUsername,
          api_key: config.lastfm.client_id,
          format: 'json',
          limit: 1,
        },
      });
      const tracks = recents.data?.recenttracks?.track;
      if (tracks) {
        const track = Array.isArray(tracks) ? tracks[0] : tracks;
        // track.artist can be an object with #text or name
        artistName = track.artist?.name || track.artist['#text'];
      }
    } catch (error) {
    
      return saySafe(msg.channelName, 'error Reacting', msg.messageID);
    }
  }

  if (!artistName) {
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }

  // Fetch plays for the artist
  try {
    const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      headers: {
        'User-Agent': 'ploorp',
      },
      params: {
        method: 'artist.getinfo',
        artist: artistName,
        username: lastfmUsername,
        api_key: config.lastfm.client_id,
        format: 'json',
        autocorrect: 1,
      },
      timeout: 5000,
    });

    if (!response.data || !response.data.artist) {
      return saySafe(msg.channelName, `error Reacting`, msg.messageID);
    }

    const artist = response.data.artist;
    const correctArtistName = artist.name;
    const userPlaycount = artist.stats?.userplaycount;

    if (userPlaycount !== undefined) {
      return saySafe(msg.channelName, `${lastfmUsername} has ${userPlaycount} plays for ${correctArtistName}`, msg.messageID);
    } else {
      return saySafe(msg.channelName, `error Reacting`, msg.messageID);
    }

  } catch (error) {
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }
}

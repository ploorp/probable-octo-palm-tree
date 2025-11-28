import { client, saySafe } from '../client.js';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getAllLastFmUsers, refreshUsername } from '../db/dbManager.js';

export default async function whoKnows(msg: PrivmsgMessage, args: string[]) {
  let artistName: string | null = null;

  if (args.length > 1) {
    artistName = args.slice(1).join(' ');
  } else {
    const account = getAccount(msg.senderUserID, 'lastfm') as { handle?: string } | null;
    if (!account || !account.handle) {
      return saySafe(msg.channelName, `@${msg.senderUsername}, usage: %whoknows <artist> or link your account`);
    }

    try {
      const recents = await axios.get('https://ws.audioscrobbler.com/2.0/', {
        params: {
          method: 'user.getrecenttracks',
          user: account.handle,
          api_key: config.lastfm.client_id,
          format: 'json',
          limit: 1,
        },
      });
      const tracks = recents.data?.recenttracks?.track;
      if (tracks) {
        const track = Array.isArray(tracks) ? tracks[0] : tracks;
        artistName = track.artist?.name || track.artist['#text'];
      }
    } catch (error) {
      return saySafe(msg.channelName, `@${msg.senderUsername}, error Reacting`);
    }
  }

  if (!artistName) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, cant find artist`);
  }

  const users = getAllLastFmUsers();
  if (users.length === 0) {
    return saySafe(msg.channelName, `no lastfm users lol`);
  }

  const plays: { username: string, playcount: number }[] = [];
  let correctArtistName = artistName;
  let artistNameUpdated = false;

  const BATCH_SIZE = 5;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (user) => {
      try {
        const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
          params: {
            method: 'artist.getinfo',
            artist: artistName,
            username: user.lastfm,
            api_key: config.lastfm.client_id,
            format: 'json',
          },
        });
        
        if (!artistNameUpdated && response.data?.artist?.name) {
            correctArtistName = response.data.artist.name;
            artistNameUpdated = true;
        }

        const userPlaycount = response.data?.artist?.stats?.userplaycount;
        if (userPlaycount) {
          const count = parseInt(userPlaycount, 10);
          let displayName;
          if (count > 0) {
            if (!user.username) {
              displayName = await refreshUsername(user.id) || 'unknown';
            } else {
              displayName = user.username;
            }
            plays.push({ username: `@${displayName}`, playcount: count });
          }
        }
      } catch (error) {}
    });

    await Promise.all(promises);
  }

  if (plays.length === 0) {
    return saySafe(msg.channelName, `ts artist is niche`);
  }

  plays.sort((a, b) => b.playcount - a.playcount);

  const parts = plays.map((p, i) => `${i + 1}. ${p.username} (${p.playcount})`);
  const message = `${correctArtistName}: ${parts.join(', ')}`;

  return saySafe(msg.channelName, message);
}

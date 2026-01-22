import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };
import { getAccount, getAllLastFmUsers, refreshUsername } from '../db/dbManager.js';
import { saySafe } from '../client.js';
import { timeLog, usernameToID, uploadToHastebin } from '../utils.js';

export async function whoKnowsArtist(msg: PrivmsgMessage, args: string[]) {
  let artistName: string | null = null;
  let account: string | null = null;

  if (args.length > 1) {
    if (args[1].startsWith('@')) {
      account = getAccount(await usernameToID(args[1].replace(/^@/, '')), 'lastfm');
    } else {
      artistName = args.slice(1).join(' ');
    }
  } else {
    account = getAccount(msg.senderUserID, 'lastfm');
  }

  if (account) {
    try {
      const recents = await axios.get('https://ws.audioscrobbler.com/2.0/', {
        headers: {
          'User-Agent': 'ploorp',
        },
        params: {
          method: 'user.getrecenttracks',
          user: account,
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
      return saySafe(msg.channelName, 'error Reacting', msg.messageID);
    }
  }

  if (!artistName) {
    return saySafe(msg.channelName, 'cant find artist', msg.messageID);
  }

  const users = getAllLastFmUsers();
  if (users.length === 0) {
    return saySafe(msg.channelName, 'no lastfm users lol', msg.messageID);
  }

  const plays: { username: string; playcount: number }[] = [];
  let correctArtistName = artistName;
  let artistNameUpdated = false;

  const BATCH_SIZE = 5;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (user) => {
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
            headers: {
              'User-Agent': 'ploorp',
            },
            params: {
              method: 'artist.getinfo',
              artist: artistName,
              username: user.lastfm,
              api_key: config.lastfm.client_id,
              format: 'json',
              autocorrect: 1,
            },
            timeout: 5000,
          });
          if (response.data) break;
        } catch (error) {
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!response?.data) return;

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
            displayName = (await refreshUsername(user.id)) || 'unknown';
          } else {
            displayName = user.username;
          }
          plays.push({ username: `@${displayName}`, playcount: count });
        }
      }
    });

    await Promise.all(promises);
  }

  if (plays.length === 0) {
    const responses = ['who is that', 'ts is niche', 'underground', 'they have no fans', 'never heard of them'];
    const response = responses[Math.floor(Math.random() * responses.length)];
    return saySafe(msg.channelName, response, msg.messageID);
  }

  plays.sort((a, b) => b.playcount - a.playcount);

  const parts = plays.map((p, i) => `${i + 1}. ${p.username} (${p.playcount})`);
  const message = `${correctArtistName}: ${parts.join(', ')}`;

  if (message.length > 450) {
    try {
      let link;
      link = await uploadToHastebin(message);
      if (!link) {
        timeLog('Hastebin upload failed');
        link = '';
      }

      const suffix = ` ... ${link}`;
      let truncated = `${correctArtistName}: `;

      for (const part of parts) {
        const nextStr = truncated === `${correctArtistName}: ` ? part : `, ${part}`;
        if (truncated.length + nextStr.length + suffix.length > 450) break;
        truncated += nextStr;
      }
      truncated += suffix;
      return saySafe(msg.channelName, truncated, msg.messageID);
    } catch (e) {
      timeLog(`Error uploading to Hastebin: ${e}`);
      return saySafe(msg.channelName, message.substring(0, 447) + '...', msg.messageID);
    }
  }

  return saySafe(msg.channelName, message, msg.messageID);
}

export async function whoKnowsAlbum(msg: PrivmsgMessage, _args?: string[]) {
  return saySafe(msg.channelName, 'whoknows album is not implemented yet FeelsDankMan', msg.messageID);
}

export async function whoKnowsTrack(msg: PrivmsgMessage, _args?: string[]) {
  return saySafe(msg.channelName, 'whoknows track is not implemented yet FeelsDankMan', msg.messageID);
}

export default whoKnowsArtist;

import { client, saySafe } from '../client.js';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount } from '../db/dbManager.js';
import { getUserId } from '../helix.js';

export default async function song(msg: PrivmsgMessage, playcount: boolean, args: string[]) {
  let username: string;

  if (!args[1]) {
    const account = getAccount(msg.senderUserID, 'lastfm') as { handle?: string } | null;
    if (account && account.handle) {
      username = account.handle;
    } else {
      username = msg.senderUsername;
    }
  } else {
    if (args[1].startsWith('@')) {
      const twitchLogin = args[1].replace(/^@+/, '').toLowerCase();
      if (!/^[a-z0-9_]+$/.test(twitchLogin)) {
        return saySafe(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
      }
      const userId = await getUserId(twitchLogin);
      if (!userId) return saySafe(msg.channelName, `@${msg.senderUsername}, twitch user not found`);
      const account = getAccount(userId, 'lastfm') as { handle?: string } | null;
      if (!account || !account.handle) {
        return saySafe(msg.channelName, `@${msg.senderUsername}, ${twitchLogin} has no linked lastfm`);
      }
      username = account.handle;
    } else {
      username = args[1].toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_]+$/.test(username)) {
        return saySafe(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
      }
    }
  }

  let userInfo;
  try {
    userInfo = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'user.getinfo',
        user: username,
        api_key: config.lastfm.client_id,
        format: 'json',
      },
    });
  } catch (error) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, user not found smh`);
  }

  let recents;
  try {
    recents = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'user.getrecenttracks',
        user: username,
        api_key: config.lastfm.client_id,
        format: 'json',
        limit: 1,
        extended: 1,
      },
    });
  } catch (error) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }

  const tracks = recents.data?.recenttracks?.track;
  if (!tracks || (Array.isArray(tracks) && tracks.length === 0)) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, no recent tracks found smh`);
  }

  const track = Array.isArray(tracks) ? tracks[0] : tracks;
  const artist = track.artist?.name || track.artist['#text'] || 'unknown';
  const songTitle = track.name || 'unknown';
  const date = track.date;
  const nowPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';

  let scrobbleCount = '';
  if (playcount) {
    let trackInfo;
    try {
      trackInfo = await axios.get('https://ws.audioscrobbler.com/2.0/', {
        params: {
          method: 'track.getinfo',
          artist,
          track: songTitle,
          user: username,
          api_key: config.lastfm.client_id,
          format: 'json',
        },
      });
      if (trackInfo?.data?.track?.userplaycount != null) {
        scrobbleCount = ` (${trackInfo.data.track.userplaycount} plays)`;
      }
    }
    catch (error) {
      return saySafe(msg.channelName, `@${msg.senderUsername}, error Reacting`);
    }
  }

  if (!tracks || tracks.length === 0) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, no recent tracks found smh`);
  }

  function timeAgo(date: Date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  }

  if (nowPlaying) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, ${username} is currently playing "${songTitle}" by ${artist}${scrobbleCount} kittyJam`);
  } else {
    let ago = 'unknown time ago';
    if (date?.uts) {
      ago = timeAgo(new Date(parseInt(date.uts) * 1000));
    }
    return saySafe(msg.channelName, `@${msg.senderUsername}, ${username} last played "${songTitle}" by ${artist} (${ago})${scrobbleCount} RobertJam`);
  }
}

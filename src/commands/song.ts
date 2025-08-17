import { client } from '../client.js';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount } from '../db/dbManager.js';

export default async function song(msg: PrivmsgMessage, args: string[]) {
  let username: string;

  if (!args[1]) {
    const account = getAccount(msg.senderUserID, 'lastfm') as { handle?: string } | null;
    if (account && account.handle) {
      username = account.handle;
    } else {
      username = msg.senderUsername;
    }
  } else {
    username = args[1].toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]+$/.test(username)) {
      return client.say(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
    }
  }

  try {
    await axios.get('https://ws.audioscrobbler.com/2.0/', {
      params: {
        method: 'user.getinfo',
        user: username,
        api_key: config.lastfm.client_id,
        format: 'json',
      },
    });
  } catch (error) {
    return client.say(msg.channelName, `@${msg.senderUsername}, user not found smh`);
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
    return client.say(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }

  const tracks = recents.data?.recenttracks?.track;
  if (!tracks || tracks.length === 0) {
    return client.say(msg.channelName, `@${msg.senderUsername}, no recent tracks found smh`);
  }

  const track = Array.isArray(tracks) ? tracks[0] : tracks;
  const artist = track.artist?.name || track.artist['#text'] || 'unknown';
  const songTitle = track.name || 'unknown';
  const date = track.date;
  const nowPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';

  // let playCount = null;
  // try {
  //   const trackInfoResponse = await axios.get('https://ws.audioscrobbler.com/2.0/', {
  //     params: {
  //       method: 'track.getInfo',
  //       api_key: config.lastfm.client_id,
  //       artist: artist,
  //       track: songTitle,
  //       username: username,
  //       format: 'json',
  //       autocorrect: 1,
  //     },
  //   });
  //   playCount = trackInfoResponse.data?.track?.userplaycount ?? null;
  // } catch (error) {}

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
    return client.say(msg.channelName, `@${msg.senderUsername}, ${username} is currently playing "${songTitle}" by ${artist} kittyJam`);
  } else {
    let ago = 'unknown time ago';
    if (date?.uts) {
      ago = timeAgo(new Date(parseInt(date.uts) * 1000));
    }
    return client.say(msg.channelName, `@${msg.senderUsername}, ${username} last played "${songTitle}" by ${artist} (${ago}) RobertJam`);
  }
}

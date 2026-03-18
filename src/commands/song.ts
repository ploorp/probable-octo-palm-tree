import { saySafe } from '../client.js';
import axios from 'axios';
import config from '../config/index.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getLastFmConfigs } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';

let spotifyToken = "";
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;
  if (!config.spotify || !config.spotify.client_id || !config.spotify.client_secret) return null;
  
  const auth = Buffer.from(`${config.spotify.client_id}:${config.spotify.client_secret}`).toString('base64');
  try {
    const res = await axios.post('https://accounts.spotify.com/api/token', 'grant_type=client_credentials', {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    spotifyToken = res.data.access_token;
    spotifyTokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch (e) {
    return null;
  }
}

async function searchSpotify(query: string) {
  const token = await getSpotifyToken();
  if (!token) return null;
  
  try {
    const res = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.data.tracks?.items?.[0]?.external_urls?.spotify || null;
  } catch (e) {
    return null;
  }
}

async function searchYoutube(query: string) {
  if (!config.youtube || !config.youtube.api_key) return null;
  try {
    const res = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${config.youtube.api_key}`);
    const videoId = res.data.items?.[0]?.id?.videoId;
    if (videoId) return `https://youtu.be/${videoId}`;
    return null;
  } catch (e) {
    return null;
  }
}

export default async function song(msg: PrivmsgMessage, playcount: boolean, args: string[]) {
  let username: string;
  let targetUserId: string | null = msg.senderUserID;

  if (!args[1]) {
    const account = getAccount(msg.senderUserID, 'lastfm');
    if (account) {
      username = account;
    } else {
      username = msg.senderUsername;
    }
  } else {
    if (args[1].startsWith('@')) {
      const twitchLogin = args[1].replace(/^@+/, '').toLowerCase();
      if (!/^[a-z0-9_]+$/.test(twitchLogin)) {
        return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
      }
      const userId = await getUserId(twitchLogin);
      if (!userId) return saySafe(msg.channelName, `twitch user not found`, msg.messageID);
      targetUserId = userId;
      const account = getAccount(userId, 'lastfm');
      if (!account) {
        return saySafe(msg.channelName, `${twitchLogin} has no linked lastfm`, msg.messageID);
      }
      username = account;
    } else {
      username = args[1].toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_]+$/.test(username)) {
        return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
      }
      targetUserId = null;
    }
  }

  let configs;
  if (targetUserId) {
    configs = getLastFmConfigs(targetUserId);
  } else {
    configs = { playCount: true };
  }

  let recents;
  try {
    recents = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      headers: {
        'User-Agent': 'ploorp',
      },
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
    if (axios.isAxiosError(error) && error.response?.data?.error === 6) {
      return saySafe(msg.channelName, `user not found smh`, msg.messageID);
    }
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }

  const tracks = recents.data?.recenttracks?.track;
  if (!tracks || (Array.isArray(tracks) && tracks.length === 0)) {
    return saySafe(msg.channelName, `no recent tracks found smh`, msg.messageID);
  }

  const track = Array.isArray(tracks) ? tracks[0] : tracks;
  const artist = track.artist?.name || track.artist['#text'] || 'unknown';
  const songTitle = track.name || 'unknown';
  const date = track.date;
  const nowPlaying = track['@attr'] && track['@attr'].nowplaying === 'true';

  let scrobbleCount = '';
  let shouldShowPlaycount = configs.playCount;
  if (playcount) shouldShowPlaycount = true;

  if (shouldShowPlaycount) {
    let trackInfo;
    try {
      trackInfo = await axios.get('https://ws.audioscrobbler.com/2.0/', {
        headers: {
          'User-Agent': 'ploorp',
        },
        params: {
          method: 'track.getinfo',
          artist,
          track: songTitle,
          username: username,
          api_key: config.lastfm.client_id,
          format: 'json',
          autocorrect: 1,
        },
      });
      if (trackInfo?.data?.track?.userplaycount != null) {
        scrobbleCount = ` (play ${+trackInfo.data.track.userplaycount + 1})`;
      }
    }
    catch (error) {
      return saySafe(msg.channelName, `error Reacting`, msg.messageID);
    }
  }

  if (!tracks || tracks.length === 0) {
    return saySafe(msg.channelName, `no recent tracks found smh`, msg.messageID);
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

  let extraLink = '';
  if (configs.songLink === 'spotify') {
    const link = await searchSpotify(`${songTitle} ${artist}`);
    if (link) extraLink = ` - ${link}`;
  } else if (configs.songLink === 'youtube') {
    const link = await searchYoutube(`${songTitle} ${artist}`);
    if (link) extraLink = ` - ${link}`;
  }

  if (nowPlaying) {
    return saySafe(msg.channelName, `${username} is currently playing "${songTitle}" by ${artist}${scrobbleCount} SourPls${extraLink}`, msg.messageID);
  } else {
    let ago = 'unknown time ago';
    if (date?.uts) {
      ago = timeAgo(new Date(parseInt(date.uts) * 1000));
    }
    return saySafe(msg.channelName, `${username} last played "${songTitle}" by ${artist} (${ago})${scrobbleCount} SourPls${extraLink}`, msg.messageID);
  }
}

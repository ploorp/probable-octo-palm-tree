import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import axios from 'axios';
import config from '../config/index.js';
import { getAccount, getAllLastFmUsers, getLastFmConfigs, getPrefix, refreshUsernames } from '../db/dbManager.js';
import { saySafe } from '../client.js';
import { timeLog, unPing, uploadToHastebin } from '../utils.js';

const IGNORE_FLAGS = new Set(['-ignore', '-i']);
const SELF_FLAGS = new Set(['-self', '-s']);
const MESSAGE_LIMIT = 490;
const MAX_OUTPUT_ITEMS = 20;

function formatWhoKnowsUsername(displayName: string, antiPing: boolean, forceIgnore: boolean) {
  return antiPing || forceIgnore ? `@¾${unPing(displayName)}` : `@${displayName}`;
}

async function sendLimitedListMessage(msg: PrivmsgMessage, header: string, parts: string[], messageId?: string) {
  const limitedParts = parts.slice(0, MAX_OUTPUT_ITEMS);
  const fullMessage = `${header}: ${limitedParts.join(', ')}`;

  if (fullMessage.length <= MESSAGE_LIMIT) {
    return saySafe(msg.channelName, fullMessage, messageId);
  }

  try {
    let link = await uploadToHastebin(fullMessage, true);
    if (!link) {
      timeLog('Hastebin upload failed');
      link = '';
    }

    const suffix = link ? ` ... ${link}` : ' ...';
    let truncated = `${header}: `;

    for (const part of limitedParts) {
      const nextStr = truncated === `${header}: ` ? part : `, ${part}`;
      if (truncated.length + nextStr.length + suffix.length > MESSAGE_LIMIT) break;
      truncated += nextStr;
    }

    truncated += suffix;
    return saySafe(msg.channelName, truncated, messageId);
  } catch (e) {
    timeLog(`Error uploading to Hastebin: ${e}`);
    return saySafe(msg.channelName, fullMessage.substring(0, MESSAGE_LIMIT - 3) + '...', messageId);
  }
}

async function getRecentTrackForUser(lastfmUser: string): Promise<{ artist: string; track: string } | null> {
  try {
    const recents = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      headers: {
        'User-Agent': 'ploorp',
      },
      params: {
        method: 'user.getrecenttracks',
        user: lastfmUser,
        api_key: config.lastfm.client_id,
        format: 'json',
        limit: 1,
      },
    });

    const tracks = recents.data?.recenttracks?.track;
    if (!tracks) {
      return null;
    }

    const track = Array.isArray(tracks) ? tracks[0] : tracks;
    const artist = track.artist?.name || track.artist?.['#text'];
    const name = track.name;

    if (!artist || !name) {
      return null;
    }

    return { artist, track: name };
  } catch {
    return null;
  }
}

async function resolveTrackFromQuery(trackQuery: string): Promise<{ artist: string; track: string } | null> {
  const separators = [' - ', ' – ', ' — '];
  for (const separator of separators) {
    const idx = trackQuery.indexOf(separator);
    if (idx > 0 && idx < trackQuery.length - separator.length) {
      const artist = trackQuery.slice(0, idx).trim();
      const track = trackQuery.slice(idx + separator.length).trim();
      if (artist && track) {
        return { artist, track };
      }
    }
  }

  try {
    const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      headers: {
        'User-Agent': 'ploorp',
      },
      params: {
        method: 'track.search',
        track: trackQuery,
        api_key: config.lastfm.client_id,
        format: 'json',
        limit: 1,
      },
      timeout: 5000,
    });

    const searchTracks = response.data?.results?.trackmatches?.track;
    const first = Array.isArray(searchTracks) ? searchTracks[0] : searchTracks;
    if (!first?.artist || !first?.name) {
      return null;
    }

    return {
      artist: first.artist,
      track: first.name,
    };
  } catch {
    return null;
  }
}

export async function whoKnowsArtist(msg: PrivmsgMessage, args: string[]) {
  let artistName: string | null = null;
  let account: string | null = null;

  const lastFmConfigs = getLastFmConfigs(msg.senderUserID);
  const ignorePing = config.lastfm.always_ignore || lastFmConfigs.alwaysIgnore || args.some((arg) => IGNORE_FLAGS.has(arg.toLowerCase()));
  const selfOnly = args.some((arg) => SELF_FLAGS.has(arg.toLowerCase()));
  const filteredArgs = args.filter((arg) => {
    const flag = arg.toLowerCase();
    return !IGNORE_FLAGS.has(flag) && !SELF_FLAGS.has(flag);
  });

  if (filteredArgs.length > 1) {
    artistName = filteredArgs.slice(1).join(' ');
    if (selfOnly) {
      account = getAccount(msg.senderUserID, 'lastfm');
      if (!account) {
        return saySafe(msg.channelName, `You are not linked to last.fm 😭 Use ${getPrefix(msg.channelID)}link <username> to link your account.`, msg.messageID);
      }
    }
  } else {
    account = getAccount(msg.senderUserID, 'lastfm');
    if (!account) {
      return saySafe(msg.channelName, `You are not linked to last.fm 😭 Use ${getPrefix(msg.channelID)}link <username> to link your account.`, msg.messageID);
    }
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

  const users = getAllLastFmUsers().filter((user) => !selfOnly || user.id === msg.senderUserID);
  if (users.length === 0) {
    return saySafe(msg.channelName, 'no lastfm users lol', msg.messageID);
  }

  const matches: { id: string; username?: string; playcount: number; whoknowsAntiping: boolean }[] = [];
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
        if (count > 0) {
          matches.push({ id: user.id, username: user.username, playcount: count, whoknowsAntiping: user.whoknowsAntiping });
        }
      }
    });

    await Promise.all(promises);
  }

  if (matches.length === 0) {
    const responses = ['who is that', 'ts is niche', 'im gatekeeping this response', 'this artist is too underground 😢', 'they have no fans', 'never heard of them', 'try a better artist 🤣'];
    const response = responses[Math.floor(Math.random() * responses.length)];
    return saySafe(msg.channelName, response, msg.messageID);
  }

  // Refresh current Twitch usernames in one batched call so renamed users show up correctly,
  // falling back to the cached name if lookup fails.
  const freshUsernames = await refreshUsernames(matches.map((m) => m.id));

  const plays = matches.map((m) => ({
    username: formatWhoKnowsUsername(freshUsernames.get(m.id) || m.username || 'unknown', m.whoknowsAntiping, ignorePing),
    playcount: m.playcount,
  }));

  plays.sort((a, b) => b.playcount - a.playcount);

  const parts = plays.map((p, i) => `${i + 1}. ${p.username} (${p.playcount})`);
  const message = `${correctArtistName}: ${parts.join(', ')}`;

  if (message.length > 450) {
    try {
      let link;
      link = await uploadToHastebin(message, true);
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

export async function whoKnowsTrack(msg: PrivmsgMessage, args: string[]) {
  let account: string | null = null;
  let targetTrack: { artist: string; track: string } | null = null;

  const lastFmConfigs = getLastFmConfigs(msg.senderUserID);
  const ignorePing = config.lastfm.always_ignore || lastFmConfigs.alwaysIgnore || args.some((arg) => IGNORE_FLAGS.has(arg.toLowerCase()));
  const selfOnly = args.some((arg) => SELF_FLAGS.has(arg.toLowerCase()));
  const filteredArgs = args.filter((arg) => {
    const flag = arg.toLowerCase();
    return !IGNORE_FLAGS.has(flag) && !SELF_FLAGS.has(flag);
  });

  account = getAccount(msg.senderUserID, 'lastfm');
  if (!account) {
    return saySafe(msg.channelName, `You are not linked to last.fm 😭 Use ${getPrefix(msg.channelID)}link <username> to link your account.`, msg.messageID);
  }

  if (filteredArgs.length > 1) {
    const trackQuery = filteredArgs.slice(1).join(' ').trim();
    targetTrack = await resolveTrackFromQuery(trackQuery);
    if (!targetTrack) {
      return saySafe(msg.channelName, 'cant find track', msg.messageID);
    }
  } else {
    targetTrack = await getRecentTrackForUser(account);
    if (!targetTrack) {
      return saySafe(msg.channelName, 'cant find track', msg.messageID);
    }
  }

  const users = getAllLastFmUsers().filter((user) => !selfOnly || user.id === msg.senderUserID);
  if (users.length === 0) {
    return saySafe(msg.channelName, 'no lastfm users lol', msg.messageID);
  }

  const matches: { id: string; username?: string; playcount: number; whoknowsAntiping: boolean }[] = [];
  let correctArtistName = targetTrack.artist;
  let correctTrackName = targetTrack.track;
  let trackNameUpdated = false;

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
              method: 'track.getinfo',
              artist: targetTrack.artist,
              track: targetTrack.track,
              username: user.lastfm,
              api_key: config.lastfm.client_id,
              format: 'json',
              autocorrect: 1,
            },
            timeout: 5000,
          });
          if (response.data) break;
        } catch {
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!response?.data?.track) return;

      if (!trackNameUpdated && response.data.track?.name && response.data.track?.artist?.name) {
        correctTrackName = response.data.track.name;
        correctArtistName = response.data.track.artist.name;
        trackNameUpdated = true;
      }

      const userPlaycount = response.data?.track?.userplaycount;
      if (userPlaycount) {
        const count = parseInt(userPlaycount, 10);
        if (count > 0) {
          matches.push({ id: user.id, username: user.username, playcount: count, whoknowsAntiping: user.whoknowsAntiping });
        }
      }
    });

    await Promise.all(promises);
  }

  if (matches.length === 0) {
    const responses = ['who is that', 'ts is niche', 'im gatekeeping this response', 'this track is too underground 😢', 'they have no fans', 'never heard of this', 'try a better song 🤣'];
    const response = responses[Math.floor(Math.random() * responses.length)];
    return saySafe(msg.channelName, response, msg.messageID);
  }

  const freshUsernames = await refreshUsernames(matches.map((m) => m.id));

  const plays = matches.map((m) => ({
    username: formatWhoKnowsUsername(freshUsernames.get(m.id) || m.username || 'unknown', m.whoknowsAntiping, ignorePing),
    playcount: m.playcount,
  }));

  plays.sort((a, b) => b.playcount - a.playcount);

  const parts = plays.map((p, i) => `${i + 1}. ${p.username} (${p.playcount})`);
  const header = `${correctArtistName} - ${correctTrackName}`;

  return sendLimitedListMessage(msg, header, parts, msg.messageID);
}

export async function topArtistTracks(msg: PrivmsgMessage, args: string[]) {
  const account = getAccount(msg.senderUserID, 'lastfm');
  if (!account) {
    return saySafe(msg.channelName, `You are not linked to last.fm 😭 Use ${getPrefix(msg.channelID)}link <username> to link your account.`, msg.messageID);
  }

  let artistName: string | null = null;
  if (args.length > 1) {
    artistName = args.slice(1).join(' ').trim();
  } else {
    const recent = await getRecentTrackForUser(account);
    artistName = recent?.artist || null;
  }

  if (!artistName) {
    return saySafe(msg.channelName, 'cant find artist', msg.messageID);
  }

  try {
    const artistInfo = await axios.get('https://ws.audioscrobbler.com/2.0/', {
      headers: {
        'User-Agent': 'ploorp',
      },
      params: {
        method: 'artist.getinfo',
        artist: artistName,
        username: account,
        api_key: config.lastfm.client_id,
        format: 'json',
        autocorrect: 1,
      },
      timeout: 5000,
    });

    const correctedArtist = artistInfo.data?.artist?.name || artistName;
    if (!correctedArtist) {
      return saySafe(msg.channelName, 'cant find artist', msg.messageID);
    }

    const normalize = (value: string) => value.trim().toLowerCase();
    const normalizedArtist = normalize(correctedArtist);
    const collected: { name: string; playcount: number }[] = [];

    // user.gettoptracks is ordered by user playcount, so filtering this list preserves ranking.
    const PAGE_LIMIT = 200;
    for (let page = 1; page <= 10; page++) {
      const response = await axios.get('https://ws.audioscrobbler.com/2.0/', {
        headers: {
          'User-Agent': 'ploorp',
        },
        params: {
          method: 'user.gettoptracks',
          user: account,
          api_key: config.lastfm.client_id,
          format: 'json',
          period: 'overall',
          limit: PAGE_LIMIT,
          page,
        },
        timeout: 5000,
      });

      const topTracks = response.data?.toptracks?.track;
      const tracks = Array.isArray(topTracks) ? topTracks : topTracks ? [topTracks] : [];

      for (const track of tracks) {
        const trackArtist = track?.artist?.name || track?.artist;
        const trackName = track?.name as string | undefined;
        const playcount = parseInt(track?.playcount ?? '0', 10);

        if (!trackName || !Number.isFinite(playcount) || playcount <= 0 || !trackArtist) continue;
        if (normalize(trackArtist) !== normalizedArtist) continue;

        collected.push({ name: trackName, playcount });
        if (collected.length >= MAX_OUTPUT_ITEMS) break;
      }

      if (collected.length >= MAX_OUTPUT_ITEMS) break;

      const attr = response.data?.toptracks?.['@attr'];
      const totalPages = parseInt(attr?.totalPages ?? '0', 10);
      if (!tracks.length || !Number.isFinite(totalPages) || totalPages <= page) {
        break;
      }
    }

    if (collected.length === 0) {
      return saySafe(msg.channelName, 'no scrobbles for this artist', msg.messageID);
    }

    const parts = collected.slice(0, MAX_OUTPUT_ITEMS).map((track, i) => `${i + 1}. ${track.name} (${track.playcount})`);
    return sendLimitedListMessage(msg, `${account}'s top tracks for ${correctedArtist}`, parts, msg.messageID);
  } catch {
    return saySafe(msg.channelName, 'error Reacting', msg.messageID);
  }
}

export default whoKnowsArtist;

import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import axios from 'axios';
import { isOptedOut } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';

export default async function connections(msg: PrivmsgMessage, args: string[]) {
  const endpoint = 'https://api.potat.app/users/';

  const PLATFORMS = ['spotify', 'lastfm', 'monkeytype', 'anilist', 'steam', 'trakt'] as const;
  type Platform = (typeof PLATFORMS)[number];

  const sender = msg.senderUsername;
  let username: string = sender;
  let platform: Platform | undefined;

  const arg1 = args[1]?.toLowerCase();
  const arg2 = args[2]?.toLowerCase();

  if (!arg1) {
    username = sender;
  } else if (!arg2) {
    if ((PLATFORMS as readonly string[]).includes(arg1)) {
      platform = arg1 as Platform;
      username = sender;
    } else {
      username = arg1.replace(/^@/, '');
    }
  } else {
    // support both orderings: user platform OR platform user
    if ((PLATFORMS as readonly string[]).includes(arg1)) {
      platform = arg1 as Platform;
      username = arg2.replace(/^@/, '');
    } else if ((PLATFORMS as readonly string[]).includes(arg2)) {
      username = arg1.replace(/^@/, '');
      platform = arg2 as Platform;
    } else {
      return saySafe(msg.channelName, `format is %connections <username|platform> <username|platform>`, msg.messageID);
    }
  }

  if (!/^[a-z0-9_]+$/.test(username)) return saySafe(msg.channelName, `bad username`, msg.messageID);

  const userId = await getUserId(username);
  if (!userId) return saySafe(msg.channelName, `this user does not exist Reacting`, msg.messageID);
  if (isOptedOut(userId)) return saySafe(msg.channelName, `${username} is opted out of ts`, msg.messageID);

  let response;
  try {
    response = await axios.get(endpoint + username);
  } catch (err) {
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }
  if (response.data.statusCode === 404) return saySafe(msg.channelName, `no information about this user Reacting`, msg.messageID);

  const profile = response.data.data[0].user || {};
  const connections: any[] = profile.connections || [];
  const map: Record<string, any> = {};
  for (const c of connections) map[c.platform] = c;

  const steamId = map.STEAM ? (BigInt(76561197960265728) + BigInt(map.STEAM.id)).toString() : undefined;

  const urls: Record<Platform, string | undefined> = {
    spotify: map.SPOTIFY ? `https://open.spotify.com/user/${map.SPOTIFY.id}` : undefined,
    lastfm: map.LASTFM ? `https://www.last.fm/user/${map.LASTFM.id}` : undefined,
    monkeytype: map.MONKEYTYPE ? `https://monkeytype.com/profile/${map.MONKEYTYPE.username}` : undefined,
    anilist: map.ANILIST ? `https://anilist.co/user/${map.ANILIST.username}` : undefined,
    steam: steamId ? `https://steamcommunity.com/profiles/${steamId}` : undefined,
    trakt: map.TRAKT ? `https://trakt.tv/users/${map.TRAKT.username}` : undefined,
  };

  const available = Object.values(urls).filter(Boolean) as string[];
  const isSelf = username === sender;
  const possessive = isSelf ? 'your' : `${username}'s`;
  const subject = isSelf ? 'you' : username;

  if (available.length === 0) {
    const verb = isSelf ? "haven't" : "hasn't";
    return saySafe(msg.channelName, `${subject} ${verb} connected any interesting accounts`, msg.messageID);
  }

  if (platform) {
    const url = urls[platform];
    if (!url) {
      const verb = isSelf ? "haven't" : "hasn't";
      return saySafe(msg.channelName, `${subject} ${verb} connected a ${platform} account`, msg.messageID);
    }
    return saySafe(msg.channelName, `${possessive} ${platform}: ${url}`, msg.messageID);
  }

  return saySafe(msg.channelName, `${possessive} connected accounts: ${available.join(' • ')}`, msg.messageID);
}

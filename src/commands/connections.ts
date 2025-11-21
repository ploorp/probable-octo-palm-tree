import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import axios from 'axios';
import { isOptedOut } from '../db/dbManager.js';
import { getUserId } from '../helix.js';

export default async function connections(msg: PrivmsgMessage, args: string[]) {
  const endpoint = 'https://api.potat.app/users/';

  const PLATFORMS = ['spotify', 'lastfm', 'monkeytype', 'anilist', 'steam', 'trakt'] as const;
  type Platform = (typeof PLATFORMS)[number];

  const sender = msg.senderUsername;
  let username: string = sender;
  let platform: Platform | undefined;

  const rawUser = args[1]?.toLowerCase();
  const rawPlatform = args[2]?.toLowerCase();

  if (!rawUser) {
    username = sender;
  } else if (!rawPlatform) {
    if ((PLATFORMS as readonly string[]).includes(rawUser)) {
      platform = rawUser as Platform;
      username = sender;
    } else {
      username = rawUser.replace(/^@/, '');
    }
  } else {
    username = rawUser.replace(/^@/, '');
    if ((PLATFORMS as readonly string[]).includes(rawPlatform)) {
      platform = rawPlatform as Platform;
    } else {
      return saySafe(msg.channelName, `@${sender}, that doesnt exist`);
    }
  }

  if (!/^[a-z0-9_]+$/.test(username)) return saySafe(msg.channelName, `@${sender}, bad username`);

  const userId = await getUserId(username);
  if (!userId) return saySafe(msg.channelName, `@${sender}, this user does not exist Reacting`);
  if (isOptedOut(userId)) return saySafe(msg.channelName, `@${sender}, ${username} is opted out of ts`);

  let response;
  try {
    response = await axios.get(endpoint + username);
  } catch (err) {
    return saySafe(msg.channelName, `@${sender}, error Reacting`);
  }
  if (response.data.statusCode === 404) return saySafe(msg.channelName, `@${sender}, no information about this user Reacting`);

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
  if (available.length === 0) return saySafe(msg.channelName, `@${sender}, ${username} hasn't connected any interesting accounts`);

  if (platform) {
    const url = urls[platform];
    if (!url) return saySafe(msg.channelName, `@${sender}, ${username} hasn't connected a ${platform} account`);
    const label = platform[0].toUpperCase() + platform.slice(1);
    return saySafe(msg.channelName, `@${sender}, ${username}'s ${label}: ${url}`);
  }

  return saySafe(msg.channelName, `@${sender}, ${username}'s connected accounts: ${available.join(' • ')}`);
}

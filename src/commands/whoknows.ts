import { client, saySafe } from '../client.js';
import axios from 'axios';
import { spawn } from 'child_process';
import config from '../../config.json' with { type: 'json' };
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getAllLastFmUsers, refreshUsername } from '../db/dbManager.js';
import { usernameToID } from '../utils.js';

export default async function whoKnows(msg: PrivmsgMessage, args: string[]) {
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
    return saySafe(msg.channelName, `cant find artist`, msg.messageID);
  }

  const users = getAllLastFmUsers();
  if (users.length === 0) {
    return saySafe(msg.channelName, `no lastfm users lol`, msg.messageID);
  }

  const plays: { username: string, playcount: number }[] = [];
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
            displayName = await refreshUsername(user.id) || 'unknown';
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
    return saySafe(msg.channelName, `ts artist is niche`, msg.messageID);
  }

  plays.sort((a, b) => b.playcount - a.playcount);

  const parts = plays.map((p, i) => `${i + 1}. ${p.username} (${p.playcount})`);
  const message = `${correctArtistName}: ${parts.join(', ')}`;

  if (message.length > 450) {
    try {
      const link = await new Promise<string>((resolve, reject) => {
        const curl = spawn('curl', ['-F', 'file=@-', 'https://0x0.st']);
        let output = '';
        let error = '';

        curl.stdout.on('data', (data) => {
          output += data.toString();
        });

        curl.stderr.on('data', (data) => {
          error += data.toString();
        });

        curl.on('close', (code) => {
          if (code === 0) {
            resolve(output.trim());
          } else {
            reject(new Error(`curl exited with code ${code}: ${error}`));
          }
        });

        curl.stdin.write(message);
        curl.stdin.end();
      });

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
      console.error('0x0 upload failed', e);
      return saySafe(msg.channelName, message.substring(0, 447) + '...', msg.messageID);
    }
  }

  return saySafe(msg.channelName, message, msg.messageID);
}

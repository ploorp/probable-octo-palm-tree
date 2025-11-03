import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { getUsername, whisperUser } from '../helix.js';
import { timeLog } from '../utils.js';
import { getPrefix } from '../db/dbManager.js';

export default async function newname(msg: PrivmsgMessage, args: string[]) {
  if (!args[1]) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, usage: ${getPrefix(msg.channelID)} newname <username>`);
  }

  const username = args[1].toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_]+$/.test(username)) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
  }

  client.removeAllListeners('WHISPER');
  client.once('WHISPER', async (whisperMsg) => {
    timeLog(`Whisper from ${whisperMsg.senderUsername}: ${whisperMsg.messageText}`);

    if (whisperMsg.senderUserID !== "68136884") return;

    const txt = whisperMsg.messageText?.trim() ?? '';

    if (txt.startsWith('No data')) {
      return await saySafe(msg.channelName, `@${msg.senderUsername}, failed to find user`);
    }

    // Try to extract the Twitch ID from the whisper
    // Prefer an explicit "Twitch ID: <digits>" label. If not present, fall back
    // to a heuristic that prefers 6-11 digit candidates (typical Twitch ID lengths).
    const labelled = txt.match(/twitch\s*id[:\s]*([0-9]+)/i);
    let twitchid: string | null = null;
    let candidates: string[] = [];

    if (labelled) {
      twitchid = labelled[1];
      timeLog(`Found labelled Twitch ID ${twitchid} from whisper`);
    } else {
      candidates = txt.match(/\d{3,}/g) ?? [];

      // Prefer candidate lengths between 6 and 11 (reasonable Twitch ID lengths)
      const preferred = candidates.filter(s => s.length >= 6 && s.length <= 11);

      if (preferred.length > 0) {
        // pick the last preferred candidate (often the most specific)
        twitchid = preferred[preferred.length - 1];
        timeLog(`No labelled Twitch ID; picked preferred candidate ${twitchid} from ${candidates.join(',')}`);
      } else if (candidates.length > 0) {
        // fallback: pick the longest numeric run, but avoid extremely long IDs (likely not Twitch)
        const filtered = candidates.filter(s => s.length <= 18); // avoid enormous IDs like some external tokens
        twitchid = filtered.reduce((a, b) => (b.length > a.length ? b : a), filtered[0]);
        timeLog(`No preferred candidates; fallback to ${twitchid} from ${candidates.join(',')}`);
      } else {
        timeLog(`Could not parse ID from whisper: "${txt}"`);
        return await saySafe(msg.channelName, `@${msg.senderUsername}, failed to parse user id`);
      }
    }

    const current = await getUsername(twitchid);
    timeLog(`Fetched current name ${current} for ${username} (id ${twitchid})`);

    if (!current) {
      // More informative message
      return await saySafe(
        msg.channelName,
        `@${msg.senderUsername}, couldn't fetch current username for id ${twitchid}`
      );
    }

    return await saySafe(msg.channelName, `@${msg.senderUsername}, their current username is ${current}`);
  });

  whisperUser("68136884", `$uid ${username}`);
}
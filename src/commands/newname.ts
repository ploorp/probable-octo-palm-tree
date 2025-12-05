import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { getUsername, whisperUser } from '../helix.js';
import { timeLog } from '../utils.js';
import { getPrefix } from '../db/dbManager.js';

export default async function newname(msg: PrivmsgMessage, args: string[]) {
  if (!args[1]) {
    return saySafe(msg.channelName, `usage: ${getPrefix(msg.channelID)} newname <username>`, msg.messageID);
  }

  const username = args[1].toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_]+$/.test(username)) {
    return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
  }

  client.removeAllListeners('WHISPER');
  client.once('WHISPER', async (whisperMsg) => {
    timeLog(`Whisper from ${whisperMsg.senderUsername}: ${whisperMsg.messageText}`);

    if (whisperMsg.senderUserID !== "68136884") return;

    const txt = whisperMsg.messageText?.trim() ?? '';

    if (txt.startsWith('No data')) {
      await saySafe(msg.channelName, `failed to find user`, msg.messageID);
      return;
    }

    const twitchid = txt.match(/twitch\s*id[:\s]*([0-9]+)/i)?.[1];

    if (!twitchid) {
      await saySafe(msg.channelName, `error Reacting`, msg.messageID);
      return;
    }
    
    const current = await getUsername(twitchid);
    
    if (!current) {
      await saySafe(msg.channelName, `error getting username for ${twitchid}`, msg.messageID);
      return;
    }

    await saySafe(msg.channelName, `their current username is ${current}`, msg.messageID);
    return; 
  });

  whisperUser("68136884", `$uid ${username}`);
}
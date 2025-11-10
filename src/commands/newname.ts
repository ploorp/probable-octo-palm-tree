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
      await saySafe(msg.channelName, `@${msg.senderUsername}, failed to find user`);
      return;
    }

    const twitchid = txt.match(/twitch\s*id[:\s]*([0-9]+)/i)?.[1];

    if (!twitchid) {
      await saySafe(msg.channelName, `@${msg.senderUsername}, error Reacting`);
      return;
    }
    
    const current = await getUsername(twitchid);
    
    if (!current) {
      await saySafe(msg.channelName, `@${msg.senderUsername}, error getting username for ${twitchid}`);
      return;
    }

    await saySafe(msg.channelName, `@${msg.senderUsername}, their current username is ${current}`);
    return; 
  });

  whisperUser("68136884", `$uid ${username}`);
}
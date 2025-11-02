import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { getUsername, whisperUser } from '../helix.js';
import { timeLog } from '../utils.js';

export default async function newname(msg: PrivmsgMessage, args: string[]) {
  if (!args[1]) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, usage: !newname <username>`);
  }

  const username = args[1].toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9_]+$/.test(username)) {
    return saySafe(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
  }

  client.removeAllListeners('WHISPER');
  client.once('WHISPER', async (whisperMsg) => {
    timeLog(`Whisper from ${whisperMsg.senderUsername} ${whisperMsg.messageText}`);
    if (whisperMsg.senderUserID === "68136884") {
      if (whisperMsg.messageText.startsWith('No data')) {
        return await saySafe(msg.channelName, `@${msg.senderUsername}, failed to find user`);
      }
      const response = whisperMsg.messageText.split(' ');
      const twitchid = response[response.length - 1];
      const current = await getUsername(twitchid);
      if (!current) {
        return await saySafe(msg.channelName, `@${msg.senderUsername}, channel is banned or something`);
      }
      return await saySafe(msg.channelName, `@${msg.senderUsername}, their current username is ${current}`);
    }
  });

  whisperUser("68136884", `$uid ${username}`);
}
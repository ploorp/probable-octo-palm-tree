import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { whisperUser } from '../helix.js';
import { timeLog } from '../utils.js';

export default async function supibot(msg: PrivmsgMessage, args: string[]) {
  client.removeAllListeners('WHISPER');
  client.once('WHISPER', async (whisperMsg) => {
    timeLog(`Whisper from ${whisperMsg.senderUsername} ${whisperMsg.messageText}`);
    if (whisperMsg.senderUserID === "68136884") {
      return await saySafe(msg.channelName, whisperMsg.messageText);
    }
  });

  whisperUser("68136884", `${args.slice(1).join(' ')}`);
}

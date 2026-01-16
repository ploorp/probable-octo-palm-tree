import { saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { uploadToHastebin } from '../utils.js';

export default async function paste(msg: PrivmsgMessage, args: string[]) {
  if (args.length < 1) {
    return saySafe(msg.channelName, 'usage is %paste <text>', msg.messageID);
  }

  const content = args.slice(1).join(' ');
  const link = await uploadToHastebin(content);

  if (link) {
    return saySafe(msg.channelName, `${link}`, msg.messageID);
  } else {
    return saySafe(msg.channelName, 'error Reacting', msg.messageID);
  }
}

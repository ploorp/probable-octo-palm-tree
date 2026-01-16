import { saySafe } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import axios from 'axios';
import { timeLog } from '../utils.js';

export default async function unicode(msg: PrivmsgMessage, args: string[]) {
  args = args.slice(1);

  const message = args.join(' ').trim();

  if (message.length < 1) {
    return saySafe(msg.channelName, `uuh include some characters`, msg.messageID);
  }

  const link = `https://www.babelstone.co.uk/Unicode/whatisit.html?string=${encodeURIComponent(message)}`;

  try {
    const shortenerResponse = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(link)}`);
    const shortenedUrl = shortenerResponse.data;

    return saySafe(msg.channelName, `${shortenedUrl}`, msg.messageID);
  } catch (error: any) {
    timeLog(`Error shortening URL: ${error.message}`);
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }
}
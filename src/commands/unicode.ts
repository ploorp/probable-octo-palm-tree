import { client } from '../client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import axios from 'axios';
import { timeLog } from '../utils.js';

export default async function unicode(msg: PrivmsgMessage, args: string[]) {
  args = args.slice(1);

  const message = args.join(' ').trim();

  if (message.length < 1) {
    return client.say(msg.channelName, `@${msg.senderUsername}, uuh include some characters`);
  }

  const link = `https://www.babelstone.co.uk/Unicode/whatisit.html?string=${encodeURIComponent(message)}`;

  // Check if the message is too long
  if (link.length > 500) {
    return client.say(msg.channelName, `@${msg.senderUsername}, keep the message short pls`);
  }

  try {
    const shortenerResponse = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(link)}`);
    const shortenedUrl = shortenerResponse.data;

    return client.say(msg.channelName, `@${msg.senderUsername}, ${shortenedUrl}`);
  } catch (error: any) {
    timeLog(`Error shortening URL: ${error.message}`);
    return client.say(msg.channelName, `@${msg.senderUsername}, error Reacting`);
  }
}

import { client } from '../src/client.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';

export default async function unicode(msg: PrivmsgMessage) {
  const args = msg.messageText.trim().split(' ');
  const message = msg.messageText.slice(args[0].length).trim();

  const replyParent = msg.replyParentMessageBody

  if (!args[1]) {
    return client.say(msg.channelName, `@${msg.senderUsername}, uuh include some characters`);
  }

  const link = `https://www.babelstone.co.uk/Unicode/whatisit.html?string=${encodeURIComponent(message)}`;

  // Check if the message is too long
  if (link.length > 400) {
    return client.say(msg.channelName, `@${msg.senderUsername}, keep the message short pls`);
  }

  return client.say(msg.channelName, `@${msg.senderUsername}, What ${link}`);
}

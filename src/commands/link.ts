import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client } from '../client.js';
import { linkAccount, unlinkAccount } from '../db/dbManager.js';

export default async function link(msg: PrivmsgMessage, args: string[]) {
  args[0] = args[0].slice(1);

  if (args[0].toLowerCase() === 'link') {
    if (!args[2]) {
      return client.say(msg.channelName, `@${msg.senderUsername}, format is %link <lastfm|letterboxd> <username>`);
    }
    if (args[1].toLowerCase() === 'lastfm' || args[1].toLowerCase() === 'letterboxd') {
      linkAccount(msg.senderUserID, args[1].toLowerCase(), args[2].toLowerCase());
      return client.say(msg.channelName, `@${msg.senderUsername}, successfully linked ${args[1].toLowerCase()} account pog`);
    } else {
      return client.say(msg.channelName, `@${msg.senderUsername}, format is %link <lastfm|letterboxd> <username>`);
    }
  } else {
    if (!args[1]) {
      return client.say(msg.channelName, `@${msg.senderUsername}, format is %unlink <lastfm|letterboxd>`);
    }
    if (args[1].toLowerCase() === 'lastfm' || args[1].toLowerCase() === 'letterboxd') {
      unlinkAccount(msg.senderUserID, args[1].toLowerCase());
      return client.say(msg.channelName, `@${msg.senderUsername}, successfully unlinked ${args[1].toLowerCase()} account`);
    } else {
      return client.say(msg.channelName, `@${msg.senderUsername}, format is %unlink <lastfm|letterboxd>`);
    }
  }
}
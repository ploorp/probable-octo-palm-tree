import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { linkAccount, unlinkAccount } from '../db/dbManager.js';
import config from '../../config.json' with { type: 'json' };

export default async function link(msg: PrivmsgMessage, args: string[]) {
  args[0] = args[0].slice(config.prefix.length).toLowerCase();

  if (args[0].toLowerCase() === 'link') {
    if (!args[2]) {
      return saySafe(msg.channelName, `format is %link <lastfm|letterboxd|osu> <username>`, msg.messageID);
    }
    if (args[1].toLowerCase() === 'lastfm' || args[1].toLowerCase() === 'letterboxd' || args[1].toLowerCase() === 'osu') {
      linkAccount(msg.senderUserID, args[1].toLowerCase(), args[2].toLowerCase());
      return saySafe(msg.channelName, `successfully linked ${args[1].toLowerCase()} account pog`, msg.messageID);
    } else {
      return saySafe(msg.channelName, `format is %link <lastfm|letterboxd|osu> <username>`, msg.messageID);
    }
  } else {
    if (!args[1]) {
      return saySafe(msg.channelName, `format is %unlink <lastfm|letterboxd|osu>`, msg.messageID);
    }
    if (args[1].toLowerCase() === 'lastfm' || args[1].toLowerCase() === 'letterboxd' || args[1].toLowerCase() === 'osu') {
      unlinkAccount(msg.senderUserID, args[1].toLowerCase());
      return saySafe(msg.channelName, `successfully unlinked ${args[1].toLowerCase()} account`, msg.messageID);
    } else {
      return saySafe(msg.channelName, `format is %unlink <lastfm|letterboxd|osu>`, msg.messageID);
    }
  }
}
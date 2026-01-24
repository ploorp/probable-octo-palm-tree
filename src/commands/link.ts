import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { linkAccount, unlinkAccount } from '../db/dbManager.js';
import config from '../config/index.js';
import axios from 'axios';

export default async function link(msg: PrivmsgMessage, args: string[]) {
  args[0] = args[0].slice(config.prefix.length).toLowerCase();

  if (args[0].toLowerCase() === 'link') {
    if (!args[2]) {
      return saySafe(msg.channelName, `format is %link <lastfm|letterboxd|osu> <username>`, msg.messageID);
    }
    if (args[1].toLowerCase() === 'lastfm' || args[1].toLowerCase() === 'letterboxd' || args[1].toLowerCase() === 'osu') {
      const service = args[1].toLowerCase();
      const username = args[2].toLowerCase();

      if (service === 'lastfm') {
        if (!/^[a-zA-Z0-9_-]{2,15}$/.test(username)) {
          return saySafe(msg.channelName, `invalid lastfm username`, msg.messageID);
        }

        try {
          await axios.get('https://ws.audioscrobbler.com/2.0/', {
            headers: {
              'User-Agent': 'ploorp',
            },
            params: {
              method: 'user.getInfo',
              user: username,
              api_key: config.lastfm.client_id,
              format: 'json'
            }
          });
        } catch (e) {
          return saySafe(msg.channelName, `lastfm user not found`, msg.messageID);
        }
      }

      linkAccount(msg.senderUserID, service, username);
      return saySafe(msg.channelName, `successfully linked ${service} account pog`, msg.messageID);
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
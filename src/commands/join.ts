import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { partChannel, isWhitelisted, addChannel } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';
import config from '../config/index.js';

export default async function join(msg: PrivmsgMessage, args: string[]) {
  args[0] = args[0].slice(config.prefix.length).toLowerCase();

  if (!args[1]) {
    if (args[0]=== 'join') {
      try {
        await client.join(msg.senderUsername);
        addChannel(msg.senderUserID);
      } catch (error) {
        return saySafe(msg.channelName, 'error joining ' + msg.senderUsername, msg.messageID);
      }
      return saySafe(msg.channelName, 'joined ' + msg.senderUsername, msg.messageID);
    } else {
      try {
        await client.part(msg.senderUsername);
        partChannel(msg.senderUserID);
        return saySafe(msg.channelName, 'leaving ' + msg.senderUsername, msg.messageID);
      } catch (error) {
        return saySafe(msg.channelName, 'error Reacting', msg.messageID);
      }
    }
  } else {
    if (args[0] === 'join') {
      if (isWhitelisted(msg.senderUserID) || args[1].toLowerCase() === msg.senderUserID) {
        try {
          await client.join(args[1].toLowerCase());
          const joinId = await getUserId(args[1].toLowerCase()) as string;
          addChannel(joinId);
        } catch (error) {
          return saySafe(msg.channelName, 'error joining ' + args[1], msg.messageID);
        }
        return saySafe(msg.channelName, 'joined ' + args[1], msg.messageID);
      } else {
        return saySafe(msg.channelName, `you can only join your own channel`, msg.messageID);
      }
    } else if (isWhitelisted(msg.senderUserID) || args[1].toLowerCase() === msg.senderUserID) {
      try {
        saySafe(msg.channelName, 'leaving ' + args[1], msg.messageID);
        await client.part(args[1].toLowerCase());
        const partId = await getUserId(args[1].toLowerCase()) as string;
        return partChannel(partId);
      } catch (error) {
        return saySafe(msg.channelName, 'error Reacting', msg.messageID);
      }
    } else {
      return saySafe(msg.channelName, `you can only part your own channel`, msg.messageID);
    }
  }
}

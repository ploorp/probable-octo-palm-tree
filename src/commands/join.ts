import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { partChannel, isWhitelisted, addChannel } from '../db/dbManager.js';
import { getUserId } from '../helix.js';

export default async function join(msg: PrivmsgMessage, args: string[]) {
  args[0] = args[0].slice(1).toLowerCase();

  if (!args[1]) {
    if (args[0]=== 'join') {
      try {
        await client.join(msg.senderUsername);
        addChannel(msg.senderUserID);
      } catch (error) {
        return saySafe(msg.channelName, 'error joining ' + msg.senderUsername);
      }
      return saySafe(msg.channelName, 'joined ' + msg.senderUsername);
    } else {
      try {
        await client.part(msg.senderUsername);
        partChannel(msg.senderUserID);
        return saySafe(msg.channelName, 'leaving ' + msg.senderUsername);
      } catch (error) {
        return saySafe(msg.channelName, 'error Reacting');
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
          return saySafe(msg.channelName, 'error joining ' + args[1]);
        }
        return saySafe(msg.channelName, 'joined ' + args[1]);
      } else {
        return saySafe(msg.channelName, `@${msg.senderUsername}, you can only join your own channel`);
      }
    } else if (isWhitelisted(msg.senderUserID) || args[1].toLowerCase() === msg.senderUserID) {
      try {
        saySafe(msg.channelName, 'leaving ' + args[1]);
        await client.part(args[1].toLowerCase());
        const partId = await getUserId(args[1].toLowerCase()) as string;
        return partChannel(partId);
      } catch (error) {
        return saySafe(msg.channelName, 'error Reacting');
      }
    } else {
      return saySafe(msg.channelName, `@${msg.senderUsername}, you can only part your own channel`);
    }
  }
}

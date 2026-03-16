import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import { partChannel, isWhitelisted, addChannel } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';
import { timeLog } from '../utils.js';

export default async function join(msg: PrivmsgMessage, args: string[], command: string = "join") {

  if (!args[1]) {
    if (command === 'join') {
      try {
        await client.join(msg.senderUsername);
        addChannel(msg.senderUserID);
      } catch (error) {
        timeLog(`Error joining ${msg.senderUsername}: ${error}`);
        if (String(error).includes("Timed out")) {
             return saySafe(msg.channelName, 'error joining ' + msg.senderUsername + ' (timed out maybe banned?)', msg.messageID);
        }
        return saySafe(msg.channelName, 'error joining ' + msg.senderUsername, msg.messageID);
      }
      return saySafe(msg.channelName, 'joined ' + msg.senderUsername, msg.messageID);
    } else {
      try {
        await client.part(msg.senderUsername);
        partChannel(msg.senderUserID);
        return saySafe(msg.channelName, 'leaving ' + msg.senderUsername, msg.messageID);
      } catch (error) {
        timeLog(`Error parting ${msg.senderUsername}: ${error}`);
        return saySafe(msg.channelName, 'error Reacting', msg.messageID);
      }
    }
  } else {
    if (command === 'join') {
      if (isWhitelisted(msg.senderUserID) || args[1].toLowerCase() === msg.senderUsername) {
        try {
          await client.join(args[1].toLowerCase());
          const joinId = await getUserId(args[1].toLowerCase()) as string;
          addChannel(joinId);
        } catch (error) {
           timeLog(`Error joining ${args[1]}: ${error}`);
            if (String(error).includes("Timed out")) {
                 return saySafe(msg.channelName, 'error joining ' + args[1] + ' (timed out maybe banned?)', msg.messageID);
            }
          return saySafe(msg.channelName, 'error joining ' + args[1], msg.messageID);
        }
        return saySafe(msg.channelName, 'joined ' + args[1], msg.messageID);
      } else {
        return saySafe(msg.channelName, `you can only join your own channel`, msg.messageID);
      }
    } else if (isWhitelisted(msg.senderUserID) || args[1].toLowerCase() === msg.senderUsername) {
      try {
        saySafe(msg.channelName, 'leaving ' + args[1], msg.messageID);
        await client.part(args[1].toLowerCase());
        const partId = await getUserId(args[1].toLowerCase()) as string;
        return partChannel(partId);
      } catch (error) {
        timeLog(`Error parting ${args[1]}: ${error}`);
        return saySafe(msg.channelName, 'error Reacting', msg.messageID);
      }
    } else {
      return saySafe(msg.channelName, `you can only part your own channel`, msg.messageID);
    }
  }
}

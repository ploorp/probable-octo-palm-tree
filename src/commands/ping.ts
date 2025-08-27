import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client } from '../client.js';

export default async function ping(msg: PrivmsgMessage, startTime: Date) {
  const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;

  let uptimeStr = 
  days > 0 ? `${days}d ${hours}h` :
  hours > 0 ? `${hours}h ${minutes}m` :
  minutes > 0 ? `${minutes}m ${seconds}s` :
  `${seconds}s`;

  return saySafe(msg.channelName, `@${msg.senderUsername}, catHop guptime: ${uptimeStr}`);
}

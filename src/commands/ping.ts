import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getJoinedChannels } from '../db/dbManager.js';
import { saySafe } from '../client.js';

export default async function ping(msg: PrivmsgMessage, startTime: Date) {
  const uptimeSeconds = Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000));
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  const uptimeStr =
    days > 0 ? `${days}d ${hours}h` :
    hours > 0 ? `${hours}h ${minutes}m` :
    minutes > 0 ? `${minutes}m ${seconds}s` :
    `${seconds}s`;

  const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);

  const serverTimestamp = (msg as any)?.serverTimestamp as Date | undefined;
  const latencyMs = serverTimestamp instanceof Date ? Math.max(0, Date.now() - serverTimestamp.getTime()) : null;
  const latencyStr = latencyMs !== null ? ` | latency ${latencyMs}ms` : '';

  const totalChannels = (await getJoinedChannels()).length;

  return saySafe(
    msg.channelName,
    `catHop guptime ${uptimeStr} | mem ${memoryMb}MB${latencyStr} | total channels ${totalChannels}`,
    msg.messageID
  );
}
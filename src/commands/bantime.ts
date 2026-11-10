import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { getBanInfo, getUserId } from '../api/helix.js';

function formatDuration(createdAt: string): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000));
  const days = Math.floor(elapsedSeconds / 86400);
  const hours = Math.floor((elapsedSeconds % 86400) / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export async function bantimeCommand(msg: PrivmsgMessage, args: string[]) {
  const requestedName = args[1]?.replace(/^@/, '').trim();
  const username = requestedName || msg.senderUsername || msg.displayName;
  if (!username) {
    return saySafe(msg.channelName, 'Usage: %bantime <username>', msg.messageID);
  }

  const userId = await getUserId(username);
  if (!userId) {
    return saySafe(msg.channelName, `user ${username} not found`, msg.messageID);
  }

  try {
    const ban = await getBanInfo(userId, msg.channelID);
    if (!ban) {
      return saySafe(msg.channelName, `${username} is not currently banned.`, msg.messageID);
    }

    const duration = ban.endTime ? `${formatDuration(ban.createdAt)} (until ${ban.endTime})` : `${formatDuration(ban.createdAt)} (permanent)`;
    const reason = ban.reason ? ` Reason: ${ban.reason}` : '';
    return saySafe(msg.channelName, `${ban.userLogin} has been banned for ${duration}.${reason}`, msg.messageID);
  } catch {
    return saySafe(msg.channelName, `could not look up ${username}'s ban`, msg.messageID);
  }
}
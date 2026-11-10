import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { getBanInfo } from '../api/helix.js';
import { getTwitchAccountStatus } from '../api/twitch.js';

function formatDuration(seconds: number): string {
  let remaining = Math.max(0, Math.floor(seconds));
  const units = [
    { size: 31536000, name: 'year' },
    { size: 86400, name: 'day' },
    { size: 3600, name: 'hour' },
    { size: 60, name: 'minute' }
  ];
  const parts: string[] = [];

  for (const unit of units) {
    const count = Math.floor(remaining / unit.size);
    if (!count) continue;
    parts.push(`${count} ${unit.name}${count === 1 ? '' : 's'}`);
    remaining %= unit.size;
    if (parts.length === 2) break;
  }

  return parts.join(' ') || 'less than 1 minute';
}

export async function bantimeCommand(msg: PrivmsgMessage, args: string[]) {
  const requestedName = args[1]?.replace(/^@/, '').trim();
  if (!requestedName) {
    return saySafe(msg.channelName, '%bantime <username>', msg.messageID);
  }

  try {
    const account = await getTwitchAccountStatus(requestedName);
    if (!account) {
      return saySafe(msg.channelName, `${requestedName} not found`, msg.messageID);
    }

    if (account.banType) {
      return saySafe(msg.channelName, `${account.login} ${account.banType}`, msg.messageID);
    }

    if (!account.id) {
      return saySafe(msg.channelName, `${requestedName} not banned`, msg.messageID);
    }

    const ban = await getBanInfo(account.id, msg.channelID);
    if (!ban) {
      return saySafe(msg.channelName, `${account.login} not banned`, msg.messageID);
    }

    const elapsed = formatDuration((Date.now() - Date.parse(ban.createdAt)) / 1000);
    const remaining = ban.endTime
      ? ` remaining ${formatDuration((Date.parse(ban.endTime) - Date.now()) / 1000)}`
      : ' permanent';
    const reason = ban.reason ? ` reason ${ban.reason}` : '';
    return saySafe(msg.channelName, `${ban.userLogin} BANNED ${elapsed}${remaining}${reason}`, msg.messageID);
  } catch {
    return saySafe(msg.channelName, `${requestedName} lookup failed`, msg.messageID);
  }
}
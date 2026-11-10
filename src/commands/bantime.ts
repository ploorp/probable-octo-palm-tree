import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { getTwitchAccountStatus } from '../api/twitch.js';

function formatDuration(seconds: number): string {
  let remaining = Math.max(0, Math.floor(seconds));
  const units = [
    { size: 31536000, name: 'year' },
    { size: 2592000, name: 'month' },
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
      return saySafe(msg.channelName, `not found`, msg.messageID);
    }

    if (account.banType) {
      const duration = account.updatedAt
        ? ` ${formatDuration((Date.now() - Date.parse(account.updatedAt)) / 1000)}`
        : '';
      return saySafe(msg.channelName, `${account.login} ${account.banType}${duration}`, msg.messageID);
    }

    return saySafe(msg.channelName, `${account.login} is not banned`, msg.messageID);
  } catch {
    return saySafe(msg.channelName, `lookup failed`, msg.messageID);
  }
}
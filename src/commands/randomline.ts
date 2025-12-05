import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import axios from 'axios';
import { timeLog } from '../utils.js';

export default async function randomline(msg: PrivmsgMessage, args: string[]) {
  let channel = msg.channelName;
  let user: string | null = null;

  if (!args[1]) {
  } else if (!args[2]) {
    user = args[1].replace(/^@/, '');
    if (user === '*') {
      user = null;
    } else if (!/^[A-Za-z0-9_]+$/.test(user)) {
      return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
    }
  } else {
    channel = args[1].replace(/^@/, '');
    user = args[2].replace(/^@/, '');
    if (channel === '*') {
      channel = msg.channelName;
    } else if (!/^[A-Za-z0-9_]+$/.test(channel)) {
      return saySafe(msg.channelName, `bad channel name tupid`, msg.messageID);
    }
    if (user === '*') {
      user = null;
    } else if (!/^[A-Za-z0-9_]+$/.test(user)) {
      return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
    }
  }

  const url = user ? `https://logs.zonian.dev/channel/${channel}/user/${user}/random` : `https://logs.zonian.dev/channel/${channel}/random`;

  try {
    const res = await axios.get(url, { validateStatus: () => true });
    const body = res.data;

    if (res.status === 404) {
      console.log(body);
      if (!body) return saySafe(msg.channelName, `no lines found ohno`, msg.messageID);
      if (body.includes('The user does not exist')) {
        return saySafe(msg.channelName, `user not found ohno`, msg.messageID);
      }
      if (body.includes('The channel does not exist')) {
        return saySafe(msg.channelName, `channel not found ohno`, msg.messageID);
      }
      if (body.includes('No user logs found')) {
        return saySafe(msg.channelName, `no logs found ohno`, msg.messageID);
      }
    }

    const line = res.data.split(' ');
    const datetime = line[0].replace('[', '')

		const reply = `${datetime} ${line.slice(3).join(' ')}`;
		return saySafe(msg.channelName, reply.length > 490 ? reply.slice(0, 487) + '...' : reply);
	} catch (err: any) {
		timeLog(`randomline error for ${user}: ${err?.message ?? err}`);
		return saySafe(msg.channelName, `error Reacting`, msg.messageID);
	}
}

import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { client, saySafe } from '../client.js';
import axios from 'axios';
import { timeLog } from '../utils.js';

export default async function randomline(msg: PrivmsgMessage, args: string[]) {
    let user: string;
    let channel: string;

    if (!args[1]) {
        channel = msg.channelName;
        user = msg.senderUsername;
    } else {
        channel = args[1].replace(/^@/, '');
        if (!/^[a-z0-9_]+$/.test(channel)) {
		    return saySafe(msg.channelName, `@${msg.senderUsername}, bad channel name tupid`);
	    }
        if (args[2]) {
            user = args[2].replace(/^@/, '');
            if (!/^[a-z0-9_]+$/.test(user)) {
		        return saySafe(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
	        }
        } else {
            channel = msg.channelName;
            user = args[1].replace(/^@/, '');
        }
    }

	const url = `https://logs.zonian.dev/channel/${channel}/user/${user}/random`;

	try {
		const res = await axios.get(url);

        if (res.data === "The channel does not exist") {
            return saySafe(msg.channelName, `@${msg.senderUsername}, channel not found smh`);
        }

        if (res.data === "No user logs found") {
            return saySafe(msg.channelName, `@${msg.senderUsername}, no logs found ohno`);
        }

		const line = res.data.split(' ');
        const datetime = line[0].replace('[', '')

		const reply = `@${msg.senderUsername}, ${datetime} ${line.slice(3).join(' ')}`;
		return saySafe(msg.channelName, reply.length > 490 ? reply.slice(0, 487) + '...' : reply);
	} catch (err: any) {
		timeLog(`randomline error for ${user}: ${err?.message ?? err}`);
		return saySafe(msg.channelName, `@${msg.senderUsername}, error Reacting`);
	}
}

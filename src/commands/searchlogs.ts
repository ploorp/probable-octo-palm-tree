import { client, saySafe } from '../client.js';
import axios from 'axios';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { timeLog } from '../utils.js';
import { getPrefix } from '../db/dbManager.js';

export default async function searchlogs(msg: PrivmsgMessage, args: string[]) {
  const prefix = getPrefix(msg.channelID)

  if (args.length < 2) {
    return saySafe(msg.channelName, `format is ${prefix}searchlogs <channel> <username> <query>`, msg.messageID);
  }

  const channel = args[1].toLowerCase().replace(/^@/, '');
  const username = args[2].toLowerCase().replace(/^@/, '');
  const query = args.slice(3).join(' ').toLowerCase();

  if (!/^[a-z0-9_]+$/.test(username) || !/^[a-z0-9_]+$/.test(channel)) {
    return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
  }

  if (query.length > 100) {
    return saySafe(msg.channelName, `long ah query ☠️`, msg.messageID);
  }

  const logs = `https://logs.zonian.dev/channel/${channel}/user/${username}/search?reverse=true&q=${encodeURIComponent(query)}`
  let response;
  let lineCount = 0;

  try {
    response = await axios.get(logs);
    const lines = response.data.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== '') {
        lineCount++;
      }
    }
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return saySafe(msg.channelName, `no matching logs found smh`, msg.messageID);
    }
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }

  try {
    const shortenerResponse = await axios.get(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(logs)}`);
    const shortenedUrl = shortenerResponse.data;

    return saySafe(msg.channelName, `${lineCount} matches: ${shortenedUrl}`, msg.messageID);
  } catch (error: any) {
    timeLog(`Error shortening URL: ${error.message}`);
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }
}

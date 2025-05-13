import { client } from './client.js';
import { getUserInfo, usernameToID, getFirstSeen, isColorDefault, isPfpDefault, timeLog } from './utils.js';
import { chatBan, chatTimeout } from './helix.js';
import config from '../config.json' with { type: 'json' };

export default async function autoban(joinedUser: string, lastBan: any, msg: any) {
  const userInfo = await getUserInfo(joinedUser);

  if (!userInfo) {
    timeLog('null user info for: ' + joinedUser);
    return null;
  }

  const userID = await usernameToID(userInfo);
  const banChannels = config.ban_list;
  const banPattern = new RegExp(config.ban_pattern, "i");

  if (userID === config.id || config.channels.includes(joinedUser)) {
    timeLog('joined user is confirmed safe: ' + joinedUser);
    return null;
  }

  const firstSeenTimestamp = await getFirstSeen(userInfo);
  let isNewChatter = false;

  if (!userID) {
    isNewChatter = true; // new account
  } else if (firstSeenTimestamp) {
    const firstSeen = new Date(firstSeenTimestamp);
    const now = Date.now();
    isNewChatter = now - firstSeen.getTime() < 864000000; // 10 days
  }

  const isColorChanged = !await isColorDefault(userInfo);
  const isPfpChanged = !await isPfpDefault(userInfo);

  if (isNewChatter) {
    timeLog('isNewChatter ' + joinedUser);
    if (banPattern.test(joinedUser)) {
      timeLog('matched ban regex ' + joinedUser);
      for (const channel of banChannels) {
        chatBan(userID, channel, 'band');
        client.say(channel, `@${msg.channelName}, banned ${joinedUser} use %undo to unban`);
      }
      return joinedUser;
    } else if (!isColorChanged && !isPfpChanged) {
      timeLog('default color and pfp ' + joinedUser);
      chatTimeout(userID, msg.channelName, 3600, 'band');
      client.say(msg.channelName, `@${msg.channelName}, sus user @${joinedUser} joined, use %ban?`);
      return joinedUser;
    }
  }
  
  return null;
}
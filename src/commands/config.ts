import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getLastFmConfigs, setLastFmConfig, setLastFmConfigString } from '../db/dbManager.js';
import { saySafe } from '../client.js';

export default async function configSys(msg: PrivmsgMessage) {
  const args = msg.messageText.split(' ').slice(1);
  if (args.length === 0) {
    return saySafe(msg.channelName, 'usage: %config <system> - e.g. %config lastfm', msg.messageID);
  }

  const system = args[0].toLowerCase();
  
  if (system === 'lastfm') {
    const property = args[1]?.toLowerCase();
    const value = args[2]?.toLowerCase();

    const configs = getLastFmConfigs(msg.senderUserID);

    if (!property) {
      return saySafe(
        msg.channelName,
        `current lastfm configs: song-link: ${configs.songLink}, play-count: ${configs.playCount} | usage: %config lastfm <property> <value>`,
        msg.messageID
      );
    }

    if (!value) {
      if (property === 'song-link') {
        return saySafe(msg.channelName, `usage: %config lastfm song-link <none|spotify|youtube>`, msg.messageID);
      }
      return saySafe(msg.channelName, `usage: %config lastfm ${property} <true|false>`, msg.messageID);
    }

    if (property === 'song-link') {
      if (value !== 'none' && value !== 'spotify' && value !== 'youtube') {
        return saySafe(msg.channelName, 'song-link must be none, spotify, or youtube', msg.messageID);
      }
      setLastFmConfigString(msg.senderUserID, 'lastfm_song_link', value);
      return saySafe(msg.channelName, `lastfm song-link is now ${value}`, msg.messageID);
    }

    let isTrue = false;
    if (value === 'true' || value === '1' || value === 'on') isTrue = true;
    else if (value === 'false' || value === '0' || value === 'off') isTrue = false;
    else {
      return saySafe(msg.channelName, 'value must be true or false', msg.messageID);
    }

    if (property === 'play-count') {
      setLastFmConfig(msg.senderUserID, 'lastfm_play_count', isTrue);
      return saySafe(msg.channelName, `lastfm play-count is now ${isTrue}`, msg.messageID);
    } else {
      return saySafe(msg.channelName, 'unknown property. available: song-link, play-count', msg.messageID);
    }
  }

  return saySafe(msg.channelName, 'unknown system. available: lastfm', msg.messageID);
}

import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getLastFmConfigs, getWhoKnowsConfigs, setLastFmConfig, setLastFmConfigString, setWhoKnowsConfig } from '../db/dbManager.js';
import { saySafe } from '../client.js';

export default async function configSys(msg: PrivmsgMessage) {
  const args = msg.messageText.split(' ').slice(1);
  if (args.length === 0) {
    return saySafe(msg.channelName, 'usage: %config <system> <property> <value> - try a command to see available options', msg.messageID);
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

    if (property !== 'song-link' && property !== 'play-count') {
      return saySafe(msg.channelName, 'unknown property. available: song-link, play-count', msg.messageID);
    }

    if (!value) {
      if (property === 'song-link') {
        return saySafe(msg.channelName, `usage: %config lastfm song-link <none|spotify|youtube|lastfm>`, msg.messageID);
      }
      return saySafe(msg.channelName, `usage: %config lastfm play-count <true|false>`, msg.messageID);
    }

    if (property === 'song-link') {
      if (value !== 'none' && value !== 'spotify' && value !== 'youtube' && value !== 'lastfm') {
        return saySafe(msg.channelName, 'song-link must be none, spotify, youtube, or lastfm', msg.messageID);
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
    }
  }

  if (system === 'whoknows') {
    const property = args[1]?.toLowerCase();
    const value = args[2]?.toLowerCase();

    const configs = getWhoKnowsConfigs(msg.senderUserID);

    if (!property) {
      return saySafe(
        msg.channelName,
        `current whoknows configs: antiping: ${configs.antiPing} | usage: %config whoknows <property> <value>`,
        msg.messageID
      );
    }

    if (property !== 'antiping') {
      return saySafe(msg.channelName, 'unknown property. available: antiping', msg.messageID);
    }

    if (!value) {
      return saySafe(msg.channelName, 'usage: %config whoknows antiping <true|false>', msg.messageID);
    }

    let isTrue = false;
    if (value === 'true' || value === '1' || value === 'on') isTrue = true;
    else if (value === 'false' || value === '0' || value === 'off') isTrue = false;
    else {
      return saySafe(msg.channelName, 'value must be true or false', msg.messageID);
    }

    setWhoKnowsConfig(msg.senderUserID, 'whoknows_antiping', isTrue);
    return saySafe(msg.channelName, `whoknows antiping is now ${isTrue}`, msg.messageID);
  }

  return saySafe(msg.channelName, 'unknown system. available: lastfm, whoknows', msg.messageID);
}

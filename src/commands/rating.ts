import { saySafe } from '../client.js';
import axios from 'axios';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getPrefix } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default async function rating(msg: PrivmsgMessage, args: string[]) {
  let username: string | undefined;
  let displayName: string | undefined;
  let query: string;

  const prefix = getPrefix(msg.channelID);

  if (!args[1]) {
    return saySafe(msg.channelName, `usage: ${prefix}rating [@username] <movie title>`, msg.messageID);
  }

  if (args[1].startsWith("@")) {
    const twitchName = args[1].replace(/^@/, '').toLowerCase();
    const twitchId = await getUserId(twitchName) as string;
    const account = getAccount(twitchId, 'letterboxd');
    if (account) {
      username = account;
      displayName = twitchName;
      query = args.slice(2).join(' ').trim();
    } else {
      return saySafe(msg.channelName, `they dont have a letterboxd account linked`, msg.messageID);
    }
  } else if (args[1].startsWith("u:")) {
    username = args[1].substring(2).toLowerCase();
    displayName = username;
    query = args.slice(2).join(' ').trim();
    if (!/^[a-z0-9_]+$/.test(username)) {
      return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
    }
  } else {
    const account = getAccount(msg.senderUserID, 'letterboxd');
    username = account || msg.senderUsername;
    displayName = username;
    query = args.slice(1).join(' ').trim();
  }

  if (!query) {
    return saySafe(msg.channelName, `usage: ${prefix}rating [@username] <movie title>`, msg.messageID);
  }

  let xmlData;
  try {
    const rssUrl = `https://letterboxd.com/${username}/rss/`;
    const response = await axios.get(rssUrl, { headers: { 'User-Agent': UA } });
    xmlData = response.data;
  } catch (error) {
    return saySafe(msg.channelName, `bad username or error fetching letterboxd`, msg.messageID);
  }

  const items = xmlData.match(/<item>(.*?)<\/item>/gs);
  if (!items) {
    return saySafe(msg.channelName, `${displayName} has no recent movie ratings`, msg.messageID);
  }

  let foundItem = null;
  const lowerQuery = query.toLowerCase();

  for (const item of items) {
    const titleMatch = item.match(/<letterboxd:filmTitle>(.*?)<\/letterboxd:filmTitle>/);
    const originalTitleMatch = item.match(/<title>(.*?),\s+\d{4}\s+-.*?<\/title>/);
    
    let filmTitle = titleMatch ? titleMatch[1] : '';
    if (!filmTitle && originalTitleMatch) {
      filmTitle = originalTitleMatch[1];
    }
    
    if (filmTitle && filmTitle.toLowerCase().includes(lowerQuery)) {
      foundItem = item;
      break;
    }
  }

  if (!foundItem) {
    // If not found in RSS, they might be searching for an older movie!
    // Since scraping letterboxd search is blocked by CF, we can't reliably get past 50 entries right now.
    return saySafe(msg.channelName, `no recent movie found for "${query}" (check last 50)`, msg.messageID);
  }

  const linkMatch = foundItem.match(/<link>(.*?)<\/link>/);
  const titleMatch = foundItem.match(/<letterboxd:filmTitle>(.*?)<\/letterboxd:filmTitle>/);
  const yearMatch = foundItem.match(/<letterboxd:filmYear>(.*?)<\/letterboxd:filmYear>/);
  const ratingMatch = foundItem.match(/<letterboxd:memberRating>(.*?)<\/letterboxd:memberRating>/);
  const likeMatch = foundItem.match(/<letterboxd:memberLike>(.*?)<\/letterboxd:memberLike>/);
  const rewatchMatch = foundItem.match(/<letterboxd:rewatch>(.*?)<\/letterboxd:rewatch>/);
  const dateMatch = foundItem.match(/<letterboxd:watchedDate>(.*?)<\/letterboxd:watchedDate>/);
  
  const movieTitle = titleMatch ? titleMatch[1] : query;
  const reviewUrl = linkMatch ? linkMatch[1] : `https://letterboxd.com/${username}/`;
  const dateLogged = dateMatch ? dateMatch[1] : '';
  const ratingVal = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
  const like = likeMatch ? (likeMatch[1] === 'Yes') : false;
  const rewatch = (rewatchMatch && rewatchMatch[1] === 'Yes') ? 'rewatched' : 'watched';
  const releaseDate = yearMatch ? yearMatch[1] : 'Unknown';

  const ratingText = `${ratingVal || like ? 'rating:' + (ratingVal ? ' ' + ratingVal + '/5' : '') + (like ? ' ❤️' : '') : ''}`;

  const message = `${dateLogged} ${displayName} ${rewatch} ${movieTitle} (${releaseDate}) ${ratingText} ${reviewUrl}`;

  return saySafe(msg.channelName, `${message}`.trim().replace(/\s+/g, ' '), msg.messageID);
}

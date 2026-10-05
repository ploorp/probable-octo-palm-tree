import { saySafe } from '../client.js';
import axios from 'axios';
import { getUserId } from '../api/helix.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount } from '../db/dbManager.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default async function boxd(msg: PrivmsgMessage, args: string[]) {
  let username: string | undefined;
  let displayName: string | undefined;
  let rssUrl: string;
  let response;

  if (!args[1]) {
    const account = getAccount(msg.senderUserID, 'letterboxd');
    if (account) {
      username = account;
    } else {
      username = msg.senderUsername;
    }
    displayName = username;
  } else {
    if (args[1].startsWith("@")) {
      const twitchName = args[1].replace(/^@/, '').toLowerCase();
      const twitchId = await getUserId(twitchName) as string;
      const account = getAccount(twitchId, 'letterboxd');
      if (account) {
        username = account;
        displayName = twitchName;
      } else {
        return saySafe(msg.channelName, `they dont have a letterboxd account linked`, msg.messageID);
      }
    } else {
      username = args[1].toLowerCase();
      displayName = username;
      if (!/^[a-z0-9_]+$/.test(username)) {
        return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
      }
    }
  }

  rssUrl = `https://letterboxd.com/${username}/rss/`;
  try {
    response = await axios.get(rssUrl, { headers: { 'User-Agent': UA } });
  } catch (error) {
    return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
  }

  const xmlData = response.data;
  const itemMatch = xmlData.match(/<item>(.*?)<\/item>/s);

  if (!itemMatch) {
    return saySafe(msg.channelName,`${displayName} has not logged any movies smh`, msg.messageID);
  }

  const itemXml = itemMatch[1];
  
  const linkMatch = itemXml.match(/<link>(.*?)<\/link>/);
  if (!linkMatch || !linkMatch[1].includes('/film/')) {
    return saySafe(msg.channelName,`${displayName} has not logged any movies smh`, msg.messageID);
  }

  const titleMatch = itemXml.match(/<letterboxd:filmTitle>(.*?)<\/letterboxd:filmTitle>/);
  const yearMatch = itemXml.match(/<letterboxd:filmYear>(.*?)<\/letterboxd:filmYear>/);
  const ratingMatch = itemXml.match(/<letterboxd:memberRating>(.*?)<\/letterboxd:memberRating>/);
  const likeMatch = itemXml.match(/<letterboxd:memberLike>(.*?)<\/letterboxd:memberLike>/);
  const rewatchMatch = itemXml.match(/<letterboxd:rewatch>(.*?)<\/letterboxd:rewatch>/);
  const dateMatch = itemXml.match(/<letterboxd:watchedDate>(.*?)<\/letterboxd:watchedDate>/);
  const descMatch = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s);

  const movieTitle = titleMatch ? titleMatch[1] : 'Unknown';
  const reviewUrl = linkMatch[1];
  const dateLogged = dateMatch ? dateMatch[1] : '';
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
  const like = likeMatch ? likeMatch[1] === 'Yes' : false;
  const rewatch = (rewatchMatch && rewatchMatch[1] === 'Yes') ? 'rewatched' : 'watched';
  const releaseDate = yearMatch ? yearMatch[1] : 'Unknown';

  let review = '';
  if (descMatch) {
      // Very basic stripping of p tags and images
      const descText = descMatch[1].replace(/<p><img.*?><\/p>/, '').replace(/<p>/g, '').replace(/<\/p>/g, ' ').trim();
      if (descText && !descText.startsWith('Watched on')) {
          review = descText;
      }
  }

  if (review && review.length > 150) {
    review = review.slice(0, 150) + '...';
  }

  const ratingText = `${rating || like ? 'rating:' + (rating ? ' ' + rating + '/5' : '') + (like ? ' ❤️' : '') : ''}`;
  const reviewText = `${review ? 'review: ' + review : ''}`;

  const message = `${dateLogged} ${displayName} ${rewatch} ${movieTitle} (${releaseDate}) ${ratingText} ${reviewText} ${reviewUrl}`;

  return saySafe(msg.channelName, `${message}`, msg.messageID);
}

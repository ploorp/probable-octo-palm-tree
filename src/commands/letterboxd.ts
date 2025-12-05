import { client, saySafe } from '../client.js';
import axios from 'axios';
import { getUserId } from '../helix.js';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount } from '../db/dbManager.js';

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
    response = await axios.get(rssUrl);
  } catch (error) {
    return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
  }

  const xmlData = response.data;
  const linkMatch = xmlData.match(/<item>.*?<link>(.*?)<\/link>/s);

  if (!linkMatch || !linkMatch[1].includes('/film/')) {
    return saySafe(msg.channelName,`${displayName} has not logged any movies smh`, msg.messageID);
  }

  const jsonUrl = linkMatch[1] + '/json';
  let jsonResponse;

  try {
    jsonResponse = await axios.get(jsonUrl);
  } catch (error) {
    return saySafe(msg.channelName,`error Reacting`, msg.messageID);
  }

  const jsonData = jsonResponse.data;

  const movieTitle = jsonData.viewingable.name;
  const reviewUrl = `https://letterboxd.com/${username}/film/${jsonData.viewingable.slug}`;
  //const movieUrl = `https://letterboxd.com/film/${jsonData.viewingable.slug}`;
  //const profileUrl = `https://letterboxd.com/${username}/`;
  const dateLogged = jsonData.viewingDate;
  const rating = jsonData.rating;
  const rewatch = jsonData.rewatch ? 'rewatched' : 'watched';
  const releaseDate = jsonData.viewingable.releaseYear;
  const like = jsonData.liked;

  let review = jsonData.reviewText;
  if (review && review.length > 150) {
    review = review.slice(0, 150) + '...';
  }

  const ratingText = `${rating || like ? 'rating:' + (rating ? ' ' + rating/2 + '/5' : '') + (like ? ' ❤️' : '') : ''}`;
  const reviewText = `${review ? 'review: ' + review : ''}`;

  const message = `${dateLogged} ${displayName} ${rewatch} ${movieTitle} (${releaseDate}) ${ratingText} ${reviewUrl}`;

  return saySafe(msg.channelName, `${message}`, msg.messageID);
}

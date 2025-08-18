import { client } from '../client.js';
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
    const dbAccount = getAccount(msg.senderUserID, 'letterboxd');
    if (dbAccount && dbAccount.handle) {
      username = dbAccount.handle;
    } else {
      username = msg.senderUsername;
    }
    displayName = username;
  } else {
    if (args[1].startsWith("@")) {
      const twitchName = args[1].replace(/^@/, '').toLowerCase();
      const twitchId = await getUserId(twitchName) as string;
      const dbAccount = getAccount(twitchId, 'letterboxd');
      if (dbAccount && dbAccount.handle) {
        username = dbAccount.handle;
        displayName = twitchName;
      } else {
        return client.say(msg.channelName, `@${msg.senderUsername}, they dont have a letterboxd account linked`);
      }
    } else {
      username = args[1].toLowerCase();
      displayName = username;
      if (!/^[a-z0-9_]+$/.test(username)) {
        return client.say(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
      }
    }
  }

  rssUrl = `https://letterboxd.com/${username}/rss/`;
  try {
    response = await axios.get(rssUrl);
  } catch (error) {
    return client.say(msg.channelName, `@${msg.senderUsername}, bad username tupid`);
  }

  const xmlData = response.data;
  const linkMatch = xmlData.match(/<item>.*?<link>(.*?)<\/link>/s);

  if (!linkMatch || !linkMatch[1].includes('/film/')) {
    return client.say(msg.channelName,`@${msg.senderUsername}, ${displayName} has not logged any movies smh`);
  }

  const jsonUrl = linkMatch[1] + '/json';
  let jsonResponse;

  try {
    jsonResponse = await axios.get(jsonUrl);
  } catch (error) {
    return client.say(msg.channelName,`@${msg.senderUsername}, error Reacting`);
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

  return client.say(msg.channelName, `@${msg.senderUsername}, ${message}`);
}

import { saySafe } from '../client.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getPrefix } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';
import { timeLog } from '../utils.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function searchFilmHtml(query: string): Promise<{ slug: string; title: string } | null> {
  const url = `https://letterboxd.com/s/search/films/${encodeURIComponent(query)}/`;
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': UA } });
    const $ = cheerio.load(html);
    const first = $('li.search-result.-production').first();
    if (!first || !first.length) return null;

    const slug =
      first.find('[data-film-slug]').attr('data-film-slug') ||
      first.find('[data-item-slug]').attr('data-item-slug') ||
      (first.find('h2.headline-2 a').attr('href') || '').split('/').filter(Boolean).pop() ||
      first.find('[data-item-link]').attr('data-item-link');

    const title = first.find('h2.headline-2 a').first().clone().children().remove().end().text().trim();

    return slug && title ? { slug, title } : null;
  } catch (err) {
    timeLog('letterboxd search failed' + err);
    return null;
  }
}

export default async function rating(msg: PrivmsgMessage, args: string[]) {
  let username: string | undefined;
  let displayName: string | undefined;

  const prefix = getPrefix(msg.channelID);

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

  const query = args.slice(2).join(' ').trim();

  if (!query) {
    return saySafe(msg.channelName, `usage: ${prefix}rating <username> <movie title>`, msg.messageID);
  }

  const found = await searchFilmHtml(query);
  if (!found) {
    return saySafe(msg.channelName, `no movie found tupid`, msg.messageID);
  }

  let jsonResponse;

  try {
    jsonResponse = await axios.get(`https://letterboxd.com/${username}/film/${found.slug}/json/`);
  } catch (error) {
    return saySafe(msg.channelName, `no review found sad`, msg.messageID);
  }

  const jsonData = jsonResponse.data;

  const movieTitle = jsonData.viewingable.name;
  const reviewUrl = `https://letterboxd.com/${username}/film/${found.slug}`;
  const dateLogged = jsonData.viewingDate;
  const ratingVal = jsonData.rating;
  const rewatch = jsonData.rewatch ? 'rewatched' : 'watched';
  const releaseDate = jsonData.viewingable.releaseYear;
  const like = jsonData.liked;

  const ratingText = `${ratingVal || like ? 'rating:' + (ratingVal ? ' ' + ratingVal/2 + '/5' : '') + (like ? ' ❤️' : '') : ''}`;

  const message = `${dateLogged} ${displayName} ${rewatch} ${movieTitle} (${releaseDate}) ${ratingText} ${reviewUrl}`;

  return saySafe(msg.channelName, `${message}`, msg.messageID);
}

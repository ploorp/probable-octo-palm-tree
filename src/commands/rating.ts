import { client } from '../client.js';
import axios from 'axios';
import config from '../../config.json' with { type: 'json' };
import * as cheerio from 'cheerio';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getPrefix } from '../db/dbManager.js';
import { getUserId } from '../helix.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function human(n: number | null): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

async function searchFilmHtml(query: string): Promise<{ slug: string; title: string } | null> {
  const url = `https://letterboxd.com/s/search/films/${encodeURIComponent(query)}/`;
  try {
    const { data: html } = await axios.get(url, { headers: { 'User-Agent': UA } });
    const $ = cheerio.load(html);
    const first = $('li.search-result.-production').first();
    const slug = first.find('[data-film-slug]').attr('data-film-slug');
    const title = first.find('h2.headline-2 a').first().clone().children().remove().end().text().trim();
    return slug && title ? { slug, title } : null;
  } catch (err) {
    console.error('Letterboxd search failed', err);
    return null;
  }
}

async function scrapeFilm(slug: string): Promise<{
  title: string;
  slug: string;
  year: string | null;
  average: number | null;
  ratings: number | null;
  director: string | null;
}> {
  const url = `https://letterboxd.com/film/${slug}/`;
  const { data: html } = await axios.get(url, { headers: { 'User-Agent': UA } });

  const ogTitle = html.match(/property="og:title"[^>]*content="([^"]+)"/i)?.[1] ?? slug;
  const [, title = ogTitle, year = null] = ogTitle.match(/^(.*)\s\((\d{4})\)$/) || [];

  const director = html.match(/name="twitter:data1"[^>]*content="([^"]+)"/i)?.[1] ?? null;

  const average = parseFloat(html.match(/"ratingValue":\s*([\d.]+)/)?.[1] || '') || null;
  const ratings = parseInt(html.match(/"ratingCount":\s*(\d+)/)?.[1] || '') || null;

  return { title, slug, year, average, ratings, director };
}

export default async function rating(msg: PrivmsgMessage, args: string[]) {
  let username: string | undefined;
  let displayName: string | undefined;

  const prefix = getPrefix(msg.channelID);

  if (!args[1]) {
    const dbAccount = getAccount(msg.senderUserID, 'letterboxd') as { handle?: string } | null;
    if (dbAccount && dbAccount.handle) {
      username = dbAccount.handle;
    } else {
      username = msg.senderUsername;
    }
    displayName = username;
  } else {
    if (args[1].startsWith("@")) {
      const twitchName = args[1].replace(/^@/, '').toLowerCase();
      const twitchId = await getUserId(twitchName);
      const dbAccount = getAccount(twitchId, 'letterboxd') as { handle?: string } | null;
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

  const query = args.slice(2).join(' ').trim();

  if (!query) {
    return client.say(
      msg.channelName,
      `@${msg.senderUsername}, usage: ${prefix}rating <username> <movie title>`
    );
  }

  const found = await searchFilmHtml(query);
  if (!found) {
    return client.say(msg.channelName, `@${msg.senderUsername}, no movie found tupid`);
  }

  let jsonResponse;

  try {
    jsonResponse = await axios.get(`https://letterboxd.com/${username}/film/${found.slug}/json/`);
  } catch (error) {
    return client.say(msg.channelName, `@${msg.senderUsername}, no review found sad`);
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

  return client.say(msg.channelName, `@${msg.senderUsername}, ${message}`);
}

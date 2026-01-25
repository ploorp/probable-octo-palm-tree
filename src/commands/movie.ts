import { saySafe } from '../client.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getPrefix } from '../db/dbManager.js';
import { timeLog } from '../utils.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  'Referer': 'https://letterboxd.com/',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'max-age=0',
  'Upgrade-Insecure-Requests': '1'
};

async function searchFilmHtml(query: string): Promise<{ slug: string; title: string } | null> {
  const url = `https://letterboxd.com/s/search/films/${encodeURIComponent(query)}/`;
  try {
    const { data: html } = await axios.get(url, { headers: HEADERS });
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

async function scrapeFilm(slug: string): Promise<{
  title: string;
  slug: string;
  year: string | null;
  average: number | null;
  ratings: number | null;
  director: string | null;
}> {
  const url = `https://letterboxd.com/film/${slug}/`;
  const { data: html } = await axios.get(url, { headers: HEADERS });

  const ogTitle = html.match(/property="og:title"[^>]*content="([^"]+)"/i)?.[1] ?? slug;
  const [, title = ogTitle, year = null] = ogTitle.match(/^(.*)\s\((\d{4})\)$/) || [];

  const director = html.match(/name="twitter:data1"[^>]*content="([^"]+)"/i)?.[1] ?? null;

  const average = parseFloat(html.match(/"ratingValue":\s*([\d.]+)/)?.[1] || '') || null;
  const ratings = parseInt(html.match(/"ratingCount":\s*(\d+)/)?.[1] || '') || null;

  return { title, slug, year, average, ratings, director };
}

function formatRatings(n: number | null): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default async function movie(msg: PrivmsgMessage, args: string[]) {
  const prefix = getPrefix(msg.channelID)

  const query = args.slice(1).join(' ').trim();

  if (!query) {
    return saySafe(msg.channelName, `usage: ${prefix}movie <movie title>`, msg.messageID);
  }

  const found = await searchFilmHtml(query);
  if (!found) {
    return saySafe(msg.channelName, `no movie found tupid`, msg.messageID);
  }

  const data = await scrapeFilm(found.slug);
  if (!data) {
    return saySafe(msg.channelName, `error Reacting`, msg.messageID);
  }

  const ratingText = data.average ? `${data.average.toFixed(2)}/5 avg` : 'no rating';
  const ratingsText = data.ratings ? `${formatRatings(data.ratings)} ratings` : '0 ratings';
  const directorText = data.director || 'unknown director';
  const yearText = data.year || 'n.d.';

  const message = `${data.title} (${yearText}) by ${directorText} - ${ratingText} from ${ratingsText} https://letterboxd.com/film/${data.slug}/`;

  return saySafe(msg.channelName, `${message}`, msg.messageID);
}

import { saySafe } from '../client.js';
import axios from 'axios';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getPrefix } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';
import { timeLog } from '../utils.js';
import config from '../config/index.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function searchFilmTmdb(
  query: string
): Promise<{ slug: string; title: string; year?: string } | null> {
  try {
    const { data } = await axios.get('https://api.themoviedb.org/3/search/movie', {
      params: {
        api_key: config.tmdb.api_key,
        query,
        include_adult: true,
        page: 1,
      },
      headers: { 'User-Agent': UA },
    });

    const movie = data?.results?.[0];
    if (!movie?.id) return null;

    const res = await axios.get(`https://letterboxd.com/tmdb/${movie.id}`, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://letterboxd.com/',
      },
      maxRedirects: 0,
      validateStatus: status => status >= 300 && status < 400,
    });

    const location = res.headers.location as string | undefined;
    const slug = location?.match(/\/film\/([^/]+)/)?.[1];

    if (!slug) return null;

    return {
      slug,
      title: movie.title,
      year: movie.release_date?.slice(0, 4),
    };
  } catch (err) {
    timeLog(`tmdb search failed ${err}`);
    return null;
  }
}

export default async function rating(msg: PrivmsgMessage, args: string[]) {
  let username: string | undefined;
  let displayName: string | undefined;
  let query = '';

  const prefix = getPrefix(msg.channelID);

  if (!args[1]) {
    const account = getAccount(msg.senderUserID, 'letterboxd');
    username = account || msg.senderUsername;
    displayName = username;
  } else if (args[1].startsWith('@')) {
    const twitchName = args[1].replace(/^@/, '').toLowerCase();
    const twitchId = (await getUserId(twitchName)) as string;
    const account = getAccount(twitchId, 'letterboxd');

    if (!account) {
      return saySafe(msg.channelName, `they dont have a letterboxd account linked`, msg.messageID);
    }

    username = account;
    displayName = twitchName;
    query = args.slice(2).join(' ').trim();
  } else if (args[1].startsWith('u:')) {
    username = args[1].slice(2).toLowerCase();
    displayName = username;

    if (!/^[a-z0-9_]+$/.test(username)) {
      return saySafe(msg.channelName, `bad username tupid`, msg.messageID);
    }

    query = args.slice(2).join(' ').trim();
  } else {
    const account = getAccount(msg.senderUserID, 'letterboxd');
    username = account || msg.senderUsername;
    displayName = username;
    query = args.slice(1).join(' ').trim();
  }

  if (!query) {
    return saySafe(
      msg.channelName,
      `usage: ${prefix}rating [@username|u:letterboxd] <movie title>`,
      msg.messageID
    );
  }

  if (!process.env.TMDB_API_KEY) {
    return saySafe(msg.channelName, `tmdb api key missing`, msg.messageID);
  }

  const found = await searchFilmTmdb(query);
  if (!found) {
    return saySafe(msg.channelName, `no movie found tupid`, msg.messageID);
  }

  let jsonResponse;
  try {
    jsonResponse = await axios.get(`https://letterboxd.com/${username}/film/${found.slug}/json/`, {
      headers: { 'User-Agent': UA },
    });
  } catch {
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

  const ratingText =
    ratingVal || like
      ? `rating:${ratingVal ? ` ${ratingVal / 2}/5` : ''}${like ? ' ❤️' : ''}`
      : '';

  const message = [
    dateLogged,
    displayName,
    rewatch,
    movieTitle,
    releaseDate ? `(${releaseDate})` : '',
    ratingText,
    reviewUrl,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return saySafe(msg.channelName, message, msg.messageID);
}
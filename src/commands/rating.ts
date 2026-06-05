import { saySafe } from '../client.js';
import axios from 'axios';
import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { getAccount, getPrefix } from '../db/dbManager.js';
import { getUserId } from '../api/helix.js';
import { timeLog } from '../utils.js';
import config from '../config/index.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type FoundFilm = {
  slug: string;
  title: string;
  year?: string;
};

type FilmData = {
  movieTitle: string;
  dateLogged: string;
  ratingText: string;
  rewatch: 'watched' | 'rewatched';
  releaseYear?: string;
  reviewUrl: string;
};

function formatRating(rating: number | null | undefined, liked: boolean): string {
  if (rating == null && !liked) return '';
  if (rating == null) return liked ? '❤️' : '';
  return liked ? `${rating}/5 ❤️` : `${rating}/5`;
}

async function searchFilmTmdb(query: string): Promise<FoundFilm | null> {
  try {
    timeLog(`tmdb query="${query}" key=${config.tmdb?.api_key ? 'present' : 'missing'}`);

    const tmdbRes = await axios.get('https://api.themoviedb.org/3/search/movie', {
      params: {
        api_key: config.tmdb.api_key,
        query,
        include_adult: true,
        page: 1,
      },
      headers: { 'User-Agent': UA },
      validateStatus: () => true,
    });

    timeLog(`tmdb status=${tmdbRes.status} url=${tmdbRes.config.url}`);

    if (tmdbRes.status !== 200) {
      timeLog(`tmdb body=${JSON.stringify(tmdbRes.data).slice(0, 500)}`);
      return null;
    }

    const movie = tmdbRes.data?.results?.[0];
    if (!movie?.id) {
      timeLog(`tmdb no results for query="${query}"`);
      return null;
    }

    const lbRes = await axios.get(`https://letterboxd.com/tmdb/${movie.id}`, {
      headers: {
        'User-Agent': UA,
        Referer: 'https://letterboxd.com/',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
      },
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const finalUrl = lbRes.request?.res?.responseUrl || lbRes.headers.location;
    const slug = finalUrl?.match(/\/film\/([^/]+)/)?.[1];

    timeLog(
      `letterboxd tmdb status=${lbRes.status} finalUrl=${finalUrl || 'none'} slug=${slug || 'none'}`
    );

    if (!slug) return null;

    return {
      slug,
      title: movie.title,
      year: movie.release_date?.slice(0, 4),
    };
  } catch (err: any) {
    timeLog(`tmdb search failed ${err?.message || err}`);
    return null;
  }
}

async function getUserFilmData(username: string, slug: string): Promise<FilmData | null> {
  const jsonUrl = `https://letterboxd.com/${username}/film/${slug}/json/`;

  try {
    const jsonRes = await axios.get(jsonUrl, {
      headers: { 'User-Agent': UA },
      validateStatus: () => true,
    });

    timeLog(`letterboxd json status=${jsonRes.status} url=${jsonUrl}`);

    if (jsonRes.status !== 200 || !jsonRes.data?.viewingable) {
      timeLog(`letterboxd json body=${JSON.stringify(jsonRes.data).slice(0, 500)}`);
      return null;
    }

    const d = jsonRes.data;

    return {
      movieTitle: d.viewingable.name,
      dateLogged: d.viewingDate || '',
      ratingText: formatRating(d.rating, !!d.liked),
      rewatch: d.rewatch ? 'rewatched' : 'watched',
      releaseYear: d.viewingable.releaseYear,
      reviewUrl: `https://letterboxd.com/${username}/film/${slug}`,
    };
  } catch (err: any) {
    timeLog(`letterboxd json failed ${err?.message || err}`);
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
    query = args.slice(1).join(' ').trim();
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

  if (!config.tmdb?.api_key) {
    return saySafe(msg.channelName, `tmdb api key missing`, msg.messageID);
  }

  const found = await searchFilmTmdb(query);
  if (!found) {
    return saySafe(msg.channelName, `no movie found tupid`, msg.messageID);
  }

  const filmData = await getUserFilmData(username!, found.slug);
  if (!filmData) {
    return saySafe(msg.channelName, `no review found sad`, msg.messageID);
  }

  const parts = [
    filmData.dateLogged,
    displayName,
    filmData.rewatch,
    filmData.movieTitle,
    filmData.releaseYear ? `(${filmData.releaseYear})` : '',
    filmData.ratingText ? `rating: ${filmData.ratingText}` : '',
    filmData.reviewUrl,
  ].filter(Boolean);

  return saySafe(
    msg.channelName,
    parts.join(' ').replace(/\s+/g, ' ').trim(),
    msg.messageID
  );
}
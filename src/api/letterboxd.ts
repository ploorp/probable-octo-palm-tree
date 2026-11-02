import axios from 'axios';
import * as cheerio from 'cheerio';
import { timeLog } from '../utils.js';
import config from '../config/index.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HEADERS = {
	'User-Agent': UA,
	'Referer': 'https://letterboxd.com/',
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
	'Accept-Language': 'en-US,en;q=0.9',
	'Cache-Control': 'max-age=0',
	'Upgrade-Insecure-Requests': '1'
};

export type LetterboxdFilm = {
	title: string;
	slug: string;
	year: string | null;
	average: number | null;
	ratings: number | null;
	director: string | null;
};

function filmSlug(title: string): string {
	return title
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

async function searchTmdbFilm(query: string): Promise<LetterboxdFilm | null> {
	if (!config.tmdb?.api_key) return null;

	try {
		const search = await axios.get('https://api.themoviedb.org/3/search/movie', {
			params: { api_key: config.tmdb.api_key, query, include_adult: true, page: 1 },
			headers: { 'User-Agent': UA },
		});
		const movie = search.data?.results?.[0];
		if (!movie?.id || !movie.title) return null;
		return getTmdbFilmById(movie.id, movie);
	} catch (err) {
		timeLog(`tmdb movie search failed: ${err}`);
		return null;
	}
}

async function getTmdbFilmById(id: number | string, movie: any = null): Promise<LetterboxdFilm | null> {
	if (!config.tmdb?.api_key) return null;

	try {
		const details = await axios.get(`https://api.themoviedb.org/3/movie/${id}`, {
			params: { api_key: config.tmdb.api_key, append_to_response: 'credits' },
			headers: { 'User-Agent': UA },
		});
		const source = details.data || movie;
		if (!source?.title) return null;
		const director = details.data?.credits?.crew?.find((person: { job?: string }) => person.job === 'Director')?.name ?? null;

		return {
			title: source.title,
			slug: filmSlug(source.title),
			year: source.release_date?.slice(0, 4) || null,
			average: typeof source.vote_average === 'number' ? source.vote_average / 2 : null,
			ratings: typeof source.vote_count === 'number' ? source.vote_count : null,
			director,
		};
	} catch (err) {
		timeLog(`tmdb movie details failed: ${err}`);
		return null;
	}
}

function parseFilmHtml(html: string, slug: string): LetterboxdFilm {
	const ogTitle = html.match(/property="og:title"[^>]*content="([^"]+)"/i)?.[1] ?? slug;
	const [, title = ogTitle, year = null] = ogTitle.match(/^(.*)\s\((\d{4})\)$/) || [];

	const director = html.match(/name="twitter:data1"[^>]*content="([^"]+)"/i)?.[1] ?? null;
	const average = parseFloat(html.match(/"ratingValue":\s*([\d.]+)/)?.[1] || '') || null;
	const ratings = parseInt(html.match(/"ratingCount":\s*(\d+)/)?.[1] || '') || null;

	return { title, slug, year, average, ratings, director };
}

export async function searchFilmHtml(query: string): Promise<{ slug: string; title: string } | null> {
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
		timeLog(`letterboxd search failed: ${err}`);
		return null;
	}
}

export async function searchFilm(query: string): Promise<LetterboxdFilm | null> {
	const found = await searchFilmHtml(query);
	if (found) {
		const film = await scrapeFilm(found.slug);
		if (film) return film;
	}

	return searchTmdbFilm(query);
}

export async function scrapeFilm(slug: string): Promise<LetterboxdFilm | null> {
	const url = `https://letterboxd.com/film/${slug}/`;
	try {
		const { data: html } = await axios.get(url, { headers: HEADERS });
		return parseFilmHtml(html, slug);
	} catch (err) {
		timeLog(`letterboxd scrape failed for ${slug}: ${err}`);
		return searchTmdbFilm(slug.replace(/-/g, ' '));
	}
}

export async function scrapeFilmByTmdb(tmdbId: number | string): Promise<LetterboxdFilm | null> {
	const url = `https://letterboxd.com/tmdb/${tmdbId}`;
	try {
		const { data: html, request, headers } = await axios.get(url, {
			headers: HEADERS,
			maxRedirects: 10,
			validateStatus: () => true,
		});

		const finalUrl = request?.res?.responseUrl || headers.location || '';
		const slug = finalUrl.match(/\/film\/([^/?#]+)/)?.[1]?.replace(/\/$/, '');
		if (!slug || !html || typeof html !== 'string' || html.includes('Just a moment')) {
			return getTmdbFilmById(tmdbId);
		}

		return parseFilmHtml(html, slug);
	} catch (err) {
		timeLog(`letterboxd scrape failed for tmdb ${tmdbId}: ${err}`);
		return getTmdbFilmById(tmdbId);
	}
}

export function formatRatings(n: number | null): string {
	if (!n) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return n.toString();
}
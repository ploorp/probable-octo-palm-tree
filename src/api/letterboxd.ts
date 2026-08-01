import axios from 'axios';
import * as cheerio from 'cheerio';
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

export type LetterboxdFilm = {
	title: string;
	slug: string;
	year: string | null;
	average: number | null;
	ratings: number | null;
	director: string | null;
};

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

export async function scrapeFilm(slug: string): Promise<LetterboxdFilm | null> {
	const url = `https://letterboxd.com/film/${slug}/`;
	try {
		const { data: html } = await axios.get(url, { headers: HEADERS });

		const ogTitle = html.match(/property="og:title"[^>]*content="([^"]+)"/i)?.[1] ?? slug;
		const [, title = ogTitle, year = null] = ogTitle.match(/^(.*)\s\((\d{4})\)$/) || [];

		const director = html.match(/name="twitter:data1"[^>]*content="([^"]+)"/i)?.[1] ?? null;
		const average = parseFloat(html.match(/"ratingValue":\s*([\d.]+)/)?.[1] || '') || null;
		const ratings = parseInt(html.match(/"ratingCount":\s*(\d+)/)?.[1] || '') || null;

		return { title, slug, year, average, ratings, director };
	} catch (err) {
		timeLog(`letterboxd scrape failed for ${slug}: ${err}`);
		return null;
	}
}

export function formatRatings(n: number | null): string {
	if (!n) return '0';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return n.toString();
}

function parseFilmSlugFromHref(href: string): string | null {
	const match = href.match(/^\/film\/([^/]+)\/?$/i);
	return match?.[1] ?? null;
}

export async function getRandomPopularFilmSlug(maxPages: number = 25): Promise<string | null> {
	const page = Math.floor(Math.random() * maxPages) + 1;
	const pagePath = page === 1 ? '/films/popular/' : `/films/popular/page/${page}/`;
	const url = `https://letterboxd.com${pagePath}`;

	try {
		const { data: html } = await axios.get(url, { headers: HEADERS });
		const $ = cheerio.load(html);
		const slugs = new Set<string>();

		$('[data-film-slug]').each((_, el) => {
			const slug = $(el).attr('data-film-slug')?.trim();
			if (slug) slugs.add(slug);
		});

		$('a[href^="/film/"]').each((_, el) => {
			const href = $(el).attr('href');
			if (!href) return;
			const slug = parseFilmSlugFromHref(href.trim());
			if (slug) slugs.add(slug);
		});

		const list = [...slugs];
		if (!list.length) return null;

		const randomIndex = Math.floor(Math.random() * list.length);
		return list[randomIndex];
	} catch (err) {
		timeLog(`letterboxd popular scrape failed: ${err}`);
		return null;
	}
}

export async function getRandomPopularRatedFilm(maxAttempts: number = 8): Promise<LetterboxdFilm | null> {
	for (let i = 0; i < maxAttempts; i++) {
		const slug = await getRandomPopularFilmSlug(25);
		if (!slug) continue;
		const film = await scrapeFilm(slug);
		if (!film?.average) continue;
		return film;
	}

	return null;
}
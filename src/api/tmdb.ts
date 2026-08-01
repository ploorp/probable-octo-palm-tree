import axios from 'axios';
import config from '../config/index.js';
import { timeLog } from '../utils.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export type TmdbPopularMovie = {
	title: string;
	slug: string;
	year: string | null;
	average: number | null;
	ratings: number | null;
	director: string | null;
};

async function getRandomTmdbPopularFilm(maxPages: number = 25): Promise<TmdbPopularMovie | null> {
	if (!config.tmdb?.api_key) return null;

	const page = Math.floor(Math.random() * maxPages) + 1;

	try {
		const res = await axios.get('https://api.themoviedb.org/3/movie/popular', {
			params: {
				api_key: config.tmdb.api_key,
				page,
				include_adult: true,
			},
			headers: {
				'User-Agent': UA,
			},
		});

		const results = (res.data?.results || []) as Array<{
			id?: number;
			title?: string;
			release_date?: string;
			vote_average?: number;
			vote_count?: number;
		}>;

		const candidates = results.filter((m) => m.id && m.title && (m.vote_average || 0) > 0 && (m.vote_count || 0) >= 200);
		if (!candidates.length) return null;

		const movie = candidates[Math.floor(Math.random() * candidates.length)];
		const year = movie.release_date?.slice(0, 4) || null;
		const avgOutOfFive = (movie.vote_average || 0) / 2;

		return {
			title: movie.title as string,
			slug: `tmdb-${movie.id}`,
			year,
			average: avgOutOfFive,
			ratings: movie.vote_count || null,
			director: null,
		};
	} catch (err) {
		timeLog(`tmdb popular fetch failed: ${err}`);
		return null;
	}
}

export async function getRandomPopularRatedMovie(maxAttempts: number = 8): Promise<TmdbPopularMovie | null> {
	for (let i = 0; i < maxAttempts; i++) {
		const film = await getRandomTmdbPopularFilm(25);
		if (!film?.average) continue;
		return film;
	}

	return null;
}
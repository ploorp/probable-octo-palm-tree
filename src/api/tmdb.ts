import axios from 'axios';
import config from '../config/index.js';
import { timeLog } from '../utils.js';
import { LetterboxdFilm, scrapeFilmByTmdb } from './letterboxd.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getRandomTmdbMovieId(maxPages: number = 25): Promise<number | null> {
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

		const results = (res.data?.results || []) as Array<{ id?: number; vote_count?: number }>;
		const candidates = results.filter((m) => m.id && (m.vote_count || 0) >= 200);
		if (!candidates.length) return null;

		const movie = candidates[Math.floor(Math.random() * candidates.length)];
		return movie.id || null;
	} catch (err) {
		timeLog(`tmdb popular fetch failed: ${err}`);
		return null;
	}
}

export async function getRandomPopularRatedMovie(maxAttempts: number = 8): Promise<LetterboxdFilm | null> {
	for (let i = 0; i < maxAttempts; i++) {
		const tmdbId = await getRandomTmdbMovieId(25);
		if (!tmdbId) continue;

		const film = await scrapeFilmByTmdb(tmdbId);
		if (!film?.average) continue;
		return film;
	}

	return null;
}
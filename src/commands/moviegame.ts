import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { LetterboxdFilm } from '../api/letterboxd.js';
import { getRandomPopularRatedMovie } from '../api/tmdb.js';
import { getMovieGameBestStreak, getMovieGameLeaderboard, getPrefix, setMovieGameBestStreak } from '../db/dbManager.js';

type GameState = {
  left: LetterboxdFilm;
  right: LetterboxdFilm;
  streak: number;
};

const activeGames = new Map<string, GameState>();

function parseGuess(input: string | undefined): 'left' | 'right' | null {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  if (['1', 'l', 'left', 'a'].includes(lower)) return 'left';
  if (['2', 'r', 'right', 'b'].includes(lower)) return 'right';
  return null;
}

function filmLabel(film: LetterboxdFilm): string {
  const year = film.year || 'n.d.';
  return `${film.title} (${year})`;
}

function filmWithScore(film: LetterboxdFilm): string {
  return `${filmLabel(film)} ${rating(film).toFixed(2)}/5`;
}

function roundChoices(state: Pick<GameState, 'left' | 'right'>): string {
  return `1) ${filmLabel(state.left)} | 2) ${filmLabel(state.right)}`;
}

function rating(film: LetterboxdFilm): number {
  return film.average || 0;
}

async function getDistinctRatedFilm(excludedSlug?: string, attempts: number = 8): Promise<LetterboxdFilm | null> {
  for (let i = 0; i < attempts; i++) {
    const film = await getRandomPopularRatedMovie();
    if (!film) continue;
    if (excludedSlug && film.slug === excludedSlug) continue;
    return film;
  }
  return null;
}

async function createInitialState(): Promise<GameState | null> {
  const left = await getDistinctRatedFilm();
  if (!left) return null;
  const right = await getDistinctRatedFilm(left.slug);
  if (!right) return null;
  return { left, right, streak: 0 };
}

function buildInitialPrompt(prefix: string, state: GameState, best: number): string {
  return [
    `Higher/Lower`,
    roundChoices(state),
    `streak ${state.streak} | channel best ${best} | view leaderboard: ${prefix}higherlower lb`
  ].join(' ');
}

function isQuickAnswerText(msgText: string): boolean {
  const lower = msgText.toLowerCase().trim();
  return lower === '1' || lower === '2';
}

export async function handleMoviegameQuickAnswer(msg: PrivmsgMessage, msgText: string): Promise<boolean> {
  if (!isQuickAnswerText(msgText)) return false;
  if (!activeGames.has(msg.channelID)) return false;
  await moviegame(msg, ['moviegame', msgText.trim()]);
  return true;
}

export default async function moviegame(msg: PrivmsgMessage, args: string[]) {
  const prefix = getPrefix(msg.channelID);
  const channelId = msg.channelID;
  const choice = parseGuess(args[1]);
  const sub = (args[1] || '').toLowerCase();

  if (sub === 'leaderboard' || sub === 'lb') {
    const rows = getMovieGameLeaderboard(5);
    const channelBest = getMovieGameBestStreak(channelId);
    if (!rows.length) {
      return saySafe(msg.channelName, `Higher/Lower leaderboard is empty | channel best ${channelBest}`, msg.messageID);
    }
    const body = rows.map((r, idx) => `${idx + 1}. ${r.channelName} (${r.best})${r.channelId === channelId ? ' [here]' : ''}`).join(' | ');
    return saySafe(msg.channelName, `Higher/Lower channel leaderboard | channel best ${channelBest} | ${body}`, msg.messageID);
  }

  if (sub === 'stats' || sub === 'best') {
    const state = activeGames.get(channelId);
    const best = getMovieGameBestStreak(channelId);
    const current = state?.streak ?? 0;
    return saySafe(msg.channelName, `Higher/Lower | streak ${current} | channel best ${best}`, msg.messageID);
  }

  if (sub === 'new' || sub === 'start' || sub === 'skip') {
    const fresh = await createInitialState();
    if (!fresh) {
      return saySafe(msg.channelName, `failed to fetch movies what the fuck`, msg.messageID);
    }
    activeGames.set(channelId, fresh);
    const best = getMovieGameBestStreak(channelId);
    return saySafe(msg.channelName, buildInitialPrompt(prefix, fresh, best), msg.messageID);
  }

  let state = activeGames.get(channelId);
  if (!state) {
    const initial = await createInitialState();
    if (!initial) {
      return saySafe(msg.channelName, `failed to fetch movies what the fuck`, msg.messageID);
    }
    state = initial;
    activeGames.set(channelId, state);

    // Avoid resolving a guess against a round the user has not seen yet.
    if (choice) {
      const best = getMovieGameBestStreak(channelId);
      return saySafe(msg.channelName, buildInitialPrompt(prefix, state, best), msg.messageID);
    }
  }

  if (!choice) {
    const best = getMovieGameBestStreak(channelId);
    return saySafe(msg.channelName, buildInitialPrompt(prefix, state, best), msg.messageID);
  }

  const leftScore = rating(state.left);
  const rightScore = rating(state.right);

  if (leftScore === rightScore) {
    const chosenSide = choice;
    const chosenFilm = chosenSide === 'left' ? state.left : state.right;
    const otherFilm = chosenSide === 'left' ? state.right : state.left;

    const replacement = await getDistinctRatedFilm(chosenFilm.slug);
    if (!replacement) {
      return saySafe(msg.channelName, `failed to fetch movies what the fuck`, msg.messageID);
    }

    state.streak += 1;
    const best = setMovieGameBestStreak(channelId, state.streak);

    state.left = chosenFilm;
    state.right = replacement;
    activeGames.set(channelId, state);

    return saySafe(
      msg.channelName,
      `tie | ${filmWithScore(chosenFilm)} = ${filmWithScore(otherFilm)} | streak ${state.streak} | channel best ${best} | next ${roundChoices(state)}`,
      msg.messageID
    );
  }

  const winnerSide = leftScore > rightScore ? 'left' : 'right';
  const winnerFilm = winnerSide === 'left' ? state.left : state.right;
  const loserFilm = winnerSide === 'left' ? state.right : state.left;

  if (choice === winnerSide) {
    const next = await getDistinctRatedFilm(winnerFilm.slug);
    if (!next) {
      return saySafe(msg.channelName, `correct, but failed to fetch movies what the fuck`, msg.messageID);
    }

    state.streak += 1;
    const best = setMovieGameBestStreak(channelId, state.streak);

    state.left = winnerFilm;
    state.right = next;
    activeGames.set(channelId, state);

    return saySafe(
      msg.channelName,
      `correct | ${filmWithScore(winnerFilm)} > ${filmWithScore(loserFilm)} | streak ${state.streak} | channel best ${best} | next ${roundChoices(state)}`,
      msg.messageID
    );
  }

  const previousStreak = state.streak;
  state.streak = 0;
  const best = getMovieGameBestStreak(channelId);

  // Losing ends the current round; user can start a new one manually.
  activeGames.delete(channelId);

  return saySafe(
    msg.channelName,
    `wrong | ${filmWithScore(winnerFilm)} > ${filmWithScore(loserFilm)} | ended ${previousStreak} | channel best ${best}`,
    msg.messageID
  );
}
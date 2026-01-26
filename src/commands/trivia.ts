import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { ttrim } from '../utils.js';
import {
  recordTriviaCorrect,
  resetTriviaStreak,
  getTriviaStreak,
  getTriviaLeaderboard,
  isWhitelisted,
  getTriviaCategories,
  getRandomTriviaQuestion,
} from '../db/dbManager.js';
import { getUsername } from '../api/helix.js';

const QUESTION_TIMEOUT_MS = 45000;

type TriviaQuestion = {
  id: number;
  category: string;
  question: string;
  answer: string;
  aliases?: string[];
  choices?: string[];
};

type ActiveSession = {
  channelId: string;
  category: string;
  question: TriviaQuestion;
  expiresAt: number;
  answers: Set<string>;
  timeout?: NodeJS.Timeout;
};

const CATEGORY_ALIASES: Record<string, string> = {
  comp: 'computers',
  tech: 'computers',
  cs: 'computers',
  sci: 'science',
  movie: 'movies',
  film: 'movies',
  films: 'movies',
  mv: 'movies',
  songs: 'music',
  game: 'games',
  gaming: 'games'
};

const activeSessions = new Map<string, ActiveSession>();

function normalizeAnswer(text: string): string {
  const trimmed = ttrim(text).toLowerCase();
  return trimmed.replace(/[^a-z0-9]+/g, '');
}

function resolveCategory(input: string | null | undefined, available: string[]): string | null {
  if (!input) return null;
  const raw = input.toLowerCase();
  const mapped = CATEGORY_ALIASES[raw] ?? raw;
  return available.includes(mapped) ? mapped : null;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandomCategory(available: string[]): string {
  return available[Math.floor(Math.random() * available.length)];
}

function buildSession(channelId: string, category: string, question: TriviaQuestion): ActiveSession {
  const normalizedAnswers = new Set<string>();
  normalizedAnswers.add(normalizeAnswer(question.answer));
  for (const alias of question.aliases ?? []) {
    normalizedAnswers.add(normalizeAnswer(alias));
  }

  return {
    channelId,
    category,
    question,
    expiresAt: Date.now() + QUESTION_TIMEOUT_MS,
    answers: normalizedAnswers
  };
}

function clearSession(channelId: string) {
  const existing = activeSessions.get(channelId);
  if (existing?.timeout) {
    clearTimeout(existing.timeout);
  }
  activeSessions.delete(channelId);
}

function formatCategoryName(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

async function announceTimeout(session: ActiveSession, channelName: string, reason: string) {
  clearSession(session.channelId);
  resetTriviaStreak(session.channelId, session.category);
  await saySafe(channelName, `${reason} ${formatCategoryName(session.category)} streak reset to 0. Answer was: ${session.question.answer}.`);
}

async function startQuestion(msg: PrivmsgMessage, categoryInput?: string) {
  if (activeSessions.has(msg.channelID)) {
    return saySafe(msg.channelName, 'There is already a trivia question active. Use the answer or ask to skip.', msg.messageID);
  }

  const availableCategories = getTriviaCategories();
  if (!availableCategories.length) {
    return saySafe(msg.channelName, 'No trivia questions are loaded yet.', msg.messageID);
  }

  const category = categoryInput && categoryInput !== 'random'
    ? resolveCategory(categoryInput, availableCategories)
    : null;

  const chosenCategory = category ?? pickRandomCategory(availableCategories);

  if (!chosenCategory) {
    return saySafe(msg.channelName, `Unknown category. Available: ${availableCategories.join(', ')}`, msg.messageID);
  }

  const question = getRandomTriviaQuestion(chosenCategory);
  if (!question) {
    return saySafe(msg.channelName, `No questions available for ${chosenCategory} yet.`, msg.messageID);
  }

  const session = buildSession(msg.channelID, chosenCategory, question);

  session.timeout = setTimeout(() => {
    announceTimeout(session, msg.channelName, "Time's up!").catch(() => {});
  }, QUESTION_TIMEOUT_MS);

  activeSessions.set(msg.channelID, session);
  const options = question.choices && question.choices.length > 0 ? shuffle(question.choices) : null;
  const optionsText = options ? ` Options: ${options.join(' | ')}` : '';

  return saySafe(
    msg.channelName,
    `Trivia (${formatCategoryName(chosenCategory)}): ${question.question}${optionsText} (45s)`,
    msg.messageID
  );
}

async function handleSkip(msg: PrivmsgMessage) {
  const existing = activeSessions.get(msg.channelID);
  if (!existing) {
    return saySafe(msg.channelName, 'No active trivia question to skip.', msg.messageID);
  }

  if (msg.senderUserID !== msg.channelID && !isWhitelisted(msg.senderUserID)) {
    return saySafe(msg.channelName, 'Only the channel owner or whitelisted users can skip trivia.', msg.messageID);
  }

  return announceTimeout(existing, msg.channelName, 'Skipped.');
}

async function sendCategories(msg: PrivmsgMessage) {
  const cats = getTriviaCategories();
  if (!cats.length) {
    return saySafe(msg.channelName, 'No trivia categories available yet. Import a dataset first.', msg.messageID);
  }
  return saySafe(msg.channelName, `Trivia categories: ${cats.join(', ')}`, msg.messageID);
}

async function sendStats(msg: PrivmsgMessage, categoryInput?: string) {
  const available = getTriviaCategories();
  if (!available.length) {
    return saySafe(msg.channelName, 'No trivia categories available yet. Import a dataset first.', msg.messageID);
  }

  const category = categoryInput ? resolveCategory(categoryInput, available) : null;
  const categories = category ? [category] : available;
  const parts: string[] = [];

  for (const cat of categories) {
    const streak = getTriviaStreak(msg.channelID, cat);
    parts.push(`${formatCategoryName(cat)}: current ${streak.current}, best ${streak.best}`);
  }

  return saySafe(msg.channelName, parts.join(' | '), msg.messageID);
}

async function sendLeaderboard(msg: PrivmsgMessage, categoryInput?: string) {
  const available = getTriviaCategories();
  if (!available.length) {
    return saySafe(msg.channelName, 'No trivia categories available yet. Import a dataset first.', msg.messageID);
  }

  const category = categoryInput ? resolveCategory(categoryInput, available) : null;
  if (!category) {
    return saySafe(msg.channelName, `Pick a category: ${available.join(', ')}`, msg.messageID);
  }

  const leaders = getTriviaLeaderboard(msg.channelID, category, 5);
  if (!leaders.length) {
    return saySafe(msg.channelName, `No correct answers yet for ${formatCategoryName(category)}.`, msg.messageID);
  }

  const leaderboardNames = await Promise.all(
    leaders.map(async (row) => {
      const name = (await getUsername(row.user_id)) ?? row.user_id;
      return `${name}: ${row.correct}`;
    })
  );

  const leaderboard = leaderboardNames.join(', ');

  return saySafe(msg.channelName, `${formatCategoryName(category)} leaderboard — ${leaderboard}`, msg.messageID);
}

export async function triviaCommand(msg: PrivmsgMessage, args: string[]) {
  const action = (args[1] ?? '').toLowerCase();

  if (action === 'categories' || action === 'cats') {
    return sendCategories(msg);
  }

  if (action === 'skip') {
    return handleSkip(msg);
  }

  if (action === 'stats') {
    return sendStats(msg, args[2]);
  }

  if (action === 'leaderboard' || action === 'lb') {
    return sendLeaderboard(msg, args[2]);
  }

  return startQuestion(msg, action || undefined);
}

export async function handleTriviaAnswer(msg: PrivmsgMessage) {
  const session = activeSessions.get(msg.channelID);
  if (!session) return false;

  const now = Date.now();
  if (now >= session.expiresAt) {
    await announceTimeout(session, msg.channelName, "Time's up!");
    return false;
  }

  const guess = normalizeAnswer(msg.messageText);
  if (!guess) return false;

  if (!session.answers.has(guess)) return false;

  clearSession(msg.channelID);
  const result = recordTriviaCorrect(session.channelId, msg.senderUserID, session.category);

  const display = msg.displayName || (msg as any).senderUsername || 'someone';
  return saySafe(
    msg.channelName,
    `${display} is correct! ${formatCategoryName(session.category)} streak ${result.streak.current} (best ${result.streak.best}). Their correct answers in this category: ${result.userCorrect}.`,
    msg.messageID
  );
}

export function hasActiveTrivia(channelId: string) {
  return activeSessions.has(channelId);
}

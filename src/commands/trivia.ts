import { PrivmsgMessage } from '@mastondzn/dank-twitch-irc';
import { saySafe } from '../client.js';
import { ttrim, uploadToHastebin } from '../utils.js';
import {
  recordTriviaCorrect,
  resetTriviaStreak,
  getTriviaStreak,
  getTriviaLeaderboard,
  isWhitelisted,
  getTriviaCategories,
  getRandomTriviaQuestion,
  getTriviaTypes,
  getTriviaCategorySummary,
  TriviaMode
} from '../db/dbManager.js';
import { getUsername } from '../api/helix.js';

const QUESTION_TIMEOUT_MS = 45000;
const HINT_DELAY_MS = 10000;

type TriviaQuestion = {
  id: number;
  category: string;
  question: string;
  answer: string;
  aliases?: string[];
  choices?: string[];
  difficulty?: string | null;
  type?: string | null;
};

type ActiveSession = {
  key: string;
  channelId: string;
  channelName: string;
  category: string;
  mode: TriviaMode;
  hard: boolean;
  ownerId?: string | null;
  ownerName?: string | null;
  question: TriviaQuestion;
  questionType?: string | null;
  expiresAt: number;
  answers: Set<string>;
  choices?: string[];
  timeout?: NodeJS.Timeout;
  hintTimeout?: NodeJS.Timeout;
};

const BASE_CATEGORY_ALIASES: Record<string, string> = {
  comp: 'science: computers',
  cs: 'science: computers',
  tech: 'science: computers',
  sci: 'science & nature',
  science: 'science & nature',
  nature: 'science & nature',
  film: 'entertainment: film',
  films: 'entertainment: film',
  movie: 'entertainment: film',
  movies: 'entertainment: film',
  tv: 'entertainment: television',
  music: 'entertainment: music',
  song: 'entertainment: music',
  songs: 'entertainment: music',
  anime: 'entertainment: japanese anime & manga',
  manga: 'entertainment: japanese anime & manga',
  vg: 'entertainment: video games',
  games: 'entertainment: video games',
  game: 'entertainment: video games',
  geo: 'geography',
  hist: 'history',
  gk: 'general knowledge',
  general: 'general knowledge',
  myth: 'mythology',
  mytho: 'mythology',
  math: 'science: mathematics',
  maths: 'science: mathematics'
};

const activeSessions = new Map<string, ActiveSession>();

function normalizeAnswer(text: string): string {
  const trimmed = ttrim(text).toLowerCase();
  return trimmed.replace(/[^a-z0-9]+/g, '');
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function isNormalizedClose(guess: string, answers: Set<string>): boolean {
  if (!guess) return false;
  for (const ans of answers) {
    if (!ans) continue;
    if (guess === ans) return true;
    if (ans.length >= 4 && (guess.includes(ans) || ans.includes(guess))) return true;
    const dist = levenshtein(guess, ans);
    const maxLen = Math.max(ans.length, guess.length, 1);
    const ratio = 1 - dist / maxLen;
    if (dist <= Math.max(1, Math.floor(ans.length * 0.25))) return true;
    if (ratio >= 0.72) return true;
  }
  return false;
}

function normalizeGuessAgainstChoices(rawGuess: string, choices?: string[]): string {
  if (!choices || choices.length === 0) return normalizeAnswer(rawGuess);

  const lower = ttrim(rawGuess).toLowerCase();
  const letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const letterIdx = letters.indexOf(lower);
  if (letterIdx >= 0 && letterIdx < choices.length) {
    return normalizeAnswer(choices[letterIdx]);
  }

  const numeric = Number.parseInt(lower, 10);
  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= choices.length) {
    return normalizeAnswer(choices[numeric - 1]);
  }

  const normalized = normalizeAnswer(rawGuess);
  for (const choice of choices) {
    if (normalized === normalizeAnswer(choice)) {
      return normalized;
    }
  }

  return normalized;
}

function makeSessionKey(mode: TriviaMode, channelId: string, ownerId?: string | null) {
  return mode === 'user' ? `user:${channelId}:${ownerId ?? 'self'}` : `channel:${channelId}`;
}

function formatCategoryName(category: string) {
  return category
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function stripMegaCategory(category: string) {
  return category.trim().replace(/^(entertainment|science):\s*/i, '');
}

function formatModeLabel(mode: TriviaMode, hard: boolean) {
  const base = mode === 'user' ? 'User' : mode === 'speed' ? 'Speed' : 'Channel';
  return hard ? `${base} (Hard)` : base;
}

function formatTypeLabel(type?: string | null) {
  if (!type) return 'Unknown type';
  const lower = type.toLowerCase();
  if (lower === 'boolean') return 'True/False';
  if (lower === 'multiple') return 'Multiple choice';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function buildHint(answer: string) {
  const raw = answer.trim();
  const chars = [...raw];
  const revealable = chars.filter((c) => /[a-z0-9]/i.test(c)).length;
  const keep = Math.max(2, Math.ceil(revealable * 0.35));
  let revealed = 0;

  return chars
    .map((c, idx) => {
      if (!/[a-z0-9]/i.test(c)) return c;
      if (idx === 0 || idx === chars.length - 1) return c;
      if (revealed < keep) {
        revealed++;
        return c;
      }
      return '_';
    })
    .join('');
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildCategoryAliasMap(categories: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [alias, target] of Object.entries(BASE_CATEGORY_ALIASES)) {
    map.set(alias.toLowerCase(), target.toLowerCase());
  }

  for (const cat of categories) {
    const lower = cat.toLowerCase();
    const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.length === 0) continue;
    const first = words[0];
    map.set(first, lower);
    const initials = words.map((w) => w[0]).join('');
    if (initials.length >= 1) map.set(initials, lower);
    if (initials.length >= 2) map.set(initials.slice(0, 2), lower);
  }

  return map;
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length, 1);
  return 1 - dist / maxLen;
}

function resolveCategory(input: string | null | undefined, available: string[]): string | null {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();
  const aliasMap = buildCategoryAliasMap(available);
  const aliasTarget = aliasMap.get(normalized);
  if (aliasTarget && available.includes(aliasTarget)) return aliasTarget;

  const cleaned = normalized.replace(/[^a-z0-9]+/g, ' ');
  let best: { cat: string; score: number } | null = null;
  for (const cat of available) {
    const score = similarity(cleaned, cat.toLowerCase().replace(/[^a-z0-9]+/g, ' '));
    if (!best || score > best.score) {
      best = { cat, score };
    }
  }

  return best && best.score >= 0.45 ? best.cat : null;
}

function pickRandomCategory(available: string[]): string {
  return available[Math.floor(Math.random() * available.length)];
}

function makeChoicesText(choices?: string[]) {
  if (!choices || !choices.length) return '';
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const labeled = choices.slice(0, letters.length).map((c, idx) => `${letters[idx]}) ${c}`);
  return `Options: ${labeled.join(' | ')}`;
}

function clearSession(session: ActiveSession) {
  if (session.timeout) clearTimeout(session.timeout);
  if (session.hintTimeout) clearTimeout(session.hintTimeout);
  activeSessions.delete(session.key);
}

async function announceTimeout(session: ActiveSession, channelName: string, reason: string) {
  clearSession(session);
  resetTriviaStreak({
    channelId: session.channelId,
    category: session.category,
    mode: session.mode,
    hard: session.hard,
    userId: session.mode === 'user' ? session.ownerId : null
  });

  const ownerPrefix = session.mode === 'user' && session.ownerName ? `${session.ownerName}, ` : '';
  await saySafe(
    channelName,
    `${ownerPrefix}${reason} ${formatModeLabel(session.mode, session.hard)} ${formatCategoryName(session.category)} streak reset to 0. Answer: ${session.question.answer}.`
  );
}

async function sendHint(session: ActiveSession) {
  const active = activeSessions.get(session.key);
  if (!active || active.expiresAt <= Date.now()) return;

  const ownerPrefix = active.mode === 'user' && active.ownerName ? `${active.ownerName}: ` : '';

  if (active.choices && active.choices.length) {
    const optionsText = makeChoicesText(active.choices);
    await saySafe(active.channelName, `${ownerPrefix}Hint (${formatCategoryName(active.category)}): ${optionsText}`);
    return;
  }

  const hint = buildHint(active.question.answer);
  await saySafe(active.channelName, `${ownerPrefix}Hint (${formatCategoryName(active.category)}): ${hint}`);
}

function parseArgs(args: string[]) {
  const tokens = args.slice(1);
  const flags = { mode: 'channel' as TriviaMode, hard: false, type: null as string | null };
  const categoryTokens: string[] = [];
  let subcommand: string | null = null;

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === 'leaderboard' || lower === 'lb') {
      subcommand = 'leaderboard';
      continue;
    }
    if (lower === 'categories' || lower === 'cats') {
      subcommand = 'categories';
      continue;
    }
    if (lower === 'skip') {
      subcommand = 'skip';
      continue;
    }
    if (lower === 'stats') {
      subcommand = 'stats';
      continue;
    }

    if (lower === '--channel' || lower === '-c') {
      flags.mode = 'channel';
      continue;
    }
    if (lower === '--user' || lower === '-u') {
      flags.mode = 'user';
      continue;
    }
    if (lower === '--speed' || lower === '-s') {
      flags.mode = 'speed';
      continue;
    }
    if (lower === '--hard' || lower === '-h') {
      flags.hard = true;
      continue;
    }
    if (lower === '--boolean' || lower === '-b' || lower === 'boolean') {
      flags.type = 'boolean';
      continue;
    }
    if (lower === '--multiple' || lower === '--multi' || lower === '-m' || lower === 'multiple') {
      flags.type = 'multiple';
      continue;
    }

    categoryTokens.push(token);
  }

  const categoryInput = categoryTokens.length ? categoryTokens.join(' ') : null;
  return { subcommand, categoryInput, ...flags };
}

function buildSession(msg: PrivmsgMessage, category: string, question: TriviaQuestion, mode: TriviaMode, hard: boolean, ownerId?: string | null) {
  const normalizedAnswers = new Set<string>();
  normalizedAnswers.add(normalizeAnswer(question.answer));
  for (const alias of question.aliases ?? []) {
    normalizedAnswers.add(normalizeAnswer(alias));
  }

  return {
    key: makeSessionKey(mode, msg.channelID, ownerId),
    channelId: msg.channelID,
    channelName: msg.channelName,
    category,
    mode,
    hard,
    ownerId,
    ownerName: msg.displayName || (msg as any).senderUsername || undefined,
    question,
    questionType: question.type ?? null,
    expiresAt: Date.now() + QUESTION_TIMEOUT_MS,
    answers: normalizedAnswers,
    choices: question.choices
  } as ActiveSession;
}

async function startQuestion(msg: PrivmsgMessage, opts: { categoryInput?: string | null; mode: TriviaMode; hard: boolean; typeFilter?: string | null }) {
  const availableCategories = getTriviaCategories();
  if (!availableCategories.length) {
    return saySafe(msg.channelName, 'No trivia questions are loaded yet.', msg.messageID);
  }

  const channelKey = makeSessionKey('channel', msg.channelID);
  const personalKey = makeSessionKey('user', msg.channelID, msg.senderUserID);
  if (opts.mode === 'user') {
    if (activeSessions.has(personalKey)) {
      return saySafe(msg.channelName, 'You already have an active trivia question.', msg.messageID);
    }
  } else if (activeSessions.has(channelKey)) {
    return saySafe(msg.channelName, 'There is already a trivia question active in this channel.', msg.messageID);
  }

  const category = opts.categoryInput && opts.categoryInput !== 'random'
    ? resolveCategory(opts.categoryInput, availableCategories)
    : null;

  const chosenCategory = category ?? pickRandomCategory(availableCategories);

  if (!chosenCategory) {
    return saySafe(msg.channelName, `Unknown category. Available: ${availableCategories.join(', ')}`, msg.messageID);
  }

  const question = getRandomTriviaQuestion({ category: chosenCategory, type: opts.typeFilter ?? undefined });
  if (!question) {
    const typeText = opts.typeFilter ? ` (${opts.typeFilter})` : '';
    return saySafe(msg.channelName, `No questions available for ${chosenCategory}${typeText}.`, msg.messageID);
  }

  const session = buildSession(msg, chosenCategory, question, opts.mode, opts.hard, opts.mode === 'user' ? msg.senderUserID : null);

  session.timeout = setTimeout(() => {
    announceTimeout(session, msg.channelName, "Time's up!").catch(() => {});
  }, QUESTION_TIMEOUT_MS);

  const options = question.choices && question.choices.length > 0 ? shuffle(question.choices) : null;
  if (options) {
    session.choices = options;
  }

  const skipHint = opts.hard || !!options;

  if (!skipHint) {
    session.hintTimeout = setTimeout(() => {
      sendHint(session).catch(() => {});
    }, HINT_DELAY_MS);
  }

  const key = session.key;
  activeSessions.set(key, session);

  const typeLabel = formatTypeLabel(question.type);
  const difficulty = question.difficulty ? ` - ${question.difficulty}` : '';
  const hintSuffix = !skipHint ? '; hint in 10s' : '';
  const ownerPrefix = opts.mode === 'user' ? `${session.ownerName || 'You'} | ` : '';
  const optionsText = options ? ` | ${makeChoicesText(options)}` : '';

  return saySafe(
    msg.channelName,
    `${ownerPrefix}Trivia [${formatModeLabel(session.mode, session.hard)}] ${formatCategoryName(chosenCategory)} - ${typeLabel}${difficulty}: ${question.question}${optionsText} (${QUESTION_TIMEOUT_MS / 1000}s${hintSuffix})`,
    msg.messageID
  );
}

async function handleSkip(msg: PrivmsgMessage) {
  const personalKey = makeSessionKey('user', msg.channelID, msg.senderUserID);
  const personal = activeSessions.get(personalKey);
  if (personal) {
    if (personal.ownerId === msg.senderUserID || msg.senderUserID === msg.channelID || isWhitelisted(msg.senderUserID)) {
      return announceTimeout(personal, msg.channelName, 'Skipped.');
    }
    return saySafe(msg.channelName, 'You cannot skip someone else\'s trivia.', msg.messageID);
  }

  const channelSession = activeSessions.get(makeSessionKey('channel', msg.channelID));
  if (!channelSession) {
    return saySafe(msg.channelName, 'No active trivia question to skip.', msg.messageID);
  }

  if (msg.senderUserID !== msg.channelID && !isWhitelisted(msg.senderUserID)) {
    return saySafe(msg.channelName, 'Only the channel owner or whitelisted users can skip trivia.', msg.messageID);
  }

  return announceTimeout(channelSession, msg.channelName, 'Skipped.');
}

async function sendCategories(msg: PrivmsgMessage) {
  const summary = getTriviaCategorySummary();
  const types = getTriviaTypes();
  if (!summary.length) {
    return saySafe(msg.channelName, 'No trivia categories available yet. Import a dataset first.', msg.messageID);
  }

  const typeLine = `TYPES: ${types.join(', ') || 'unknown'}`;
  const lines = summary.map((entry) => {
    const counts = types.map((type) => entry.counts?.[type] ?? 0);
    const display = formatCategoryName(stripMegaCategory(entry.category));
    return `${display} (${counts.join(', ')})`;
  });

  const payload = `%trivia <category> <type> <flags>\ncan work in any order\n\n${typeLine}\n\nCATEGORIES:\n${lines.join('\n')}`;
  const paste = await uploadToHastebin(payload);

  if (paste) {
    return saySafe(msg.channelName, `Trivia categories/types: ${paste}`, msg.messageID);
  }

  const text = lines.join(' | ');
  return saySafe(msg.channelName, `Trivia categories: ${text}`, msg.messageID);
}

async function sendStats(msg: PrivmsgMessage, categoryInput: string | null, mode: TriviaMode, hard: boolean) {
  const available = getTriviaCategories();
  if (!available.length) {
    return saySafe(msg.channelName, 'No trivia categories available yet. Import a dataset first.', msg.messageID);
  }

  const category = categoryInput ? resolveCategory(categoryInput, available) : null;
  const categories = category ? [category] : available;
  const parts: string[] = [];

  for (const cat of categories) {
    const streak = getTriviaStreak({
      channelId: msg.channelID,
      category: cat,
      mode,
      hard,
      userId: mode === 'user' ? msg.senderUserID : null
    });
    parts.push(`${formatCategoryName(cat)}: current ${streak.current}, best ${streak.best}`);
  }

  return saySafe(msg.channelName, parts.join(' | '), msg.messageID);
}

async function sendLeaderboard(msg: PrivmsgMessage, opts: { categoryInput?: string | null; mode: TriviaMode; hard: boolean }) {
  const available = getTriviaCategories();
  if (!available.length) {
    return saySafe(msg.channelName, 'No trivia categories available yet. Import a dataset first.', msg.messageID);
  }

  const category = opts.categoryInput ? resolveCategory(opts.categoryInput, available) : null;
  const leaders = getTriviaLeaderboard({
    channelId: msg.channelID,
    category: category ?? undefined,
    mode: opts.mode,
    hard: opts.hard,
    limit: 10
  });

  if (!leaders.length) {
    const scope = category ? `${formatCategoryName(category)} ` : '';
    return saySafe(msg.channelName, `No correct answers yet for ${scope}${formatModeLabel(opts.mode, opts.hard)}.`, msg.messageID);
  }

  const leaderboardNames = await Promise.all(
    leaders.map(async (row) => {
      const name = (await getUsername(row.user_id)) ?? row.user_id;
      return `${name}: ${row.correct}`;
    })
  );

  const headerCategory = category ? `${formatCategoryName(category)} ` : '';
  const leaderboard = leaderboardNames.join(', ');

  return saySafe(
    msg.channelName,
    `${headerCategory}${formatModeLabel(opts.mode, opts.hard)} leaderboard - ${leaderboard}`,
    msg.messageID
  );
}

function findActiveSessionForMessage(msg: PrivmsgMessage): ActiveSession | null {
  const personal = activeSessions.get(makeSessionKey('user', msg.channelID, msg.senderUserID));
  if (personal) return personal;

  const channelSession = activeSessions.get(makeSessionKey('channel', msg.channelID));
  return channelSession ?? null;
}

export async function triviaCommand(msg: PrivmsgMessage, args: string[]) {
  const parsed = parseArgs(args);

  if (parsed.subcommand === 'categories') {
    return sendCategories(msg);
  }

  if (parsed.subcommand === 'skip') {
    return handleSkip(msg);
  }

  if (parsed.subcommand === 'stats') {
    return sendStats(msg, parsed.categoryInput, parsed.mode, parsed.hard);
  }

  if (parsed.subcommand === 'leaderboard') {
    return sendLeaderboard(msg, { categoryInput: parsed.categoryInput, mode: parsed.mode, hard: parsed.hard });
  }

  return startQuestion(msg, {
    categoryInput: parsed.categoryInput,
    mode: parsed.mode,
    hard: parsed.hard,
    typeFilter: parsed.type
  });
}

export async function handleTriviaAnswer(msg: PrivmsgMessage) {
  const session = findActiveSessionForMessage(msg);
  if (!session) return false;

  if (session.mode === 'user' && msg.senderUserID !== session.ownerId) return false;

  const now = Date.now();
  if (now >= session.expiresAt) {
    await announceTimeout(session, msg.channelName, "Time's up!");
    return false;
  }

  const normalizedGuess = normalizeGuessAgainstChoices(msg.messageText, session.choices);
  if (!normalizedGuess) return false;

  if (!isNormalizedClose(normalizedGuess, session.answers)) return false;

  clearSession(session);
  const result = recordTriviaCorrect({
    channelId: session.channelId,
    userId: msg.senderUserID,
    category: session.category,
    mode: session.mode,
    hard: session.hard
  });

  const display = msg.displayName || (msg as any).senderUsername || 'someone';
  return saySafe(
    msg.channelName,
    `${display} is correct! ${formatCategoryName(session.category)} ${formatModeLabel(session.mode, session.hard)} streak ${result.streak.current} (best ${result.streak.best}). Their correct answers here: ${result.userCorrect}.`,
    msg.messageID
  );
}

export function hasActiveTrivia(channelId: string) {
  const channelKey = makeSessionKey('channel', channelId);
  if (activeSessions.has(channelKey)) return true;
  for (const key of activeSessions.keys()) {
    if (key.startsWith(`user:${channelId}:`)) return true;
  }
  return false;
}

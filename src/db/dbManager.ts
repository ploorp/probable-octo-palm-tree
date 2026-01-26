import db from "./db.js";
import { getUsername, getUserId } from "../api/helix.js";
import config from "../config/index.js";
import { readFileSync } from "node:fs";
import * as path from "node:path";

export function ensureUserRow(id: string) {
  db.prepare(`
    INSERT INTO users (id, prefix)
    VALUES (?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(id, config.prefix);
}

export async function refreshUsername(id: string): Promise<string | null> {
  const username = await getUsername(id);
  if (username) {
    db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, id);
    return username;
  }
  return null;
}

export async function editLastfm(twitchUsername: string, lastfmUsername: string): Promise<boolean> {
  const id = await getUserId(twitchUsername);
  if (!id) return false;
  ensureUserRow(id);
  db.prepare("UPDATE users SET lastfm = ? WHERE id = ?").run(lastfmUsername, id);
  return true;
}

export async function getJoinedChannels(): Promise<{ id: string; username?: string; }[]> {
  const rows = db.prepare('SELECT id, username FROM users WHERE is_joined = 1').all() as { id: string; username?: string }[];
  if (rows.length === 0) {
    const channels = config.channels 
    if (channels.length === 0) return [{ id: config.id, username: config.username }]; // at least join bot channel
    const joined: { id: string; username?: string }[] = [];
    for (const chan of channels) {
      const id = await getUserId(chan);
      if (id) {
        joined.push({ id, username: chan });
      }
    }
    return joined;
  }
  return rows;
}


// OPT-OUT
export function isOptedOut(id: string): boolean {
  ensureUserRow(id);
  const row = db.prepare("SELECT opted_out FROM users WHERE id = ?").get(id) as { opted_out: number } | undefined;
  return row ? !!row.opted_out : false;
}

export async function setOptOut(id: string, optOut: boolean) {
  ensureUserRow(id);
  db.prepare("UPDATE users SET opted_out = ? WHERE id = ?").run(optOut ? 1 : 0, id);
}


// CHANNELS
export async function addChannel(id: string, prefix: string = config.prefix) {
  ensureUserRow(id);

  const username = await getUsername(id);
  db.prepare(`
    UPDATE users
    SET username = COALESCE(?, username),
        is_joined = 1,
        prefix = ?
    WHERE id = ?
  `).run(username, prefix, id);
}

export function partChannel(id: string) {
  ensureUserRow(id);
  db.prepare("UPDATE users SET is_joined = 0 WHERE id = ?").run(id);
}

export function getPrefix(id: string): string {
  ensureUserRow(id);
  const row = db.prepare("SELECT prefix FROM users WHERE id = ?").get(id) as { prefix: string } | undefined;
  return row ? row.prefix : config.prefix;
}

export function setPrefix(id: string, prefix: string) {
  ensureUserRow(id);
  db.prepare(`
    INSERT INTO users (id, prefix)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET prefix = excluded.prefix
  `).run(id, prefix);
}


// WHITELIST
export function setWhitelist(id: string, whitelist: boolean) {
  ensureUserRow(id);
  db.prepare("UPDATE users SET is_whitelisted = ? WHERE id = ?").run(whitelist ? 1 : 0, id);
}

export function isWhitelisted(id: string): boolean {
  ensureUserRow(id);
  const row = db.prepare("SELECT is_whitelisted FROM users WHERE id = ?").get(id) as { is_whitelisted: number } | undefined;
  return row ? !!row.is_whitelisted : false;
}

export function getWhitelistedUsers(): string[] {
  const rows = db.prepare("SELECT id FROM users WHERE is_whitelisted = 1").all() as { id: string }[];
  return rows.map(row => row.id);
}

export async function updateWhitelist() {
  for (const adminId of config.admins) {
    setWhitelist(adminId, true);
  }
  for (const channel of config.whitelist_channels) {
    const id = await getUserId(channel);
    if (id) {
      setWhitelist(id, true);
    }
  }
}


// CONNECTIONS
export function linkAccount(id: string, service: string, handle: string) {
  ensureUserRow(id);
  if (service === "lastfm" || service === "letterboxd" || service === "osu") {
    db.prepare(`UPDATE users SET ${service} = ? WHERE id = ?`).run(handle, id);
  }
}

export function unlinkAccount(id: string, service: string) {
  ensureUserRow(id);
  if (service === "lastfm" || service === "letterboxd" || service === "osu") {
    db.prepare(`UPDATE users SET ${service} = NULL WHERE id = ?`).run(id);
  }
}

export function getAccount(id: string, service: string) {
  if (service === "lastfm" || service === "letterboxd" || service === "osu") {
    const row = db.prepare(`SELECT ${service} FROM users WHERE id = ?`).get(id) as { [key: string]: string } | undefined;
    return row && row[service] ? row[service] : null;
  }
  return null;
}

export function getAllLastFmUsers(): { id: string; username?: string; lastfm: string }[] {
  const rows = db.prepare('SELECT id, username, lastfm FROM users WHERE lastfm IS NOT NULL').all() as { id: string; username?: string; lastfm: string }[];
  return rows;
}


// FORTUNE
export function updateStreak(userId: string) {
  ensureUserRow(userId);
  const nowUTC = new Date(Date.now() + new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const user = db.prepare("SELECT last_fortune, fortune_streak FROM users WHERE id = ?").get(userId) as { last_fortune: string, fortune_streak: number };

  if (user.last_fortune === nowUTC) {
    return { success: false, streak: user.fortune_streak };
  }

  const yesterdayUTC = new Date(Date.now() + new Date().getTimezoneOffset() * 60000);
  yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
  const yDateUTC = yesterdayUTC.toISOString().split("T")[0];

  let newStreak = 1;
  if (user.last_fortune === yDateUTC) {
    newStreak = user.fortune_streak + 1;
  }

  db.prepare(`
    UPDATE users SET last_fortune = ?, fortune_streak = ?
    WHERE id = ?
  `).run(nowUTC, newStreak, userId);

  return { success: true, streak: newStreak };
}


// TRIVIA
function ensureTriviaStreakRow(channelId: string, category: string) {
  db.prepare(`
    INSERT INTO trivia_streaks (channel_id, category, current_streak, best_streak)
    VALUES (?, ?, 0, 0)
    ON CONFLICT(channel_id, category) DO NOTHING
  `).run(channelId, category);
}

export function getTriviaStreak(channelId: string, category: string): { current: number; best: number } {
  ensureTriviaStreakRow(channelId, category);
  const row = db.prepare(`
    SELECT current_streak AS current, best_streak AS best
    FROM trivia_streaks
    WHERE channel_id = ? AND category = ?
  `).get(channelId, category) as { current: number; best: number } | undefined;

  return row ?? { current: 0, best: 0 };
}

export function incrementTriviaStreak(channelId: string, category: string): { current: number; best: number } {
  ensureTriviaStreakRow(channelId, category);
  db.prepare(`
    UPDATE trivia_streaks
    SET current_streak = current_streak + 1,
        best_streak = CASE WHEN current_streak + 1 > best_streak THEN current_streak + 1 ELSE best_streak END
    WHERE channel_id = ? AND category = ?
  `).run(channelId, category);

  return getTriviaStreak(channelId, category);
}

export function resetTriviaStreak(channelId: string, category: string) {
  ensureTriviaStreakRow(channelId, category);
  db.prepare(`
    UPDATE trivia_streaks SET current_streak = 0 WHERE channel_id = ? AND category = ?
  `).run(channelId, category);
}

export function recordTriviaCorrect(channelId: string, userId: string, category: string): { streak: { current: number; best: number }; userCorrect: number } {
  ensureUserRow(userId);
  ensureTriviaStreakRow(channelId, category);

  const streak = incrementTriviaStreak(channelId, category);

  db.prepare(`
    INSERT INTO trivia_user_stats (channel_id, category, user_id, correct_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(channel_id, category, user_id)
    DO UPDATE SET correct_count = correct_count + 1
  `).run(channelId, category, userId);

  const userRow = db.prepare(`
    SELECT correct_count AS correct
    FROM trivia_user_stats
    WHERE channel_id = ? AND category = ? AND user_id = ?
  `).get(channelId, category, userId) as { correct: number } | undefined;

  return {
    streak,
    userCorrect: userRow?.correct ?? 1
  };
}

export function getTriviaLeaderboard(channelId: string, category: string, limit = 5): { user_id: string; correct: number }[] {
  const rows = db.prepare(`
    SELECT user_id, correct_count AS correct
    FROM trivia_user_stats
    WHERE channel_id = ? AND category = ?
    ORDER BY correct_count DESC, user_id ASC
    LIMIT ?
  `).all(channelId, category, limit) as { user_id: string; correct: number }[];

  return rows;
}

export function getTriviaBestStreaks(channelId: string): { category: string; current: number; best: number }[] {
  const rows = db.prepare(`
    SELECT category, current_streak AS current, best_streak AS best
    FROM trivia_streaks
    WHERE channel_id = ?
    ORDER BY category ASC
  `).all(channelId) as { category: string; current: number; best: number }[];

  return rows;
}


// TRIVIA QUESTIONS
export type TriviaQuestionRow = {
  id: number;
  category: string;
  question: string;
  answer: string;
  aliases: string[];
  choices?: string[];
  difficulty?: string | null;
  source?: string | null;
};

export type TriviaDatasetItem = {
  category: string;
  question: string;
  answer: string;
  aliases?: string[];
  choices?: string[];
  difficulty?: string | null;
  source?: string | null;
};

function normalizeCategory(cat: string) {
  return cat.trim().toLowerCase();
}

function normalizeText(text: string) {
  return text.trim();
}

function normalizeAliases(rawAliases?: string[]) {
  if (!Array.isArray(rawAliases)) return [] as string[];
  return rawAliases
    .map((a) => normalizeText(String(a)))
    .filter((a) => a.length > 0);
}

export function importTriviaItems(items: TriviaDatasetItem[]): number {
  const insert = db.prepare(`
    INSERT INTO trivia_questions (category, question, answer, aliases, choices, difficulty, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(category, question) DO UPDATE SET
      answer = excluded.answer,
      aliases = excluded.aliases,
      choices = excluded.choices,
      difficulty = excluded.difficulty,
      source = excluded.source
  `);

  const tx = db.transaction((rows: TriviaDatasetItem[]) => {
    let count = 0;
    for (const item of rows) {
      if (!item?.category || !item?.question || !item?.answer) continue;
      const category = normalizeCategory(String(item.category));
      const question = normalizeText(String(item.question));
      const answer = normalizeText(String(item.answer));
      const aliases = normalizeAliases(item.aliases);
      const choices = Array.isArray(item.choices)
        ? item.choices.map((c) => normalizeText(String(c))).filter((c) => c.length > 0)
        : null;

      insert.run(
        category,
        question,
        answer,
        JSON.stringify(aliases),
        choices ? JSON.stringify(choices) : null,
        item.difficulty ?? null,
        item.source ?? null
      );
      count++;
    }
    return count;
  });

  return tx(items);
}

export function getTriviaCategories(): string[] {
  const rows = db.prepare(`SELECT DISTINCT category FROM trivia_questions ORDER BY category ASC`).all() as { category: string }[];
  return rows.map((r) => r.category);
}

export function getRandomTriviaQuestion(category?: string): TriviaQuestionRow | null {
  const row = category
    ? db.prepare(`
        SELECT id, category, question, answer, aliases, choices, difficulty, source
        FROM trivia_questions
        WHERE category = ?
        ORDER BY COALESCE(last_used_at, 0) ASC, RANDOM()
        LIMIT 1
      `).get(category) as any
    : db.prepare(`
        SELECT id, category, question, answer, aliases, choices, difficulty, source
        FROM trivia_questions
        ORDER BY COALESCE(last_used_at, 0) ASC, RANDOM()
        LIMIT 1
      `).get() as any;

  if (!row) return null;

  db.prepare(`UPDATE trivia_questions SET last_used_at = ? WHERE id = ?`).run(Date.now(), row.id);

  let aliases: string[] = [];
  let choices: string[] | undefined;
  try {
    aliases = row.aliases ? JSON.parse(row.aliases) : [];
    if (!Array.isArray(aliases)) aliases = [];
  } catch {
    aliases = [];
  }

  try {
    choices = row.choices ? JSON.parse(row.choices) : undefined;
    if (!Array.isArray(choices)) choices = undefined;
  } catch {
    choices = undefined;
  }

  return {
    id: row.id,
    category: row.category,
    question: row.question,
    answer: row.answer,
    aliases,
    choices,
    difficulty: row.difficulty ?? null,
    source: row.source ?? null
  };
}

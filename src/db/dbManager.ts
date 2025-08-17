import { get } from "cheerio/dist/commonjs/api/traversing.js";
import db from "./db.js";
import { getUserId } from "../helix.js";

export function ensureUser(id: string, username: string) {
  db.prepare(`
    INSERT OR IGNORE INTO users (id, username, fortune_streak, opted_out)
    VALUES (?, ?, 0, 0)
  `).run(id, username);
}

export function isOptedOut(username: string): boolean {
  const row = db.prepare("SELECT opted_out FROM users WHERE username = ?").get(username) as { opted_out: number } | undefined;
  return row ? !!row.opted_out : false;
}

// CHANNELS
export async function addChannel(username: string, prefix: string = "%") {
  const id = await getUserId(username);
  db.prepare(`
    INSERT INTO users (id, username, is_joined, prefix)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(id) DO UPDATE SET is_joined = 1, prefix = excluded.prefix
  `).run(id, username, prefix);
}

export function removeChannel(id: string) {
  db.prepare("UPDATE users SET is_joined = 0 WHERE id = ?").run(id);
}

export function getPrefix(id: string): string {
  const row = db.prepare("SELECT prefix FROM users WHERE id = ?").get(id) as { prefix: string } | undefined;
  return row ? row.prefix : "%";
}

export function setPrefix(id: string, prefix: string) {
  db.prepare(`
    INSERT INTO users (id, prefix)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET prefix = excluded.prefix
  `).run(id, prefix);
}

// WHITELIST
export function whitelistUser(id: string) {
  db.prepare("UPDATE users SET is_whitelisted = 1 WHERE id = ?").run(id);
}

export function isWhitelist(id: string): boolean {
  const row = db.prepare("SELECT is_whitelisted FROM users WHERE id = ?").get(id) as { is_whitelisted: number } | undefined;
  return row ? !!row.is_whitelisted : false;
}

export function removeWhitelist(id: string) {
  db.prepare("UPDATE users SET is_whitelisted = 0 WHERE id = ?").run(id);
}

// CONNECTIONS
export function linkAccount(id: string, username: string, service: string, handle: string) {
  ensureUser(id, username);
  if (service === "lastfm" || service === "letterboxd") {
    db.prepare(`UPDATE users SET ${service} = ? WHERE id = ?`).run(handle, id);
  }
}

export function unlinkAccount(id: string, username: string, service: string) {
  ensureUser(id, username);
  if (service === "lastfm" || service === "letterboxd") {
    db.prepare(`UPDATE users SET ${service} = NULL WHERE id = ?`).run(id);
  }
}

export function getAccount(id: string, service: string) {
  if (service === "lastfm" || service === "letterboxd") {
    const row = db.prepare(`SELECT ${service} FROM users WHERE id = ?`).get(id) as { [key: string]: string } | undefined;
    return row && row[service] ? { handle: row[service] } : null;
  }
  return null;
}

// FORTUNE
export function setStreak(userId: string, username: string) {
  ensureUser(userId, username);
  const nowUTC = new Date(Date.now() + new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const user = db.prepare("SELECT last_fortune, fortune_streak FROM users WHERE id = ?").get(userId) as { last_fortune: string, fortune_streak: number } | undefined;

  if (!user) {
    db.prepare(`
      INSERT INTO users (id, last_fortune, fortune_streak)
      VALUES (?, ?, 1)
    `).run(userId, nowUTC);
    return { success: true, streak: 1 };
  }

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

export function getJoinedChannels(): string[] {
  const rows = db.prepare('SELECT username FROM users WHERE is_joined = 1').all() as { username: string }[];
  return rows.map(row => row.username.toLowerCase());
}
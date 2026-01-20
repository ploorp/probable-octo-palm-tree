import db from "./db.js";
import { getUsername, getUserId } from "../api/helix.js";
import config from "../../config.json" with { type: "json" };

const admins: string[] = Array.isArray(config.admins) ? (config.admins as string[]) : [];

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
  for (const adminId of admins) {
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

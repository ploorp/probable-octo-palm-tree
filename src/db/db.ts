import Database from "better-sqlite3";
import config from '../config/index.js';

const db = new Database("bot.db");

// Users
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT,
  is_joined INTEGER DEFAULT 0,
  prefix TEXT DEFAULT '${config.prefix}',
  last_seen TEXT,
  last_fortune TEXT,
  fortune_streak INTEGER DEFAULT 0,
  opted_out INTEGER DEFAULT 0,
  lastfm TEXT,
  letterboxd TEXT,
  osu TEXT,
  is_whitelisted INTEGER DEFAULT 0
);
`).run();

export default db;

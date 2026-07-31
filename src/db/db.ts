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
  is_whitelisted INTEGER DEFAULT 0,
  lastfm_play_count INTEGER DEFAULT 1,
  lastfm_song_link TEXT DEFAULT 'lastfm',
  whoknows_antiping INTEGER DEFAULT 0
);
`).run();

try {
  db.prepare(`ALTER TABLE users ADD COLUMN lastfm_play_count INTEGER DEFAULT 1;`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN lastfm_song_link TEXT DEFAULT 'lastfm';`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN whoknows_antiping INTEGER DEFAULT 0;`).run();
} catch (e) {}

// Legacy trivia streak tables (replaced by trivia_scores/trivia_streaks_v2) kept for backward compatibility
db.prepare(`
CREATE TABLE IF NOT EXISTS trivia_streaks (
  channel_id TEXT NOT NULL,
  category TEXT NOT NULL,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  PRIMARY KEY (channel_id, category)
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS trivia_user_stats (
  channel_id TEXT NOT NULL,
  category TEXT NOT NULL,
  user_id TEXT NOT NULL,
  correct_count INTEGER DEFAULT 0,
  PRIMARY KEY (channel_id, category, user_id)
);
`).run();

// Extended trivia leaderboards/streaks per mode and per user correctness
db.prepare(`
CREATE TABLE IF NOT EXISTS trivia_scores (
  channel_id TEXT NOT NULL,
  category TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'channel',
  hard INTEGER NOT NULL DEFAULT 0,
  user_id TEXT NOT NULL,
  correct_count INTEGER DEFAULT 0,
  PRIMARY KEY (channel_id, category, mode, hard, user_id)
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS trivia_streaks_v2 (
  channel_id TEXT NOT NULL,
  category TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'channel',
  hard INTEGER NOT NULL DEFAULT 0,
  user_id TEXT,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  PRIMARY KEY (channel_id, category, mode, hard, user_id)
);
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS trivia_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  aliases TEXT DEFAULT '[]', -- JSON array
  choices TEXT, -- JSON array of answer options (for multiple/boolean)
  difficulty TEXT,
  source TEXT,
  last_used_at INTEGER,
  UNIQUE (category, question)
);
`).run();

db.prepare(`CREATE INDEX IF NOT EXISTS idx_trivia_questions_category ON trivia_questions(category);`).run();

export default db;

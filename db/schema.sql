-- 动态版 SQLite schema（唯一表结构来源）
-- 应用通过 `import schemaSql from '../../db/schema.sql?raw'` 打进 bundle；
-- 迁移脚本用 node:fs 直接读本文件。

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf       TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS posts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  slug               TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  description        TEXT,
  lead               TEXT,
  body_markdown      TEXT NOT NULL DEFAULT '',
  raw_markdown       TEXT NOT NULL DEFAULT '',
  cover              TEXT,
  cover_caption      TEXT,
  entry_badge        TEXT,
  featured           INTEGER NOT NULL DEFAULT 0,
  draft              INTEGER NOT NULL DEFAULT 0,
  pub_date           TEXT NOT NULL,
  updated_date       TEXT,
  kinetic_caption    TEXT,
  rail_mode          TEXT,
  rail_specs_json    TEXT,
  rail_topology_json TEXT,
  tags_json          TEXT NOT NULL DEFAULT '[]',
  auto_updated       INTEGER,
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS posts_pub_date_idx ON posts(pub_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_draft_idx ON posts(draft);

CREATE TABLE IF NOT EXISTS photo_walls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  date       TEXT,
  place      TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  wall_id          INTEGER NOT NULL REFERENCES photo_walls(id) ON DELETE CASCADE,
  file             TEXT NOT NULL,
  caption          TEXT NOT NULL DEFAULT '',
  title            TEXT,
  story            TEXT,
  group_name       TEXT,
  coord            TEXT,
  date             TEXT,
  location         TEXT,
  aspect           TEXT,
  ar               REAL,
  ratio_pill       TEXT,
  camera           TEXT,
  lens             TEXT,
  exposure         TEXT,
  color            TEXT,
  gps              TEXT,
  ev               TEXT,
  hist_json        TEXT,
  auto_fields_json TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS photos_wall_idx ON photos(wall_id, sort_order);

CREATE TABLE IF NOT EXISTS links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id     TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  avatar      TEXT,
  tag         TEXT,
  owner       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT NOT NULL,
  path       TEXT NOT NULL UNIQUE,
  width      INTEGER,
  height     INTEGER,
  mime       TEXT,
  size       INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

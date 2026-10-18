/**
 * SQLite 连接与迁移。
 *
 * 单例：Astro dev 的 HMR 会重复 import 模块，这里把连接挂在 globalThis 上，
 * 避免每次热更新都新开一个文件句柄。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

export type Db = Database.Database;

const globalForDb = globalThis as unknown as { __blogDb?: Db };

export function getDb(): Db {
  if (globalForDb.__blogDb) return globalForDb.__blogDb;

  const file = resolve(process.env.BLOG_DB_PATH ?? 'data/blog.db');
  mkdirSync(dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');

  migrate(db);
  globalForDb.__blogDb = db;
  return db;
}

/** 测试/脚本用：关掉单例，下次 getDb() 重新打开 */
export function closeDb(): void {
  globalForDb.__blogDb?.close();
  globalForDb.__blogDb = undefined;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db
    .prepare('SELECT MAX(version) AS version FROM schema_migrations')
    .get() as { version: number | null } | undefined;
  const current = row?.version ?? 0;

  if (current < SCHEMA_VERSION) {
    db.transaction(() => {
      db.exec(SCHEMA_SQL);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(SCHEMA_VERSION);
    })();
  }
}

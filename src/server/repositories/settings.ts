/** 站点设置（site / home / authorDossier / articleRail / programs / studio / pages）。 */
import { getDb } from '../db';
import { bumpContentVersion } from '../page-cache';

export const SETTING_KEYS = [
  'site',
  'home',
  'authorDossier',
  'articleRail',
  'programs',
  'studio',
  'pages',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

interface SettingRow {
  key: string;
  value_json: string;
}

/**
 * 内存级配置缓存（TTL 60 秒 + 写时即时失效）：
 * 单次 SSR 渲染首页或文章页会调用 10+ 次 getSetting()，
 * 内存缓存可彻底消除每次请求重复执行的 SQLite 查询与 JSON.parse 开销。
 */
const SETTINGS_CACHE_TTL_MS = 60_000;
const settingsCache = new Map<SettingKey, { value: unknown; expiresAt: number }>();

export function invalidateSettingsCache(key?: SettingKey): void {
  if (key) settingsCache.delete(key);
  else settingsCache.clear();
  bumpContentVersion();
}

export function getSetting<T>(key: SettingKey, fallback: T): T {
  const now = Date.now();
  const hit = settingsCache.get(key);
  if (hit && hit.expiresAt > now) {
    return (hit.value !== undefined ? hit.value : fallback) as T;
  }

  const row = getDb()
    .prepare('SELECT key, value_json FROM site_settings WHERE key = ?')
    .get(key) as SettingRow | undefined;
  if (!row) {
    settingsCache.set(key, { value: undefined, expiresAt: now + SETTINGS_CACHE_TTL_MS });
    return fallback;
  }
  try {
    const parsed = JSON.parse(row.value_json) as T;
    settingsCache.set(key, { value: parsed, expiresAt: now + SETTINGS_CACHE_TTL_MS });
    return parsed;
  } catch {
    return fallback;
  }
}

export function getSettings(): Partial<Record<SettingKey, unknown>> {
  const rows = getDb().prepare('SELECT key, value_json FROM site_settings').all() as SettingRow[];
  const out: Partial<Record<SettingKey, unknown>> = {};
  const now = Date.now();
  for (const row of rows) {
    try {
      const k = row.key as SettingKey;
      const parsed = JSON.parse(row.value_json);
      out[k] = parsed;
      settingsCache.set(k, { value: parsed, expiresAt: now + SETTINGS_CACHE_TTL_MS });
    } catch {
      // ignore malformed value; page-level fallback will handle it
    }
  }
  return out;
}

export function setSetting(key: SettingKey, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO site_settings (key, value_json, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
    )
    .run(key, JSON.stringify(value));
  settingsCache.set(key, { value, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS });
  bumpContentVersion();
}

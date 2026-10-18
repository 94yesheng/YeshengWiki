/** 站点设置（site / home / authorDossier / articleRail / programs / studio）。 */
import { getDb } from '../db';

export const SETTING_KEYS = [
  'site',
  'home',
  'authorDossier',
  'articleRail',
  'programs',
  'studio',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

interface SettingRow {
  key: string;
  value_json: string;
}

export function getSetting<T>(key: SettingKey, fallback: T): T {
  const row = getDb()
    .prepare('SELECT key, value_json FROM site_settings WHERE key = ?')
    .get(key) as SettingRow | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function getSettings(): Partial<Record<SettingKey, unknown>> {
  const rows = getDb().prepare('SELECT key, value_json FROM site_settings').all() as SettingRow[];
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const row of rows) {
    try {
      out[row.key as SettingKey] = JSON.parse(row.value_json);
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
}

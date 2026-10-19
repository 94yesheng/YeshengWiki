/**
 * 把旧的站点设置里属于「页面文案」的内容迁移到新的 `pages` 设置。
 *
 * 用法：
 *   node scripts/migrate-pages-settings.mjs --db data/blog.db
 *   node scripts/migrate-pages-settings.mjs --db /srv/blog-data/blog.db --dry-run
 *
 * 只迁移有对应关系、且 `pages` 里还没有显式设置过的 key（幂等，可重复执行）。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DRY = args.includes('--dry-run');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.resolve(arg('--db', path.join(ROOT, 'data/blog.db')));

const db = new Database(DB_PATH);
const readSetting = (key) => {
  const row = db.prepare('SELECT value_json FROM site_settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return null;
  }
};

const home = readSetting('home') ?? {};
const dossier = readSetting('authorDossier') ?? {};
const current = readSetting('pages') ?? {};

const candidates = {
  'home.hero.originBadge': home.originBadge,
  'home.hero.topbarTag': home.topbarTag,
  'home.hero.coordText': home.coordText,
  'home.loader.status': home.manifold?.loaderText,
  'home.hero.intro': Array.isArray(home.intro) ? home.intro.join('\n') : undefined,
};

/**
 * 新 schema 的默认值就是现在页面里写死的文字，所以「等于默认值」的旧配置不需要迁移
 * （迁移只会把用户在旧设置里真正改过的值搬过来）。这里列的是与 schema 一致的默认值。
 */
const DEFAULTS = {
  'home.hero.originBadge': 'ORIGIN (0, 0, L3)',
  'home.hero.topbarTag': 'DAYLIGHT INFINITY // 纯净暖色流形与无尾迹纯粒子场',
  'home.hero.coordText': 'SPATIAL LEMNISCATE · 自然聚落星团交织的纯粒子立体无限环（零线段干扰）',
  'home.loader.status': 'INFINITY MANIFOLD // 正在展开立体无限流形',
  'home.hero.intro':
    '这里是夜笙的小世界。写点技术笔记，也写点没什么用但想记下来的事。\n如果抵达不了人生的高度，那就尽可能的探索世界的广度吧。',
};

const merged = { ...current };
const applied = [];
for (const [key, value] of Object.entries(candidates)) {
  if (typeof value !== 'string' || !value.trim()) continue;
  if (key in merged) continue; // 已经有显式值就不覆盖
  if (DEFAULTS[key] === value) continue; // 与默认值相同，没必要写库
  merged[key] = value;
  applied.push(`${key} = ${JSON.stringify(value.slice(0, 60))}`);
}

console.log(`[pages] 数据库：${DB_PATH}`);
console.log(`[pages] 现有 pages 键：${Object.keys(current).length} 个`);
if (applied.length === 0) {
  console.log('[pages] 没有需要迁移的内容');
} else {
  console.log('[pages] 将写入：');
  for (const line of applied) console.log('  ·', line);
}

if (!DRY && applied.length > 0) {
  db.prepare(
    `INSERT INTO site_settings (key, value_json, updated_at)
     VALUES ('pages', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')`
  ).run(JSON.stringify(merged));
  console.log('[pages] 已写入 site_settings.pages');
}

db.close();

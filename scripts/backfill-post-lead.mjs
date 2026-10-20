/**
 * 一次性修复：把 WordPress 的自动摘要补进 posts.lead / posts.description，
 * 并同步更新 raw_markdown 的 frontmatter（否则后台保存会把它清掉）。
 *
 * 用法：node scripts/backfill-post-lead.mjs --export .work/wp-export --db <db>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import * as YAML from 'js-yaml';

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.resolve(arg('--export', path.join(ROOT, '.work/wp-export')));
const DB_PATH = path.resolve(arg('--db', path.join(ROOT, 'data/blog.db')));

const posts = JSON.parse(fs.readFileSync(path.join(EXPORT, 'posts.json'), 'utf8'));

const strip = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&#8217;/g, '’')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\[…\]|\[\.\.\.\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const norm = (s) => String(s ?? '').replace(/[\s\u3000·—\-_,，。.、：:；;！!？?（）()「」『』【】\[\]"'’“”]/g, '');

const leadFrom = (p) => {
  const fromExcerpt = strip(p.excerpt?.rendered ?? '');
  if (fromExcerpt) return fromExcerpt;
  const text = strip(p.content?.raw ?? '');
  return text.slice(0, 120);
};

const db = new Database(DB_PATH);
const rows = db.prepare('select id, slug, title, lead, raw_markdown from posts').all();
const byTitle = new Map();
for (const p of posts) {
  const title = strip(p.title?.raw ?? '') || `无标题 · ${p.date.slice(0, 10)}`;
  byTitle.set(norm(title), p);
}

const update = db.prepare('update posts set lead = ?, description = ?, raw_markdown = ? where id = ?');
let changed = 0;
db.transaction(() => {
  for (const row of rows) {
    if (row.lead && row.lead.trim()) continue; // 已有摘要就不动
    const wp = byTitle.get(norm(row.title));
    if (!wp) {
      console.log('  跳过（找不到对应 WP 文章）：', row.slug, row.title);
      continue;
    }
    const lead = leadFrom(wp).slice(0, 120).trim();
    if (!lead) continue;
    const description = lead.slice(0, 160);

    let raw = row.raw_markdown ?? '';
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
    if (m) {
      let data = {};
      try {
        data = YAML.load(m[1]) ?? {};
      } catch {
        data = {};
      }
      data.lead = lead;
      raw = `---\n${YAML.dump(data, { lineWidth: -1, noRefs: true })}---\n${m[2] ?? ''}`;
    }
    update.run(lead, description, raw, row.id);
    changed++;
    console.log('  +', row.slug.padEnd(22), lead.slice(0, 42));
  }
})();

console.log(`\n[backfill] 更新 ${changed} 篇（共 ${rows.length} 篇）→ ${DB_PATH}`);
db.close();

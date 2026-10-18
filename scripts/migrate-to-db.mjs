/**
 * 把现有内容（Markdown / JSON / site.data.json）迁移进 SQLite。
 *
 * 用法：
 *   node scripts/migrate-to-db.mjs --db data/blog.db --uploads data/uploads
 *   node scripts/migrate-to-db.mjs --db .work/migrate-test.db --uploads .work/uploads-test --fresh
 *
 * 可重复执行：posts 按 slug upsert；walls 按 slug upsert 后重建 photos；
 * links 全量重建；settings 按 key upsert。图片会复制并覆盖同名文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import * as YAML from 'js-yaml';

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const fresh = args.includes('--fresh');

const ROOT = process.cwd();
const DB_PATH = path.resolve(arg('--db', process.env.BLOG_DB_PATH ?? 'data/blog.db'));
const UPLOAD_DIR = path.resolve(arg('--uploads', process.env.BLOG_UPLOAD_DIR ?? 'data/uploads'));
const POSTS_DIR = path.join(ROOT, 'src/content/posts');
const WALLS_DIR = path.join(ROOT, 'src/content/photos');
const LINKS_FILE = path.join(ROOT, 'src/content/links.json');
const SITE_FILE = path.join(ROOT, 'src/site.data.json');
const ASSETS_POSTS = path.join(ROOT, 'src/assets/posts');
const ASSETS_PHOTOS = path.join(ROOT, 'src/assets/photos');
const SCHEMA = fs.readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8');

const log = (...x) => console.log('[migrate]', ...x);

function isoDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(value);
}

function parsePostFile(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error(`frontmatter 解析失败：${file}`);
  const data = YAML.load(m[1]) ?? {};
  const body = m[2] ?? '';
  const slug = path.basename(file, '.md');
  return { slug, data, body };
}

function rewriteAssetPaths(markdown) {
  return markdown
    .replaceAll('../../assets/posts/', '/uploads/posts/')
    .replaceAll('../../assets/photos/', '/uploads/photos/')
    .replaceAll('/src/assets/posts/', '/uploads/posts/')
    .replaceAll('/src/assets/photos/', '/uploads/photos/');
}

function firstMarkdownImage(markdown) {
  const m = /!\[[^\]]*\]\(\s*([^)\s]+)/.exec(markdown);
  if (!m) return null;
  const name = m[1].split('/').pop();
  return name ? `/uploads/posts/${name}` : null;
}

function copyDirImages(from, to) {
  if (!fs.existsSync(from)) return 0;
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const file of fs.readdirSync(from)) {
    if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(file)) continue;
    fs.copyFileSync(path.join(from, file), path.join(to, file));
    n += 1;
  }
  return n;
}

/**
 * 个别照片墙引用的文件名在 src/assets/photos 里不存在，但旧 HUD 页有对应的
 * public/artifact/home/images/photo-XX-large.jpg。迁移时用旧图补上，避免 404。
 */
function copyPhotoFallbacks(uploadDir) {
  const map = {
    '2024-07-17-山城竖幅.jpg': 'public/artifact/home/images/photo-03-large.jpg',
  };
  const destDir = path.join(uploadDir, 'photos');
  fs.mkdirSync(destDir, { recursive: true });
  for (const [name, rel] of Object.entries(map)) {
    const dest = path.join(destDir, name);
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      log(`photo fallback ${name} <- ${rel}`);
    }
  }
}

function checkPhotoFiles(db, uploadDir) {
  const rows = db.prepare('SELECT file FROM photos').all();
  const missing = rows
    .map((r) => r.file)
    .filter((file) => !fs.existsSync(path.join(uploadDir, 'photos', file)));
  if (missing.length) {
    console.warn('[migrate] 以下照片文件缺失，页面会 404：', missing.join(', '));
  }
}

function prepareDatabase() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (fresh) {
    for (const suffix of ['', '-wal', '-shm']) {
      fs.rmSync(DB_PATH + suffix, { force: true });
    }
    log('已删除旧数据库（--fresh）');
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

function migratePosts(db) {
  if (!fs.existsSync(POSTS_DIR)) return 0;
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort();
  const stmt = db.prepare(`
    INSERT INTO posts (
      slug, title, description, lead, body_markdown, cover, cover_caption, entry_badge,
      featured, draft, pub_date, updated_date, kinetic_caption, rail_mode,
      rail_specs_json, rail_topology_json, tags_json, auto_updated, version
    ) VALUES (
      @slug, @title, @description, @lead, @body_markdown, @cover, @cover_caption, @entry_badge,
      @featured, @draft, @pub_date, @updated_date, @kinetic_caption, @rail_mode,
      @rail_specs_json, @rail_topology_json, @tags_json, @auto_updated, 1
    )
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      lead = excluded.lead,
      body_markdown = excluded.body_markdown,
      cover = excluded.cover,
      cover_caption = excluded.cover_caption,
      entry_badge = excluded.entry_badge,
      featured = excluded.featured,
      draft = excluded.draft,
      pub_date = excluded.pub_date,
      updated_date = excluded.updated_date,
      kinetic_caption = excluded.kinetic_caption,
      rail_mode = excluded.rail_mode,
      rail_specs_json = excluded.rail_specs_json,
      rail_topology_json = excluded.rail_topology_json,
      tags_json = excluded.tags_json,
      auto_updated = excluded.auto_updated,
      updated_at = datetime('now')
  `);

  let count = 0;
  for (const file of files) {
    const { slug, data, body } = parsePostFile(path.join(POSTS_DIR, file));
    const bodyMarkdown = rewriteAssetPaths(body);
    const cover = data.cover ? String(data.cover) : firstMarkdownImage(bodyMarkdown);
    stmt.run({
      slug,
      title: String(data.title ?? slug),
      description: data.description ? String(data.description) : null,
      lead: data.lead ? String(data.lead) : null,
      body_markdown: bodyMarkdown,
      cover,
      cover_caption: data.coverCaption ? String(data.coverCaption) : null,
      entry_badge: data.entryBadge ? String(data.entryBadge) : null,
      featured: data.featured ? 1 : 0,
      draft: data.draft ? 1 : 0,
      pub_date: isoDate(data.pubDate),
      updated_date: data.updatedDate ? isoDate(data.updatedDate) : null,
      kinetic_caption: data.kineticCaption ? String(data.kineticCaption) : null,
      rail_mode: data.railMode ? String(data.railMode) : null,
      rail_specs_json: data.railSpecs ? JSON.stringify(data.railSpecs) : null,
      rail_topology_json: data.railTopology ? JSON.stringify(data.railTopology) : null,
      tags_json: JSON.stringify(Array.isArray(data.tags) ? data.tags : []),
      auto_updated: typeof data.autoUpdated === 'boolean' ? (data.autoUpdated ? 1 : 0) : null,
    });
    count += 1;
    log(`post ${slug}${data.draft ? ' (draft)' : ''}`);
  }
  return count;
}

function migrateWalls(db) {
  if (!fs.existsSync(WALLS_DIR)) return { walls: 0, photos: 0 };
  const files = fs.readdirSync(WALLS_DIR).filter((f) => f.endsWith('.json')).sort();
  const wallStmt = db.prepare(`
    INSERT INTO photo_walls (slug, title, date, place, note, sort_order)
    VALUES (@slug, @title, @date, @place, @note, @sort_order)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      place = excluded.place,
      note = excluded.note,
      sort_order = excluded.sort_order,
      updated_at = datetime('now')
  `);
  const idStmt = db.prepare('SELECT id FROM photo_walls WHERE slug = ?');
  const delPhotos = db.prepare('DELETE FROM photos WHERE wall_id = ?');
  const photoStmt = db.prepare(`
    INSERT INTO photos (
      wall_id, file, caption, title, story, group_name, coord, date, location, aspect,
      ar, ratio_pill, camera, lens, exposure, color, gps, ev, hist_json, auto_fields_json, sort_order
    ) VALUES (
      @wall_id, @file, @caption, @title, @story, @group_name, @coord, @date, @location, @aspect,
      @ar, @ratio_pill, @camera, @lens, @exposure, @color, @gps, @ev, @hist_json, @auto_fields_json, @sort_order
    )
  `);

  let walls = 0;
  let photos = 0;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    const raw = JSON.parse(fs.readFileSync(path.join(WALLS_DIR, file), 'utf8'));
    const list = Array.isArray(raw.photos) ? raw.photos : [];
    if (list.length === 0) {
      log(`skip empty wall ${file}`);
      continue;
    }
    const slug = path.basename(file, '.json');
    wallStmt.run({
      slug,
      title: String(raw.title ?? slug),
      date: raw.date ? isoDate(raw.date) : null,
      place: raw.place ? String(raw.place) : '',
      note: raw.note ? String(raw.note) : '',
      sort_order: i,
    });
    const { id: wallId } = idStmt.get(slug);
    delPhotos.run(wallId);

    for (let j = 0; j < list.length; j += 1) {
      const p = list[j];
      photoStmt.run({
        wall_id: wallId,
        file: String(p.file ?? ''),
        caption: p.caption ? String(p.caption) : '',
        title: p.title ? String(p.title) : null,
        story: p.story ? String(p.story) : null,
        group_name: p.group ? String(p.group) : null,
        coord: p.coord ? String(p.coord) : null,
        date: p.date ? String(p.date) : null,
        location: p.location ? String(p.location) : null,
        aspect: p.aspect ? String(p.aspect) : null,
        ar: typeof p.ar === 'number' ? p.ar : null,
        ratio_pill: p.ratioPill ? String(p.ratioPill) : null,
        camera: p.camera ? String(p.camera) : null,
        lens: p.lens ? String(p.lens) : null,
        exposure: p.exposure ? String(p.exposure) : null,
        color: p.color ? String(p.color) : null,
        gps: p.gps ? String(p.gps) : null,
        ev: p.ev ? String(p.ev) : null,
        hist_json: Array.isArray(p.hist) ? JSON.stringify(p.hist) : null,
        auto_fields_json: Array.isArray(p.autoFields) ? JSON.stringify(p.autoFields) : null,
        sort_order: j,
      });
      photos += 1;
    }
    walls += 1;
    log(`wall ${slug} (${list.length} photos)`);
  }
  return { walls, photos };
}

function migrateLinks(db) {
  if (!fs.existsSync(LINKS_FILE)) return 0;
  const raw = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  const list = Array.isArray(raw.links) ? raw.links : [];
  db.prepare('DELETE FROM links').run();
  const stmt = db.prepare(`
    INSERT INTO links (link_id, name, url, description, avatar, tag, owner, sort_order)
    VALUES (@link_id, @name, @url, @description, @avatar, @tag, @owner, @sort_order)
  `);
  list.forEach((l, i) => {
    stmt.run({
      link_id: String(l.id ?? `link-${i}`),
      name: String(l.name ?? ''),
      url: String(l.url ?? ''),
      description: l.description ? String(l.description) : '',
      avatar: l.avatar ? String(l.avatar) : null,
      tag: l.tag ? String(l.tag) : null,
      owner: l.owner ? String(l.owner) : null,
      sort_order: i,
    });
  });
  return list.length;
}

function migrateSettings(db) {
  if (!fs.existsSync(SITE_FILE)) return 0;
  const raw = JSON.parse(fs.readFileSync(SITE_FILE, 'utf8'));
  const keys = ['site', 'home', 'authorDossier', 'articleRail', 'programs', 'studio'];
  const stmt = db.prepare(`
    INSERT INTO site_settings (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `);
  let n = 0;
  for (const key of keys) {
    if (raw[key] === undefined) continue;
    stmt.run(key, JSON.stringify(raw[key]));
    n += 1;
    log(`setting ${key}`);
  }
  return n;
}

function main() {
  const db = prepareDatabase();
  try {
    const postCount = migratePosts(db);
    const wallCounts = migrateWalls(db);
    const linkCount = migrateLinks(db);
    const settingCount = migrateSettings(db);

    const postImages = copyDirImages(ASSETS_POSTS, path.join(UPLOAD_DIR, 'posts'));
    const photoImages = copyDirImages(ASSETS_PHOTOS, path.join(UPLOAD_DIR, 'photos'));
    copyPhotoFallbacks(UPLOAD_DIR);
    checkPhotoFiles(db, UPLOAD_DIR);

    const counts = {
      posts: db.prepare('SELECT COUNT(*) AS n FROM posts').get().n,
      walls: db.prepare('SELECT COUNT(*) AS n FROM photo_walls').get().n,
      photos: db.prepare('SELECT COUNT(*) AS n FROM photos').get().n,
      links: db.prepare('SELECT COUNT(*) AS n FROM links').get().n,
      settings: db.prepare('SELECT COUNT(*) AS n FROM site_settings').get().n,
    };
    log('完成:', JSON.stringify(counts));
    log('导入:', JSON.stringify({ postCount, ...wallCounts, linkCount, settingCount, postImages, photoImages }));
    log('数据库:', DB_PATH);
    log('上传目录:', UPLOAD_DIR);
    db.close();
  } catch (error) {
    db.close();
    throw error;
  }
}

main();

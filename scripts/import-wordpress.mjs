/**
 * 把 WordPress 导出数据导入本站 SQLite。
 *
 * 用法：
 *   node scripts/import-wordpress.mjs --export .work/wp-export --db data/blog.db --uploads data/uploads
 *   node scripts/import-wordpress.mjs --export .work/wp-export --dry-run
 *
 * 规则：
 * - 一篇 WP 文章 → 一篇 posts；status=publish → 公开，draft/private → draft=1（本站没有"私密"概念）
 * - 正文里的图片下载到 uploads/posts/<slug>/，并写入 media 表（媒体库按目录归档到文章）
 * - 不做照片墙：图片只作为文章配图与媒体库条目
 * - 友链页里的 friend-links 解析成 links 行
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import * as YAML from 'js-yaml';
import TurndownService from 'turndown';

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DRY = args.includes('--dry-run');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT_DIR = path.resolve(arg('--export', path.join(ROOT, '.work/wp-export')));
const DB_PATH = path.resolve(arg('--db', path.join(ROOT, 'data/blog.db')));
const UPLOAD_DIR = path.resolve(arg('--uploads', path.join(ROOT, 'data/uploads')));

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, name), 'utf8'));
const posts = readJson('posts.json');
const pages = readJson('pages.json');
const media = readJson('media.json');
const categories = readJson('categories.json');
const tags = readJson('tags.json');

/* WordPress 文章 id → 站内 slug（旧站 slug 是百分号编码的中文，不能直接用） */
const SLUGS = {
  309: 'mc-server',
  297: 'ji-bao',
  258: 'maptoposter',
  228: 'blender',
  57: 'deepseek-wechat',
  360: 'weekly-260825',
  356: 'weekly-260809',
  350: 'weekly-260802',
  345: 'deepseek-claude-code',
  343: 'train-notes',
  203: 'github-student-pack',
  200: 'year-2025',
  196: 'app-dev-log',
  188: 'random-thoughts',
  186: 'winter-note',
  184: 'java-package-log',
  40: 'about-l',
  52: 'drinking-culture',
  38: 'college-record',
};

/* 结构性的分类不当标签用 */
const SKIP_CATEGORIES = new Set(['主页', '文章', 'index', 'article']);
const categoryName = new Map(categories.map((c) => [c.id, c.name]));
const tagName = new Map(tags.map((t) => [t.id, t.name]));

const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&#8217;/g, '’')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0';
const magic = (buf) => {
  if (buf.length < 12) return 'unknown';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf.slice(0, 3).toString() === 'GIF') return 'gif';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return 'unknown';
};

async function download(url, dest, tried = 0) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const kind = magic(buf);
    if (buf.length < 100 || kind === 'unknown') throw new Error(`不是有效图片（${buf.length}B, ${kind}）`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, buf);
    return { bytes: buf.length, mime: kind === 'jpeg' ? 'image/jpeg' : `image/${kind}` };
  } catch (e) {
    if (tried < 3) {
      await new Promise((r) => setTimeout(r, 600 * (tried + 1)));
      return download(url, dest, tried + 1);
    }
    throw new Error(`${e.message} <- ${url}`);
  }
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});
turndown.addRule('figure', { filter: 'figure', replacement: (content) => `\n\n${content.trim()}\n\n` });
turndown.addRule('iframe', { filter: 'iframe', replacement: () => '' });
turndown.addRule('script', { filter: 'script', replacement: () => '' });
turndown.addRule('style', { filter: 'style', replacement: () => '' });

/** 把正文 HTML 里的图片换成站内路径，返回 { html, images } */
function safeName(url) {
  let base = decodeURIComponent(url.split('?')[0].split('/').pop() ?? 'image');
  return base.replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-');
}

function localizeImages(html, slug) {
  const images = [];
  const push = (url, alt, width, height) => {
    const [clean, query] = url.split('?');
    const base = safeName(clean);
    const local = `/uploads/posts/${slug}/${base}`;
    if (!images.some((i) => i.local === local)) {
      images.push({ url: query ? `${clean}?${query}` : clean, local, base, alt, width, height });
    }
    return local;
  };

  html = html.replace(/<div[^>]*class=['"][^'"]*fancybox-wrapper[^'"]*['"][^>]*>[\s\S]*?<\/div>/gi, (block) => {
    const href = /href=['"]([^'"]+)['"]/i.exec(block)?.[1];
    if (!href || href.startsWith('data:')) return '';
    const local = push(href, '', null, null);
    return `<figure><img src="${local}" alt=""></figure>`;
  });

  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const pick = (re) => re.exec(tag)?.[1];
    const raw =
      pick(/data-original=['"]([^'"]+)['"]/i) ||
      pick(/data-src=['"]([^'"]+)['"]/i) ||
      pick(/src=['"]([^'"]+)['"]/i);
    if (!raw || raw.startsWith('data:')) return '';
    const alt = pick(/alt=['"]([^'"]*)['"]/i) ?? '';
    const width = Number(pick(/width=['"]?(\d+)/i)) || null;
    const height = Number(pick(/height=['"]?(\d+)/i)) || null;
    const local = push(raw, alt, width, height);
    return `<figure><img src="${local}" alt="${alt}"></figure>`;
  });

  return { html, images };
}

const tidyMarkdown = (md) =>
  md
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*<!--[\s\S]*?-->\s*$/gm, '')
    .trim();

/**
 * WP 里很多人用「整段加粗」当小标题。若一篇文章里有 2 处以上这种独立加粗行，
 * 就升级成 ## 小标题，让文章页的目录/侧栏能识别（只有 1 处的仍当强调保留）。
 */
function promoteBoldHeadings(md) {
  const lines = md.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    if (/^\*\*[^*\n]{1,60}\*\*$/.test(line.trim())) hits.push(i);
  });
  if (hits.length < 2) return md;
  for (const i of hits) {
    const text = lines[i].trim().replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
    if (text) lines[i] = `## ${text}`;
  }
  return lines.join('\n');
}

/* ---------------- 组装 ---------------- */
const records = [];
const mediaRows = [];

for (const post of [...posts].sort((a, b) => a.date.localeCompare(b.date))) {
  const slug = SLUGS[post.id];
  if (!slug) continue;

  const title = stripHtml(post.title.raw) || `无标题 · ${post.date.slice(0, 10)}`;
  const { html, images } = localizeImages(post.content.raw ?? '', slug);
  const body = promoteBoldHeadings(tidyMarkdown(turndown.turndown(html)));

  const postTags = [];
  for (const catId of post.categories ?? []) {
    const name = categoryName.get(catId);
    if (name && !SKIP_CATEGORIES.has(name)) postTags.push(name);
  }
  for (const tagId of post.tags ?? []) {
    const name = tagName.get(tagId);
    if (name && !postTags.includes(name)) postTags.push(name);
  }

  const draft = post.status !== 'publish';
  const lead = stripHtml(post.excerpt?.raw ?? '').replace(/\[…\]$/, '').trim() || null;
  const pubDate = post.date.slice(0, 10);

  // 封面：优先用 WP 的特色图片；没有特色图就留空，让前台用设计好的默认封面
  let cover = null;
  const featured = post.featured_media ? media.find((m) => m.id === post.featured_media) : null;
  if (featured?.source_url) {
    const base = safeName(featured.source_url);
    const local = `/uploads/posts/${slug}/${base}`;
    if (!images.some((i) => i.local === local)) {
      images.unshift({
        url: featured.source_url,
        local,
        base,
        alt: 'cover',
        width: featured.media_details?.width ?? null,
        height: featured.media_details?.height ?? null,
      });
    }
    cover = local;
  }

  const front = {
    title,
    pubDate,
    ...(lead ? { lead } : {}),
    ...(postTags.length ? { tags: postTags } : {}),
    ...(cover ? { cover } : {}),
    ...(draft ? { draft: true } : {}),
  };
  const rawMarkdown = `---\n${YAML.dump(front, { lineWidth: -1, noRefs: true })}---\n${body}\n`;

  records.push({
    wpId: post.id,
    slug,
    title,
    status: post.status,
    draft,
    pubDate,
    updatedDate: post.modified ? post.modified.slice(0, 10) : null,
    lead,
    tags: postTags,
    cover,
    body,
    rawMarkdown,
    images,
  });
}

/* 友链页 */
const linksPage = pages.find((p) => /友链/.test(stripHtml(p.title.raw)));
const linkRows = [];
if (linksPage) {
  // 友链是主题的 [friendlinks/] 短代码渲染出来的，raw 里只有短代码，所以解析 rendered
  const html = linksPage.content.rendered || linksPage.content.raw || '';
  const blocks = [
    ...html.matchAll(
      /<div[^>]*class=['"][^'"]*friend-link-title[^'"]*['"][^>]*>([\s\S]*?)<\/div>([\s\S]*?)(?=<div[^>]*class=['"][^'"]*friend-link-title|$)/gi
    ),
  ];
  for (const b of blocks) {
    const name = stripHtml(b[1]);
    const url = /href=['"]([^'"]+)['"]/i.exec(b[1])?.[1] ?? '';
    const desc = stripHtml(
      /<div[^>]*class=['"][^'"]*friend-link-description[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i.exec(b[2])?.[1] ?? ''
    );
    if (!name || !url) continue;
    const id = url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .replace(/[^a-z0-9.-]/gi, '-')
      .toLowerCase();
    linkRows.push({ id, name, url, description: desc || '' });
  }
}

/** 读取本地图片的真实类型与尺寸（PNG / JPEG / GIF），避免依赖 WP 元数据。 */
function imageInfo(file) {
  const buf = fs.readFileSync(file);
  const kind = magic(buf);
  const mime = kind === 'jpeg' ? 'image/jpeg' : `image/${kind}`;
  let width = null;
  let height = null;
  if (kind === 'png' && buf.length >= 24) {
    width = buf.readUInt32BE(16);
    height = buf.readUInt32BE(20);
  } else if (kind === 'gif' && buf.length >= 10) {
    width = buf.readUInt16LE(6);
    height = buf.readUInt16LE(8);
  } else if (kind === 'jpeg') {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const size = buf.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) {
        height = buf.readUInt16BE(i + 5);
        width = buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + (size > 0 ? size : 2);
    }
  }
  return { mime, width, height, size: buf.length };
}

/* ---------------- 下载图片 ---------------- */
if (!DRY) {
  for (const rec of records) {
    for (const img of rec.images) {
      const dest = path.join(UPLOAD_DIR, 'posts', rec.slug, img.base);
      try {
        if (!(fs.existsSync(dest) && fs.statSync(dest).size > 100)) {
          const info = await download(img.url, dest);
          process.stdout.write(`\r[下载] ${rec.slug}/${img.base} ${info.bytes}B`.padEnd(70));
        }
        const info = imageInfo(dest);
        mediaRows.push({
          filename: img.base,
          path: img.local,
          mime: info.mime,
          size: info.size,
          width: info.width,
          height: info.height,
        });
      } catch (e) {
        console.warn(`\n  ! 图片失败 ${rec.slug}/${img.base}: ${e.message}`);
      }
    }
  }
  console.log();
}

/* ---------------- 输出 ---------------- */
console.log('\n=== 文章 ===');
for (const r of records) {
  console.log(
    `  ${r.status.padEnd(8)} ${r.draft ? 'DRAFT ' : 'PUBLIC'}  ${r.slug.padEnd(22)} 图${String(r.images.length).padStart(2)}  ${String(r.body.length).padStart(5)}字  ${r.title}`
  );
}
console.log('\n=== 友链 ===');
for (const l of linkRows) console.log(`  ${l.name} | ${l.url} | ${l.description}`);

if (DRY) {
  console.log(`\n[dry-run] 文章 ${records.length}、图片 ${records.reduce((n, r) => n + r.images.length, 0)}、友链 ${linkRows.length}`);
  process.exit(0);
}

/* ---------------- 写库 ---------------- */
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const upsertPost = db.prepare(`
  INSERT INTO posts (slug, title, description, lead, body_markdown, raw_markdown, cover, cover_caption,
    entry_badge, featured, draft, pub_date, updated_date, kinetic_caption, rail_mode, rail_specs_json,
    rail_topology_json, tags_json, auto_updated, version)
  VALUES (@slug, @title, @description, @lead, @bodyMarkdown, @rawMarkdown, @cover, NULL,
    NULL, 0, @draft, @pubDate, @updatedDate, NULL, NULL, NULL,
    NULL, @tagsJson, NULL, 1)
  ON CONFLICT(slug) DO UPDATE SET
    title = excluded.title, description = excluded.description, lead = excluded.lead,
    body_markdown = excluded.body_markdown, raw_markdown = excluded.raw_markdown,
    cover = excluded.cover, draft = excluded.draft, pub_date = excluded.pub_date,
    updated_date = excluded.updated_date, tags_json = excluded.tags_json,
    version = posts.version + 1, updated_at = datetime('now')
`);

const upsertMedia = db.prepare(`
  INSERT INTO media (filename, path, width, height, mime, size)
  VALUES (@filename, @path, @width, @height, @mime, @size)
  ON CONFLICT(path) DO UPDATE SET filename = excluded.filename, width = excluded.width,
    height = excluded.height, mime = excluded.mime, size = excluded.size
`);

const upsertLink = db.prepare(`
  INSERT INTO links (link_id, name, url, description, avatar, tag, owner, sort_order)
  VALUES (@id, @name, @url, @description, NULL, NULL, NULL, @sort)
  ON CONFLICT(link_id) DO UPDATE SET name = excluded.name, url = excluded.url,
    description = excluded.description, sort_order = excluded.sort_order
`);

db.transaction(() => {
  for (const r of records) {
    upsertPost.run({
      slug: r.slug,
      title: r.title,
      description: r.lead ? r.lead.slice(0, 160) : null,
      lead: r.lead,
      bodyMarkdown: r.body,
      rawMarkdown: r.rawMarkdown,
      cover: r.cover,
      draft: r.draft ? 1 : 0,
      pubDate: r.pubDate,
      updatedDate: r.updatedDate,
      tagsJson: JSON.stringify(r.tags),
    });
  }
  for (const m of mediaRows) {
    upsertMedia.run({ filename: m.filename, path: m.path, width: m.width ?? null, height: m.height ?? null, mime: m.mime, size: m.size });
  }
  linkRows.forEach((l, i) => upsertLink.run({ ...l, sort: i }));
})();

db.close();
console.log(`\n[db] 文章 ${records.length}、媒体 ${mediaRows.length}、友链 ${linkRows.length} -> ${DB_PATH}`);

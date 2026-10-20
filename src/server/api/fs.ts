/**
 * 虚拟文件 API：让现有 /studio/ 继续用 `Github.getFile/putText/listDir` 这套接口，
 * 但底层改为 SQLite + uploads。
 *
 * 映射：
 *   src/content/posts/<slug>.md      → posts.raw_markdown
 *   src/content/photos/<slug>.json   → photo_walls + photos
 *   src/content/links.json           → links
 *   src/site.data.json               → site_settings
 *   src/assets/posts/<file>          → uploads/posts/<file>          （旧版扁平资源）
 *   src/assets/posts/<slug>/<file>   → uploads/posts/<slug>/<file>   （按文章归档）
 *   src/assets/photos/<file>         → uploads/photos/<file>
 *   src/assets/photos/<dir>/<file>   → uploads/photos/<dir>/<file>   （一层子目录）
 *   src/assets/audio/<file>          → uploads/audio/<file>          （音频媒体库）
 *   src/assets/audio/<slug>/<file>   → uploads/audio/<slug>/<file>   （按文章归档音频）
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIContext } from 'astro';
import { getAuth, hasValidCsrf } from '../auth';
import { getDb } from '../db';
import { buildPostMarkdown, parsePostMarkdown } from '../post-markdown';
import {
  createWall,
  deleteWall,
  getWallBySlug,
  listWalls,
  updateWall,
  type Photo,
  type PhotoWall,
  type WallInput,
} from '../repositories/photos';
import {
  createPost,
  deletePost,
  getPostBySlug,
  listPosts,
  updatePost,
} from '../repositories/posts';
import { listLinks, replaceLinks } from '../repositories/links';
import { getSettings, SETTING_KEYS, setSetting } from '../repositories/settings';
import { uploadRoot } from '../uploads';
import { fail, json, readJson } from './http';

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

interface FsEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file';
}

export async function handleFs(context: APIContext): Promise<Response> {
  const auth = getAuth(context);
  if (!auth) return fail('未登录', 401);

  const method = context.request.method.toUpperCase();
  const url = context.url;
  const filePath = url.searchParams.get('path') ?? '';
  const list = url.searchParams.get('list') === '1';
  const binary = url.searchParams.get('binary') === '1';

  if (!filePath || filePath.includes('..') || filePath.startsWith('/')) {
    return fail('非法路径', 400);
  }

  if (method === 'GET' && list) {
    return listDir(filePath);
  }

  if (method === 'GET') {
    return binary ? getBinary(filePath) : getText(filePath);
  }

  if (method === 'PUT' || method === 'DELETE') {
    if (!hasValidCsrf(context, auth)) return fail('CSRF 校验失败', 403);
  }

  if (method === 'PUT') {
    if (binary) {
      const body = await readJson<{ base64?: string; message?: string; sha?: string }>(context.request);
      if (!body?.base64) return fail('缺少 base64', 400);
      return putBinary(filePath, body.base64, body.sha);
    }
    const body = await readJson<{ text?: string; message?: string; sha?: string }>(context.request);
    if (typeof body?.text !== 'string') return fail('缺少 text', 400);
    return putText(filePath, body.text, body.sha);
  }

  if (method === 'DELETE') {
    const body = await readJson<{ sha?: string; message?: string }>(context.request);
    return deleteFile(filePath, body?.sha);
  }

  return fail('接口不存在', 404);
}

/* --------------------------------------------------------------------------
   list
   -------------------------------------------------------------------------- */

async function listDir(dir: string): Promise<Response> {
  if (dir === 'src/content/posts') {
    const entries: FsEntry[] = listPosts({ includeDrafts: true }).map((post) => ({
      name: `${post.slug}.md`,
      path: `src/content/posts/${post.slug}.md`,
      sha: String(post.version),
      type: 'file',
    }));
    return json({ entries });
  }

  if (dir === 'src/content/photos') {
    const entries: FsEntry[] = listWalls({ includeEmpty: true }).map((wall) => ({
      name: `${wall.slug}.json`,
      path: `src/content/photos/${wall.slug}.json`,
      sha: String(wall.version),
      type: 'file',
    }));
    return json({ entries });
  }

  if (dir === 'src/assets/posts' || dir === 'src/assets/photos' || dir === 'src/assets/audio') {
    const kind = dir.endsWith('posts') ? 'posts' : dir.endsWith('photos') ? 'photos' : 'audio';
    return listAssets(kind, dir);
  }

  return fail('目录不存在', 404);
}

async function listAssets(kind: 'posts' | 'photos' | 'audio', dir: string): Promise<Response> {
  const root = path.join(uploadRoot(), kind);
  const entries: FsEntry[] = [];

  const collect = async (relDir: string): Promise<void> => {
    let list;
    try {
      list = await readdir(path.join(root, relDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of list) {
      if (item.name.startsWith('.')) continue;
      const rel = relDir ? `${relDir}/${item.name}` : item.name;
      if (item.isDirectory()) {
        // 只展开一层：<slug>/<file>；更深的目录不进入，避免把 uploads 整棵树扫坏
        if (!relDir) await collect(item.name);
        continue;
      }
      // 符号链接等非常规条目直接跳过
      if (!item.isFile()) continue;
      const bytes = await readFile(path.join(root, rel));
      entries.push({
        name: rel,
        path: `${dir}/${rel}`,
        sha: createHash('sha1').update(bytes).digest('hex'),
        type: 'file',
      });
    }
  };

  await collect('');
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return json({ entries });
}

/* --------------------------------------------------------------------------
   text read/write
   -------------------------------------------------------------------------- */

async function getText(filePath: string): Promise<Response> {
  const postMatch = /^src\/content\/posts\/([^/]+)\.md$/.exec(filePath);
  if (postMatch) {
    const post = getPostBySlug(postMatch[1]!, true);
    if (!post) return fail('文件不存在', 404);
    return json({ text: buildPostMarkdown(post), sha: String(post.version), path: filePath });
  }

  const wallMatch = /^src\/content\/photos\/([^/]+)\.json$/.exec(filePath);
  if (wallMatch) {
    const wall = getWallBySlug(wallMatch[1]!);
    if (!wall) return fail('文件不存在', 404);
    const text = JSON.stringify(wallToJson(wall), null, 2) + '\n';
    return json({ text, sha: String(wall.version), path: filePath });
  }

  if (filePath === 'src/content/links.json') {
    const text = JSON.stringify({ links: listLinks().map(linkToJson) }, null, 2) + '\n';
    return json({ text, sha: sha1(text), path: filePath });
  }

  if (filePath === 'src/site.data.json') {
    const text = JSON.stringify(getSettings(), null, 2) + '\n';
    return json({ text, sha: sha1(text), path: filePath });
  }

  return fail('文件不存在', 404);
}

async function putText(filePath: string, text: string, sha?: string): Promise<Response> {
  const postMatch = /^src\/content\/posts\/([^/]+)\.md$/.exec(filePath);
  if (postMatch) return putPost(postMatch[1]!, text, sha);

  const wallMatch = /^src\/content\/photos\/([^/]+)\.json$/.exec(filePath);
  if (wallMatch) return putWall(wallMatch[1]!, text, sha);

  if (filePath === 'src/content/links.json') {
    const current = JSON.stringify({ links: listLinks().map(linkToJson) }, null, 2) + '\n';
    if (sha && sha !== sha1(current)) return fail('文件已在别处被修改，请刷新后重试', 409);
    let raw: { links?: unknown };
    try {
      raw = JSON.parse(text) as { links?: unknown };
    } catch {
      return fail('links.json 不是合法 JSON', 400);
    }
    if (!Array.isArray(raw.links)) return fail('links 必须是数组', 400);
    replaceLinks(raw.links as never);
    return json({ ok: true });
  }

  if (filePath === 'src/site.data.json') {
    const current = JSON.stringify(getSettings(), null, 2) + '\n';
    if (sha && sha !== sha1(current)) return fail('文件已在别处被修改，请刷新后重试', 409);
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return fail('site.data.json 不是合法 JSON', 400);
    }
    for (const key of SETTING_KEYS) {
      if (raw[key] !== undefined) setSetting(key, raw[key]);
    }
    return json({ ok: true });
  }

  return fail('文件不存在', 404);
}

function putPost(slug: string, text: string, sha?: string): Response {
  const current = getPostBySlug(slug, true);
  if (current && sha && sha !== String(current.version)) {
    return fail('文章已在别处被修改，请刷新后重试', 409);
  }

  let parsed;
  try {
    parsed = parsePostMarkdown(text, slug);
  } catch (error) {
    return fail((error as Error).message, 400);
  }

  try {
    const saved = current
      ? updatePost(current.id, parsed, current.version)
      : createPost(parsed);
    if (!saved) return fail('保存冲突，请刷新后重试', 409);
    return json({ ok: true, sha: String(saved.version) });
  } catch (error) {
    console.error('[fs] putPost', error);
    return fail('保存文章失败', 500);
  }
}

function putWall(slug: string, text: string, sha?: string): Response {
  const current = getWallBySlug(slug);
  if (current && sha && sha !== String(current.version)) {
    return fail('照片墙已在别处被修改，请刷新后重试', 409);
  }

  let input: WallInput;
  try {
    input = parseWallInput(slug, text);
  } catch (error) {
    return fail((error as Error).message, 400);
  }

  try {
    const saved = current
      ? updateWall(current.id, input, current.version)
      : createWall(input);
    if (!saved) return fail('保存冲突，请刷新后重试', 409);
    return json({ ok: true, sha: String(saved.version) });
  } catch (error) {
    console.error('[fs] putWall', error);
    return fail('保存照片墙失败', 500);
  }
}

/* --------------------------------------------------------------------------
   binary assets
   -------------------------------------------------------------------------- */

interface AssetTarget {
  kind: 'posts' | 'photos' | 'audio';
  /** 文章归档目录（一层子目录）；旧版扁平资源为空字符串 */
  dir: string;
  name: string;
  file: string;
  /** 写进 media.path 的公开路径，例如 /uploads/posts/<slug>/<file> 或 /uploads/audio/<slug>/<file> */
  publicPath: string;
}

const UNSAFE_SEGMENT = /[\\:*?"<>|\0]/;

/** 资源路径的单个分段：拒绝 . / .. / 隐藏文件 / 盘符与反斜杠 */
function safeAssetSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..') return false;
  if (segment.startsWith('.')) return false;
  if (UNSAFE_SEGMENT.test(segment)) return false;
  return segment === path.basename(segment);
}

function mimeForAsset(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.aac') return 'audio/aac';
  if (ext === '.opus') return 'audio/opus';
  if (ext === '.webm') return 'audio/webm';
  return 'image/jpeg';
}

/**
 * 虚拟资源路径 → uploads 下的真实文件。
 *
 * 支持写法（老文章继续可用）：
 *   src/assets/posts/<file>              旧版扁平资源 → uploads/posts/<file>
 *   src/assets/posts/<slug>/<file>       文章归档资源 → uploads/posts/<slug>/<file>
 *   src/assets/photos/<file>             照片墙资源   → uploads/photos/<file>
 *   src/assets/audio/<file>              音频库资源   → uploads/audio/<file>
 *   src/assets/audio/<slug>/<file>       文章归档音频 → uploads/audio/<slug>/<file>
 */
function assetTarget(filePath: string): AssetTarget | null {
  const m = /^src\/assets\/(posts|photos|audio)\/([^/]+)(?:\/([^/]+))?$/.exec(filePath);
  if (!m) return null;
  const kind = m[1] as 'posts' | 'photos' | 'audio';
  const dir = m[3] ? m[2]! : '';
  const name = m[3] ?? m[2]!;
  if (!safeAssetSegment(name)) return null;
  if (dir && !safeAssetSegment(dir)) return null;

  const base = path.resolve(uploadRoot(), kind);
  const file = path.resolve(base, dir, name);
  if (!file.startsWith(base + path.sep)) return null;

  return {
    kind,
    dir,
    name,
    file,
    publicPath: `/uploads/${kind}/${dir ? dir + '/' : ''}${name}`,
  };
}

async function getBinary(filePath: string): Promise<Response> {
  const target = assetTarget(filePath);
  if (!target) return fail('文件不存在', 404);
  try {
    const bytes = await readFile(target.file);
    return new Response(bytes, {
      headers: {
        'Content-Type': mimeForAsset(target.name),
        'X-File-Sha': createHash('sha1').update(bytes).digest('hex'),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return fail('文件不存在', 404);
  }
}

async function putBinary(filePath: string, base64: string, sha?: string): Promise<Response> {
  const target = assetTarget(filePath);
  if (!target) return fail('非法资源路径', 400);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return fail('base64 解码失败', 400);
  }
  if (!bytes.length) return fail('空文件', 400);

  const dir = path.dirname(target.file);
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));

  if (sha) {
    try {
      const old = await readFile(target.file);
      if (createHash('sha1').update(old).digest('hex') !== sha) {
        return fail('文件已在别处被修改，请刷新后重试', 409);
      }
    } catch {
      // 新文件，忽略 sha
    }
  }

  await writeFile(target.file, bytes);
  const digest = createHash('sha1').update(bytes).digest('hex');
  const db = getDb();
  db.prepare(
    `INSERT INTO media (filename, path, mime, size)
     VALUES (@name, @p, @mime, @size)
     ON CONFLICT(path) DO UPDATE SET filename = excluded.filename, mime = excluded.mime, size = excluded.size`
  ).run({
    name: target.name,
    p: target.publicPath,
    mime: mimeForAsset(target.name),
    size: bytes.length,
  });
  return json({ ok: true, sha: digest, path: target.publicPath });
}

async function deleteFile(filePath: string, sha?: string): Promise<Response> {
  const postMatch = /^src\/content\/posts\/([^/]+)\.md$/.exec(filePath);
  if (postMatch) {
    const post = getPostBySlug(postMatch[1]!, true);
    if (!post) return fail('文件不存在', 404);
    if (sha && sha !== String(post.version)) return fail('文件已在别处被修改', 409);
    deletePost(post.id);
    return json({ ok: true });
  }

  const wallMatch = /^src\/content\/photos\/([^/]+)\.json$/.exec(filePath);
  if (wallMatch) {
    const wall = getWallBySlug(wallMatch[1]!);
    if (!wall) return fail('文件不存在', 404);
    if (sha && sha !== String(wall.version)) return fail('文件已在别处被修改', 409);
    deleteWall(wall.id);
    return json({ ok: true });
  }

  const target = assetTarget(filePath);
  if (target) {
    try {
      await unlink(target.file);
    } catch {
      return fail('文件不存在', 404);
    }
    getDb().prepare('DELETE FROM media WHERE path = ?').run(target.publicPath);
    return json({ ok: true });
  }

  return fail('文件不存在', 404);
}

/* --------------------------------------------------------------------------
   JSON mapping
   -------------------------------------------------------------------------- */

function linkToJson(link: {
  id: string;
  name: string;
  url: string;
  description: string;
  avatar: string | null;
  tag: string | null;
  owner: string | null;
}) {
  return {
    id: link.id,
    name: link.name,
    url: link.url,
    description: link.description,
    ...(link.avatar ? { avatar: link.avatar } : {}),
    ...(link.tag ? { tag: link.tag } : {}),
    ...(link.owner ? { owner: link.owner } : {}),
  };
}

function photoToJson(photo: Photo) {
  return {
    file: photo.file,
    caption: photo.caption,
    ...(photo.title ? { title: photo.title } : {}),
    ...(photo.story ? { story: photo.story } : {}),
    ...(photo.group ? { group: photo.group } : {}),
    ...(photo.coord ? { coord: photo.coord } : {}),
    ...(photo.date ? { date: photo.date } : {}),
    ...(photo.location ? { location: photo.location } : {}),
    ...(photo.aspect ? { aspect: photo.aspect } : {}),
    ...(photo.ar !== null ? { ar: photo.ar } : {}),
    ...(photo.ratioPill ? { ratioPill: photo.ratioPill } : {}),
    ...(photo.camera ? { camera: photo.camera } : {}),
    ...(photo.lens ? { lens: photo.lens } : {}),
    ...(photo.exposure ? { exposure: photo.exposure } : {}),
    ...(photo.color ? { color: photo.color } : {}),
    ...(photo.gps ? { gps: photo.gps } : {}),
    ...(photo.ev ? { ev: photo.ev } : {}),
    ...(photo.hist ? { hist: photo.hist } : {}),
    ...(photo.autoFields ? { autoFields: photo.autoFields } : {}),
  };
}

function wallToJson(wall: PhotoWall) {
  return {
    title: wall.title,
    ...(wall.date ? { date: wall.date } : {}),
    place: wall.place,
    note: wall.note,
    photos: wall.photos.map(photoToJson),
  };
}

function parseWallInput(slug: string, text: string): WallInput {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('照片墙 JSON 解析失败');
  }
  const title = String(raw.title ?? '').trim();
  if (!title) throw new Error('照片墙标题不能为空');
  const list = Array.isArray(raw.photos) ? raw.photos : [];
  const photos = list.map((item) => {
    const p = (item ?? {}) as Record<string, unknown>;
    return {
      file: String(p.file ?? ''),
      caption: p.caption ? String(p.caption) : '',
      title: p.title ? String(p.title) : null,
      story: p.story ? String(p.story) : null,
      group: p.group ? String(p.group) : null,
      coord: p.coord ? String(p.coord) : null,
      date: p.date ? String(p.date) : null,
      location: p.location ? String(p.location) : null,
      aspect: p.aspect ? String(p.aspect) : null,
      ar: typeof p.ar === 'number' ? p.ar : null,
      ratioPill: p.ratioPill ? String(p.ratioPill) : null,
      camera: p.camera ? String(p.camera) : null,
      lens: p.lens ? String(p.lens) : null,
      exposure: p.exposure ? String(p.exposure) : null,
      color: p.color ? String(p.color) : null,
      gps: p.gps ? String(p.gps) : null,
      ev: p.ev ? String(p.ev) : null,
      hist: Array.isArray(p.hist) ? p.hist.map(Number) : null,
      autoFields: Array.isArray(p.autoFields) ? p.autoFields.map(String) : null,
    };
  });
  return {
    slug,
    title,
    date: raw.date ? String(raw.date) : null,
    place: raw.place ? String(raw.place) : '',
    note: raw.note ? String(raw.note) : '',
    photos,
  };
}

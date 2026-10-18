/**
 * 虚拟文件 API：让现有 /studio/ 继续用 `Github.getFile/putText/listDir` 这套接口，
 * 但底层改为 SQLite + uploads。
 *
 * 映射：
 *   src/content/posts/<slug>.md      → posts.raw_markdown
 *   src/content/photos/<slug>.json   → photo_walls + photos
 *   src/content/links.json           → links
 *   src/site.data.json               → site_settings
 *   src/assets/posts/<file>          → uploads/posts/<file>
 *   src/assets/photos/<file>         → uploads/photos/<file>
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
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

  if (dir === 'src/assets/posts' || dir === 'src/assets/photos') {
    const kind = dir.endsWith('posts') ? 'posts' : 'photos';
    return listAssets(kind, dir);
  }

  return fail('目录不存在', 404);
}

async function listAssets(kind: 'posts' | 'photos', dir: string): Promise<Response> {
  const root = path.join(uploadRoot(), kind);
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch {
    names = [];
  }
  const entries: FsEntry[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const file = path.join(root, name);
    const info = await stat(file);
    if (!info.isFile()) continue;
    const bytes = await readFile(file);
    entries.push({
      name,
      path: `${dir}/${name}`,
      sha: createHash('sha1').update(bytes).digest('hex'),
      type: 'file',
    });
  }
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

function assetTarget(filePath: string): { kind: 'posts' | 'photos'; name: string; file: string } | null {
  const m = /^src\/assets\/(posts|photos)\/([^/]+)$/.exec(filePath);
  if (!m) return null;
  const kind = m[1] as 'posts' | 'photos';
  const name = m[2]!;
  if (!name || name !== path.basename(name) || name.startsWith('.')) return null;
  return { kind, name, file: path.join(uploadRoot(), kind, name) };
}

async function getBinary(filePath: string): Promise<Response> {
  const target = assetTarget(filePath);
  if (!target) return fail('文件不存在', 404);
  try {
    const bytes = await readFile(target.file);
    const ext = path.extname(target.name).toLowerCase();
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg';
    return new Response(bytes, {
      headers: {
        'Content-Type': mime,
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
     ON CONFLICT(path) DO UPDATE SET filename = excluded.filename, size = excluded.size`
  ).run({
    name: target.name,
    p: `/uploads/${target.kind}/${target.name}`,
    mime: path.extname(target.name).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
    size: bytes.length,
  });
  return json({ ok: true, sha: digest });
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
    getDb().prepare('DELETE FROM media WHERE path = ?').run(`/uploads/${target.kind}/${target.name}`);
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

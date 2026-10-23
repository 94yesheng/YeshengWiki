/**
 * 虚拟文件 API：让现有 /studio/ 继续用 `Github.getFile/putText/listDir` 这套接口，
 * 但底层改为 SQLite + uploads。
 *
 * 映射：
 *   src/content/posts/<slug>.md      → posts (结构化列 + body_markdown)
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
import { lstat, mkdir, readFile, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIContext } from 'astro';
import { getAuth, hasValidCsrf } from '../auth';
import { getDb } from '../db';
import { bumpContentVersion } from '../page-cache';
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
import { migratePostSlugAssets, rewritePostSlugReferences } from '../repositories/media';
import { getSettings, SETTING_KEYS, setSetting } from '../repositories/settings';
import { uploadRoot } from '../uploads';
import { fail, json, readJson } from './http';

const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024; // 单张图片服务端硬上限 20MB
const MAX_AUDIO_UPLOAD_BYTES = 30 * 1024 * 1024; // 单个音频服务端硬上限 30MB
const MAX_BASE64_JSON_BYTES = 42 * 1024 * 1024;  // 兼容旧版 Base64 JSON 传输上限

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

interface FsEntry {
  name: string;
  path: string;
  sha: string;
  type: 'file';
  /** listDir 时附带文本内容，消除客户端 N+1 瀑布流请求 */
  text?: string;
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
      const contentType = (context.request.headers.get('content-type') ?? '').toLowerCase();
      if (!contentType.includes('application/json')) {
        const declaredLen = Number(context.request.headers.get('content-length') || 0);
        if (Number.isFinite(declaredLen) && declaredLen > MAX_AUDIO_UPLOAD_BYTES) {
          return fail('上传文件体积超出服务端限制（最大 30MB）', 413);
        }
        const ab = await context.request.arrayBuffer();
        if (ab.byteLength > MAX_AUDIO_UPLOAD_BYTES) {
          return fail('上传文件体积超出服务端限制（最大 30MB）', 413);
        }
        const shaHeader = context.request.headers.get('x-file-sha')?.trim() || undefined;
        return putBinaryBuffer(filePath, Buffer.from(ab), shaHeader);
      }
      const body = await readJson<{ base64?: string; message?: string; sha?: string }>(
        context.request,
        MAX_BASE64_JSON_BYTES
      );
      if (!body?.base64) return fail('缺少 base64 或请求体过大', 400);
      return putBinary(filePath, body.base64, body.sha);
    }
    const body = await readJson<{
      text?: string;
      message?: string;
      sha?: string;
      fromPath?: string;
    }>(context.request);
    if (typeof body?.text !== 'string') return fail('缺少 text 或请求体过大', 400);
    return putText(filePath, body.text, body.sha, body.fromPath);
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
      text: buildPostMarkdown(post),
    }));
    return json({ entries });
  }

  if (dir === 'src/content/photos') {
    const entries: FsEntry[] = listWalls({ includeEmpty: true }).map((wall) => ({
      name: `${wall.slug}.json`,
      path: `src/content/photos/${wall.slug}.json`,
      sha: String(wall.version),
      type: 'file',
      text: JSON.stringify(wallToJson(wall), null, 2) + '\n',
    }));
    return json({ entries });
  }

  if (dir === 'src/assets/posts' || dir === 'src/assets/photos' || dir === 'src/assets/audio') {
    const kind = dir.endsWith('posts') ? 'posts' : dir.endsWith('photos') ? 'photos' : 'audio';
    return listAssets(kind, dir);
  }

  return fail('目录不存在', 404);
}

/**
 * 列出上传目录中的资源：
 * 使用文件 stat（size + mtimeMs）生成轻量指纹，绝不在列目录时把所有图片/无损音频读入内存算 SHA-1。
 */
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
      if (item.isSymbolicLink()) continue;
      const rel = relDir ? `${relDir}/${item.name}` : item.name;
      if (item.isDirectory()) {
        // 只展开一层：<slug>/<file>；更深的目录不进入，避免把 uploads 整棵树扫坏
        if (!relDir) await collect(item.name);
        continue;
      }
      // 符号链接等非常规条目直接跳过
      if (!item.isFile()) continue;
      try {
        const info = await stat(path.join(root, rel));
        entries.push({
          name: rel,
          path: `${dir}/${rel}`,
          sha: createHash('sha1')
            .update(`${rel}:${info.size}:${Math.trunc(info.mtimeMs)}`)
            .digest('hex'),
          type: 'file',
        });
      } catch {
        // 忽略并发删除的文件
      }
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

async function putText(
  filePath: string,
  text: string,
  sha?: string,
  fromPath?: string
): Promise<Response> {
  const postMatch = /^src\/content\/posts\/([^/]+)\.md$/.exec(filePath);
  if (postMatch) {
    const fromPostMatch = fromPath ? /^src\/content\/posts\/([^/]+)\.md$/.exec(fromPath) : null;
    return putPost(postMatch[1]!, text, sha, fromPostMatch?.[1]);
  }

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

function putPost(slug: string, text: string, sha?: string, fromSlug?: string): Response {
  const isRename = Boolean(fromSlug && fromSlug !== slug);
  const current = isRename ? getPostBySlug(fromSlug!, true) : getPostBySlug(slug, true);
  if (current && sha && sha !== String(current.version)) {
    return fail('文章已在别处被修改，请刷新后重试', 409);
  }

  if (isRename) {
    const conflict = getPostBySlug(slug, true);
    if (conflict && (!current || conflict.id !== current.id)) {
      return fail(`目标文章路由「${slug}」已存在，请换一个文件名`, 409);
    }
  }

  const effectiveText =
    isRename && fromSlug ? rewritePostSlugReferences(text, fromSlug, slug) : text;

  let parsed;
  try {
    parsed = parsePostMarkdown(effectiveText, slug);
  } catch (error) {
    return fail((error as Error).message, 400);
  }

  try {
    if (isRename && fromSlug) {
      migratePostSlugAssets(fromSlug, slug);
    }
    const saved = current
      ? updatePost(current.id, { ...parsed, slug }, current.version)
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
  kind: 'posts' | 'photos' | 'audio' | 'site';
  /** 文章归档目录（一层子目录）；旧版扁平资源为空字符串 */
  dir: string;
  name: string;
  file: string;
  base: string;
  /** 写进 media.path 的公开路径，例如 /uploads/posts/<slug>/<file> 或 /uploads/audio/<slug>/<file> */
  publicPath: string;
}

const UNSAFE_SEGMENT = /[\\:*?"<>|\x00-\x1f\x7f]/;

const ALLOWED_EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
};

/** 资源路径的单个分段：拒绝 . / .. / 隐藏文件 / 超长文件名 / 控制字符 / 盘符与反斜杠 */
function safeAssetSegment(segment: string): boolean {
  if (!segment || segment === '.' || segment === '..') return false;
  if (segment.length > 180) return false;
  if (segment.startsWith('.')) return false;
  if (UNSAFE_SEGMENT.test(segment)) return false;
  return segment === path.basename(segment);
}

function mimeForAsset(name: string): string | null {
  const ext = path.extname(name).toLowerCase();
  return ALLOWED_EXT_MIME[ext] ?? null;
}

/**
 * 零依赖解析图片二进制头部：获取真实 MIME 与像素宽高（JPEG / PNG / GIF / WebP / SVG）。
 */
function inspectImageBuffer(
  buf: Buffer,
  ext: string
): { mime: string | null; width: number | null; height: number | null } {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      mime: 'image/png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (buf.length >= 10 && buf.subarray(0, 3).toString('ascii') === 'GIF') {
    return {
      mime: 'image/gif',
      width: buf.readUInt16LE(6),
      height: buf.readUInt16LE(8),
    };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    let width: number | null = null;
    let height: number | null = null;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1]!;
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      const size = buf.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) {
        height = buf.readUInt16BE(i + 5);
        width = buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + (size > 0 ? size : 2);
    }
    return { mime: 'image/jpeg', width, height };
  }
  if (
    buf.length >= 30 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const chunk = buf.subarray(12, 16).toString('ascii');
    let width: number | null = null;
    let height: number | null = null;
    if (chunk === 'VP8 ' && buf.length >= 30) {
      width = buf.readUInt16LE(26) & 0x3fff;
      height = buf.readUInt16LE(28) & 0x3fff;
    } else if (chunk === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21]!;
      const b1 = buf[22]!;
      const b2 = buf[23]!;
      const b3 = buf[24]!;
      width = 1 + (((b1 & 0x3f) << 8) | b0);
      height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    } else if (chunk === 'VP8X' && buf.length >= 30) {
      width = 1 + buf.readUIntLE(24, 3);
      height = 1 + buf.readUIntLE(27, 3);
    }
    return { mime: 'image/webp', width, height };
  }
  if (ext === '.svg') {
    const text = buf.subarray(0, 4096).toString('utf8');
    const vb = /viewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)/i.exec(text);
    const wMatch = /\bwidth=["']([0-9.]+)(?:px)?["']/i.exec(text);
    const hMatch = /\bheight=["']([0-9.]+)(?:px)?["']/i.exec(text);
    const width = wMatch ? Math.round(Number(wMatch[1])) : vb ? Math.round(Number(vb[1])) : null;
    const height = hMatch ? Math.round(Number(hMatch[1])) : vb ? Math.round(Number(vb[2])) : null;
    return { mime: 'image/svg+xml', width: width || null, height: height || null };
  }
  return { mime: null, width: null, height: null };
}

/**
 * 解码 HTML / XML 数值与常见命名字符实体，防止通过 &#x6a;avascript: 等编码绕过 SVG 安全检测。
 */
function decodeXmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#([0-9]+);?/g, (_m, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&colon;/gi, ':')
    .replace(/&tab;/gi, ' ')
    .replace(/&newline;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/**
 * 校验 SVG 文本安全性：拦截多字节 BOM、XML 实体编码绕过、危险嵌入标签（含 <style>）、
 * SMIL 动画注入、on* 事件处理器与 javascript:/vbscript:/data: 伪协议，防止存储型 XSS。
 */
function isUnsafeSvg(buf: Buffer): boolean {
  if (buf.length < 5 || buf.includes(0x00)) return true;
  // 拒绝 UTF-16 BOM 以防 ASCII 正则被绕过
  if ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff)) {
    return true;
  }
  const rawText = buf.toString('utf8');
  if (/^\+\/v[89+/]/i.test(rawText.trimStart())) return true; // 拒绝 UTF-7

  const decoded = decodeXmlEntities(rawText).replace(/<!--[\s\S]*?-->/g, ' ');
  const compact = decoded.replace(/[\x00-\x20]+/g, '');

  if (!/<svg[\s>/]/i.test(decoded)) return true;
  if (/<!(?:ENTITY|DOCTYPE)/i.test(decoded)) return true;
  if (
    /<\/?(?:script|style|foreignObject|iframe|frame|object|embed|applet|meta|link|base|audio|video)\b/i.test(
      decoded
    )
  ) {
    return true;
  }
  // 拦截 SMIL 动画修改 href / xlink:href / on* 属性
  if (
    /<(?:animate|set|animateTransform|animateMotion)\b[^>]*\battributeName\s*=\s*["']?\s*(?:xlink:)?(?:href|on[a-z]+)/i.test(
      decoded
    )
  ) {
    return true;
  }
  if (/\bon[a-z0-9_]+\s*=/i.test(decoded)) return true;
  if (/(?:javascript|vbscript|livescript)\s*:/i.test(compact)) return true;
  // 拦截 href / xlink:href / src / url(...) 中的 data: 协议
  if (/(?:xlink:href|href|src|action|formaction)\s*=\s*["']?\s*data:/i.test(compact)) {
    return true;
  }
  if (/url\(\s*["']?\s*(?:javascript|vbscript|data):/i.test(compact)) return true;
  if (/@import\b/i.test(decoded)) return true;
  return false;
}

/**
 * 虚拟资源路径 → uploads 下的真实文件。
 */
function assetTarget(filePath: string): AssetTarget | null {
  const m = /^src\/assets\/(posts|photos|audio|site)\/([^/]+)(?:\/([^/]+))?$/.exec(filePath);
  if (!m) return null;
  const kind = m[1] as 'posts' | 'photos' | 'audio' | 'site';
  const dir = m[3] ? m[2]! : '';
  const name = m[3] ?? m[2]!;
  if (!safeAssetSegment(name)) return null;
  if (dir && !safeAssetSegment(dir)) return null;
  if (kind === 'site' && dir) return null;

  const base = path.resolve(uploadRoot(), kind);
  const file = path.resolve(base, dir, name);
  if (!file.startsWith(base + path.sep)) return null;

  return {
    kind,
    dir,
    name,
    file,
    base,
    publicPath: `/uploads/${kind}/${dir ? dir + '/' : ''}${name}`,
  };
}

/**
 * 二次校验真实物理路径（realpath + lstat），禁止通过符号链接（Symlink）逃逸出 uploads 根目录。
 */
async function ensureWithinRealBase(target: AssetTarget, mustExist: boolean): Promise<boolean> {
  try {
    await mkdir(target.base, { recursive: true });
    const realBase = await realpath(target.base);
    const parentDir = path.dirname(target.file);
    if (mustExist) {
      const fileStat = await lstat(target.file);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) return false;
      const realFile = await realpath(target.file);
      return realFile !== realBase && realFile.startsWith(realBase + path.sep);
    }
    await mkdir(parentDir, { recursive: true });
    const dirStat = await lstat(parentDir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return false;
    const realParent = await realpath(parentDir);
    if (realParent !== realBase && !realParent.startsWith(realBase + path.sep)) return false;
    try {
      const existingStat = await lstat(target.file);
      if (existingStat.isSymbolicLink()) return false;
    } catch {
      // 目标文件尚不存在（正常新建场景）
    }
    return true;
  } catch {
    return false;
  }
}

async function getBinary(filePath: string): Promise<Response> {
  const target = assetTarget(filePath);
  if (!target) return fail('文件不存在', 404);
  if (!(await ensureWithinRealBase(target, true))) return fail('文件不存在', 404);
  try {
    const bytes = await readFile(target.file);
    const info = await stat(target.file);
    const sha = createHash('sha1')
      .update(`${target.dir ? `${target.dir}/` : ''}${target.name}:${info.size}:${Math.trunc(info.mtimeMs)}`)
      .digest('hex');
    return new Response(bytes, {
      headers: {
        'Content-Type': mimeForAsset(target.name) ?? 'application/octet-stream',
        'X-File-Sha': sha,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return fail('文件不存在', 404);
  }
}

async function putBinary(filePath: string, base64: string, sha?: string): Promise<Response> {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return fail('base64 解码失败', 400);
  }
  return putBinaryBuffer(filePath, bytes, sha);
}

async function putBinaryBuffer(filePath: string, bytes: Buffer, sha?: string): Promise<Response> {
  const target = assetTarget(filePath);
  if (!target) return fail('非法资源路径', 400);

  const ext = path.extname(target.name).toLowerCase();
  const extMime = mimeForAsset(target.name);
  if (!extMime) {
    return fail(`不支持的文件格式：${ext || '未知后缀'}`, 400);
  }

  if (!bytes.length) return fail('空文件', 400);

  const isAudio = extMime.startsWith('audio/');
  const maxBytes = isAudio ? MAX_AUDIO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (bytes.length > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return fail(`文件体积超过服务端上限（最大 ${limitMb}MB）`, 413);
  }

  if (ext === '.svg' && isUnsafeSvg(bytes)) {
    return fail('SVG 文件包含不安全的脚本、样式或事件属性，已拒绝上传', 400);
  }

  const inspected = inspectImageBuffer(bytes, ext);
  const STRICT_MAGIC_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  if (STRICT_MAGIC_EXTS.has(ext) && inspected.mime !== extMime) {
    return fail('文件内容与扩展名不匹配（魔数校验未通过）', 400);
  }

  if (!(await ensureWithinRealBase(target, false))) {
    return fail('非法资源路径（符号链接校验未通过）', 403);
  }

  if (sha) {
    try {
      const oldStat = await stat(target.file);
      const rel = target.dir ? `${target.dir}/${target.name}` : target.name;
      const statSha = createHash('sha1')
        .update(`${rel}:${oldStat.size}:${Math.trunc(oldStat.mtimeMs)}`)
        .digest('hex');
      if (statSha !== sha) {
        const oldBytes = await readFile(target.file);
        const contentSha = createHash('sha1').update(oldBytes).digest('hex');
        if (contentSha !== sha) {
          return fail('文件已在别处被修改，请刷新后重试', 409);
        }
      }
    } catch {
      // 新文件，忽略 sha
    }
  }

  await writeFile(target.file, bytes);
  const newStat = await stat(target.file);
  const rel = target.dir ? `${target.dir}/${target.name}` : target.name;
  const digest = createHash('sha1')
    .update(`${rel}:${newStat.size}:${Math.trunc(newStat.mtimeMs)}`)
    .digest('hex');

  const db = getDb();
  db.prepare(
    `INSERT INTO media (filename, path, width, height, mime, size)
     VALUES (@name, @p, @width, @height, @mime, @size)
     ON CONFLICT(path) DO UPDATE SET
       filename = excluded.filename,
       width = COALESCE(excluded.width, media.width),
       height = COALESCE(excluded.height, media.height),
       mime = excluded.mime,
       size = excluded.size`
  ).run({
    name: target.name,
    p: target.publicPath,
    width: inspected.width,
    height: inspected.height,
    mime: inspected.mime ?? extMime,
    size: bytes.length,
  });
  bumpContentVersion();
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
    if (!(await ensureWithinRealBase(target, true))) {
      return fail('文件不存在', 404);
    }
    try {
      await unlink(target.file);
    } catch {
      return fail('文件不存在', 404);
    }
    getDb().prepare('DELETE FROM media WHERE path = ?').run(target.publicPath);
    bumpContentVersion();
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

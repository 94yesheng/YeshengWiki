/**
 * 媒体库数据访问层。
 *
 * `media` 表由 `/api/fs` 上传图片或音频时写入。路径约定：
 *   /uploads/posts/<文章slug>/<文件名>   已归档到某篇文章
 *   /uploads/posts/<文件名>             历史遗留，没有文章归属（owner = null）
 *   /uploads/photos/<文件名>            照片墙（owner = 'photos'）
 *   /uploads/audio/<文章slug>/<文件名>   音频文件（owner = 'audio'）
 *   /uploads/audio/<文件名>             通用音频库文件（owner = 'audio'）
 *
 * 这里只读 + 删除；上传仍走 `/api/fs`。
 */
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '../db';
import { uploadRoot } from '../uploads';

export interface MediaItem {
  id: number;
  filename: string;
  path: string;
  url: string;
  width: number | null;
  height: number | null;
  mime: string | null;
  size: number | null;
  createdAt: string;
  /** `/uploads/posts/<slug>/` 里的 slug；照片墙为 'photos'；音频库为 'audio'；其他为 null */
  owner: string | null;
  /** owner 对应的 posts.title（等价于 JOIN posts.slug） */
  postTitle: string | null;
}

interface MediaRow {
  id: number;
  filename: string;
  path: string;
  width: number | null;
  height: number | null;
  mime: string | null;
  size: number | null;
  created_at: string;
}

interface OwnerParts {
  owner: string | null;
  postSlug?: string | null;
  filename: string;
}

const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i;

/**
 * 从数据库里的 path 解析归属。
 * `path.split('/')` → `['', 'uploads', 'posts' | 'photos' | 'audio', ...]`
 *   · audio              → owner = 'audio'（若有子目录则为对应文章 slug）
 *   · posts 后面还有两段 → owner = 第 3 段（slug）
 *   · posts 后面只有一段 → owner = null（未归档）
 *   · photos             → owner = 'photos'
 *   · 其他               → owner = null
 */
function parseOwner(mediaPath: string, mime?: string | null): OwnerParts {
  const parts = mediaPath.split('/');
  const fallback = parts[parts.length - 1] ?? mediaPath;
  const isAudio = (mime ?? '').startsWith('audio/') || AUDIO_EXT_RE.test(mediaPath);

  if (parts[0] !== '' || parts[1] !== 'uploads') {
    return { owner: isAudio ? 'audio' : null, filename: fallback };
  }

  if (parts[2] === 'site') {
    return { owner: 'site', filename: parts.slice(3).join('/') || fallback };
  }

  if (parts[2] === 'audio') {
    const rest = parts.slice(3);
    if (rest.length >= 2) {
      return {
        owner: 'audio',
        postSlug: rest[0] ?? null,
        filename: rest.slice(1).join('/') || fallback,
      };
    }
    return { owner: 'audio', filename: rest.join('/') || fallback };
  }

  if (parts[2] === 'photos') {
    const rest = parts.slice(3);
    return { owner: 'photos', filename: rest.join('/') || fallback };
  }

  if (parts[2] === 'posts') {
    const rest = parts.slice(3);
    if (isAudio) {
      return {
        owner: 'audio',
        postSlug: rest.length >= 2 ? (rest[0] ?? null) : null,
        filename: (rest.length >= 2 ? rest.slice(1).join('/') : rest[0]) ?? fallback,
      };
    }
    // rest[0] 是 slug，rest[1] 起是文件名；只有一段说明是历史遗留的未归档文件。
    if (rest.length >= 2) return { owner: rest[0] ?? null, postSlug: rest[0] ?? null, filename: rest.slice(1).join('/') };
    return { owner: null, filename: rest[0] ?? fallback };
  }

  return { owner: isAudio ? 'audio' : null, filename: fallback };
}

/** 分组排序：文章分组（按 slug）→ 音频库 → 照片墙 → 未归档；组内按文件名。 */
function ownerRank(owner: string | null): number {
  if (owner === null) return 3;
  if (owner === 'photos') return 2;
  if (owner === 'audio') return 1;
  return 0;
}

export function listMedia(): MediaItem[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM media ORDER BY id DESC').all() as MediaRow[];

  const titles = new Map<string, string>();
  for (const post of db.prepare('SELECT slug, title FROM posts').all() as Array<{
    slug: string;
    title: string;
  }>) {
    titles.set(post.slug, post.title);
  }

  const items = rows.map((row) => {
    const { owner, postSlug, filename } = parseOwner(row.path, row.mime);
    const lookupSlug = postSlug ?? (owner && owner !== 'photos' && owner !== 'audio' ? owner : null);
    return {
      id: row.id,
      filename: row.filename || filename,
      path: row.path,
      url: row.path,
      width: row.width,
      height: row.height,
      mime: row.mime,
      size: row.size,
      createdAt: row.created_at,
      owner,
      postTitle: lookupSlug ? (titles.get(lookupSlug) ?? null) : null,
    } satisfies MediaItem;
  });

  items.sort(
    (a, b) =>
      ownerRank(a.owner) - ownerRank(b.owner) ||
      (a.owner ?? '').localeCompare(b.owner ?? '') ||
      a.filename.localeCompare(b.filename)
  );
  return items;
}

/**
 * 把 `/uploads/...` 解析成 uploadRoot() 下的绝对路径。
 * 解析后不在 uploadRoot() 里（目录穿越、绝对路径、空路径）就返回 null。
 */
function resolveUploadFile(mediaPath: string): string | null {
  const prefix = '/uploads/';
  if (!mediaPath.startsWith(prefix) || mediaPath.includes('\0')) return null;

  const rel = mediaPath.slice(prefix.length);
  if (!rel) return null;

  const root = uploadRoot();
  const file = path.resolve(root, rel);
  if (file === root || !file.startsWith(root + path.sep)) return null;
  return file;
}

/**
 * 删除一条媒体：先删 uploads 下的真实文件，再删 media 行。
 * 返回是否真的删掉了东西（数据库行或文件任一存在）；路径非法或都不存在返回 false。
 */
export function deleteMedia(mediaPath: string): boolean {
  const file = resolveUploadFile(mediaPath);
  if (!file) return false;

  let fileRemoved = false;
  try {
    unlinkSync(file);
    fileRemoved = true;
  } catch (error) {
    // 文件已经不在了不算失败：只要 media 行还在，这次删除仍然有效。
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const info = getDb().prepare('DELETE FROM media WHERE path = ?').run(mediaPath);
  return fileRemoved || info.changes > 0;
}

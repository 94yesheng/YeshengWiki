/**
 * `/uploads/*` 的本地兜底静态服务。
 *
 * 生产环境 Nginx 会直接 alias 到 `/srv/blog-data/uploads`，不会走到 Node；
 * 这个 handler 用于本地 dev / staging（没有 Nginx 时也能看到图与音频）。
 */
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { APIContext } from 'astro';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
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

export function uploadRoot(): string {
  return path.resolve(process.env.BLOG_UPLOAD_DIR ?? 'data/uploads');
}

export async function serveUpload(context: APIContext): Promise<Response | null> {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') return null;

  const raw = context.url.pathname.replace(/^\/uploads\//, '');
  let rel: string;
  try {
    rel = decodeURIComponent(raw);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!rel || rel.includes('\0')) return new Response('Not found', { status: 404 });

  const root = uploadRoot();
  const file = path.resolve(root, rel);
  if (file === root || !file.startsWith(root + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    // 拒绝符号链接（Symlink）并进行 realpath 二次根目录囚禁校验
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) {
      return new Response('Not found', { status: 404 });
    }
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(file)]);
    if (realFile === realRoot || !realFile.startsWith(realRoot + path.sep)) {
      return new Response('Not found', { status: 404 });
    }

    const ext = path.extname(realFile).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    const rangeHeader = context.request.headers.get('range');

    const baseHeaders: Record<string, string> = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=2592000',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    };

    if (rangeHeader && context.request.method === 'GET') {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
      if (m) {
        const total = info.size;
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(total - 1, parseInt(m[2], 10)) : total - 1;
        if (start >= 0 && start <= end && start < total) {
          const chunkLen = end - start + 1;
          const nodeStream = createReadStream(realFile, { start, end });
          const webStream = Readable.toWeb(nodeStream) as ReadableStream;
          return new Response(webStream, {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Length': String(chunkLen),
              'Content-Range': `bytes ${start}-${end}/${total}`,
            },
          });
        }
      }
    }

    if (context.request.method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Length': String(info.size),
        },
      });
    }

    const nodeStream = createReadStream(realFile);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new Response(webStream, {
      status: 200,
      headers: {
        ...baseHeaders,
        'Content-Length': String(info.size),
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

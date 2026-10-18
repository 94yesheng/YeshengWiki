/**
 * `/uploads/*` 的本地兜底静态服务。
 *
 * 生产环境 Nginx 会直接 alias 到 `/var/www/blog-data/uploads`，不会走到 Node；
 * 这个 handler 用于本地 dev / staging（没有 Nginx 时也能看到图）。
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { APIContext } from 'astro';

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export function uploadRoot(): string {
  return path.resolve(process.env.BLOG_UPLOAD_DIR ?? 'data/uploads');
}

export async function serveUpload(context: APIContext): Promise<Response | null> {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') return null;

  const raw = context.url.pathname.replace(/^\/uploads\//, '');
  const rel = decodeURIComponent(raw);
  if (!rel) return new Response('Not found', { status: 404 });

  const root = uploadRoot();
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) return new Response('Not found', { status: 404 });
    const body = context.request.method === 'HEAD' ? null : await readFile(file);
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': String(info.size),
        'Cache-Control': 'public, max-age=2592000',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

import { defineMiddleware } from 'astro:middleware';
import { bootstrap } from './server/bootstrap';
import { handleApi } from './server/api/router';
import { serveUpload } from './server/uploads';
import { faviconInfo, getSiteConfig } from './server/site';
import { legacyRedirectTarget } from './server/legacy-redirects';

bootstrap();

export const onRequest = defineMiddleware(async (context, next) => {
  // 后台配了自定义图标时，让 /favicon.ico 也跳到它（书签/后台页兜底）
  if (context.url.pathname === '/favicon.ico') {
    const fav = faviconInfo(getSiteConfig());
    if (fav.href !== '/favicon.svg') return context.redirect(fav.href, 302);
  }

  // 旧 WordPress 链接（?p=ID / 中文 percent-encoded slug / ?page_id=ID）→ 新站 301。
  // 动手前先看 src/server/legacy-redirects.ts 的注释：只做精确匹配。
  if (context.request.method === 'GET' || context.request.method === 'HEAD') {
    const legacyTarget = legacyRedirectTarget(context.url);
    if (legacyTarget) {
      return new Response(null, {
        status: 301,
        headers: { Location: legacyTarget },
      });
    }
  }

  // /uploads/*：本地/staging 兜底；生产 Nginx 会直接服务
  if (context.url.pathname.startsWith('/uploads/')) {
    const upload = await serveUpload(context);
    if (upload) return upload;
  }

  // /api/* 由我们自己的 router 处理（静态构建时不会用到）
  const apiResponse = await handleApi(context);
  const response = apiResponse ?? (await next());

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (context.url.pathname.startsWith('/api/') || context.url.pathname.startsWith('/studio')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
});

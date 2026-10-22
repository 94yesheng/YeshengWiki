import { defineMiddleware } from 'astro:middleware';
import artifactCss from './artifact/artifact.css?raw';
import artifactJs from './artifact/artifact.js?raw';
import { bootstrap } from './server/bootstrap';
import { handleApi } from './server/api/router';
import { serveUpload } from './server/uploads';
import { faviconInfo, getSiteConfig } from './server/site';
import { legacyRedirectTarget } from './server/legacy-redirects';
import { recordVisit } from './server/repositories/analytics';

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

  // /artifact/artifact.css 与 /artifact/artifact.js：支持带 ?v=<hash> 的长缓存响应
  if (
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    (context.url.pathname === '/artifact/artifact.css' ||
      context.url.pathname === '/artifact/artifact.js')
  ) {
    const isCss = context.url.pathname.endsWith('.css');
    const hasVer = context.url.searchParams.has('v');
    return new Response(context.request.method === 'HEAD' ? null : isCss ? artifactCss : artifactJs, {
      status: 200,
      headers: {
        'Content-Type': isCss
          ? 'text/css; charset=utf-8'
          : 'application/javascript; charset=utf-8',
        'Cache-Control': hasVer
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=2592000',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  }

  // /uploads/*：本地/staging 兜底；生产 Nginx 会直接服务
  if (context.url.pathname.startsWith('/uploads/')) {
    const upload = await serveUpload(context);
    if (upload) return upload;
  }

  // /api/* 由我们自己的 router 处理（静态构建时不会用到）
  const apiResponse = await handleApi(context);
  if (apiResponse) {
    apiResponse.headers.set('X-Content-Type-Options', 'nosniff');
    apiResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    apiResponse.headers.set('Cache-Control', 'no-store');
    return apiResponse;
  }

  // 记录公开页面访客信息（日期、IP、国家坐标、使用设备/系统/浏览器）
  if (context.request.method === 'GET') {
    recordVisit(context);
  }

  const response = await next();

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (context.url.pathname.startsWith('/api/') || context.url.pathname.startsWith('/studio')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
});

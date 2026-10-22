import { defineMiddleware } from 'astro:middleware';
import artifactCss from './artifact/artifact.css?raw';
import artifactJs from './artifact/artifact.js?raw';
import { bootstrap } from './server/bootstrap';
import { handleApi } from './server/api/router';
import { serveUpload } from './server/uploads';
import {
  ARTIFACT_CSS_HASH,
  ARTIFACT_JS_HASH,
  faviconInfo,
  getSiteConfig,
} from './server/site';
import { legacyRedirectTarget } from './server/legacy-redirects';
import { getCachedPage, setCachedPage } from './server/page-cache';
import { recordVisit } from './server/repositories/analytics';

bootstrap();

const STATIC_EXT_RE =
  /\.(?:xml|js|mjs|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|flac|aac|opus|webm|json|txt|map|webmanifest)$/i;

function isCacheablePublicRoute(pathname: string): boolean {
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/studio') ||
    pathname.startsWith('/uploads/') ||
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/artifact/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.svg' ||
    pathname === '/robots.txt' ||
    STATIC_EXT_RE.test(pathname)
  ) {
    return false;
  }
  return true;
}

/** 部分 Node/代理实现会把 If-None-Match 的引号剥掉，这里统一比较裸 ETag。 */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const normalize = (value: string) => value.trim().replace(/^W\//, '').replace(/^"+|"+$/g, '');
  const expected = normalize(etag);
  return header.split(',').some((part) => normalize(part) === expected);
}

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

  // /artifact/artifact.css 与 /artifact/artifact.js：支持带 ?v=<hash> 的长缓存与 ETag 304 响应
  if (
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    (context.url.pathname === '/artifact/artifact.css' ||
      context.url.pathname === '/artifact/artifact.js')
  ) {
    const isCss = context.url.pathname.endsWith('.css');
    const etag = `"${isCss ? ARTIFACT_CSS_HASH : ARTIFACT_JS_HASH}"`;
    const hasVer = context.url.searchParams.has('v');
    const cacheControl = hasVer
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=2592000';

    if (etagMatches(context.request.headers.get('if-none-match'), etag)) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': cacheControl,
        },
      });
    }

    return new Response(context.request.method === 'HEAD' ? null : isCss ? artifactCss : artifactJs, {
      status: 200,
      headers: {
        'Content-Type': isCss
          ? 'text/css; charset=utf-8'
          : 'application/javascript; charset=utf-8',
        ETag: etag,
        'Cache-Control': cacheControl,
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

  // 公开 HTML 页面极速内存缓存层（0ms TTFB + 后台修改实时失效 + 每次访问照常异步记录访客统计）
  const canUsePageCache =
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    isCacheablePublicRoute(context.url.pathname);
  const cacheKey = canUsePageCache ? `${context.url.pathname}${context.url.search}` : '';

  if (canUsePageCache) {
    const cached = getCachedPage(cacheKey);
    if (cached) {
      if (context.request.method === 'GET') {
        recordVisit(context);
      }
      if (etagMatches(context.request.headers.get('if-none-match'), cached.etag)) {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: cached.etag,
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        });
      }
      return new Response(context.request.method === 'HEAD' ? null : cached.html, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          ETag: cached.etag,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
      });
    }
  }

  // 先完成页面渲染，不在请求前做任何阻塞动作
  const response = await next();

  const contentType = response.headers.get('content-type') ?? '';
  const isHtml200 = response.status === 200 && contentType.includes('text/html');

  // 仅当公开 HTML 页面成功返回（200 text/html）时，异步将真实访问推入内存缓冲队列
  if (context.request.method === 'GET' && isHtml200) {
    recordVisit(context);
  }

  if (canUsePageCache && context.request.method === 'GET' && isHtml200) {
    const html = await response.text();
    const cached = setCachedPage(cacheKey, html, contentType);
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        ETag: cached.etag,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  }

  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (context.url.pathname.startsWith('/api/') || context.url.pathname.startsWith('/studio')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
});

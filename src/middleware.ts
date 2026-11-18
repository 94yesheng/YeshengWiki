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

// 默认采用前端 JS 信标（POST /api/analytics/collect）确认真实浏览器访问，彻底过滤不执行 JS 的机房脚本；
// 如需同时开启 SSR 裸 GET 记数，可设置环境变量 BLOG_SSR_RAW_VISIT=1。
const ENABLE_SSR_RAW_VISIT = process.env.BLOG_SSR_RAW_VISIT === '1';

const STATIC_EXT_RE =
  /\.(?:xml|js|mjs|css|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|mp3|wav|ogg|m4a|flac|aac|opus|webm|json|txt|map|webmanifest|php|asp|aspx|jsp|cgi|env|git|sql|bak|zip|tar|gz|rar)$/i;

const PUBLIC_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; frame-src 'self' https://music.163.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

const STUDIO_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

function applySecurityHeaders(headers: Headers, pathname: string, isHttps: boolean): void {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  if (isHttps) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  if (!headers.has('Content-Security-Policy') && !pathname.startsWith('/uploads/')) {
    const isStudioOrApi = pathname.startsWith('/studio') || pathname.startsWith('/api/');
    headers.set('Content-Security-Policy', isStudioOrApi ? STUDIO_CSP : PUBLIC_CSP);
  }
}

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
  const { pathname } = context.url;
  const isHttps =
    context.url.protocol === 'https:' ||
    context.request.headers.get('x-forwarded-proto') === 'https';

  if (pathname === '/favicon.ico') {
    const fav = faviconInfo(getSiteConfig());
    if (fav.href !== '/favicon.svg') return context.redirect(fav.href, 302);
  }

  if (context.request.method === 'GET' || context.request.method === 'HEAD') {
    const legacyTarget = legacyRedirectTarget(context.url);
    if (legacyTarget) {
      const res = new Response(null, {
        status: 301,
        headers: { Location: legacyTarget },
      });
      applySecurityHeaders(res.headers, pathname, isHttps);
      return res;
    }
  }

  if (
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    (pathname === '/artifact/artifact.css' || pathname === '/artifact/artifact.js')
  ) {
    const isCss = pathname.endsWith('.css');
    const etag = `"${isCss ? ARTIFACT_CSS_HASH : ARTIFACT_JS_HASH}"`;
    const hasVer = context.url.searchParams.has('v');
    const cacheControl = hasVer
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=2592000';

    if (etagMatches(context.request.headers.get('if-none-match'), etag)) {
      const res304 = new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': cacheControl,
        },
      });
      applySecurityHeaders(res304.headers, pathname, isHttps);
      return res304;
    }

    const res200 = new Response(
      context.request.method === 'HEAD' ? null : isCss ? artifactCss : artifactJs,
      {
        status: 200,
        headers: {
          'Content-Type': isCss
            ? 'text/css; charset=utf-8'
            : 'application/javascript; charset=utf-8',
          ETag: etag,
          'Cache-Control': cacheControl,
        },
      }
    );
    applySecurityHeaders(res200.headers, pathname, isHttps);
    return res200;
  }

  if (pathname.startsWith('/uploads/')) {
    const upload = await serveUpload(context);
    if (upload) return upload;
  }

  const apiResponse = await handleApi(context);
  if (apiResponse) {
    applySecurityHeaders(apiResponse.headers, pathname, isHttps);
    apiResponse.headers.set('Cache-Control', 'no-store');
    return apiResponse;
  }

  const canUsePageCache =
    (context.request.method === 'GET' || context.request.method === 'HEAD') &&
    isCacheablePublicRoute(pathname);
  const cacheKey = canUsePageCache ? `${pathname}${context.url.search}` : '';

  if (canUsePageCache) {
    const cached = getCachedPage(cacheKey);
    if (cached) {
      if (ENABLE_SSR_RAW_VISIT && context.request.method === 'GET') {
        recordVisit(context);
      }
      if (etagMatches(context.request.headers.get('if-none-match'), cached.etag)) {
        const res304 = new Response(null, {
          status: 304,
          headers: {
            ETag: cached.etag,
            'Cache-Control': 'no-cache',
          },
        });
        applySecurityHeaders(res304.headers, pathname, isHttps);
        return res304;
      }
      const resCached = new Response(context.request.method === 'HEAD' ? null : cached.html, {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          ETag: cached.etag,
          'Cache-Control': 'no-cache',
        },
      });
      applySecurityHeaders(resCached.headers, pathname, isHttps);
      return resCached;
    }
  }

  const response = await next();

  const contentType = response.headers.get('content-type') ?? '';
  const isHtml200 = response.status === 200 && contentType.includes('text/html');

  if (ENABLE_SSR_RAW_VISIT && context.request.method === 'GET' && isHtml200) {
    recordVisit(context);
  }

  if (canUsePageCache && context.request.method === 'GET' && isHtml200) {
    const html = await response.text();
    const cached = setCachedPage(cacheKey, html, contentType);
    const resFresh = new Response(html, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        ETag: cached.etag,
        'Cache-Control': 'no-cache',
      },
    });
    applySecurityHeaders(resFresh.headers, pathname, isHttps);
    return resFresh;
  }

  applySecurityHeaders(response.headers, pathname, isHttps);

  if (pathname.startsWith('/api/') || pathname.startsWith('/studio')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
});

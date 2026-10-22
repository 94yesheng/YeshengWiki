import type { APIContext } from 'astro';
import { getAuth } from '../../server/auth';
import statsHtml from '../../studio/stats.html?raw';

export const prerender = false;

/**
 * /studio/stats —— 后台访客统计与 3D 粒子地球仪遥测台。
 * 页面本身是一套独立 HUD（样式与脚本内联在 stats.html），这里只做登录保护与返回。
 */
export function GET(context: APIContext): Response {
  if (!getAuth(context)) return context.redirect('/studio/', 302);
  return new Response(statsHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * 站点级配置的唯一读取入口。
 *
 * 动态版里 `site` 存在 site_settings 表；`src/site.config` 只作默认兜底。
 * 所有 header / footer / meta 都应走这里，避免“后台改了、页面还读静态文件”。
 */
import { createHash } from 'node:crypto';
import artifactCss from '../artifact/artifact.css?raw';
import artifactJs from '../artifact/artifact.js?raw';
import { site as staticSite, type SiteConfig } from '../site.config';
import { getSetting } from './repositories/settings';
import { copy, getPageValues } from './pages';

/** 进程启动时一次性计算 ~290KB 静态资源的 SHA-1 指纹，避免每次 SSR 页面请求重复计算 */
export const ARTIFACT_CSS_HASH = createHash('sha1').update(artifactCss).digest('hex').slice(0, 10);
export const ARTIFACT_JS_HASH = createHash('sha1').update(artifactJs).digest('hex').slice(0, 10);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function getSiteConfig(): SiteConfig {
  const stored = getSetting<Partial<SiteConfig>>('site', staticSite);
  return {
    ...staticSite,
    ...stored,
    nav: Array.isArray(stored.nav) ? stored.nav : staticSite.nav,
  };
}

export interface FaviconInfo {
  href: string;
  type: string;
}

const FAVICON_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.gif': 'image/gif',
};

/**
 * 站点图标地址：只接受站内 /uploads/... 或 /favicon.*，其余一律回退默认，
 * 避免把 javascript: 之类的地址写进 <link rel="icon">。
 */
export function faviconInfo(site: Partial<SiteConfig> | undefined): FaviconInfo {
  const raw = String(site?.favicon ?? '').trim();
  const safe = /^\/(?:uploads\/[A-Za-z0-9._\/-]+|favicon\.[a-z0-9]+)$/i.test(raw);
  const href = safe ? raw : '/favicon.svg';
  const dot = href.lastIndexOf('.');
  const ext = dot >= 0 ? href.slice(dot).toLowerCase() : '.svg';
  return { href, type: FAVICON_TYPES[ext] ?? 'image/png' };
}

const NAV_VIEW: Record<string, string> = {
  '/': 'home',
  '/posts/': 'posts',
  '/photos/': 'photos',
  '/programs/': 'programs',
  '/links/': 'links',
};

function renderNav(site: SiteConfig, current?: string): string {
  const links = site.nav
    .map((item, i) => {
      const view = NAV_VIEW[item.href] ?? '';
      const active = view && view === current ? ' aria-current="page"' : '';
      const data = view ? ` data-nav-view="${view}"` : '';
      return `          <a class="site-nav-link"${data}${active} href="${esc(item.href)}">
            <span class="nav-idx">${String(i).padStart(2, '0')}</span><span>${esc(item.label)}</span>
          </a>`;
    })
    .join('\n');
  return `<nav class="site-nav" aria-label="主导航">\n${links}\n        </nav>`;
}

/**
 * artifact 的 header/footer 是原样 HTML，里面写死了站名、作者和导航。
 * 在 SSR 注入前替换这几处，保持原有结构和 class 不变。
 */
export function applyArtifactSite(html: string, site: SiteConfig, current?: string): string {
  let out = html;

  out = out.replace(
    /(<span class="nav-brand-text">)[\s\S]*?(<\/span>)/,
    (_m, a: string, b: string) => `${a}${esc(site.author)}${b}`
  );
  out = out.replace(
    /(<span class="nav-brand-coord">)[\s\S]*?(<\/span>)/,
    (_m, a: string, b: string) => `${a}${esc(site.brandCoord ?? '96REM // ULTRAWIDE')}${b}`
  );
  out = out.replace(
    /(<span class="loader-title-kai">)[\s\S]*?(<\/span>)/,
    (_m, a: string, b: string) => `${a}${esc(site.title)}${b}`
  );

  // 子页 artifact 模板里带着和主页同一份 loader；状态文字统一走页面文案配置。
  if (out.includes('id="loader-status-text"')) {
    const pages = getPageValues();
    out = out.replace(
      /(<span id="loader-status-text">)[\s\S]*?(<\/span>)/,
      (_m, a: string, b: string) => `${a}${esc(copy(pages, 'home.loader.status'))}${b}`
    );
  }

  out = out.replace(/<nav class="site-nav"[\s\S]*?<\/nav>/, renderNav(site, current));

  out = out.replace(
    /(<a\b[^>]*\bclass="nav-brand"[^>]*\baria-label=")[^"]*(")/,
    (_m, a: string, b: string) => `${a}${esc(site.title)} 主页${b}`
  );

  if (site.footerCopyright) {
    out = out.replace(
      /(<div class="site-foot-inner">\s*<span>)[\s\S]*?(<span class="theme-foot-mark")/,
      (_m, a: string, b: string) => `${a}${esc(site.footerCopyright!)} ${b}`
    );
  }

  const dmEnabled = site.divergenceMeter?.enabled !== false;
  const dmWorldline = (site.divergenceMeter?.worldline ?? '').trim();
  const studioCfg = getSetting<{ exifCipherEffect?: boolean }>('studio', {});
  const exifCipherEnabled = studioCfg.exifCipherEffect !== false;

  out = out.replace(
    /<div class="dm dm--dark-only" id="footer-dm" data-dm aria-hidden="true">/,
    `<div class="dm dm--dark-only" id="footer-dm" data-dm data-dm-enabled="${
      dmEnabled ? 'true' : 'false'
    }" data-worldline="${esc(dmWorldline)}" data-exif-cipher="${
      exifCipherEnabled ? 'true' : 'false'
    }"${dmEnabled ? '' : ' hidden style="display:none"'} aria-hidden="true">`
  );

  return out;
}

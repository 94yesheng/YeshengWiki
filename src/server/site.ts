/**
 * 站点级配置的唯一读取入口。
 *
 * 动态版里 `site` 存在 site_settings 表；`src/site.config` 只作默认兜底。
 * 所有 header / footer / meta 都应走这里，避免“后台改了、页面还读静态文件”。
 */
import { site as staticSite, type SiteConfig } from '../site.config';
import { getSetting } from './repositories/settings';
import { copy, getPageValues } from './pages';

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

  return out;
}

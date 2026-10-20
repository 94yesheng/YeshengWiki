/**
 * 「按博客里的真实样子预览」—— 1:1 同构渲染前台文章详细页（ArtifactLayout + article.html + artifact-prose.css + artifact.js）
 *
 * 彻底解决旧版预览与前台不一致的问题：
 *   1. 直接使用与前台 `/posts/<slug>/` 完全相同的 `article.html` 模板、`artifact.css`、`artifact-prose.css` 与 `artifact.js`；
 *   2. 无论是未保存的新建草稿、草稿状态文章还是已发布文章，均实时注入当前编辑的标题、导语、标签、坐标徽标、三体铭牌、
 *      正文 HTML（含 H2/H3 锚点与 TOC 目录）以及右侧信息悬浮窗（`renderArticleRailSlots`）；
 *   3. 保留前台《三体》三维引力轨迹 Canvas 动画、阅读进度遥测、目录平滑定位与昼夜模式同步；
 *   4. 预览顶栏支持桌面宽屏 / 笔记本 / 平板 / 手机视口宽度切换与页内昼夜模式切换。
 */
import articleTpl from '../artifact/article.html?raw';
import artifactCss from '../artifact/artifact.css?raw';
import artifactProseCss from '../styles/artifact-prose.css?raw';
import artifactJs from '../artifact/artifact.js?raw';
import { renderMarkdown } from './md';
import { readingTime } from '../utils/date';
import { cjkSpacing } from '../utils/typography';
import { isDark } from '../utils/theme';
import {
  renderArticleRailSlots,
  type RailKvItem,
  type RelatedPostSummary,
} from '../utils/article-rail';
import type { ArticleRailConfig, SiteConfig } from '../site.config';

export interface PreviewInput {
  id: string;
  entryNo?: string;
  title: string;
  lead?: string;
  description?: string;
  dateText: string;
  tags?: string[];
  entryBadge?: string;
  kineticCaption?: string;
  bodyMarkdown: string;
  railMode?: string;
  railSpecs?: RailKvItem[];
  railConfig?: Record<string, unknown>;
  globalRail?: ArticleRailConfig;
  siteConfig?: Partial<SiteConfig>;
  relatedPosts?: RelatedPostSummary[];
  totalPostsCount?: number;
  newerPost?: { slug: string; title: string } | null;
  olderPost?: { slug: string; title: string } | null;
  fallbackId?: string;
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function fixImagePaths(html: string): string {
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (_whole, head: string, src: string, tail: string) => {
    if (/^(https?:|data:|blob:)/.test(src)) return `${head}${src}${tail}`;
    const fixed = src
      .replace(/^\.\.\/\.\.\/assets\/posts\//, '/uploads/posts/')
      .replace(/^\.\.\/\.\.\/assets\/photos\//, '/uploads/photos/')
      .replace(/^\/src\/assets\/posts\//, '/uploads/posts/')
      .replace(/^\/src\/assets\/photos\//, '/uploads/photos/')
      .replace(/^assets\/posts\//, '/uploads/posts/')
      .replace(/^assets\/photos\//, '/uploads/photos/');
    return `${head}${fixed}${tail}`;
  });
}

function slugifyHeading(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'section';
}

function attachHeadingIdsAndExtractToc(rawHtml: string): {
  proseHtml: string;
  tocHtml: string;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="prose-root">${rawHtml}</div>`, 'text/html');
  const root = doc.getElementById('prose-root')!;
  const used = new Map<string, number>();
  const headings: Array<{ slug: string; text: string; depth: number }> = [];

  root.querySelectorAll<HTMLElement>('h1, h2, h3').forEach((el) => {
    const text = (el.textContent ?? '').trim();
    if (!text) return;
    const base = slugifyHeading(text);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const slug = count === 1 ? base : `${base}-${count}`;
    el.setAttribute('id', slug);
    const depth = el.tagName === 'H3' ? 3 : 2;
    headings.push({ slug, text, depth });
  });

  const tocHtml = headings.length
    ? `<ul class="toc-list" id="article-toc-list">${headings
        .map(
          (h, i) =>
            `<li><a href="#${esc(h.slug)}"><span class="toc-num">${String(i + 1).padStart(
              2,
              '0'
            )}</span><span>${esc(h.text)}</span></a></li>`
        )
        .join('')}</ul>`
    : `<p class="toc-empty">本文未设置小节标题</p>`;

  return {
    proseHtml: root.innerHTML,
    tocHtml,
  };
}

function deriveLead(markdown: string): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`#>~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

function applySiteToPreviewHtml(html: string, site?: Partial<SiteConfig>): string {
  if (!site) return html;
  let out = html;
  if (site.author) {
    out = out.replace(
      /(<span class="nav-brand-text">)[\s\S]*?(<\/span>)/,
      (_m, a: string, b: string) => `${a}${esc(site.author)}${b}`
    );
  }
  if (site.brandCoord) {
    out = out.replace(
      /(<span class="nav-brand-coord">)[\s\S]*?(<\/span>)/,
      (_m, a: string, b: string) => `${a}${esc(site.brandCoord)}${b}`
    );
  }
  if (site.title) {
    out = out.replace(
      /(<span class="loader-title-kai">)[\s\S]*?(<\/span>)/,
      (_m, a: string, b: string) => `${a}${esc(site.title)}${b}`
    );
  }
  if (Array.isArray(site.nav) && site.nav.length) {
    const navLinks = site.nav
      .map((item, i) => {
        const active = item.href === '/posts/' ? ' aria-current="page"' : '';
        return `          <a class="site-nav-link"${active} href="${esc(item.href)}">
            <span class="nav-idx">${String(i).padStart(2, '0')}</span><span>${esc(item.label)}</span>
          </a>`;
      })
      .join('\n');
    out = out.replace(
      /<nav class="site-nav"[\s\S]*?<\/nav>/,
      `<nav class="site-nav" aria-label="主导航">\n${navLinks}\n        </nav>`
    );
  }
  if (site.footerCopyright) {
    out = out.replace(
      /(<div class="site-foot-inner">\s*<span>)[\s\S]*?(<span class="theme-foot-mark")/,
      (_m, a: string, b: string) => `${a}${esc(site.footerCopyright)} ${b}`
    );
  }
  return out;
}

function buildFullArticlePreviewDoc(input: PreviewInput, theme: 'light' | 'dark'): string {
  const rawBodyHtml = fixImagePaths(renderMarkdown(input.bodyMarkdown));
  const { proseHtml, tocHtml } = attachHeadingIdsAndExtractToc(rawBodyHtml);
  const { chars, minutes } = readingTime(input.bodyMarkdown);

  const displayTitle = cjkSpacing(input.title || '未命名文章');
  const tags = input.tags ?? [];
  const tagText = tags.length ? tags.join(' · ') : '未分类';
  const lead =
    input.lead?.trim() || deriveLead(input.bodyMarkdown) || input.description?.trim() || '暂无导语摘要';
  const dateText = input.dateText || '未设日期';
  const entryNo = input.entryNo || '01';
  const entryBadge = input.entryBadge?.trim()
    ? `ARCHIVE COORDINATE // ENTRY #${entryNo} · ${input.entryBadge.trim()}`
    : `ARCHIVE COORDINATE // ENTRY #${entryNo}`;

  const globalRail = input.globalRail ?? {};
  const kineticCaption = input.kineticCaption?.trim()
    ? esc(input.kineticCaption.trim())
    : esc(globalRail.threeBody?.defaultCaption ?? '3-BODY GRAVITY // CHAOTIC ORBIT');

  const railSlots = renderArticleRailSlots({
    slug: input.id,
    dateText,
    chars,
    minutes,
    tagText,
    railMode: input.railMode,
    railSpecs: input.railSpecs,
    railConfig: input.railConfig,
    globalRail,
    relatedPosts: input.relatedPosts,
    totalPostsCount: input.totalPostsCount,
    isStudioDockPreview: false,
  });

  const pagerCell = (p: { slug: string; title: string } | null | undefined, dir: 'prev' | 'next') => {
    const label = dir === 'prev' ? '&lt;- PREV ENTRY' : 'NEXT ENTRY -&gt;';
    const href = p ? `/posts/${p.slug}/` : '/posts/';
    const text = p ? esc(cjkSpacing(p.title)) : '全部文章';
    return `<a class="article-pager-cell" href="${esc(href)}"><span class="pager-kicker">${label}</span><span class="pager-title">${text}</span></a>`;
  };
  const pagerHtml = `<div class="article-pager-grid">${pagerCell(input.newerPost, 'prev')}${pagerCell(
    input.olderPost,
    'next'
  )}</div>`;

  const slots: Record<string, string> = {
    TOPBAR_TITLE: esc(`/posts/${input.id}/ · ${displayTitle}`),
    ENTRY_NO: esc(entryNo),
    TITLE: esc(displayTitle),
    LEAD: esc(lead),
    DATE: esc(dateText),
    TAGS: esc(tagText),
    WORDS: `约 ${chars.toLocaleString('zh-CN')} 字`,
    READING: `约 ${minutes} 分钟`,
    KICKER: esc(entryBadge),
    KINETIC_CAPTION: kineticCaption,
    TOC: tocHtml,
    RAIL_TOPOLOGY: railSlots.topCardsHtml,
    RAIL_SPEC: railSlots.specAndCustomHtml,
    RAIL_RELATED: railSlots.relatedCardHtml,
    PAGER: pagerHtml,
  };

  let bodyInner = articleTpl;
  // 移除全屏开场加载遮罩，让预览打开即刻呈现完整画面
  bodyInner = bodyInner.replace(/<div class="infinity-loader"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, '');

  for (const [key, value] of Object.entries(slots)) {
    bodyInner = bodyInner.split(`@@${key}@@`).join(value);
  }
  bodyInner = bodyInner.replace('@@PROSE@@', proseHtml);

  if (globalRail.threeBody?.eraBadge) {
    bodyInner = bodyInner.replace(
      /(<span class="threebody-era-badge" id="threebody-era-badge">)[\s\S]*?(<\/span>)/,
      (_m, a: string, b: string) => `${a}${esc(globalRail.threeBody!.eraBadge!)}${b}`
    );
  }
  if (globalRail.threeBody?.fluxReadout) {
    bodyInner = bodyInner.replace(
      /(<span id="threebody-flux-readout">)[\s\S]*?(<\/span>)/,
      (_m, a: string, b: string) => `${a}${esc(globalRail.threeBody!.fluxReadout!)}${b}`
    );
  }

  bodyInner = applySiteToPreviewHtml(bodyInner, input.siteConfig);

  const previewHelperScript = `
    (function(){
      try {
        localStorage.setItem('theme', ${JSON.stringify(theme)});
        document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      } catch (e) {}
      var loader = document.getElementById('infinity-loader');
      if (loader) loader.remove();
      document.addEventListener('click', function(e) {
        var a = e.target && e.target.closest ? e.target.closest('a') : null;
        if (!a) return;
        var href = a.getAttribute('href') || '';
        if (href.startsWith('#')) {
          var targetId = decodeURIComponent(href.slice(1));
          var targetEl = document.getElementById(targetId);
          if (targetEl) {
            e.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        }
        if (a.hasAttribute('data-lightbox')) return;
        // 预览内点击站内链接阻止直接跳离编辑器，改为提示
        if (href.startsWith('/')) {
          e.preventDefault();
        }
      });
    })();
  `;

  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(displayTitle)} · 预览</title>
    <style>${artifactCss}</style>
    <style>${artifactProseCss}</style>
    <style>
      .infinity-loader { display: none !important; }
      .pv-missing {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.75rem;
        border: 1px dashed var(--rule);
        color: var(--muted);
        font-family: var(--mono);
        font-size: 0.78rem;
      }
    </style>
  </head>
  <body class="article" data-page="article" data-scale="ultrawide">
    ${bodyInner}
    <script>${previewHelperScript}<\/script>
    <script>${artifactJs}<\/script>
  </body>
</html>`;
}

function markMissingImages(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('#article-prose-body img').forEach((img) => {
    const showMissing = () => {
      if (!img.parentNode) return;
      const span = img.ownerDocument.createElement('span');
      span.className = 'pv-missing';
      span.textContent = `图片：${(img.getAttribute('src') || '').split('/').pop() ?? ''}（本地未找到该图片，上传或发布后正常显示）`;
      img.replaceWith(span);
    };
    if (img.complete && img.naturalWidth === 0) showMissing();
    else img.addEventListener('error', showMissing, { once: true });
  });
}

export async function openPreview(input: PreviewInput): Promise<void> {
  let previewTheme: 'light' | 'dark' = isDark() ? 'dark' : 'light';
  const { chars, minutes } = readingTime(input.bodyMarkdown);

  const overlay = document.createElement('div');
  overlay.className = 'pv-overlay';
  overlay.innerHTML = `
    <div class="pv-bar">
      <span class="pv-tag">
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="vertical-align:-2px;margin-right:4px;">
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z"/>
          <circle cx="8" cy="8" r="2.1"/>
        </svg>
        1:1 前台实景预览
      </span>
      <span class="pv-note">/posts/${esc(input.id)}/ · ${esc(input.title || '未命名草稿')}（约 ${chars.toLocaleString('zh-CN')} 字 · ${minutes} 分钟）</span>
      <span class="pv-grow"></span>
      <div class="pv-viewport-switch" role="group" aria-label="预览视口宽度">
        <button type="button" class="pv-vp-btn" data-vp="100%" aria-pressed="true">桌面全宽</button>
        <button type="button" class="pv-vp-btn" data-vp="1100px" aria-pressed="false">紧凑桌面</button>
        <button type="button" class="pv-vp-btn" data-vp="820px" aria-pressed="false">平板</button>
        <button type="button" class="pv-vp-btn" data-vp="430px" aria-pressed="false">手机</button>
      </div>
      <button class="pv-theme-btn" type="button" id="pv-toggle-theme">切换昼夜 (${previewTheme === 'dark' ? '夜' : '昼'})</button>
      <button class="pv-close" type="button">关闭预览 (ESC)</button>
    </div>
    <div class="pv-frame"></div>`;

  const frameHost = overlay.querySelector<HTMLElement>('.pv-frame');
  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  overlay.querySelector('.pv-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === frameHost) close();
  });
  document.addEventListener('keydown', onKey);

  const iframe = document.createElement('iframe');
  iframe.className = 'pv-page';
  frameHost?.append(iframe);

  const mountDoc = () => {
    iframe.srcdoc = buildFullArticlePreviewDoc(input, previewTheme);
    iframe.addEventListener(
      'load',
      () => {
        const inner = iframe.contentDocument;
        if (inner) markMissingImages(inner);
      },
      { once: true }
    );
  };

  mountDoc();

  // 视口宽度切换
  overlay.querySelectorAll<HTMLButtonElement>('[data-vp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const vp = btn.dataset.vp ?? '100%';
      iframe.style.maxWidth = vp;
      overlay.querySelectorAll<HTMLButtonElement>('[data-vp]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
    });
  });

  // 昼夜模式实时切换
  const themeBtn = overlay.querySelector<HTMLButtonElement>('#pv-toggle-theme');
  themeBtn?.addEventListener('click', () => {
    previewTheme = previewTheme === 'dark' ? 'light' : 'dark';
    themeBtn.textContent = `切换昼夜 (${previewTheme === 'dark' ? '夜' : '昼'})`;
    const innerWin = iframe.contentWindow as (Window & { document: Document }) | null;
    const innerToggle = innerWin?.document?.getElementById('detail-toggle-theme');
    if (innerToggle) {
      innerToggle.click();
    } else {
      mountDoc();
    }
  });

  document.body.append(overlay);
}

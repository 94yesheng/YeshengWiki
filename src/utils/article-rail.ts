import { isDefaultAudioArtist, isDefaultAudioTitle, parseAudioMetadataFromFilename } from './audio-meta';
/**
 * 文章右侧信息悬浮窗（Article Right Rail）与左侧多级折叠章节目录通用数据结构与同构渲染器。
 *
 * 同时供以下三处调用，确保前台、后台伴读预览、后台全屏实景预览 100% 一致：
 *   1. 前台 SSR 文章页：`src/pages/posts/[...slug].astro`
 *   2. 后台文章全屏预览：`src/studio/preview.ts`
 *   3. 后台编辑器右侧悬浮栏实时预览：`src/studio/views/posts.ts`
 */
import type { ArticleRailConfig, RailCustomCard } from '../site.config';
import { cjkSpacing } from './typography';

export interface RailKvItem {
  label: string;
  value: string;
}

export interface RailLinkItem {
  label: string;
  url: string;
  note?: string;
}

export type RailWidgetType = 'kv' | 'docspec' | 'related' | 'note' | 'links' | 'list' | 'music';

export interface RailWidgetCard {
  id: string;
  enabled?: boolean;
  type: RailWidgetType;
  kicker: string;
  badge: string;
  /** type === 'note' 的文本内容 */
  content?: string;
  /** type === 'kv' 的键值对行 */
  items?: RailKvItem[];
  /** type === 'links' 的参考链接项 */
  links?: RailLinkItem[];
  /** type === 'list' 的要点列表 */
  bullets?: string[];
  /** type === 'music' 的音乐播放模块字段 */
  audioUrl?: string;
  audioTitle?: string;
  audioArtist?: string;
  audioCover?: string;
  autoplay?: boolean;
  loop?: boolean;
}

export interface PostRailConfig {
  /** 是否显示文档基础速查卡（默认 true） */
  showDocSpec?: boolean;
  /** 单篇覆盖文档速查卡的顶栏标题 */
  specKicker?: string;
  /** 单篇覆盖文档速查卡的右侧副标 */
  specBadge?: string;
  /** 单篇覆盖：是否显示发布日期 */
  showPublished?: boolean;
  /** 单篇覆盖：是否显示字数统计 */
  showChars?: boolean;
  /** 单篇覆盖：是否显示阅读时长 */
  showReading?: boolean;
  /** 单篇覆盖：是否显示分类标签 */
  showTags?: boolean;
  /** 是否把单篇附加键值参数 (railSpecs) 独立成一张专属卡片（默认 false = 合并或替换） */
  separateSpecsCard?: boolean;
  /** 独立参数卡标题 */
  customSpecsKicker?: string;
  /** 独立参数卡副标 */
  customSpecsBadge?: string;
  /** 是否展示全局自定义悬浮卡片（默认 true） */
  showGlobalCards?: boolean;
  /** 是否展示底部相关文章推荐卡（默认 true） */
  showRelated?: boolean;
  /** 本文专属自定义悬浮卡片列表 */
  cards?: RailWidgetCard[];
}

export interface RelatedPostSummary {
  slug: string;
  title: string;
  tags: string[];
  indexNo?: number;
}

export interface RenderRailInput {
  slug: string;
  dateText: string;
  chars: number;
  minutes: number;
  tagText: string;
  tags?: string[];
  railMode?: string | null;
  railSpecs?: RailKvItem[] | null;
  railConfig?: Record<string, unknown> | null;
  globalRail?: ArticleRailConfig | null;
  relatedPosts?: RelatedPostSummary[];
  totalPostsCount?: number;
  /** 后台小预览模式下链接不触发整页离开 */
  isStudioDockPreview?: boolean;
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * 过滤危险 URL 协议（javascript: / vbscript: / data:），仅允许 http(s)、mailto、站内相对路径与锚点。
 */
export function safeRailUrl(raw: unknown, fallback = '#'): string {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  if (/^(?:https?:\/\/|mailto:)/i.test(s)) return s;
  if ((s.startsWith('/') && !s.startsWith('//')) || s.startsWith('#')) return s;
  return fallback;
}

export function normalizeMediaAssetUrl(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const rewritten = s
    .replace(/^\.\.\/\.\.\/assets\/posts\//, '/uploads/posts/')
    .replace(/^\.\.\/\.\.\/assets\/photos\//, '/uploads/photos/')
    .replace(/^\.\.\/\.\.\/assets\/audio\//, '/uploads/audio/')
    .replace(/^\/?src\/assets\/posts\//, '/uploads/posts/')
    .replace(/^\/?src\/assets\/photos\//, '/uploads/photos/')
    .replace(/^\/?src\/assets\/audio\//, '/uploads/audio/');
  if (/^https?:\/\//i.test(rewritten) || (rewritten.startsWith('/') && !rewritten.startsWith('//'))) {
    return rewritten;
  }
  return '';
}

/**
 * 构建支持 H2 一级标题 + H3 二级标题（默认折叠）的层级章节坐标导览 HTML。
 */
export function renderHierarchicalTocHtml(
  headings: Array<{ slug: string; text: string; depth: number }>
): string {
  const valid = headings.filter((h) => h.text.trim() && h.depth >= 2 && h.depth <= 3);
  if (!valid.length) {
    return `<p class="toc-empty">本文未设置小节标题</p>`;
  }

  interface TocGroup {
    slug: string;
    text: string;
    num: string;
    children: Array<{ slug: string; text: string; num: string }>;
  }

  const groups: TocGroup[] = [];
  let h2Counter = 0;

  for (const h of valid) {
    if (h.depth === 2 || groups.length === 0) {
      h2Counter += 1;
      groups.push({
        slug: h.slug,
        text: h.text,
        num: String(h2Counter).padStart(2, '0'),
        children: [],
      });
    } else {
      const currentGroup = groups[groups.length - 1]!;
      const subIdx = currentGroup.children.length + 1;
      currentGroup.children.push({
        slug: h.slug,
        text: h.text,
        num: `${currentGroup.num}.${subIdx}`,
      });
    }
  }

  const itemsHtml = groups
    .map((g, gIdx) => {
      const hasSub = g.children.length > 0;
      const activeAttr = gIdx === 0 ? ' data-active="true"' : '';
      if (!hasSub) {
        return `<li class="toc-item toc-item--h2">
          <div class="toc-row">
            <a href="#${esc(g.slug)}" data-toc-link data-toc-level="2"${activeAttr}>
              <span class="toc-num">${g.num}</span>
              <span class="toc-text">${esc(g.text)}</span>
            </a>
          </div>
        </li>`;
      }

      const subItemsHtml = g.children
        .map(
          (sub) => `<li class="toc-subitem">
            <a href="#${esc(sub.slug)}" data-toc-link data-toc-level="3" class="toc-link--h3">
              <span class="toc-num">${sub.num}</span>
              <span class="toc-text">${esc(sub.text)}</span>
            </a>
          </li>`
        )
        .join('');

      return `<li class="toc-item toc-item--h2 toc-item--has-children" data-toc-group data-collapsed="true">
        <div class="toc-row">
          <a href="#${esc(g.slug)}" data-toc-link data-toc-level="2"${activeAttr}>
            <span class="toc-num">${g.num}</span>
            <span class="toc-text">${esc(g.text)}</span>
          </a>
          <button type="button" class="toc-fold-btn" data-toc-toggle aria-expanded="false" title="展开/折叠二级标题 (${g.children.length})">
            <span class="toc-sub-count">${g.children.length}</span>
            <span class="toc-fold-chevron" aria-hidden="true">▸</span>
          </button>
        </div>
        <div class="toc-sublist-wrap">
          <ul class="toc-sublist">${subItemsHtml}</ul>
        </div>
      </li>`;
    })
    .join('');

  return `<ul class="toc-list" id="article-toc-list">${itemsHtml}</ul>`;
}

/**
 * 将数据库/frontmatter 中的 railTopology 对象安全归一化为 PostRailConfig。
 */
export function normalizePostRailConfig(raw: unknown): PostRailConfig {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawCards = Array.isArray(obj.cards) ? obj.cards : [];

  const cards: RailWidgetCard[] = rawCards
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c, idx) => {
      const t = String(c.type ?? 'note');
      const type: RailWidgetType =
        t === 'kv' || t === 'docspec' || t === 'related' || t === 'links' || t === 'list' || t === 'note' || t === 'music' ? t : 'note';
      const items = Array.isArray(c.items)
        ? c.items
            .filter((it): it is Record<string, unknown> => Boolean(it && typeof it === 'object'))
            .map((it) => ({
              label: String(it.label ?? ''),
              value: String(it.value ?? ''),
            }))
        : [];
      const links = Array.isArray(c.links)
        ? c.links
            .filter((lk): lk is Record<string, unknown> => Boolean(lk && typeof lk === 'object'))
            .map((lk) => ({
              label: String(lk.label ?? ''),
              url: String(lk.url ?? ''),
              note: lk.note ? String(lk.note) : '',
            }))
        : [];
      const bullets = Array.isArray(c.bullets)
        ? c.bullets.map((b) => String(b ?? '')).filter(Boolean)
        : [];

      return {
        id: String(c.id ?? `card-${idx + 1}`),
        enabled: c.enabled !== false,
        type,
        kicker: String(
          c.kicker ?? (type === 'music' ? 'AUDIO PLAYER // 伴读音乐盒' : 'INFO CARD // 伴读卡片')
        ),
        badge: String(c.badge ?? (type === 'music' ? 'AUDIO' : 'INFO')),
        content: String(c.content ?? ''),
        items,
        links,
        bullets,
        audioUrl: typeof c.audioUrl === 'string' ? c.audioUrl : '',
        audioTitle: typeof c.audioTitle === 'string' ? c.audioTitle : '',
        audioArtist: typeof c.audioArtist === 'string' ? c.audioArtist : '',
        audioCover: typeof c.audioCover === 'string' ? c.audioCover : '',
        autoplay: Boolean(c.autoplay),
        loop: c.loop !== false,
      };
    });

  return {
    showDocSpec: typeof obj.showDocSpec === 'boolean' ? obj.showDocSpec : true,
    specKicker: typeof obj.specKicker === 'string' ? obj.specKicker : '',
    specBadge: typeof obj.specBadge === 'string' ? obj.specBadge : '',
    showPublished: typeof obj.showPublished === 'boolean' ? obj.showPublished : undefined,
    showChars: typeof obj.showChars === 'boolean' ? obj.showChars : undefined,
    showReading: typeof obj.showReading === 'boolean' ? obj.showReading : undefined,
    showTags: typeof obj.showTags === 'boolean' ? obj.showTags : undefined,
    separateSpecsCard: typeof obj.separateSpecsCard === 'boolean' ? obj.separateSpecsCard : false,
    customSpecsKicker: typeof obj.customSpecsKicker === 'string' ? obj.customSpecsKicker : '',
    customSpecsBadge: typeof obj.customSpecsBadge === 'string' ? obj.customSpecsBadge : '',
    showGlobalCards: typeof obj.showGlobalCards === 'boolean' ? obj.showGlobalCards : true,
    showRelated: typeof obj.showRelated === 'boolean' ? obj.showRelated : true,
    cards,
  };
}

/**
 * 渲染单张通用悬浮窗卡片（支持 kv / note / links / list / music 五种高可用类型）
 */
export function renderWidgetCardHtml(
  card: RailWidgetCard | RailCustomCard,
  isStudioDockPreview = false
): string {
  if (card.enabled === false) return '';
  const kicker = esc(card.kicker || 'INFO CARD // 信息卡');
  const badge = esc(card.badge || 'NOTE');
  const type = card.type || 'note';

  if (type === 'music') {
    const mc = card as RailWidgetCard;
    const audioSrc = normalizeMediaAssetUrl(mc.audioUrl ?? '');
    const parsedFromUrl = parseAudioMetadataFromFilename(mc.audioUrl ?? '');
    const rawTitle = (mc.audioTitle ?? '').trim();
    const rawArtist = (mc.audioArtist ?? '').trim();
    const titleIsDefault = isDefaultAudioTitle(rawTitle);
    const artistIsDefault = isDefaultAudioArtist(rawArtist);
    const trackTitle =
      (!titleIsDefault ? rawTitle : parsedFromUrl.title) || rawTitle || '未命名伴读曲目';
    const trackArtist =
      (!artistIsDefault ? rawArtist : parsedFromUrl.artist) || rawArtist || 'ACOUSTIC STREAM // 伴读声轨';
    const coverSrc = normalizeMediaAssetUrl(mc.audioCover ?? '');
    const loop = mc.loop !== false;
    const autoplay = Boolean(mc.autoplay) && !isStudioDockPreview;

    return `<div class="rail-blueprint-card rail-music-card" data-rail-music-player data-playing="false" data-loop="${loop ? 'true' : 'false'}" data-title-is-default="${titleIsDefault ? 'true' : 'false'}" data-artist-is-default="${artistIsDefault ? 'true' : 'false'}">
      <div class="rail-card-kicker">
        <span>${kicker}</span>
        <span class="rail-music-status-badge" data-music-badge>${badge}</span>
      </div>
      <div class="rail-music-stage">
        <div class="rail-music-disc-wrap" data-music-disc>
          ${
            coverSrc
              ? `<img class="rail-music-cover-img" src="${esc(coverSrc)}" alt="${esc(trackTitle)}" loading="lazy" />`
              : `<svg class="rail-music-disc-svg" viewBox="0 0 64 64" aria-hidden="true">
                  <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.45"/>
                  <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 3" stroke-opacity="0.35"/>
                  <circle cx="32" cy="32" r="17" fill="none" stroke="currentColor" stroke-width="0.75" stroke-opacity="0.26"/>
                  <path d="M39.6 25.5A8.5 8.5 0 1 1 38 38L26 26A8.5 8.5 0 1 0 26 38L29.2 34.8M34.8 29.2L36.8 27.2" fill="none" stroke="var(--accent)" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M17.8 32H22.2M20 29.8V34.2M41.8 32H46.2" fill="none" stroke="var(--accent)" stroke-width="1.45" stroke-linecap="round"/>
                  <circle cx="32" cy="32" r="3.6" fill="var(--paper)" stroke="var(--accent)" stroke-width="1.2"/>
                  <circle cx="32" cy="32" r="1.3" fill="var(--accent)"/>
                </svg>`
          }
          <span class="rail-music-center-dot" aria-hidden="true"></span>
        </div>
        <div class="rail-music-info">
          <div class="rail-music-title-row">
            <strong class="rail-music-title" data-music-title-el title="${esc(trackTitle)}">${esc(trackTitle)}</strong>
            <span class="rail-music-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          </div>
          <div class="rail-music-artist" data-music-artist-el title="${esc(trackArtist)}">${esc(trackArtist)}</div>
          <div class="rail-music-time-row">
            <span data-music-cur>00:00</span>
            <span class="rail-music-sep">/</span>
            <span data-music-dur>00:00</span>
          </div>
        </div>
      </div>
      ${
        audioSrc
          ? `<div class="rail-music-controls">
              <button type="button" class="rail-music-play-btn" data-music-toggle aria-label="播放或暂停音乐" title="播放 / 暂停">
                <svg class="icon-play" viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true"><polygon points="6,4 16,10 6,16"/></svg>
                <svg class="icon-pause" viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12"/><rect x="11.5" y="4" width="3.5" height="12"/></svg>
              </button>
              <div class="rail-music-bar-wrap">
                <input type="range" class="rail-music-seek" data-music-seek min="0" max="100" step="0.1" value="0" aria-label="调整播放进度" />
                <div class="rail-music-bar-track">
                  <div class="rail-music-bar-fill" data-music-fill style="width:0%;"></div>
                </div>
              </div>
              <button type="button" class="rail-music-aux-btn" data-music-loop aria-pressed="${loop ? 'true' : 'false'}" title="循环播放">
                <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3l3 3-3 3"/><path d="M3 10V8a2 2 0 0 1 2-2h12"/><path d="M6 17l-3-3 3-3"/><path d="M17 10v2a2 2 0 0 1-2 2H3"/></svg>
              </button>
              <button type="button" class="rail-music-aux-btn" data-music-mute aria-pressed="false" title="静音切换">
                <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="9,5 5,8 2,8 2,12 5,12 9,15" fill="currentColor"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5"/><path d="M15.5 5a7 7 0 0 1 0 10"/></svg>
              </button>
            </div>
            <audio class="rail-music-audio" data-music-audio preload="metadata" src="${esc(audioSrc)}"${loop ? ' loop' : ''}${autoplay ? ' autoplay' : ''}></audio>`
          : `<div class="rail-music-empty-hint">尚未选择音频文件 · 可在后台从媒体库选择或本地上传音频</div>`
      }
    </div>`;
  }

  if (type === 'kv' || type === 'docspec') {
    const items = Array.isArray(card.items) ? card.items.filter((r) => r.label || r.value) : [];
    if (!items.length) return '';
    return `<div class="rail-blueprint-card">
      <div class="rail-card-kicker"><span>${kicker}</span><span>${badge}</span></div>
      <ul class="rail-kv-list">
        ${items.map((it) => `<li><span>${esc(it.label)}</span><strong>${esc(it.value)}</strong></li>`).join('')}
      </ul>
    </div>`;
  }

  if (type === 'links') {
    const links = Array.isArray((card as RailWidgetCard).links)
      ? (card as RailWidgetCard).links!.filter((l) => l.label || l.url)
      : [];
    if (!links.length) return '';
    return `<div class="rail-blueprint-card">
      <div class="rail-card-kicker"><span>${kicker}</span><span>${badge}</span></div>
      <ul class="rail-related-list">
        ${links
          .map((lk, idx) => {
            const url = safeRailUrl(lk.url, '#');
            const external = /^https?:\/\//i.test(url);
            const sub = lk.note?.trim() || url.replace(/^https?:\/\//i, '');
            if (isStudioDockPreview) {
              return `<li>
                <div class="rail-rel-mock rail-rel-link">
                  <span class="r-idx">LINK #${String(idx + 1).padStart(2, '0')} // ${esc(sub)}</span>
                  <span class="r-tit">${esc(lk.label || url)} ↗</span>
                </div>
              </li>`;
            }
            return `<li>
              <a class="rail-rel-link" href="${esc(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>
                <span class="r-idx">LINK #${String(idx + 1).padStart(2, '0')} // ${esc(sub)}</span>
                <span class="r-tit">${esc(lk.label || url)}</span>
              </a>
            </li>`;
          })
          .join('')}
      </ul>
    </div>`;
  }

  if (type === 'list') {
    const bullets = Array.isArray((card as RailWidgetCard).bullets)
      ? (card as RailWidgetCard).bullets!.filter((b) => b.trim())
      : (card.content ?? '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
    if (!bullets.length) return '';
    return `<div class="rail-blueprint-card">
      <div class="rail-card-kicker"><span>${kicker}</span><span>${badge}</span></div>
      <ul class="rail-kv-list rail-checklist">
        ${bullets
          .map(
            (b, idx) =>
              `<li><span class="rail-check-num">${String(idx + 1).padStart(2, '0')}</span><strong style="text-align:left;flex:1;">${esc(b)}</strong></li>`
          )
          .join('')}
      </ul>
    </div>`;
  }

  const paragraphs = String(card.content ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!paragraphs.length) return '';

  return `<div class="rail-blueprint-card">
    <div class="rail-card-kicker"><span>${kicker}</span><span>${badge}</span></div>
    <div class="rail-note-body">
      ${paragraphs
        .map(
          (p) =>
            `<p style="margin:0 0 0.35rem; font-size:1.125rem; line-height:1.68; color:var(--muted);">${esc(p)}</p>`
        )
        .join('')}
    </div>
  </div>`;
}

/**
 * 生成文章右侧悬浮栏各插槽 HTML（与 article.html 的占位符和后台预览完全对齐）
 */
export function renderArticleRailSlots(input: RenderRailInput): {
  topCardsHtml: string;
  specAndCustomHtml: string;
  relatedCardHtml: string;
  relatedListHtml: string;
  relatedKicker: string;
  relatedBadge: string;
  showRelated: boolean;
} {
  const mode = input.railMode || 'follow';
  const isCustomMode = mode === 'custom' || mode === 'minimal';
  const isMinimal = mode === 'minimal';
  const postCfg = normalizePostRailConfig(input.railConfig);
  const hasExplicitCards = Array.isArray((input.railConfig as Record<string, unknown> | undefined)?.cards);
  const globalRail = input.globalRail ?? {};
  const docSpecCfg = globalRail.docSpec ?? {};
  const postSpecs = (input.railSpecs ?? []).filter((r) => r.label.trim() || r.value.trim());

  const showDocSpec = isCustomMode
    ? postCfg.showDocSpec !== false
    : docSpecCfg.enabled !== false;

  const showPub =
    postCfg.showPublished !== undefined ? postCfg.showPublished : docSpecCfg.showPublished !== false;
  const showChars =
    postCfg.showChars !== undefined ? postCfg.showChars : docSpecCfg.showChars !== false;
  const showReading =
    postCfg.showReading !== undefined ? postCfg.showReading : docSpecCfg.showReading !== false;
  const showTags =
    postCfg.showTags !== undefined ? postCfg.showTags : docSpecCfg.showTags !== false;

  const autoRows: RailKvItem[] = [];
  if (showPub) autoRows.push({ label: 'PUBLISHED', value: input.dateText });
  if (showChars) autoRows.push({ label: 'CHARS', value: `${input.chars.toLocaleString('zh-CN')} 字` });
  if (showReading) autoRows.push({ label: 'READING', value: `约 ${input.minutes} 分钟` });
  if (showTags) autoRows.push({ label: 'TAGS', value: input.tagText });

  if (!isMinimal && Array.isArray(docSpecCfg.customRows)) {
    for (const r of docSpecCfg.customRows) {
      if (r.label && r.value) autoRows.push({ label: r.label, value: r.value });
    }
  }

  const specBlocks: string[] = [];

  if (postSpecs.length > 0 && postCfg.separateSpecsCard) {
    if (showDocSpec && autoRows.length > 0) {
      const k = postCfg.specKicker?.trim() || docSpecCfg.kicker || 'DOC SPEC // 文档速查卡';
      const b = postCfg.specBadge?.trim() || docSpecCfg.badge || 'BASELINE';
      specBlocks.push(`<div class="rail-blueprint-card" id="rail-spec-card">
        <div class="rail-card-kicker"><span>${esc(k)}</span><span>${esc(b)}</span></div>
        <ul class="rail-kv-list" id="rail-spec-list">
          ${autoRows.map((r) => `<li><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></li>`).join('')}
        </ul>
      </div>`);
    }
    const ck = postCfg.customSpecsKicker?.trim() || 'SPEC SHEET // 本文参数速查';
    const cb = postCfg.customSpecsBadge?.trim() || 'CUSTOM';
    specBlocks.push(`<div class="rail-blueprint-card">
      <div class="rail-card-kicker"><span>${esc(ck)}</span><span>${esc(cb)}</span></div>
      <ul class="rail-kv-list">
        ${postSpecs.map((r) => `<li><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></li>`).join('')}
      </ul>
    </div>`);
  } else {
    const mergedRows: RailKvItem[] = [
      ...(showDocSpec ? autoRows : []),
      ...postSpecs,
    ];
    if (mergedRows.length > 0) {
      const defaultKicker =
        postSpecs.length > 0 && !showDocSpec
          ? 'SPEC SHEET // 专属速查卡'
          : docSpecCfg.kicker || 'DOC SPEC // 文档速查卡';
      const k = postCfg.specKicker?.trim() || defaultKicker;
      const b = postCfg.specBadge?.trim() || docSpecCfg.badge || (postSpecs.length > 0 ? 'CUSTOM' : 'BASELINE');
      specBlocks.push(`<div class="rail-blueprint-card" id="rail-spec-card">
        <div class="rail-card-kicker"><span>${esc(k)}</span><span>${esc(b)}</span></div>
        <ul class="rail-kv-list" id="rail-spec-list">
          ${mergedRows.map((r) => `<li><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></li>`).join('')}
        </ul>
      </div>`);
    }
  }

  const perPostCards = (postCfg.cards ?? []).filter((c) => c.enabled !== false);
  const hasDocSpecCard = perPostCards.some((c) => c.type === 'docspec');
  const perPostRelatedCards = perPostCards.filter((c) => c.type === 'related');

  const allowGlobalCards = mode === 'follow';
  const globalCardsHtml = allowGlobalCards
    ? (globalRail.customCards ?? [])
        .map((c) => renderWidgetCardHtml(c, input.isStudioDockPreview))
        .filter(Boolean)
        .join('\n')
    : '';

  const relCfg = globalRail.related ?? {};
  const showRelated = isMinimal
    ? false
    : isCustomMode
      ? postCfg.showRelated !== false && relCfg.enabled !== false
      : relCfg.enabled !== false;

  const maxRelated = Math.max(1, Math.min(8, Number(relCfg.maxCount ?? 4)));
  const currentTags = new Set(
    (input.tags && input.tags.length
      ? input.tags
      : input.tagText && input.tagText !== '未分类'
        ? input.tagText.split(' · ')
        : []
    )
      .map((t) => t.trim())
      .filter(Boolean)
  );
  const candidates = (input.relatedPosts ?? []).filter((p) => p.slug !== input.slug);
  const related = (
    currentTags.size > 0
      ? [...candidates].sort((a, b) => {
          const scoreA = (a.tags ?? []).reduce((n, t) => n + (currentTags.has(t) ? 1 : 0), 0);
          const scoreB = (b.tags ?? []).reduce((n, t) => n + (currentTags.has(t) ? 1 : 0), 0);
          return scoreB - scoreA;
        })
      : candidates
  ).slice(0, maxRelated);
  const relatedKicker = relCfg.kicker || 'ARCHIVE // 同系列文章切换';
  const totalCount = input.totalPostsCount ?? (related.length + 1);
  const relatedBadge = relCfg.badge || `${totalCount} ENTRIES`;

  const relatedListHtml = related.length
    ? `<ul class="rail-related-list">${related
        .map((p, idx) => {
          const n = String(p.indexNo ?? idx + 1).padStart(2, '0');
          const cat = p.tags[0] ?? 'ARCHIVE';
          if (input.isStudioDockPreview) {
            return `<li>
              <div class="rail-rel-mock rail-rel-link">
                <span class="r-idx">ENTRY #${n} // ${esc(cat)}</span>
                <span class="r-tit">${esc(cjkSpacing(p.title))}</span>
              </div>
            </li>`;
          }
          return `<li><a class="rail-rel-link" href="/posts/${esc(p.slug)}/"><span class="r-idx">ENTRY #${n} // ${esc(
            cat
          )}</span><span class="r-tit">${esc(cjkSpacing(p.title))}</span></a></li>`;
        })
        .join('')}</ul>`
    : `<p class="st-hint" style="margin:0;">暂无其它归档文章</p>`;

  const relatedCardHtml =
    showRelated && perPostRelatedCards.length === 0 && (!isCustomMode || !hasExplicitCards)
    ? `<div class="rail-blueprint-card">
        <div class="rail-card-kicker">
          <span>${esc(relatedKicker)}</span>
          <span>${esc(relatedBadge)}</span>
        </div>
        ${relatedListHtml}
      </div>`
    : '';

  if (isCustomMode && (hasDocSpecCard || hasExplicitCards)) specBlocks.length = 0;

  const specCardFromConfig = (card: RailWidgetCard): string => {
    const rows = [
      ...(showDocSpec ? autoRows : []),
      ...(Array.isArray(card.items) ? card.items.filter((r) => r.label || r.value) : []),
    ];
    if (!rows.length) return '';
    const k = card.kicker?.trim() || postCfg.specKicker?.trim() || docSpecCfg.kicker || 'DOC SPEC // 文档速查卡';
    const b = card.badge?.trim() || postCfg.specBadge?.trim() || docSpecCfg.badge || 'BASELINE';
    return `<div class="rail-blueprint-card" id="rail-spec-card">
      <div class="rail-card-kicker"><span>${esc(k)}</span><span>${esc(b)}</span></div>
      <ul class="rail-kv-list" id="rail-spec-list">
        ${rows.map((r) => `<li><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></li>`).join('')}
      </ul>
    </div>`;
  };

  const postCustomCardsHtml = perPostCards
    .map((c) => {
      if (c.type === 'docspec') return specCardFromConfig(c as unknown as RailWidgetCard);
      if (c.type === 'related') {
        return `<div class="rail-blueprint-card">
          <div class="rail-card-kicker"><span>${esc(c.kicker || relatedKicker)}</span><span>${esc(c.badge || relatedBadge)}</span></div>
          ${relatedListHtml}
        </div>`;
      }
      return renderWidgetCardHtml(c, input.isStudioDockPreview);
    })
    .filter(Boolean)
    .join('\n');

  return {
    topCardsHtml: postCustomCardsHtml,
    specAndCustomHtml: [...specBlocks, globalCardsHtml].filter(Boolean).join('\n'),
    relatedCardHtml,
    relatedListHtml,
    relatedKicker,
    relatedBadge,
    showRelated,
  };
}

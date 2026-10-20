/**
 * 文章右侧信息悬浮窗（Article Right Rail）通用数据结构与同构渲染器。
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

export type RailWidgetType = 'kv' | 'note' | 'links' | 'list';

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
        t === 'kv' || t === 'links' || t === 'list' || t === 'note' ? t : 'note';
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
        kicker: String(c.kicker ?? 'INFO CARD // 伴读卡片'),
        badge: String(c.badge ?? 'INFO'),
        content: String(c.content ?? ''),
        items,
        links,
        bullets,
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
 * 渲染单张通用悬浮窗卡片（支持 kv / note / links / list 四种高可用类型）
 */
export function renderWidgetCardHtml(
  card: RailWidgetCard | RailCustomCard,
  isStudioDockPreview = false
): string {
  if (card.enabled === false) return '';
  const kicker = esc(card.kicker || 'INFO CARD // 信息卡');
  const badge = esc(card.badge || 'NOTE');
  const type = card.type || 'note';

  if (type === 'kv') {
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
            const url = lk.url?.trim() || '#';
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

  const postCustomCardsHtml = (postCfg.cards ?? [])
    .map((c) => renderWidgetCardHtml(c, input.isStudioDockPreview))
    .filter(Boolean)
    .join('\n');

  const allowGlobalCards = isMinimal ? false : isCustomMode ? postCfg.showGlobalCards !== false : true;
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
  const related = (input.relatedPosts ?? []).filter((p) => p.slug !== input.slug).slice(0, maxRelated);
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

  const relatedCardHtml = showRelated
    ? `<div class="rail-blueprint-card">
        <div class="rail-card-kicker">
          <span>${esc(relatedKicker)}</span>
          <span>${esc(relatedBadge)}</span>
        </div>
        ${relatedListHtml}
      </div>`
    : '';

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

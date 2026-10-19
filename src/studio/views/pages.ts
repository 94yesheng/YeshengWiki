/**
 * 「页面」视图 —— 集中维护主页 / 文章 / 相册 / 项目 / 友链五个子页的文案与结构化内容。
 *
 * 数据来源：`GET /api/pages` → `{ pages, values, defaults }`。
 * 这里**不 import `src/server/**`**（会把 better-sqlite3 打进前端包），
 * schema 完全由接口下发；视图自己缓存，不塞进 `state`。
 *
 * 每个子页只渲染一张「XX 页面设置」卡片：`PAGE_SECTIONS` 声明小节顺序与字段归属，
 * 文案字段与结构化面板（主页画布 / 文章右栏 / 关于我档案）在同一个 `st-section-box`
 * 版式里混排，不再分成上下两块。
 *
 * 保存语义：
 * - 没有页内保存按钮：顶栏的「保存」会调用这里导出的 `savePagesValues()`；
 * - 只提交字符串；输入框清空视为「使用默认值」，提交时回落到 `defaults[key]`；
 * - 服务端 sanitize 会丢掉与默认值相同的项，数据库只存真正改过的值；
 * - 主页引擎 / 文章右栏 / 关于我三个结构化面板写在 `state.draft.site` 里，
 *   由外壳的同一次保存调用 `saveSite()` 一并提交。
 */
import { $, esc, toast } from '../ui';
import { markDirty, rerender, state } from '../state';
import {
  renderArticleRailPanel,
  renderAuthorDossierPanel,
  renderHomeEnginePanel,
  siteDraft,
} from './site';

type PageValues = Record<string, string>;
type PageFieldType = 'text' | 'textarea' | 'lines';

interface PageField {
  key: string;
  label: string;
  default: string;
  /** text=单行；textarea=多行；lines=多行且按行拆成数组 */
  type?: PageFieldType;
  hint?: string;
}

interface PageDef {
  key: string;
  label: string;
  desc: string;
  fields: PageField[];
}

interface PagesResponse {
  pages?: PageDef[];
  values?: PageValues;
  defaults?: PageValues;
  error?: string;
}

/** 左栏固定顺序。data-id 同时就是 `state.selected` 的取值。 */
export const PAGE_GROUPS = [
  { key: 'home', label: '主页', sub: '首屏 · 加载动画 · 流形参数' },
  { key: 'posts', label: '文章', sub: '归档页 · 主页文章屏 · 右栏' },
  { key: 'photos', label: '相册', sub: '照片页 · 主页相册屏' },
  { key: 'programs', label: '项目', sub: '项目页 · 主页程序屏' },
  { key: 'links', label: '友链', sub: '友链页 · 架构志 · 关于我' },
] as const;

type PageKey = (typeof PAGE_GROUPS)[number]['key'];
type StructuredPanelKey = 'home' | 'rail' | 'dossier';

interface SectionDef {
  /** 稳定标识，仅用于布局核对与调试，不渲染 */
  key: string;
  title: string;
  tag: string;
  desc?: string;
  /** 字段 key，按渲染顺序排列；必须与 schema 里当前分组的字段集合一致 */
  fields: string[];
  /** 结构化面板插入点 */
  structured?: StructuredPanelKey;
}

/**
 * 五个子页的小节排布。这里同时决定卡片内小节编号（01…0N）与字段归属；
 * 字段的 label / type / hint / default 一律从 `/api/pages` 下发的 schema 读取。
 */
const PAGE_SECTIONS: Record<PageKey, SectionDef[]> = {
  home: [
    {
      key: 'hero',
      title: '首屏文案与坐标',
      tag: 'HERO',
      desc: '首屏左上角坐标、顶栏标签、坐标说明与自述段落；自述段落一行一段。',
      fields: [
        'home.hero.originBadge',
        'home.hero.topbarTag',
        'home.hero.coordText',
        'home.hero.intro',
      ],
    },
    {
      key: 'loader-index',
      title: '加载动画与导航角标',
      tag: 'LOADER / INDEX',
      desc: '开屏加载动画的状态文字，以及首屏四象限导航的角标文案。',
      fields: [
        'home.loader.status',
        'home.hero.metaPosts',
        'home.hero.metaPhotos',
        'home.hero.metaPrograms',
        'home.hero.metaLinks',
      ],
    },
    {
      key: 'manifold',
      title: '流形画布参数',
      tag: 'MANIFOLD · 结构化',
      desc: '昼夜主题、粒子数量、演化速率与四象限导览卡片；与文案在同一次保存中提交。',
      fields: [],
      structured: 'home',
    },
  ],
  posts: [
    {
      key: 'archive',
      title: '页面文案',
      tag: 'ARCHIVE',
      desc: '归档页标题、SEO 描述、标签与文章卡片上的按钮 / 空态文案。',
      fields: [
        'posts.title',
        'posts.description',
        'posts.allTag',
        'posts.uncategorized',
        'posts.readLabel',
        'posts.empty',
      ],
    },
    {
      key: 'timeline',
      title: '时间轴与统计',
      tag: 'TIMELINE',
      desc: '时间轴两端的坐标说明与右栏统计文案，可含 {count} / {chars} 占位符。',
      fields: [
        'posts.origin',
        'posts.now',
        'posts.statTotal',
        'posts.statVisible',
        'posts.statWords',
        'posts.unit',
      ],
    },
    {
      key: 'home-posts',
      title: '主页文章屏',
      tag: 'HOME SCREEN 02',
      desc: '主页文章屏顶栏的一句说明。',
      fields: ['home.posts.note'],
    },
    {
      key: 'rail',
      title: '文章右栏',
      tag: 'RAIL · 结构化',
      desc: '右侧伴读栏的模块开关、模板文案与自定义卡片；与文案在同一次保存中提交。',
      fields: [],
      structured: 'rail',
    },
  ],
  photos: [
    {
      key: 'optics',
      title: '页面文案',
      tag: 'OPTICS',
      desc: '照片页标题、SEO 描述、筛选与空态文案。',
      fields: ['photos.title', 'photos.description', 'photos.all', 'photos.empty'],
    },
    {
      key: 'groups',
      title: '分组与滚动提示',
      tag: 'GROUPS',
      desc: '照片分组的名称与向下滚动提示。',
      fields: ['photos.latest', 'photos.earlier', 'photos.scrollLabel'],
    },
    {
      key: 'home-photos',
      title: '主页相册屏',
      tag: 'HOME SCREEN 03',
      desc: '主页相册屏顶栏的一句说明。',
      fields: ['home.photos.note'],
    },
  ],
  programs: [
    {
      key: 'programs',
      title: '页面文案',
      tag: 'PROGRAMS',
      desc: '项目页标题、导语、SEO 描述与模块卡片文案。',
      fields: [
        'programs.title',
        'programs.description',
        'programs.note',
        'programs.viewCta',
        'programs.statusFallback',
        'programs.hostCta',
      ],
    },
    {
      key: 'empty',
      title: '空态',
      tag: 'EMPTY STATE',
      desc: '没有程序数据时展示的标题、说明与按钮。',
      fields: ['programs.emptyTitle', 'programs.emptyText', 'programs.emptyCta'],
    },
    {
      key: 'home-programs',
      title: '主页程序屏',
      tag: 'HOME SCREEN 04',
      desc: '主页程序屏顶栏的一句说明。',
      fields: ['home.programs.note'],
    },
  ],
  links: [
    {
      key: 'peers-copy',
      title: '页面文案',
      tag: 'PEERS',
      desc: '友链页标题、导语、SEO 描述与空态文案。',
      fields: ['links.title', 'links.description', 'links.note', 'links.empty'],
    },
    {
      key: 'directory',
      title: '友链名录',
      tag: 'DIRECTORY',
      desc: '友链名录的小节标题、收录数量与空态说明。',
      fields: ['links.peersTitle', 'links.peersCount', 'links.peersEmpty'],
    },
    {
      key: 'site-card',
      title: '本站名片',
      tag: 'SITE CARD',
      desc: '本站友链名片的标题、导言、规格标签与复制提示。',
      fields: [
        'links.cardTitle',
        'links.cardIntro',
        'links.specName',
        'links.specTagline',
        'links.specUrl',
        'links.specRss',
        'links.copyBtn',
        'links.copyDone',
      ],
    },
    {
      key: 'colophon-title',
      title: '架构志标题',
      tag: 'COLOPHON',
      desc: '「站点说明（Site Colophon）」的小节标题与说明。',
      fields: ['links.colophonTitle', 'links.colophonNote'],
    },
    {
      key: 'home-links',
      title: '主页友链屏',
      tag: 'HOME SCREEN 05',
      desc: '主页友链屏顶栏的一句说明。',
      fields: ['home.links.note'],
    },
    {
      key: 'dossier',
      title: '关于我与架构志',
      tag: 'DOSSIER · 结构化',
      desc: '关于「我」档案卡与架构志条目；与文案在同一次保存中提交。',
      fields: [],
      structured: 'dossier',
    },
  ],
};

/** 卡片顶栏的英文标题；编号由 PAGE_GROUPS 顺序推出来。 */
const PAGE_EN_TITLE: Record<PageKey, string> = {
  home: 'HOME PAGE SETTINGS',
  posts: 'POSTS PAGE SETTINGS',
  photos: 'PHOTOS PAGE SETTINGS',
  programs: 'PROGRAMS PAGE SETTINGS',
  links: 'LINKS PAGE SETTINGS',
};

type PanelRenderer = (host: HTMLElement, data: Record<string, unknown>) => void;

const STRUCTURED_PANELS: Record<StructuredPanelKey, PanelRenderer> = {
  home: renderHomeEnginePanel,
  rail: renderArticleRailPanel,
  dossier: renderAuthorDossierPanel,
};

/**
 * 视图级缓存。刻意不放进 `state`：
 * 这几个变量只属于「页面」板块，和 loadAll 的草稿/集合状态是两套生命周期。
 * 切分组不清空 `values`，所以五个子页的未保存改动都会保留。
 */
let schema: PageDef[] | null = null;
let values: PageValues = {};
let defaults: PageValues = {};

/** 最近一次读取 / 保存后的值，用来判断「有没有未保存改动」 */
let saved: PageValues = {};

let loading = false;
let loadError: string | null = null;

/* --------------------------------------------------------------------------
   入口
   -------------------------------------------------------------------------- */

export function renderPagesView(): void {
  const edit = $('#st-edit');
  if (!edit) return;

  // 首次进入（或上次读取失败后重新进入）才拉接口；之后一直用模块级缓存。
  if (!schema && !loading && !loadError) void loadPages();

  if (!schema) {
    renderPlaceholder(edit);
    return;
  }

  const page = currentPage();
  if (!page) return;
  if (state.selected !== page.key) state.selected = page.key;

  edit.innerHTML = viewHtml(page);
  wireEvents(edit, page);

  // 结构化面板只渲染小节内容，挂到对应 st-section-box 里的容器上。
  edit.querySelectorAll<HTMLElement>('[data-pages-panel]').forEach((host) => {
    const key = host.dataset.pagesPanel as StructuredPanelKey | undefined;
    const panel = key ? STRUCTURED_PANELS[key] : undefined;
    if (panel) panel(host, siteDraft());
  });

  renderPreview(page);
}

function currentPage(): PageDef | null {
  if (!schema || schema.length === 0) return null;
  const wanted = state.selected ?? 'home';
  return schema.find((page) => page.key === wanted) ?? schema[0] ?? null;
}

function sectionsFor(page: PageDef): SectionDef[] {
  return PAGE_SECTIONS[page.key as PageKey] ?? [];
}

/* --------------------------------------------------------------------------
   读取
   -------------------------------------------------------------------------- */

async function loadPages(): Promise<void> {
  if (loading) return;
  loading = true;
  loadError = null;

  try {
    const res = await fetch('/api/pages', {
      headers: { 'X-CSRF-Token': state.csrf ?? '' },
    });
    const data = (await res.json().catch(() => ({}))) as PagesResponse;
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

    const pages = Array.isArray(data.pages)
      ? data.pages.filter(
          (page) => !!page && typeof page.key === 'string' && typeof page.label === 'string' && Array.isArray(page.fields)
        )
      : [];
    if (pages.length === 0) throw new Error('接口没有返回任何页面配置');

    schema = pages;
    defaults = readDefaults(pages, data.defaults);
    values = readValues(pages, data.values, defaults);
    saved = { ...values };
    loadError = null;

    if (state.collection === 'pages' && !pages.some((page) => page.key === state.selected)) {
      state.selected = pages.some((page) => page.key === 'home') ? 'home' : (pages[0]?.key ?? 'home');
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : '网络错误';
    toast(`读取页面文案失败：${loadError}`, true);
  } finally {
    loading = false;
    rerender();
  }
}

/** 全局保存成功后重新拉一次 `/api/pages`，让前端缓存与数据库重新对齐。 */
export async function pagesReload(): Promise<void> {
  loadError = null;
  await loadPages();
}

/** 五个子页的文案是否有未保存改动（供外壳的离开确认与全局保存判断）。 */
export function pagesDirty(): boolean {
  return hasChanges();
}

/** 放弃所有未保存的文案改动（离开板块 / 刷新 / 锁定时由外壳调用）。 */
export function pagesDiscard(): void {
  if (!hasChanges()) return;
  values = { ...saved };
}

function readDefaults(pages: PageDef[], raw: PageValues | undefined): PageValues {
  const out: PageValues = {};
  for (const page of pages) {
    for (const field of page.fields) {
      const candidate = raw && typeof raw === 'object' ? raw[field.key] : undefined;
      out[field.key] = typeof candidate === 'string' ? candidate : field.default;
    }
  }
  return out;
}

function readValues(pages: PageDef[], raw: PageValues | undefined, fallback: PageValues): PageValues {
  const out: PageValues = { ...fallback };
  for (const page of pages) {
    for (const field of page.fields) {
      const candidate = raw && typeof raw === 'object' ? raw[field.key] : undefined;
      // 空字符串按「用默认值」处理，和输入框清空的语义保持一致。
      if (typeof candidate === 'string' && candidate !== '') out[field.key] = candidate;
    }
  }
  return out;
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */

function viewHtml(page: PageDef): string {
  const key = page.key as PageKey;
  const pageIndex = PAGE_GROUPS.findIndex((group) => group.key === key);
  const badge = `PAGE // ${String((pageIndex >= 0 ? pageIndex : 0) + 1).padStart(2, '0')}`;
  const enTitle = PAGE_EN_TITLE[key] ?? 'PAGE SETTINGS';
  const sections = sectionsFor(page);
  const dirty = hasChanges();
  const changed = changedKeys().length;

  return `
    <div class="st-pages-view">
      <div class="st-q-card">
        <div class="q-topbar">
          <div class="q-topbar-cell">
            <span class="q-sec-badge">${esc(badge)}</span>
            <span>${esc(enTitle)} // ${esc(page.label)}页面设置</span>
          </div>
          <div class="q-topbar-cell q-topbar-cell--right">
            <span class="st-pages-dirty${dirty ? ' is-dirty' : ''}" id="st-pages-dirty">${
              dirty ? `${changed} 项未保存` : '全部已保存'
            }</span>
            <span class="telemetry-accent">/studio/ → 页面</span>
          </div>
        </div>

        <div class="st-head">
          <div class="st-kicker">PAGE COPY &amp; STRUCTURE // 文案与结构化内容统一维护</div>
          <h2>${esc(page.label)}页面设置</h2>
          <p class="st-hint">修改后点顶栏「保存」一次性提交；文案写 site_settings.pages，结构化内容写站点设置。</p>
        </div>

        ${sections.map((section, index) => sectionHtml(section, index)).join('')}
      </div>
    </div>`;
}

function sectionHtml(section: SectionDef, index: number): string {
  const number = String(index + 1).padStart(2, '0');
  const fields = section.fields
    .map((key) => fieldFor(key))
    .filter((field): field is PageField => Boolean(field));

  return `
    <div class="st-section-box">
      <div class="st-section-head">
        <span>${number} // ${esc(section.title)}</span>
        <span class="st-sec-tag">${esc(section.tag)}</span>
      </div>
      ${section.desc ? `<p class="st-hint st-pages-section-desc">${esc(section.desc)}</p>` : ''}
      ${fields.length ? `<div class="st-grid-3">${fields.map(fieldHtml).join('')}</div>` : ''}
      ${section.structured ? `<div class="st-pages-panel" data-pages-panel="${section.structured}"></div>` : ''}
    </div>`;
}

function fieldHtml(field: PageField): string {
  const fallback = defaultFor(field);
  const value = values[field.key] ?? fallback;
  const multiline = field.type === 'textarea' || field.type === 'lines';
  const linesFlag = field.type === 'lines';
  const id = `st-pages-${field.key}`;
  const control = multiline
    ? `<textarea class="st-textarea" id="${esc(id)}" data-page-field="${esc(field.key)}" rows="${
        linesFlag ? 4 : 3
      }" placeholder="留空则使用默认值">${esc(value)}</textarea>`
    : `<input class="st-input" id="${esc(id)}" data-page-field="${esc(field.key)}" value="${esc(
        value
      )}" placeholder="留空则使用默认值" />`;

  return `
    <div class="st-field st-pages-field-cell${multiline ? ' st-pages-field-cell--wide' : ''}">
      <label for="${esc(id)}" title="${esc(field.key)}">${esc(field.label)}</label>
      <div>${control}</div>
      ${field.hint ? `<div class="st-hint">${esc(field.hint)}</div>` : ''}
      <div class="st-hint st-pages-default-line">默认值：<span class="st-pages-default-value">${esc(
        fallback === '' ? '（空）' : fallback
      )}</span>${linesFlag ? '<span class="st-pages-field-flag">一行一项</span>' : ''}</div>
      <div class="st-pages-field-actions">
        <button type="button" class="stage-mini-btn" data-page-reset="${esc(
          field.key
        )}" title="将此字段恢复为默认值">恢复默认</button>
      </div>
    </div>`;
}

function renderPlaceholder(edit: HTMLElement): void {
  const preview = $('#st-preview');
  if (preview) {
    preview.innerHTML = `
      <div class="st-col-inner">
        <div class="st-dock-head"><span>PAGE SETTINGS // 页面设置</span></div>
        <p class="st-hint">${
          loading ? '正在读取 /api/pages…' : loadError ? '页面文案尚未读取，请先重试。' : '等待读取…'
        }</p>
      </div>`;
  }

  if (loadError) {
    edit.innerHTML = `
      <div class="st-pages-view">
        <div class="st-head">
          <div class="st-kicker">PAGE SETTINGS // 读取失败</div>
          <h2>页面文案暂时读不出来</h2>
        </div>
        <div class="st-section-box st-pages-error">
          <p class="st-error">读取失败：${esc(loadError)}</p>
          <p class="st-hint">请确认后台会话仍然有效，然后重试。</p>
          <button type="button" class="st-btn" id="st-pages-retry">重试读取</button>
        </div>
      </div>`;

    $<HTMLButtonElement>('#st-pages-retry')?.addEventListener('click', () => {
      loadError = null;
      void loadPages();
      renderPagesView();
    });
    return;
  }

  edit.innerHTML = `
    <div class="st-pages-view">
      <div class="st-head">
        <div class="st-kicker">PAGE SETTINGS // 正在读取</div>
        <h2>页面设置 · 正在读取文案配置</h2>
      </div>
      <div class="st-section-box st-pages-loading">
        <p class="st-empty">正在读取 /api/pages …</p>
        <div class="st-pages-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>
      </div>
    </div>`;
}

/* --------------------------------------------------------------------------
   事件
   -------------------------------------------------------------------------- */

function wireEvents(edit: HTMLElement, page: PageDef): void {
  edit.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-page-field]').forEach((input) => {
    input.addEventListener('input', () => {
      const field = fieldFor(input.dataset.pageField ?? '');
      if (!field) return;
      values[field.key] = input.value === '' ? defaultFor(field) : input.value;
      syncFieldState(input);
      syncDirtyUi();
      markDirty();
      renderPreview(page);
    });

    // 清空后离开输入框：直接落回默认值，避免留下一个「看起来是空、实际是默认」的歧义状态。
    input.addEventListener('blur', () => {
      const field = fieldFor(input.dataset.pageField ?? '');
      if (!field || input.value !== '') return;
      input.value = defaultFor(field);
      values[field.key] = defaultFor(field);
      syncFieldState(input);
      syncDirtyUi();
      markDirty();
      renderPreview(page);
    });
  });

  edit.querySelectorAll<HTMLButtonElement>('[data-page-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = fieldFor(btn.dataset.pageReset ?? '');
      if (!field) return;
      values[field.key] = defaultFor(field);
      const input = edit.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-page-field="${field.key}"]`
      );
      if (input) {
        input.value = defaultFor(field);
        syncFieldState(input);
      }
      syncDirtyUi();
      markDirty();
      renderPreview(page);
      toast(`「${field.label}」已恢复默认值`);
    });
  });
}

/* --------------------------------------------------------------------------
   保存（由外壳的全局「保存」调用）
   -------------------------------------------------------------------------- */

export async function savePagesValues(): Promise<void> {
  if (!schema || !hasChanges()) return;

  // 只提交「和已保存值不同」的字段。
  // 全量提交会把别人（或本标签页的旧缓存）没改过的默认值写回去，冲掉库里已有的覆盖值。
  const payload: PageValues = {};
  for (const page of schema) {
    for (const field of page.fields) {
      const raw = values[field.key];
      const next = typeof raw === 'string' && raw !== '' ? raw : defaultFor(field);
      if (next !== (saved[field.key] ?? defaultFor(field))) payload[field.key] = next;
    }
  }
  if (Object.keys(payload).length === 0) return;

  const res = await fetch('/api/pages', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': state.csrf ?? '',
    },
    body: JSON.stringify({ values: payload }),
  });
  const data = (await res.json().catch(() => ({}))) as PagesResponse;
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

  const next =
    data.values && typeof data.values === 'object'
      ? readValues(schema, data.values, defaults)
      : { ...payload };
  values = next;
  saved = { ...next };

  if (state.collection === 'pages') {
    syncDirtyUi();
    const page = currentPage();
    if (page) renderPreview(page);
  }
}

/* --------------------------------------------------------------------------
   状态判断与小更新
   -------------------------------------------------------------------------- */

function fieldFor(key: string): PageField | null {
  if (!schema) return null;
  for (const page of schema) {
    for (const field of page.fields) if (field.key === key) return field;
  }
  return null;
}

/** 服务端下发的 defaults 优先，schema 里的 default 兜底。 */
function defaultFor(field: PageField): string {
  return defaults[field.key] ?? field.default;
}

function isFieldChanged(key: string): boolean {
  const field = fieldFor(key);
  const fallback = field ? defaultFor(field) : defaults[key] ?? '';
  return (values[key] ?? fallback) !== (saved[key] ?? fallback);
}

function changedKeys(): string[] {
  if (!schema) return [];
  const out: string[] = [];
  for (const page of schema) {
    for (const field of page.fields) {
      if (isFieldChanged(field.key)) out.push(field.key);
    }
  }
  return out;
}

function hasChanges(): boolean {
  return changedKeys().length > 0;
}

/** 输入时只改徽章，不整栏重画，避免焦点与滚动位置丢失。 */
function syncDirtyUi(): void {
  const dirty = hasChanges();
  const badge = $('#st-pages-dirty');
  if (badge) {
    badge.textContent = dirty ? `${changedKeys().length} 项未保存` : '全部已保存';
    badge.classList.toggle('is-dirty', dirty);
  }
}

/** 标记当前字段是否偏离已保存值（只切换样式，不重画输入框）。 */
function syncFieldState(input: HTMLInputElement | HTMLTextAreaElement): void {
  const field = fieldFor(input.dataset.pageField ?? '');
  if (!field) return;
  const cell = input.closest<HTMLElement>('.st-pages-field-cell');
  if (cell) cell.classList.toggle('is-dirty', isFieldChanged(field.key));
}

/* --------------------------------------------------------------------------
   右侧概览
   -------------------------------------------------------------------------- */

function renderPreview(page: PageDef): void {
  const box = $('#st-preview');
  if (!box) return;

  const sections = sectionsFor(page);
  const pageChanged = page.fields.filter((field) => isFieldChanged(field.key));
  const allChanged = changedKeys().length;
  const structuredCount = sections.filter((section) => section.structured).length;

  box.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-head"><span>PAGE SETTINGS // 页面设置概览</span></div>

      <div class="rail-blueprint-card">
        <div class="rail-card-kicker">
          <span>${esc(page.label)}</span>
          <span>${sections.length} SECTIONS</span>
        </div>
        <div class="st-pages-preview-title">${esc(page.label)}页面设置</div>
        <ul class="rail-kv-list">
          <li><span>小节</span><strong>${sections.length}</strong></li>
          <li><span>字段</span><strong>${page.fields.length}</strong></li>
          <li><span>本页改动</span><strong>${pageChanged.length}</strong></li>
          <li><span>全部未保存</span><strong>${allChanged}</strong></li>
          ${structuredCount ? `<li><span>结构化小节</span><strong>${structuredCount}</strong></li>` : ''}
        </ul>
      </div>

      <div class="st-sub-kicker st-pages-preview-label">SECTIONS // 小节清单</div>
      <ul class="st-pages-preview-list">
        ${sections
          .map((section, index) => {
            const count = section.fields.filter((key) => fieldFor(key)).length;
            const countLabel = count ? `${count} 字段` : '';
            const structuredLabel = section.structured ? '结构化' : '';
            const right = [countLabel, structuredLabel].filter(Boolean).join(' · ');
            return `<li><span>${String(index + 1).padStart(2, '0')} // ${esc(
              section.title
            )}</span><span>${esc(right)}</span></li>`;
          })
          .join('')}
      </ul>

      <div class="st-sub-kicker st-pages-preview-label">UNSAVED // 本页未保存字段</div>
      ${
        pageChanged.length
          ? `<ul class="st-pages-preview-changes">${pageChanged
              .map(
                (field) =>
                  `<li title="${esc(field.key)}"><span>${esc(field.label)}</span><span class="telemetry-accent">●</span></li>`
              )
              .join('')}</ul>`
          : '<p class="st-hint">本页没有未保存的改动。</p>'
      }

      <p class="st-hint st-pages-preview-note">
        保存走顶栏的「保存」按钮；文案与结构化内容在同一次提交里写入，输入框清空会回落到默认值。
      </p>
    </div>`;
}

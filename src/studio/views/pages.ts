/**
 * 「页面」视图 —— 字体与左栏同步（楷体体系）、适度字号（最小 ≥ 顶栏 20px，一级标题略大）、
 * 精简美化顶部检索栏、右侧按当前修改页面的章节标题（01，02，...）排列导航。
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
  type?: PageFieldType;
  hint?: string;
}

interface PageDef {
  key: string;
  label: string;
  route?: string;
  desc: string;
  fields: PageField[];
}

interface PagesResponse {
  pages?: PageDef[];
  values?: PageValues;
  defaults?: PageValues;
  error?: string;
}

/** 左栏固定顺序 */
export const PAGE_GROUPS = [
  { key: 'home', label: '主页', route: '/', sub: '首屏主视觉 · 五屏导语 · 流形参数' },
  { key: 'posts', label: '文章', route: '/posts/', sub: '归档首屏 · 时间轴检索 · 全局悬浮窗' },
  { key: 'photos', label: '相册', route: '/photos/', sub: '光学检视台 · 分组筛选 · 档案网格' },
  { key: 'programs', label: '项目', route: '/programs/', sub: '工坊标题 · 模块按钮 · 空态说明' },
  { key: 'links', label: '友链', route: '/links/', sub: '友链名录 · 互换名片 · 关于我与说明志' },
] as const;

type PageKey = (typeof PAGE_GROUPS)[number]['key'];
type StructuredPanelKey = 'home' | 'rail' | 'dossier';

interface SectionDef {
  key: string;
  title: string;
  tag: string;
  desc: string;
  fields: string[];
  structured?: StructuredPanelKey;
}

const PAGE_SECTIONS: Record<PageKey, SectionDef[]> = {
  home: [
    {
      key: 'hero',
      title: '首屏主视觉与个人自述',
      tag: 'SCREEN 01 · HERO',
      desc: '主页第一屏左上角坐标、顶栏状态标语、右侧三维流形数学方程以及站名下方的个人自述段落。',
      fields: [
        'home.hero.originBadge',
        'home.hero.topbarTag',
        'home.hero.coordText',
        'home.hero.equation',
        'home.hero.intro',
      ],
    },
    {
      key: 'loader-index',
      title: '开屏加载与首屏四象限角标',
      tag: 'LOADER & QUADRANT META',
      desc: '全站开屏立体流形加载动画的状态文字，以及首屏左下角四个象限入口的角标文字。',
      fields: [
        'home.loader.status',
        'home.hero.metaPosts',
        'home.hero.metaPhotos',
        'home.hero.metaPrograms',
        'home.hero.metaLinks',
      ],
    },
    {
      key: 'screens-note',
      title: '主页分屏顶栏导语（第 02 ~ 05 屏）',
      tag: 'SCREENS 02-05',
      desc: '主页向下滚动时，文章屏、相册屏、程序屏与友链屏各自顶栏居中的导览说明。',
      fields: [
        'home.posts.note',
        'home.photos.note',
        'home.programs.note',
        'home.links.note',
      ],
    },
    {
      key: 'manifold',
      title: '四象限入口卡片与流形引擎参数',
      tag: 'ENGINE & CARDS',
      desc: '首屏四象限导览卡片的标题/路由与 3D 粒子场默认参数（白天/黑夜、粒子数 N、演化速率 ω）。',
      fields: [],
      structured: 'home',
    },
  ],
  posts: [
    {
      key: 'archive-hero',
      title: '归档页首屏标题与导语',
      tag: 'HERO & SEO',
      desc: '控制 /posts/ 页面首屏左侧的大标题 (H1)、上方坐标铭牌、导语段落、顶栏说明及浏览器标题。',
      fields: [
        'posts.heroTitle',
        'posts.heroKicker',
        'posts.heroLead',
        'posts.topbarNote',
        'posts.title',
        'posts.description',
      ],
    },
    {
      key: 'timeline-filter',
      title: '时间轴检索、标签筛选与卡片按钮',
      tag: 'TIMELINE & FILTER',
      desc: '归档时间轴的筛选按钮、搜索框提示词、文章卡片阅读按钮以及时间轴首尾坐标文案。',
      fields: [
        'posts.allTag',
        'posts.uncategorized',
        'posts.searchPlaceholder',
        'posts.readLabel',
        'posts.now',
        'posts.origin',
        'posts.empty',
      ],
    },
    {
      key: 'stats-random',
      title: '归档统计卡片与右栏随机漫游',
      tag: 'STATS & EXPLORE',
      desc: '首屏右侧统计卡片的数量展示格式（支持 {count} / {chars} 占位符）及右栏随机漫游卡片文案。',
      fields: [
        'posts.statTotal',
        'posts.statVisible',
        'posts.statWords',
        'posts.unit',
        'posts.randomWalkText',
        'posts.randomWalkBtn',
      ],
    },
    {
      key: 'rail',
      title: '文章详情页与全局悬浮窗默认配置',
      tag: 'ARTICLE RAIL · 全局默认',
      desc: '配置文章详情页《三体》画布默认铭牌、全局文档速查卡、全局伴读卡与同系列文章推荐卡。',
      fields: [],
      structured: 'rail',
    },
  ],
  photos: [
    {
      key: 'optics-stage',
      title: '光学检视台与顶栏标题',
      tag: 'OPTICS STAGE',
      desc: '控制 /photos/ 第一屏自适应光学检视台的顶栏标题、右侧拍摄信息栏标题、胶片条与直方图标题。',
      fields: [
        'photos.title',
        'photos.description',
        'photos.topbarTitle',
        'photos.topbarNote',
        'photos.specTitle',
        'photos.filmstripTitle',
        'photos.histTitle',
      ],
    },
    {
      key: 'groups-grid',
      title: '影集分组、画幅筛选与档案网格',
      tag: 'GROUPS & ARCHIVE GRID',
      desc: '照片分组名称、底部网格筛选栏按钮、向下滚动按钮与空态提示文案。',
      fields: [
        'photos.all',
        'photos.latest',
        'photos.earlier',
        'photos.scrollLabel',
        'photos.gridHint',
        'photos.empty',
      ],
    },
  ],
  programs: [
    {
      key: 'programs-main',
      title: '项目页标题、导语与模块按钮',
      tag: 'PROGRAMS MAIN',
      desc: '控制 /programs/ 页面主标题、副标题导语、模块卡片默认按钮及核心控制台底部跳转链接文案。',
      fields: [
        'programs.title',
        'programs.note',
        'programs.description',
        'programs.viewCta',
        'programs.statusFallback',
        'programs.hostCta',
      ],
    },
    {
      key: 'programs-empty',
      title: '无项目数据时的空态提示',
      tag: 'EMPTY STATE',
      desc: '当尚未录入任何程序模块时，在 /programs/ 与主页程序屏展示的空态标题、说明与后台入口按钮。',
      fields: [
        'programs.emptyTitle',
        'programs.emptyText',
        'programs.emptyCta',
      ],
    },
  ],
  links: [
    {
      key: 'peers-directory',
      title: '友链页标题与邻人名录文案',
      tag: 'PEERS DIRECTORY',
      desc: '控制 /links/ 页面主标题、副标题导语、友链名录小节标题与收录数量统计文案。',
      fields: [
        'links.title',
        'links.note',
        'links.description',
        'links.peersTitle',
        'links.peersCount',
        'links.peersEmpty',
        'links.empty',
      ],
    },
    {
      key: 'site-card',
      title: '本站互换名片与规格标签',
      tag: 'SITE EXCHANGE CARD',
      desc: '本站友链互换名片的标题、右上角徽标、导言、四项规格名称以及复制与 RSS 按钮文案。',
      fields: [
        'links.cardTitle',
        'links.cardBadge',
        'links.cardIntro',
        'links.specName',
        'links.specTagline',
        'links.specUrl',
        'links.specRss',
        'links.copyBtn',
        'links.copyDone',
        'links.rssBtn',
      ],
    },
    {
      key: 'colophon-head',
      title: '站点说明志小节标题',
      tag: 'COLOPHON HEADING',
      desc: '第二部分「站点说明（Site Colophon）」的小节主标题与副标题说明。',
      fields: ['links.colophonTitle', 'links.colophonNote'],
    },
    {
      key: 'dossier',
      title: '关于「我」个人档案卡与说明志条目',
      tag: 'AUTHOR DOSSIER & COLOPHON',
      desc: '维护关于「我」个人自述档案卡与底部四象限「站点说明志」卡片（主页与 /links/ 同步生效）。',
      fields: [],
      structured: 'dossier',
    },
  ],
};

const PAGE_EN_TITLE: Record<PageKey, string> = {
  home: 'HOME PAGE CONFIGURATION',
  posts: 'POSTS ARCHIVE & RAIL CONFIGURATION',
  photos: 'PHOTOS SHOWCASE CONFIGURATION',
  programs: 'PROGRAMS WORKBENCH CONFIGURATION',
  links: 'LINKS & AUTHOR DOSSIER CONFIGURATION',
};

type PanelRenderer = (host: HTMLElement, data: Record<string, unknown>) => void;

const STRUCTURED_PANELS: Record<StructuredPanelKey, PanelRenderer> = {
  home: renderHomeEnginePanel,
  rail: renderArticleRailPanel,
  dossier: renderAuthorDossierPanel,
};

let schema: PageDef[] | null = null;
let values: PageValues = {};
let defaults: PageValues = {};
let saved: PageValues = {};
let loading = false;
let loadError: string | null = null;

/** 页面内筛选状态（搜索关键词 / 仅看已修改项）与右侧高亮章节 */
let searchQuery = '';
let onlyModified = false;
let activeSectionByPage: Record<string, string> = {};

/* --------------------------------------------------------------------------
   入口
   -------------------------------------------------------------------------- */

export function renderPagesView(): void {
  const edit = $('#st-edit');
  if (!edit) return;

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

export async function pagesReload(): Promise<void> {
  loadError = null;
  await loadPages();
}

export function pagesDirty(): boolean {
  return hasChanges();
}

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
  const groupMeta = PAGE_GROUPS.find((g) => g.key === key) ?? PAGE_GROUPS[0];
  const pageIndex = PAGE_GROUPS.findIndex((group) => group.key === key);
  const badge = `PAGE // ${String((pageIndex >= 0 ? pageIndex : 0) + 1).padStart(2, '0')}`;
  const enTitle = PAGE_EN_TITLE[key] ?? 'PAGE SETTINGS';
  const sections = sectionsFor(page);
  const dirty = hasChanges();
  const changed = changedKeys().length;
  const pageCustomizedCount = page.fields.filter((f) => isFieldCustomized(f.key)).length;

  return `
    <div class="st-pages-view">
      <div class="st-q-card">
        <div class="q-topbar">
          <div class="q-topbar-cell">
            <span class="q-sec-badge">${esc(badge)}</span>
            <span>${esc(enTitle)}</span>
          </div>
          <div class="q-topbar-cell q-topbar-cell--right">
            <span class="st-pages-dirty${dirty ? ' is-dirty' : ''}" id="st-pages-dirty">${
              dirty ? `${changed} 项待保存` : '全部已同步'
            }</span>
            <a href="${esc(groupMeta.route)}" target="_blank" rel="noopener noreferrer" class="st-pages-open-route">
              打开前台 ${esc(groupMeta.route)} ↗
            </a>
          </div>
        </div>

        <div class="st-head st-pages-hero-head">
          <div class="st-head-top-row">
            <div>
              <div class="st-kicker">ROUTE: ${esc(groupMeta.route)} · 共 ${page.fields.length} 个动态文案项（已自定义 ${pageCustomizedCount} 项）</div>
              <h2 class="st-pages-main-title">${esc(page.label)}页面 · 动态内容与版块管理</h2>
              <p class="st-pages-main-desc">${esc(page.desc)}。修改后点右上角「保存」即刻同步至前台页面。</p>
            </div>
            <div class="st-head-btns">
              <button type="button" class="stage-mini-btn" id="st-pages-reset-all" ${pageCustomizedCount === 0 ? 'disabled' : ''}>
                恢复本页默认
              </button>
            </div>
          </div>

          <!-- 仅保留精简协调的检索栏（移除最上方各章节导航按钮，章节导航统一置于右侧栏） -->
          <div class="st-pages-search-bar" role="search" aria-label="检索本页配置项">
            <div class="st-pages-search-box">
              <svg class="st-pages-search-icon" viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="8" cy="8" r="5.2"/>
                <path d="m12 12 3.8 3.8"/>
              </svg>
              <input
                type="search"
                class="st-input st-pages-search-input"
                id="st-pages-search"
                value="${esc(searchQuery)}"
                placeholder="检索本页配置项名称、键名或当前文案内容…"
                aria-label="搜索本页配置项"
              />
              ${
                searchQuery
                  ? `<button type="button" class="stage-mini-btn st-pages-search-clear" id="st-pages-search-clear">清空</button>`
                  : ''
              }
            </div>
            <div class="st-pages-search-tools">
              <label class="st-check st-pages-only-mod">
                <input type="checkbox" id="st-pages-only-mod" ${onlyModified ? 'checked' : ''} />
                <span>仅看已自定义 (${pageCustomizedCount})</span>
              </label>
            </div>
          </div>
        </div>

        ${sections.map((section, index) => sectionHtml(section, index)).join('')}
      </div>
    </div>`;
}

function sectionHtml(section: SectionDef, index: number): string {
  const number = String(index + 1).padStart(2, '0');
  const allFields = section.fields
    .map((key) => fieldFor(key))
    .filter((field): field is PageField => Boolean(field));

  const q = searchQuery.trim().toLowerCase();
  const filteredFields = allFields.filter((f) => {
    if (onlyModified && !isFieldCustomized(f.key) && !isFieldChanged(f.key)) return false;
    if (!q) return true;
    const val = (values[f.key] ?? defaultFor(f)).toLowerCase();
    return (
      f.label.toLowerCase().includes(q) ||
      f.key.toLowerCase().includes(q) ||
      val.includes(q) ||
      (f.hint ?? '').toLowerCase().includes(q)
    );
  });

  if (!section.structured && allFields.length > 0 && filteredFields.length === 0) {
    return '';
  }

  return `
    <div class="st-section-box st-pages-section-box" id="st-page-sec-${esc(section.key)}" data-page-section="${esc(section.key)}">
      <div class="st-section-head st-pages-section-head">
        <div class="st-pages-sec-title-wrap">
          <span class="st-pages-sec-num">${number}</span>
          <h3 class="st-pages-sec-title">${esc(section.title)}</h3>
        </div>
        <span class="st-sec-tag">${esc(section.tag)}</span>
      </div>
      ${section.desc ? `<p class="st-pages-section-desc">${esc(section.desc)}</p>` : ''}
      ${filteredFields.length ? `<div class="st-pages-cards-grid">${filteredFields.map(fieldHtml).join('')}</div>` : ''}
      ${section.structured ? `<div class="st-pages-panel" data-pages-panel="${section.structured}"></div>` : ''}
    </div>`;
}

function fieldHtml(field: PageField): string {
  const fallback = defaultFor(field);
  const value = values[field.key] ?? fallback;
  const multiline = field.type === 'textarea' || field.type === 'lines' || value.length > 26;
  const linesFlag = field.type === 'lines';
  const isDirty = isFieldChanged(field.key);
  const isCustom = value !== fallback;
  const id = `st-pages-${field.key}`;

  const control =
    field.type === 'textarea' || field.type === 'lines'
      ? `<textarea class="st-textarea st-pages-input-lg" id="${esc(id)}" data-page-field="${esc(field.key)}" rows="${
          linesFlag ? 4 : 3
        }" placeholder="留空则使用默认值">${esc(value)}</textarea>`
      : `<input class="st-input st-pages-input-lg" id="${esc(id)}" data-page-field="${esc(field.key)}" value="${esc(
          value
        )}" placeholder="留空则使用默认值" />`;

  return `
    <div class="st-pages-field-card${multiline ? ' st-pages-field-card--wide' : ''}${isDirty ? ' is-dirty' : ''}${isCustom ? ' is-custom' : ''}" id="st-card-${esc(field.key)}">
      <div class="st-pages-field-top">
        <label class="st-pages-label-lg" for="${esc(id)}">
          <span>${esc(field.label)}</span>
          ${linesFlag ? '<span class="st-pages-field-flag">多段 · 每行一段</span>' : ''}
        </label>
        <div class="st-pages-field-meta">
          <span class="st-pages-status-pill" data-status-for="${esc(field.key)}">${
            isDirty ? '未保存修改' : isCustom ? '已自定义' : '默认文案'
          }</span>
          <button type="button" class="stage-mini-btn st-pages-reset-btn" data-page-reset="${esc(
            field.key
          )}" ${!isCustom && !isDirty ? 'disabled' : ''} title="恢复为系统默认文案">恢复默认</button>
        </div>
      </div>
      <div class="st-pages-control-wrap">${control}</div>
      <div class="st-pages-field-foot">
        <span class="st-pages-field-key">KEY: <code>${esc(field.key)}</code>${field.hint ? ` · ${esc(field.hint)}` : ''}</span>
        <span class="st-pages-default-inline" data-default-for="${esc(field.key)}" ${isCustom ? '' : 'hidden'}>
          默认：${esc(fallback.length > 48 ? `${fallback.slice(0, 48)}…` : fallback)}
        </span>
      </div>
    </div>`;
}

function renderPlaceholder(edit: HTMLElement): void {
  const preview = $('#st-preview');
  if (preview) {
    preview.innerHTML = `
      <div class="st-col-inner">
        <div class="st-panel-title"><span>SECTION INDEX // 章节导航</span></div>
        <p class="st-hint" style="padding:0.75rem 1rem;">${
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
  // 搜索与仅看已改筛选
  const searchInp = edit.querySelector<HTMLInputElement>('#st-pages-search');
  searchInp?.addEventListener('input', () => {
    searchQuery = searchInp.value;
    const pos = searchInp.selectionStart ?? searchQuery.length;
    renderPagesView();
    const nextInp = $<HTMLInputElement>('#st-pages-search');
    if (nextInp) {
      nextInp.focus();
      nextInp.setSelectionRange(pos, pos);
    }
  });

  edit.querySelector<HTMLButtonElement>('#st-pages-search-clear')?.addEventListener('click', () => {
    searchQuery = '';
    renderPagesView();
    $<HTMLInputElement>('#st-pages-search')?.focus();
  });

  const onlyModInp = edit.querySelector<HTMLInputElement>('#st-pages-only-mod');
  onlyModInp?.addEventListener('change', () => {
    onlyModified = onlyModInp.checked;
    renderPagesView();
  });

  // 恢复本页全部默认
  edit.querySelector<HTMLButtonElement>('#st-pages-reset-all')?.addEventListener('click', () => {
    let count = 0;
    for (const field of page.fields) {
      const fb = defaultFor(field);
      if ((values[field.key] ?? fb) !== fb) {
        values[field.key] = fb;
        count++;
      }
    }
    if (count > 0) {
      markDirty();
      renderPagesView();
      toast(`已将「${page.label}」页面的 ${count} 个字段恢复为默认值，请点保存生效`);
    }
  });

  // 单个字段输入
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

  // 单个字段恢复默认
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
   保存
   -------------------------------------------------------------------------- */

export async function savePagesValues(): Promise<void> {
  if (!schema || !hasChanges()) return;

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

function defaultFor(field: PageField): string {
  return defaults[field.key] ?? field.default;
}

function isFieldChanged(key: string): boolean {
  const field = fieldFor(key);
  const fallback = field ? defaultFor(field) : defaults[key] ?? '';
  return (values[key] ?? fallback) !== (saved[key] ?? fallback);
}

function isFieldCustomized(key: string): boolean {
  const field = fieldFor(key);
  const fallback = field ? defaultFor(field) : defaults[key] ?? '';
  return (values[key] ?? fallback) !== fallback;
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

function syncDirtyUi(): void {
  const dirty = hasChanges();
  const badge = $('#st-pages-dirty');
  if (badge) {
    badge.textContent = dirty ? `${changedKeys().length} 项待保存` : '全部已同步';
    badge.classList.toggle('is-dirty', dirty);
  }
}

function syncFieldState(input: HTMLInputElement | HTMLTextAreaElement): void {
  const field = fieldFor(input.dataset.pageField ?? '');
  if (!field) return;
  const card = input.closest<HTMLElement>('.st-pages-field-card');
  const dirty = isFieldChanged(field.key);
  const custom = isFieldCustomized(field.key);
  if (card) {
    card.classList.toggle('is-dirty', dirty);
    card.classList.toggle('is-custom', custom);
  }
  const statusEl = card?.querySelector<HTMLElement>(`[data-status-for="${field.key}"]`);
  if (statusEl) {
    statusEl.textContent = dirty ? '未保存修改' : custom ? '已自定义' : '默认文案';
  }
  const resetBtn = card?.querySelector<HTMLButtonElement>(`[data-page-reset="${field.key}"]`);
  if (resetBtn) {
    resetBtn.disabled = !custom && !dirty;
  }
  const defLine = card?.querySelector<HTMLElement>(`[data-default-for="${field.key}"]`);
  if (defLine) {
    defLine.hidden = !custom;
  }
}

/* --------------------------------------------------------------------------
   右侧：按当前修改页面的章节标题（01，02，...）排列导航（与左栏风格和字体同步）
   -------------------------------------------------------------------------- */

function renderPreview(page: PageDef): void {
  const box = $('#st-preview');
  if (!box) return;

  const sections = sectionsFor(page);
  const currentActive = activeSectionByPage[page.key] || sections[0]?.key || '';

  box.innerHTML = `
    <div class="st-col-inner st-pages-right-nav">
      <div class="st-panel-title">
        <span>SECTION NAV // ${esc(page.label)}章节导航 (${sections.length})</span>
      </div>
      <ul class="st-list st-pages-sec-nav-list" id="st-pages-sec-nav-list">
        ${sections
          .map((sec, idx) => {
            const num = String(idx + 1).padStart(2, '0');
            const isCurrent = sec.key === currentActive;
            const modCount = sec.fields.filter((k) => isFieldChanged(k) || isFieldCustomized(k)).length;
            const subInfo = sec.structured
              ? `${sec.tag} · 结构化配置模块`
              : `${sec.tag} · 共 ${sec.fields.length} 项${modCount > 0 ? `（已改 ${modCount} 项）` : ''}`;
            return `<li>
              <button
                type="button"
                data-sec-nav="st-page-sec-${esc(sec.key)}"
                data-sec-key="${esc(sec.key)}"
                aria-current="${isCurrent ? 'true' : 'false'}"
              >
                <span class="st-line">
                  <span class="st-date">${num}</span>
                  <span class="st-name">${esc(sec.title)}</span>
                </span>
                <span class="st-sub">${esc(subInfo)}</span>
              </button>
            </li>`;
          })
          .join('')}
      </ul>
    </div>`;

  box.querySelectorAll<HTMLButtonElement>('[data-sec-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.secNav ?? '';
      const secKey = btn.dataset.secKey ?? '';
      if (secKey) activeSectionByPage[page.key] = secKey;
      box.querySelectorAll<HTMLButtonElement>('[data-sec-nav]').forEach((b) => {
        b.setAttribute('aria-current', String(b === btn));
      });
      const targetEl = document.getElementById(targetId);
      targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

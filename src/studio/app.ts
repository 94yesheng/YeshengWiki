/**
 * 后台应用（外壳）—— HUD 蓝图画布体系重构版
 *
 * 1. 顶栏与全站 HUD 页面完全统一（.site-nav-bar 风格 + ∞/黑洞平面徽标 + 01..05 编号导航 + 昼夜切换）；
 * 2. 五大板块：01 文章 · 02 照片墙 · 03 程序工坊 · 04 友链矩阵 · 05 站点与右栏；
 * 3. 同时支持「免接口 UI 交互演示模式」与「本地 SQLite 数据库模式」。
 */
import {
  deletePost,
  deleteWall,
  isPost,
  listPhotoFiles,
  listPostAssetFiles,
  loadLinks,
  loadPosts,
  loadSite,
  loadWalls,
  saveLinks,
  savePost,
  saveSite,
  saveWall,
} from './content';
import { ApiGithub } from './api';
import {
  clearStaged,
  discardStaged,
  forgetSession,
  isStagedGone,
  isStagedNew,
  registerHooks,
  stagedDeletes,
  state,
  type Collection,
} from './state';
import { $, esc, reportError, setBusy, toast } from './ui';
import { mountFab, type FabHandle } from './fab';
import { enterDemoMode, renderUnlock } from './views/login';
import {
  createNewPost,
  foldStagedPostDraft,
  postDraftEdited,
  previewCurrentPost,
  renderPostView,
  savePostCurrent,
} from './views/posts';
import {
  createNewWall,
  foldStagedWallDraft,
  renderWallView,
  saveWallCurrent,
  wallDraftEdited,
} from './views/walls';
import { postListHtml, wirePostList } from './views/postlist';
import { renderLinksView } from './views/links';
import { renderProgramsView } from './views/programs';
import { renderSiteView } from './views/site';
import { loadMockAll } from './mock';
import { isDark, toggleTheme } from '../utils/theme';
import type { Github } from './github';

/* --------------------------------------------------------------------------
   载入
   -------------------------------------------------------------------------- */
async function loadAll(): Promise<void> {
  if (state.demoMode) {
    const mock = loadMockAll();
    state.posts = mock.posts;
    state.walls = mock.walls;
    state.links = mock.links;
    state.site = mock.site;
    state.photoFiles = mock.photoFiles;
    state.postAssetFiles = mock.postAssetFiles;
    state.staged = { added: [], removed: [] };
    state.selected =
      state.collection === 'posts' ? (mock.posts[0]?.id ?? null)
      : state.collection === 'walls' ? (mock.walls[0]?.id ?? null)
      : state.collection === 'links' ? '0'
      : state.collection === 'programs' ? 'console'
      : 'site';
    state.draft = {};
    state.dirty = false;
    renderApp();
    return;
  }

  const gh = state.gh;
  if (!gh) return;
  setBusy(true, '读取数据…');
  try {
    const [posts, walls, links, site, photoFiles, postAssets] = await Promise.all([
      loadPosts(gh),
      loadWalls(gh),
      loadLinks(gh),
      loadSite(gh),
      listPhotoFiles(gh),
      listPostAssetFiles(gh),
    ]);
    state.posts = posts;
    state.walls = walls;
    state.links = links;
    state.site = site;
    state.staged = { added: [], removed: [] };
    state.photoFiles = photoFiles.map((f) => f.name);
    state.postAssetFiles = postAssets.map((f) => f.name);
    state.selected =
      state.collection === 'posts' ? (posts[0]?.id ?? null)
      : state.collection === 'walls' ? (walls[0]?.id ?? null)
      : state.collection === 'links' ? '0'
      : state.collection === 'programs' ? 'console'
      : 'site';
    state.draft = {};
    state.dirty = false;
    setBusy(false);
    renderApp();
  } catch (e) {
    setBusy(false);
    reportError(e);
    renderApp();
  }
}

/* --------------------------------------------------------------------------
   左右两栏的收起 / 展开
   -------------------------------------------------------------------------- */
type Col = 'nav' | 'tools';

const COLS: Array<{ key: Col; name: string; handle: string }> = [
  { key: 'nav', name: '左栏', handle: '#st-nav-handle' },
  { key: 'tools', name: '右栏伴读与工具面板', handle: '#st-tools-handle' },
];

const colKey = (col: Col) => `studio.col.${col}`;

function colHidden(col: Col): boolean {
  try {
    return localStorage.getItem(colKey(col)) === 'hidden';
  } catch {
    return false;
  }
}

function applyCols(): void {
  const app = $('#st-app');
  if (!app) return;

  for (const { key, name, handle } of COLS) {
    // 右侧工具面板常驻显示（用户已要求删除右缘的滑动把手）
    const hidden = key === 'tools' ? false : colHidden(key);
    app.classList.toggle(key === 'nav' ? 'is-nav-hidden' : 'is-tools-hidden', hidden);

    const btn = $(handle);
    if (!btn) continue;
    const label = hidden ? `展开${name}` : `收起${name}`;
    btn.setAttribute('aria-pressed', String(hidden));
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', label);

    const icon = btn.querySelector('[data-col-icon]');
    if (icon) {
      const pointsRight = key === 'nav' ? hidden : !hidden;
      icon.textContent = pointsRight ? '›' : '‹';
    }
  }
}

function setColHidden(col: Col, hidden: boolean): void {
  try {
    localStorage.setItem(colKey(col), hidden ? 'hidden' : 'shown');
  } catch {
    /* ignore */
  }
  applyCols();
}

/* --------------------------------------------------------------------------
   顶栏（HUD 蓝图导航栏）
   -------------------------------------------------------------------------- */
function renderBar(): void {
  const bar = $('#st-bar');
  if (!bar) return;
  const dark = isDark();
  bar.innerHTML = `
    <div class="st-bar-left">
      <a href="/" class="nav-brand" title="返回站点前台主页">
        <span class="nav-brand-mark" aria-hidden="true">
          <svg class="planar-icon planar-icon--infinity" viewBox="0 0 36 18">
            <path d="M10.5 2.2C6.7 2.2 3.7 5.2 3.7 9C3.7 12.8 6.7 15.8 10.5 15.8C15.2 15.8 20.8 2.2 25.5 2.2C29.3 2.2 32.3 5.2 32.3 9C32.3 12.8 29.3 15.8 25.5 15.8C20.8 15.8 15.2 2.2 10.5 2.2Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            <circle cx="10.5" cy="9" r="1.35" fill="currentColor"/>
            <circle cx="25.5" cy="9" r="1.35" fill="currentColor"/>
          </svg>
          <svg class="planar-icon planar-icon--blackhole" viewBox="0 0 36 18">
            <path d="M8.5 8.2C11.2 2.4 24.8 2.4 27.5 8.2" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
            <path d="M10.5 10.2C13.2 14.8 22.8 14.8 25.5 10.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.75" stroke-linecap="round"/>
            <circle cx="18" cy="9" r="4.2" fill="currentColor"/>
            <ellipse cx="18" cy="9.2" rx="14.5" ry="3.1" transform="rotate(-11 18 9.2)" fill="none" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </span>
        <span class="nav-brand-text">夜笙</span>
        <span class="nav-brand-coord">STUDIO</span>
      </a>
      <nav class="st-nav" id="st-nav" aria-label="后台管理板块"></nav>
    </div>
    <div class="st-bar-right">
      ${state.dirty ? '<span class="st-dirty-badge"><span class="st-dirty-dot"></span>有未保存修改</span>' : ''}
      <span class="st-meta-badge">
        ${state.demoMode ? '<strong class="telemetry-accent">演示模式</strong>' : `LOCAL${state.user ? ` · ${esc(state.user)}` : ''}`}
      </span>
      <button type="button" class="st-btn" id="st-theme-btn" title="切换白天 / 夜间模式">
        ${dark ? '昼' : '夜'}
      </button>
      <button type="button" class="st-btn" id="st-refresh" ${state.busy ? 'disabled' : ''}>刷新</button>
      <button type="button" class="st-btn st-btn--primary" id="st-save" ${state.dirty ? '' : 'disabled'}>保存</button>
      <button type="button" class="st-btn" id="st-lock">锁定</button>
    </div>`;

  $('#st-theme-btn')?.addEventListener('click', () => {
    toggleTheme();
    renderBar();
    fab?.sync();
  });

  $('#st-refresh')?.addEventListener('click', () => {
    if (!settleLeaving()) return;
    discardStaged();
    void loadAll();
  });

  $('#st-save')?.addEventListener('click', () => void saveCurrent());

  $('#st-lock')?.addEventListener('click', () => {
    if (!settleLeaving()) return;
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    forgetSession();
    renderUnlock('已锁定会话');
  });

  // renderBar 会重建整个 #st-bar；不在这里补一次，输入第一个字后顶栏导航就会消失。
  renderNav();
}

/* --------------------------------------------------------------------------
   集合导航与左栏列表
   -------------------------------------------------------------------------- */
const NAV: Array<{ key: Collection; label: string; count: () => number }> = [
  { key: 'posts',    label: '文章',    count: () => state.posts.filter((p) => !isStagedGone(p)).length },
  { key: 'walls',    label: '相册',    count: () => state.walls.filter((w) => !isStagedGone(w)).length },
  {
    key: 'programs',
    label: '项目',
    count: () => {
      const p = ((state.draft.site ?? state.site?.data ?? {}) as Record<string, unknown>).programs as Record<string, unknown> | undefined;
      return Array.isArray(p?.modules) ? p.modules.length : 3;
    },
  },
  { key: 'links', label: '友链', count: () => state.links?.links.length ?? 0 },
  { key: 'site',  label: '设置', count: () => 4 },
];

/**
 * 当前草稿里有没有"真改过"的东西。
 * 不只看 state.dirty：它只在第一次输入时置位，用户把改动撤销回去也仍然是 true。
 */
function hasUnsavedWork(): boolean {
  if (!state.dirty) return false;
  if (state.collection === 'posts' && state.draft.post) return postDraftEdited();
  if (state.collection === 'walls' && state.draft.wall) return wallDraftEdited();
  return true;
}

function settleLeaving(): boolean {
  // 先把编辑器里的当前内容折回草稿，再判断有没有真实改动。
  foldStagedPostDraft();
  foldStagedWallDraft();
  if (!hasUnsavedWork()) return true;
  // 所有离开入口都是同步函数，所以这里用同步 confirm；
  // 换成页内的 showConfirm 需要把整条导航链改成 async，风险大于收益。
  return window.confirm('有未保存的修改，离开后这些修改会丢失。确定继续吗？');
}

function selectCollection(c: Collection): void {
  if (c === state.collection) return;
  if (!settleLeaving()) return;
  state.collection = c;
  state.selected =
    c === 'posts'    ? (state.posts[0]?.id ?? null)
    : c === 'walls'  ? (state.walls[0]?.id ?? null)
    : c === 'links'  ? (state.links?.links.length ? '0' : null)
    : c === 'programs' ? 'console'
    : 'site';
  if (!state.demoMode) {
    state.draft = {};
    state.dirty = false;
  }
  renderApp();
}

function renderNav(): void {
  const nav = $('#st-nav');
  if (!nav) return;
  nav.innerHTML = NAV.map(
    (n) =>
      `<button type="button" data-c="${n.key}" aria-current="${state.collection === n.key}">
        <span>${n.label}</span>
        <span class="st-n">${n.count()}</span>
      </button>`
  ).join('');
  nav.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach((b) =>
    b.addEventListener('click', () => selectCollection(b.dataset.c as Collection))
  );
}

function ADD_ROW(id: string, label: string): string {
  return `<li class="st-list-add"><button type="button" id="${id}" title="${label}" aria-label="${label}">＋ ${label}</button></li>`;
}

function unsaved(entry: { path: string }): string {
  return isStagedNew(entry) ? ' · <span class="st-tag-sub">未保存</span>' : '';
}

function renderList(): void {
  const box = $('#st-list');
  const title = $('#st-list-title');
  if (!box || !title) return;

  if (state.collection === 'posts') {
    const list = state.posts.filter((p) => !isStagedGone(p));
    title.innerHTML = `<span>CHRONICLE // 共 ${list.length} 篇</span>`;
    box.innerHTML = postListHtml(ADD_ROW('st-new-post', '新建文章草稿'));
    $('#st-new-post')?.addEventListener('click', () => createNewPost());
    wirePostList(box, renderList);
  } else if (state.collection === 'walls') {
    const list = state.walls.filter((w) => !isStagedGone(w));
    title.innerHTML = `<span>ALBUMS // 共 ${list.length} 组照片墙</span>`;
    box.innerHTML = `<ul class="st-list">${ADD_ROW('st-new-wall', '新建照片墙')}${list
      .map(
        (w) => `<li${state.justAdded === w.id ? ' class="is-new"' : ''}><button type="button" data-id="${esc(w.id)}" aria-current="${
          state.selected === w.id
        }">
          <span class="st-line"><span class="st-date">${esc(w.date || '无日期')}</span><span class="st-name">${esc(
            w.title || '（未填标题）'
          )}</span></span>
          <span class="st-sub">${w.photos.length} 张影像${w.place ? ` · ${esc(w.place)}` : ''}${unsaved(w)}</span>
        </button></li>`
      )
      .join('')}</ul>`;
    $('#st-new-wall')?.addEventListener('click', () => createNewWall());
  } else if (state.collection === 'programs') {
    title.innerHTML = `<span>WORKBENCH // 程序工坊</span>`;
    const prog = (((state.draft.site ?? state.site?.data ?? {}) as Record<string, unknown>).programs ?? {}) as Record<string, unknown>;
    const mods = Array.isArray(prog.modules) ? (prog.modules as Array<Record<string, unknown>>) : [];
    box.innerHTML = `<ul class="st-list">
      <li><button type="button" data-id="console" aria-current="true">
        <span class="st-line"><span class="st-date">CORE</span><span class="st-name">主力引擎与模块插槽</span></span>
        <span class="st-sub">1 控制台 + ${mods.length} 个实验模块</span>
      </button></li>
    </ul>`;
  } else if (state.collection === 'links') {
    title.innerHTML = `<span>PEERS // 共 ${state.links?.links.length ?? 0} 个友链</span>`;
    box.innerHTML = `<ul class="st-list">${(state.links?.links ?? [])
      .map(
        (l, i) => `<li><button type="button" data-id="${i}" aria-current="${state.selected === String(i)}">
          <span class="st-line"><span class="st-date">${esc(l.avatar || (l.name || '友').slice(0, 1))}</span><span class="st-name">${esc(
            l.name || '（未命名）'
          )}</span></span>
          <span class="st-sub">${esc(l.tag ? `${l.tag} · ` : '')}${esc(l.url.replace(/^https?:\/\//, ''))}</span>
        </button></li>`
      )
      .join('')}</ul>`;
  } else {
    title.innerHTML = `<span>SITE &amp; RAIL // 站点定制</span>`;
    box.innerHTML = `<ul class="st-list">
      <li><button type="button" data-id="site" aria-current="${state.selected === 'site' || !state.selected}">
        <span class="st-line"><span class="st-date">01</span><span class="st-name">全局站点与导航</span></span>
        <span class="st-sub">站名 / 签名 / 导航栏 / 辉光管</span>
      </button></li>
      <li><button type="button" data-id="home" aria-current="${state.selected === 'home'}">
        <span class="st-line"><span class="st-date">02</span><span class="st-name">主页五屏与流形引擎</span></span>
        <span class="st-sub">首屏介绍 / 方程 / 粒子数 / 四象限</span>
      </button></li>
      <li><button type="button" data-id="dossier" aria-current="${state.selected === 'dossier'}">
        <span class="st-line"><span class="st-date">03</span><span class="st-name">关于我与建站说明志</span></span>
        <span class="st-sub">个人档案 / 友链名片 / 四卡说明志</span>
      </button></li>
      <li><button type="button" data-id="rail" aria-current="${state.selected === 'rail'}">
        <span class="st-line"><span class="st-date">04</span><span class="st-name">文章右侧悬浮栏定制</span></span>
        <span class="st-sub">文档速查卡 / 拓扑图 / 自定义悬浮卡</span>
      </button></li>
    </ul>`;
  }

  box.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) =>
    b.addEventListener('click', () => selectEntry(b.dataset.id ?? ''))
  );
}

function selectEntry(id: string): void {
  if (state.selected === id) return;
  if (!settleLeaving()) return;
  state.selected = id;
  if (state.collection === 'posts' || state.collection === 'walls') {
    state.draft.post = undefined;
    state.draft.wall = undefined;
  }
  renderApp();
}

/* --------------------------------------------------------------------------
   三栏骨架与渲染
   -------------------------------------------------------------------------- */
function renderShell(): void {
  const main = $('#st-main');
  if (!main || $('#st-app')) return;
  main.innerHTML = `
    <div class="st-app" id="st-app">
      <div class="st-col st-col--nav">
        <div class="st-col-inner">
          <div class="st-panel-title" id="st-list-title"></div>
          <div id="st-list"></div>
        </div>
      </div>
      <div class="st-col st-col--edit" id="st-edit"></div>
      <div class="st-col st-col--preview" id="st-preview"></div>

      <button class="st-col-handle st-col-handle--nav" id="st-nav-handle" aria-pressed="false"><span data-col-icon aria-hidden="true">‹</span></button>
    </div>
    <div id="st-fab-host"></div>`;

  $('#st-nav-handle')?.addEventListener('click', () => setColHidden('nav', !colHidden('nav')));

  const fabHost = $('#st-fab-host');
  if (fabHost) {
    fab = mountFab(fabHost, {
      available: () => state.collection === 'posts' && !!state.draft.post,
      preview: () => previewCurrentPost(),
    });
  }
}

let fab: FabHandle | null = null;

function renderApp(): void {
  renderShell();

  const third = $('#st-preview');
  if (third) {
    const isPosts = state.collection === 'posts';
    third.classList.toggle('st-col--tools', isPosts);
    third.classList.toggle('st-col--preview', !isPosts);
  }

  applyCols();
  renderBar();
  renderNav();
  renderList();

  if (state.collection === 'posts') renderPostView();
  else if (state.collection === 'walls') renderWallView();
  else if (state.collection === 'programs') renderProgramsView();
  else if (state.collection === 'links') renderLinksView();
  else renderSiteView();

  fab?.sync();
}

/* --------------------------------------------------------------------------
   保存
   -------------------------------------------------------------------------- */
async function flushStaged(gh: Github, skip: string[]): Promise<void> {
  for (const e of state.staged.added) {
    if (skip.includes(e.path)) continue;
    if (isPost(e)) await savePost(gh, e, {}, e.parsed.body);
    else await saveWall(gh, e);
  }
  for (const e of stagedDeletes()) {
    if (isPost(e)) await deletePost(gh, e);
    else await deleteWall(gh, e);
  }
}

async function saveCurrent(): Promise<void> {
  if (!state.dirty) return;

  // 演示模式下直接合并内存草稿并提示成功
  if (state.demoMode || !state.gh) {
    foldStagedPostDraft();
    foldStagedWallDraft();
    if (state.draft.site && state.site) {
      state.site.data = JSON.parse(JSON.stringify(state.draft.site));
    }
    clearStaged();
    state.dirty = false;
    const btn = $<HTMLButtonElement>('#st-save');
    if (btn) btn.disabled = true;
    renderApp();
    toast('已保存当前全部修改（UI 交互演示模式 · 内存状态已同步更新）');
    return;
  }

  const gh = state.gh;
  setBusy(true, '提交中…');
  try {
    const written: string[] = [];

    if (state.collection === 'posts') {
      const entry = state.draft.post?.entry;
      if (!(await savePostCurrent(gh))) return;
      if (entry && isStagedNew(entry)) written.push(entry.path);
    } else if (state.collection === 'walls') {
      const wall = state.draft.wall;
      await saveWallCurrent(gh);
      if (wall && isStagedNew(wall)) written.push(wall.path);
    } else if (state.collection === 'links' && state.links) {
      await saveLinks(gh, state.links);
    } else if ((state.collection === 'site' || state.collection === 'programs') && state.draft.site) {
      await saveSite(gh, { sha: state.site?.sha ?? '', data: state.draft.site });
    }

    await flushStaged(gh, written);
    clearStaged();
    state.dirty = false;
    const btn = $<HTMLButtonElement>('#st-save');
    if (btn) btn.disabled = true;

    const keep = state.selected;
    await loadAll();
    if (keep && state.selected !== keep) {
      state.selected = keep;
      renderApp();
    }

    toast('已保存到数据库，页面会立即更新');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */
async function boot(): Promise<void> {
  // 支持 URL 带 ?demo=1 直接进入免密 UI 交互工作台
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1') {
    enterDemoMode();
    return;
  }

  // 已有会话就直接进工作台；否则显示登录页
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = (await res.json()) as { user: { username: string }; csrf: string };
      state.user = data.user.username;
      state.csrf = data.csrf;
      state.gh = new ApiGithub(data.csrf);
      await loadAll();
      return;
    }
  } catch {
    // 网络错误也退回登录页
  }
  renderUnlock();
}

registerHooks({ render: renderApp, reload: loadAll, settle: settleLeaving, dirty: renderBar });

// 关闭标签页 / 刷新浏览器时的最后一道保险。浏览器只显示通用文案，无法自定义。
window.addEventListener('beforeunload', (e) => {
  if (state.demoMode || !hasUnsavedWork()) return;
  // 现代浏览器用 preventDefault 即可触发确认框（returnValue 已废弃）。
  e.preventDefault();
});

void boot();

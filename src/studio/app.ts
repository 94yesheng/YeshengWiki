/**
 * 后台应用（外壳）—— HUD 蓝图画布体系重构版
 *
 * 1. 顶栏与全站前台展示页（.site-nav-bar）完全统一：.nav-left-cluster + .nav-brand + .site-nav (.site-nav-link 带 00..06 编号与底部 1.5px 理性橙指示条) + .nav-right-cluster；
 * 2. 七大板块：00 文章 · 01 相册 · 02 项目 · 03 友链 · 04 媒体库 · 05 页面 · 06 设置；
 * 3. 全部读写走 `/api/*`，直接落本地 SQLite 数据库。
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
import { renderUnlock } from './views/login';
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
import { renderMediaView } from './views/media';
import {
  renderPagesView,
  PAGE_GROUPS,
  pagesDirty,
  pagesDiscard,
  pagesReload,
  savePagesValues,
} from './views/pages';
import { renderProgramsView } from './views/programs';
import { renderSiteView, siteDraftDirty } from './views/site';
import { isDark, toggleTheme } from '../utils/theme';
import type { Github } from './github';

/* --------------------------------------------------------------------------
   载入
   -------------------------------------------------------------------------- */
async function loadAll(): Promise<void> {
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
      : state.collection === 'media' ? null
      : state.collection === 'pages' ? (PAGE_GROUPS.some((group) => group.key === state.selected) ? state.selected : 'home')
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
  { key: 'nav', name: '左栏导航面板', handle: '#st-nav-handle' },
  { key: 'tools', name: '右栏工具与伴读面板', handle: '#st-tools-handle' },
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
    const hidden = colHidden(key);
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
   顶栏（与前台 .site-nav-bar 样式完全统一）
   -------------------------------------------------------------------------- */
function renderBar(): void {
  const bar = $('#st-bar');
  if (!bar) return;
  const dark = isDark();
  bar.classList.add('site-nav-bar');
  bar.innerHTML = `
    <div class="st-bar-left nav-left-cluster">
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
        <span class="nav-brand-coord">STUDIO // 96REM</span>
      </a>
      <nav class="st-nav site-nav" id="st-nav" aria-label="后台管理板块"></nav>
    </div>
    <div class="st-bar-right nav-right-cluster">
      ${state.dirty ? '<span class="st-dirty-badge"><span class="st-dirty-dot"></span>有未保存修改</span>' : ''}
      <div class="nav-telemetry-pill st-meta-badge">
        <span class="nav-dot"></span>
        <span>LOCAL${state.user ? ` · ${esc(state.user)}` : ''}</span>
      </div>
      <button type="button" class="st-btn nav-scale-btn" id="st-theme-btn" title="切换白天 / 夜间模式">
        ${dark ? 'DAY // 昼' : 'NIGHT // 夜'}
      </button>
      <button type="button" class="st-btn nav-scale-btn" id="st-refresh" ${state.busy ? 'disabled' : ''}>刷新</button>
      <button type="button" class="st-btn st-btn--primary" id="st-save" ${state.dirty ? '' : 'disabled'}>保存</button>
      <button type="button" class="st-btn nav-scale-btn" id="st-lock">锁定</button>
    </div>`;

  $('#st-theme-btn')?.addEventListener('click', () => {
    toggleTheme();
    renderBar();
    fab?.sync();
  });

  $('#st-refresh')?.addEventListener('click', async () => {
    if (!settleLeaving()) return;
    if (state.collection === 'pages') pagesDiscard();
    discardStaged();
    await loadAll();
    if (state.collection === 'pages') await pagesReload();
  });

  $('#st-save')?.addEventListener('click', () => void saveCurrent());

  $('#st-lock')?.addEventListener('click', () => {
    if (!settleLeaving()) return;
    if (state.collection === 'pages') pagesDiscard();
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    forgetSession();
    renderUnlock('已锁定会话');
  });

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
  { key: 'media', label: '媒体库', count: () => state.media.length },
  { key: 'pages', label: '页面', count: () => 5 },
  { key: 'site',  label: '设置', count: () => 2 },
];

function hasUnsavedWork(): boolean {
  if (state.collection === 'pages') return pagesDirty() || siteDraftDirty();
  if (!state.dirty) return false;
  if (state.collection === 'media') return false;
  if (state.collection === 'posts' && state.draft.post) return postDraftEdited();
  if (state.collection === 'walls' && state.draft.wall) return wallDraftEdited();
  return true;
}

function settleLeaving(): boolean {
  foldStagedPostDraft();
  foldStagedWallDraft();
  if (!hasUnsavedWork()) return true;
  return window.confirm('有未保存的修改，离开后这些修改会丢失。确定继续吗？');
}

function selectCollection(c: Collection): void {
  if (c === state.collection) return;
  if (!settleLeaving()) return;
  if (state.collection === 'pages') pagesDiscard();
  state.collection = c;
  state.selected =
    c === 'posts'    ? (state.posts[0]?.id ?? null)
    : c === 'walls'  ? (state.walls[0]?.id ?? null)
    : c === 'links'  ? (state.links?.links.length ? '0' : null)
    : c === 'programs' ? 'console'
    : c === 'media'  ? null
    : c === 'pages'  ? 'home'
    : 'site';
  state.draft = {};
  state.dirty = false;
  renderApp();
}

function renderNav(): void {
  const nav = $('#st-nav');
  if (!nav) return;
  nav.innerHTML = NAV.map((n, idx) => {
    const isCurrent = state.collection === n.key;
    const idxStr = String(idx).padStart(2, '0');
    return `<button type="button" class="site-nav-link" data-c="${n.key}" aria-current="${isCurrent ? 'true' : 'false'}">
      <span class="nav-idx">${idxStr}</span>
      <span>${n.label}</span>
      <span class="st-n">${n.count()}</span>
    </button>`;
  }).join('');
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
  } else if (state.collection === 'media') {
    const files = state.media.length;
    const owners = new Set(state.media.map((m) => m.owner ?? '')).size;
    title.innerHTML = `<span>MEDIA // 共 ${files} 个文件</span>`;
    box.innerHTML = `<p class="st-media-nav-note">图片按文章 slug 归档，${owners} 个分组；缩略图与删除操作在中间栏。删除立即生效，无需保存。</p>`;
  } else if (state.collection === 'pages') {
    title.innerHTML = `<span>PAGES // 5 个站点页面</span>`;
    box.innerHTML = `<ul class="st-list">${PAGE_GROUPS.map(
      (group, i) => `<li><button type="button" data-id="${group.key}" aria-current="${state.selected === group.key}">
        <span class="st-line"><span class="st-date">${String(i + 1).padStart(2, '0')}</span><span class="st-name">${group.label}</span></span>
        <span class="st-sub">${group.sub}</span>
      </button></li>`
    ).join('')}</ul>`;
  } else {
    title.innerHTML = `<span>SITE // 站点设置</span>`;
    box.innerHTML = `<ul class="st-list">
      <li><button type="button" data-id="site" aria-current="${state.selected === 'site' || !state.selected}">
        <span class="st-line"><span class="st-date">01</span><span class="st-name">全局站点与导航</span></span>
        <span class="st-sub">站名 / 签名 / 导航栏 / 辉光管</span>
      </button></li>
      <li><button type="button" data-id="account" aria-current="${state.selected === 'account'}">
        <span class="st-line"><span class="st-date">02</span><span class="st-name">账户与安全</span></span>
        <span class="st-sub">修改登录账号 / 密码 / 会话</span>
      </button></li>
    </ul>`;
  }

  if (state.collection === 'pages') {
    box.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.id ?? '';
        if (!id || state.selected === id) return;
        state.selected = id;
        renderApp();
      })
    );
    return;
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

      <button type="button" class="st-col-handle st-col-handle--nav" id="st-nav-handle" aria-pressed="false"><span data-col-icon aria-hidden="true">‹</span></button>
      <button type="button" class="st-col-handle st-col-handle--tools" id="st-tools-handle" aria-pressed="false"><span data-col-icon aria-hidden="true">›</span></button>
    </div>
    <div id="st-fab-host"></div>`;

  $('#st-nav-handle')?.addEventListener('click', () => setColHidden('nav', !colHidden('nav')));
  $('#st-tools-handle')?.addEventListener('click', () => setColHidden('tools', !colHidden('tools')));

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
  else if (state.collection === 'media') renderMediaView();
  else if (state.collection === 'pages') renderPagesView();
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
  if (state.collection === 'media') return;

  if (!state.gh) {
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
    toast('会话已失效，修改只同步到当前页面内存；请重新登录后再保存');
    return;
  }

  const gh = state.gh;
  const isPages = state.collection === 'pages';
  setBusy(true, '提交中…');
  try {
    const written: string[] = [];

    if (isPages) {
      await savePagesValues();
      if (siteDraftDirty() && state.draft.site) {
        await saveSite(gh, { sha: state.site?.sha ?? '', data: state.draft.site });
      }
    } else if (state.collection === 'posts') {
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

    if (isPages) {
      await pagesReload();
      toast('已保存');
    } else {
      toast('已保存到数据库，页面会立即更新');
    }
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

window.addEventListener('beforeunload', (e) => {
  if (!hasUnsavedWork()) return;
  e.preventDefault();
});

void boot();

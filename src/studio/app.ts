/**
 * 后台应用（外壳）
 *
 * 这里只留"骨架"这一层：登录 → 拉取全部内容 → 三栏（列表 / 编辑 / 预览）→
 * 顶栏 / 导航 / 列表 → 按集合分发到各视图 → 保存的分发 → 启动。
 * 各集合的具体界面在 views/*.ts，共享状态在 state.ts，界面小工具在 ui.ts。
 *
 * 两条贯穿全局的原则：
 *   1. **保存只写一个文件**，而且 frontmatter 里没动过的字段原样保留（见 frontmatter.ts）
 *   2. **保存后重新拉一次那个文件**，用服务端的真实结果刷新界面 —— 既确认写成功，
 *      也拿到新的 sha，避免下一次保存因为 sha 过期而被拒
 *
 * 安全上的注意：令牌只存在内存里（刷新即失效）。这个页面不加载任何第三方脚本
 * （这正是后台不挂 CDN 的原因），所以同源脚本只有我们自己；但**别在公用电脑上登录**。
 */
import { listPhotoFiles, loadLinks, loadPosts, loadSite, loadWalls, saveLinks, saveSite } from './content';
import { fetchVault, takeLegacyToken } from './vault';
import { forgetSession, registerHooks, REPO, state, type Collection } from './state';
import { $, esc, reportError, setBusy, toast } from './ui';
import { mountFab, type FabHandle } from './fab';
import { renderNoVault, renderUnlock } from './views/login';
import { createNewPost, previewCurrentPost, renderPostView, savePostCurrent } from './views/posts';
import { createNewWall, renderWallView, saveWallCurrent } from './views/walls';
import { renderLinksView } from './views/links';
import { renderSiteView } from './views/site';

/* --------------------------------------------------------------------------
   载入
   -------------------------------------------------------------------------- */
async function loadAll(): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  setBusy(true, '读取仓库…');
  try {
    const [posts, walls, links, site, photoFiles] = await Promise.all([
      loadPosts(gh),
      loadWalls(gh),
      loadLinks(gh),
      loadSite(gh),
      listPhotoFiles(gh),
    ]);
    state.posts = posts;
    state.walls = walls;
    state.links = links;
    state.site = site;
    state.photoFiles = photoFiles.map((f) => f.name);
    // 默认选中第一项 —— 否则进来是一片空白，看着像坏了
    state.selected =
      state.collection === 'posts' ? (posts[0]?.id ?? null)
      : state.collection === 'walls' ? (walls[0]?.id ?? null)
      : null;
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

/** 每一栏的名字与把手，界面文案也在这儿统一 */
const COLS: Array<{ key: Col; name: string; handle: string }> = [
  { key: 'nav', name: '左栏', handle: '#st-nav-handle' },
  { key: 'tools', name: '格式面板', handle: '#st-tools-handle' },
];

/**
 * 只记"收起没收起"这一个偏好。放在 localStorage 而不是 site.data.json ——
 * 它是**这台机器上这个人的界面习惯**，不是站点内容，为它提交一次仓库没道理。
 */
const colKey = (col: Col) => `studio.col.${col}`;

function colHidden(col: Col): boolean {
  try {
    return localStorage.getItem(colKey(col)) === 'hidden';
  } catch {
    return false; // 隐私模式读不了 localStorage —— 那就当没收起
  }
}

/** 把两栏的收起状态落到界面上（骨架可能刚被重建过，所以每次重画都要调） */
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

    // 箭头指向"点下去会往哪边动"：左栏收起时朝右（展开回来），右栏正好相反
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
    /* 记不住就只是记不住，本次照样生效 */
  }
  applyCols();
}

/* --------------------------------------------------------------------------
   顶栏
   -------------------------------------------------------------------------- */
function renderBar(): void {
  const bar = $('#st-bar');
  if (!bar) return;
  bar.innerHTML = `
    <h1>夜笙的小世界</h1>
    <span class="st-tag">后台</span>
    <span class="st-meta">${esc(REPO.owner)}/${esc(REPO.repo)} · ${esc(REPO.branch)}${
      state.user ? ` · ${esc(state.user)}` : ''
    }</span>
    <span class="st-spacer"></span>
    <button class="st-btn" id="st-refresh" ${state.busy ? 'disabled' : ''}>重新读取</button>
    <button class="st-btn st-btn--primary" id="st-save" ${state.dirty ? '' : 'disabled'}>保存</button>
    ${state.vault ? '<button class="st-btn" id="st-lock">锁定</button>' : ''}`;
  $('#st-refresh')?.addEventListener('click', () => void loadAll());
  $('#st-save')?.addEventListener('click', () => void saveCurrent());

  // 锁定：令牌从内存里丢掉，回到解锁页（站点上的密文还在，输账密即可再进）
  // 没有单独的"退出" —— 账密模型下两者是同一件事，本机不留任何凭据要清
  $('#st-lock')?.addEventListener('click', () => {
    if (state.dirty && !confirm('有未保存的改动，确定锁定并丢弃吗？')) return;
    forgetSession();
    renderUnlock('已锁定');
  });
}

/* --------------------------------------------------------------------------
   集合导航与列表
   -------------------------------------------------------------------------- */
const NAV: Array<{ key: Collection; label: string; count: () => number }> = [
  { key: 'posts', label: '文章', count: () => state.posts.length },
  { key: 'walls', label: '照片墙', count: () => state.walls.length },
  { key: 'links', label: '友链', count: () => (state.links?.links.length ?? 0) },
  { key: 'site', label: '站点', count: () => (state.site ? 2 : 0) },
];

function confirmDiscard(): boolean {
  return !state.dirty || confirm('有未保存的改动，确定丢弃吗？');
}

function selectCollection(c: Collection): void {
  if (c === state.collection) return;
  if (!confirmDiscard()) return;
  state.collection = c;
  // 切过去就选中第一项 —— 否则右半边是一片空白，看着像坏了
  state.selected =
    c === 'posts' ? (state.posts[0]?.id ?? null)
    : c === 'walls' ? (state.walls[0]?.id ?? null)
    : c === 'links' ? (state.links?.links.length ? '0' : null)
    : 'site';
  state.draft = {};
  state.dirty = false;
  renderApp();
}

function renderNav(): void {
  const nav = $('#st-nav');
  if (!nav) return;
  nav.innerHTML = NAV.map(
    (n) =>
      `<button data-c="${n.key}" aria-current="${state.collection === n.key}">${n.label}<span class="st-n"> ${n.count()}</span></button>`
  ).join('');
  nav.querySelectorAll<HTMLButtonElement>('button[data-c]').forEach((b) =>
    b.addEventListener('click', () => selectCollection(b.dataset.c as Collection))
  );
}

/**
 * 列表最上面那一行：一个「＋」，点一下就新建。
 *
 * 原来是标题栏右边的「新建」按钮（点开还弹两个 prompt 问标题和文件名）。挪进来是因为
 * 它本来就该是"列表里的第一行" —— 新条目加在哪儿、长什么样，一眼就看得见。
 * 它是 `<li>` 而不是按钮包一层壳：这样和下面每一条走的是同一套行样式（高度、分隔线、悬停底）。
 */
function ADD_ROW(id: string, label: string): string {
  return `<li class="st-list-add"><button id="${id}" title="${label}" aria-label="${label}">＋</button></li>`;
}

function renderList(): void {
  const box = $('#st-list');
  const title = $('#st-list-title');
  if (!box || !title) return;

  if (state.collection === 'posts') {
    title.innerHTML = `<span>共 ${state.posts.length} 篇</span>`;
    box.innerHTML = `<ul class="st-list">${ADD_ROW('st-new-post', '新建文章')}${state.posts
      .map((p) => {
        const d = p.parsed.data;
        const draft = d.draft === true;
        return `<li${state.justAdded === p.id ? ' class="is-new"' : ''}><button data-id="${esc(p.id)}" aria-current="${
          state.selected === p.id
        }">
          <span class="st-line"><span class="st-date">${esc(d.pubDate ?? '无日期')}</span><span class="st-name">${esc(
            d.title ?? p.id
          )}${draft ? ' <span class="st-sub">（草稿）</span>' : ''}</span></span>
          <span class="st-sub">${esc(Array.isArray(d.tags) ? (d.tags as string[]).join(' · ') : '无标签')}</span>
        </button></li>`;
      })
      .join('')}</ul>${state.posts.length ? '' : '<p class="st-empty">还没有文章。</p>'}`;
    $('#st-new-post')?.addEventListener('click', () => void createNewPost());
  } else if (state.collection === 'walls') {
    title.innerHTML = `<span>共 ${state.walls.length} 面墙</span>`;
    box.innerHTML = `<ul class="st-list">${ADD_ROW('st-new-wall', '新建照片墙')}${state.walls
      .map(
        (w) => `<li${state.justAdded === w.id ? ' class="is-new"' : ''}><button data-id="${esc(w.id)}" aria-current="${
          state.selected === w.id
        }">
          <span class="st-line"><span class="st-date">${esc(w.date || '无日期')}</span><span class="st-name">${esc(
            w.title || '（未填标题）'
          )}</span></span>
          <span class="st-sub">${w.photos.length} 张${w.place ? ` · ${esc(w.place)}` : ''}</span>
        </button></li>`
      )
      .join('')}</ul>`;
    $('#st-new-wall')?.addEventListener('click', () => void createNewWall());
  } else if (state.collection === 'links') {
    title.textContent = `共 ${state.links?.links.length ?? 0} 条`;
    box.innerHTML = `<ul class="st-list">${(state.links?.links ?? [])
      .map(
        (l, i) => `<li><button data-id="${i}" aria-current="${state.selected === String(i)}">
          <span class="st-line"><span class="st-name">${esc(l.name || '（未命名）')}</span></span>
          <span class="st-sub">${esc(l.url.replace(/^https?:\/\//, ''))}</span>
        </button></li>`
      )
      .join('')}</ul>`;
  } else {
    title.textContent = '配置';
    box.innerHTML = `<ul class="st-list">
      <li><button data-id="site" aria-current="${state.selected === 'site'}"><span class="st-name">站点信息</span><span class="st-sub">站名 / 导航 / 描述</span></button></li>
      <li><button data-id="home" aria-current="${state.selected === 'home'}"><span class="st-name">主页文案</span><span class="st-sub">自我介绍 / 子页入口</span></button></li>
    </ul>`;
  }

  box.querySelectorAll<HTMLButtonElement>('button[data-id]').forEach((b) =>
    b.addEventListener('click', () => selectEntry(b.dataset.id ?? ''))
  );
}

function selectEntry(id: string): void {
  if (state.selected === id) return;
  if (!confirmDiscard()) return;
  state.selected = id;
  state.draft = {};
  state.dirty = false;
  renderApp();
}

/* --------------------------------------------------------------------------
   编辑区 / 预览区分发
   -------------------------------------------------------------------------- */

/**
 * 搭出三栏骨架。登录页会把 #st-main 整个换掉，所以登录成功后必须重建骨架，
 * 否则下面的 renderNav / renderList 找不到元素、界面会停在登录页（踩过）。
 */
function renderShell(): void {
  const main = $('#st-main');
  if (!main || $('#st-app')) return;
  main.innerHTML = `
    <div class="st-app" id="st-app">
      <div class="st-col st-col--nav">
        <div class="st-col-inner">
          <nav class="st-nav" id="st-nav"></nav>
          <div class="st-panel-title" id="st-list-title"></div>
          <div id="st-list"></div>
        </div>
      </div>
      <div class="st-col st-col--edit" id="st-edit"></div>
      <div class="st-col st-col--preview" id="st-preview"></div>

      <!-- 两个收放把手：绝对定位挂在 .st-app 的边缘上，所以某一栏收到 0 宽时它们还在 -->
      <button class="st-col-handle st-col-handle--nav" id="st-nav-handle" aria-pressed="false"><span data-col-icon aria-hidden="true">‹</span></button>
      <button class="st-col-handle st-col-handle--tools" id="st-tools-handle" aria-pressed="false"><span data-col-icon aria-hidden="true">›</span></button>
    </div>
    <div id="st-fab-host"></div>`;

  $('#st-nav-handle')?.addEventListener('click', () => setColHidden('nav', !colHidden('nav')));
  $('#st-tools-handle')?.addEventListener('click', () => setColHidden('tools', !colHidden('tools')));

  // 悬浮球挂在这里而不是 studio.astro 的静态骨架里：登录页会把 #st-main 整体换掉，
  // 挂外面会在登录页右下角留一个球。
  const fabHost = $('#st-fab-host');
  if (fabHost) {
    fab = mountFab(fabHost, {
      // 只有「文章」集合、且选了文章时才谈得上预览
      available: () => state.collection === 'posts' && !!state.draft.post,
      preview: () => previewCurrentPost(),
    });
  }
}

/** 右下角悬浮球；登录页会连同骨架一起被换掉，所以这里是可空的 */
let fab: FabHandle | null = null;

function renderApp(): void {
  renderShell();

  // 第三栏有两种身份：文章集合是「格式」工具面板，其它集合是各自的静态预览。
  // 分成两个类是因为窄屏那条规则**只藏预览、不藏工具面板** —— 否则工具栏会整个消失、
  // 窄屏下没有任何退路。
  const third = $('#st-preview');
  if (third) {
    const isPosts = state.collection === 'posts';
    third.classList.toggle('st-col--tools', isPosts);
    third.classList.toggle('st-col--preview', !isPosts);
  }

  // 收栏状态要在这里应用：renderShell 在骨架已存在时直接 return，不会重刷
  applyCols();

  renderBar();
  renderNav();
  renderList();
  if (state.collection === 'posts') renderPostView();
  else if (state.collection === 'walls') renderWallView();
  else if (state.collection === 'links') renderLinksView();
  else renderSiteView();

  fab?.sync();
}

/* --------------------------------------------------------------------------
   保存
   -------------------------------------------------------------------------- */
async function saveCurrent(): Promise<void> {
  const gh = state.gh;
  if (!gh || !state.dirty) return;
  setBusy(true, '提交中…');
  try {
    if (state.collection === 'posts') await savePostCurrent(gh);
    else if (state.collection === 'walls') await saveWallCurrent(gh);
    else if (state.collection === 'links' && state.draft.links) await saveLinks(gh, state.draft.links);
    else if (state.collection === 'site' && state.draft.site)
      await saveSite(gh, { sha: state.site?.sha ?? '', data: state.draft.site });

    state.dirty = false;
    const btn = $<HTMLButtonElement>('#st-save');
    if (btn) btn.disabled = true;
    toast('已提交到仓库。构建完成后线上就会更新（没配部署的话只进仓库）');
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
  // 先不渲染任何界面：页面里那段静态兜底提示（"正在载入后台…"）会一直显示到
  // 下面这次取密文结束 —— 本地请求很快，不会看到闪烁；
  // 也避免先闪一下"还没有配置"再跳到解锁页。

  // 更早的版本往浏览器里存过明文令牌。后台现在不接受令牌登录了，那个键留着也没用，
  // 顺手清掉（它是明文凭据，不该继续躺在你机器上）。不必打扰用户，记一行日志即可。
  if (takeLegacyToken()) console.info('[studio] 已清除本机残留的明文令牌');

  // 站点上有密文 → 解锁页；没有 → 提示去本机生成（后台没有令牌登录这条路）
  state.vault = await fetchVault();
  if (state.vault) renderUnlock();
  else renderNoVault();
}

// 把真正的「重画」和「重拉」注册进钩子：视图只调用 rerender()/reload()，
// 不必 import 这个文件（那会形成 app ⇄ 视图 的循环依赖）
// 注意顺序：**先注册钩子再启动** —— 反过来的话，首次 loadAll 里视图调的 rerender()
// 会落空（6909caf 拆分这个文件时 boot() 被留成了两行，踩过）。
registerHooks({ render: renderApp, reload: loadAll });

void boot();

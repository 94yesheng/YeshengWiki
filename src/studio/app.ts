/**
 * 后台应用
 *
 * 结构：登录 → 拉取全部内容 → 三栏（列表 / 编辑 / 预览）→ 保存时只提交改动的那个文件。
 *
 * 两条贯穿全局的原则：
 *   1. **保存只写一个文件**，而且 frontmatter 里没动过的字段原样保留（见 frontmatter.ts）
 *   2. **保存后重新拉一次那个文件**，用服务端的真实结果刷新界面 —— 既确认写成功，
 *      也拿到新的 sha，避免下一次保存因为 sha 过期而被拒
 *
 * 安全上的注意：令牌存在浏览器 localStorage 里。这个页面不加载任何第三方脚本
 * （这正是后台不挂 CDN 的原因），所以同源脚本只有我们自己；但**别在公用电脑上登录**。
 */
import { Github, GithubError } from './github';
import {
  createPost,
  createWall,
  deletePost,
  deleteWall,
  diffFields,
  listPhotoFiles,
  loadLinks,
  loadPosts,
  loadSite,
  loadWalls,
  newPostTemplate,
  POST_FIELDS,
  prepareImage,
  postTitle,
  saveLinks,
  savePost,
  saveSite,
  saveWall,
  uploadPhoto,
  type LinksFile,
  type PostEntry,
  type SiteFile,
  type WallEntry,
} from './content';
import { normalizeHtml, renderMarkdown } from './md';
import { createEditor, type EditorHandle } from './editor';
import { openPreview } from './preview';
import { chineseFullDate } from '../utils/date';
import { parsePost } from './frontmatter';
import { fetchVault, takeLegacyToken, unlockVault, type VaultBlob } from './vault';
import { site } from '../site.config';

/* --------------------------------------------------------------------------
   配置：仓库地址写死在这里（和 Sveltia 的 config.yml 是同一个值）
   -------------------------------------------------------------------------- */
const REPO = { owner: '94yesheng', repo: 'YeshengWiki', branch: 'main' };

/* --------------------------------------------------------------------------
   状态
   -------------------------------------------------------------------------- */
type Collection = 'posts' | 'walls' | 'links' | 'site';

interface Draft {
  /** 文章：字段缓冲 + 正文缓冲（正文的当前值由编辑器持有，body 是打开时的原文） */
  post?: { entry: PostEntry; fields: Record<string, unknown>; body: string; editor?: EditorHandle };
  wall?: WallEntry;
  links?: LinksFile;
  site?: Record<string, unknown>;
}

const state = {
  token: null as string | null,
  gh: null as Github | null,
  user: '',
  collection: 'posts' as Collection,
  selected: null as string | null,
  busy: false,
  dirty: false,
  posts: [] as PostEntry[],
  walls: [] as WallEntry[],
  links: null as LinksFile | null,
  site: null as SiteFile | null,
  photoFiles: [] as string[],
  draft: {} as Draft,
  /** 站点上的密文（没有就是 null —— 此时显示令牌登录页） */
  vault: null as VaultBlob | null,
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
};

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* --------------------------------------------------------------------------
   提示与忙碌态
   -------------------------------------------------------------------------- */
let toastTimer: number | undefined;
function toast(msg: string, isError = false): void {
  const box = $('#st-toast');
  if (!box) return;
  box.textContent = msg;
  box.classList.toggle('st-toast--err', isError);
  box.classList.add('st-show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box.classList.remove('st-show'), isError ? 6000 : 3200);
}

function setBusy(on: boolean, text = '处理中…'): void {
  state.busy = on;
  const old = $('#st-busy');
  if (old) old.remove();
  if (on) document.body.append(el('div', { id: 'st-busy', class: 'st-busy', text }));
}

function reportError(e: unknown): void {
  const msg = e instanceof GithubError ? `${e.message}${e.hint ? ` —— ${e.hint}` : ''}` : e instanceof Error ? e.message : String(e);
  toast(msg, true);
  console.error(e);
}

/* --------------------------------------------------------------------------
   登录：两种模式
     ① 加密记住 —— 用解锁密码把令牌加密后存在本机，以后只输密码
     ② 只在本次会话 —— 什么都不存，刷新就要重新粘
   -------------------------------------------------------------------------- */

/** 清空登录态并显示某个界面（顶栏也一并清掉，免得留一条空边线） */
function showOnly(html: string): void {
  const main = $('#st-main');
  const bar = $('#st-bar');
  if (bar) bar.innerHTML = '';
  if (main) main.innerHTML = html;
}

async function useToken(token: string, fromVault = false): Promise<void> {
  setBusy(true, '验证令牌…');
  try {
    const gh = new Github(token, REPO);
    const me = await gh.whoAmI();
    state.token = token;
    state.gh = gh;
    state.user = me.login;
    setBusy(false);
    await loadAll();
  } catch (e) {
    setBusy(false);
    state.token = null;
    state.gh = null;
    // 从密文解出来的令牌还被拒 → 多半是令牌本身失效/被撤销了，得重新生成一份密文
    if (fromVault) renderUnlock('解出来的令牌已经失效或被撤销了 —— 需要重新生成密文');
    else renderNoVault();
  }
}

/** 登录页顶部的站点标识 —— 用站点配置里的站名，改配置这里跟着变 */
function brandBlock(): string {
  return `
    <div class="st-brand">
      <div class="st-brand-name">${esc(site.title)}</div>
      <div class="st-brand-tag">后台</div>
    </div>`;
}

/**
 * 站点上还没有密文时的界面。
 * 后台**不接受令牌登录** —— 令牌只在你自己电脑上的生成器里用一次，不进这个界面。
 * 所以这里只说明"去哪里把密文建起来"。
 */
function renderNoVault(): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card">
        ${brandBlock()}
        <p class="st-login-note">还没有配置解锁口令。</p>
        <p class="st-login-note">在你自己电脑上的项目目录（<code>D:\\blog</code>）里运行
          <code>npm run vault</code>，按提示生成密文并提交推送，然后刷新这一页。</p>
      </div>
    </div>`);
}

function renderUnlock(message?: string): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card">
        ${brandBlock()}
        <label class="st-label" for="st-unlock-acct">账号</label>
        <input class="st-input" id="st-unlock-acct" autocomplete="off" spellcheck="false" />
        <label class="st-label" for="st-unlock-pw">密码</label>
        <input class="st-input" id="st-unlock-pw" type="password" autocomplete="current-password" />
        <button class="st-btn st-btn--primary st-btn--block" id="st-unlock-go">解锁</button>
        ${message ? `<p class="st-error">${esc(message)}</p>` : ''}
      </div>
    </div>`);

  const go = async () => {
    const blob = state.vault;
    if (!blob) return;
    const acct = $<HTMLInputElement>('#st-unlock-acct')?.value ?? '';
    const pw = $<HTMLInputElement>('#st-unlock-pw')?.value ?? '';
    if (!acct || !pw) return;
    setBusy(true, '解锁中…');
    try {
      const token = await unlockVault(blob, acct, pw);
      setBusy(false);
      await useToken(token, true);
    } catch {
      setBusy(false);
      // 账号错、密码错，都是同一个 AES-GCM 校验失败 —— 分不出来，也不该分
      renderUnlock('账号或密码不对');
    }
  };
  $('#st-unlock-go')?.addEventListener('click', () => void go());
  for (const sel of ['#st-unlock-acct', '#st-unlock-pw']) {
    $<HTMLInputElement>(sel)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void go();
    });
  }
}

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

/** 把当前会话的凭据从内存里丢掉（不动本机存的密文） */
function forgetSession(): void {
  state.token = null;
  state.gh = null;
  state.user = '';
  state.dirty = false;
  state.draft = {};
  state.posts = [];
  state.walls = [];
  state.links = null;
  state.site = null;
  state.selected = null;
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

function renderList(): void {
  const box = $('#st-list');
  const title = $('#st-list-title');
  if (!box || !title) return;

  if (state.collection === 'posts') {
    title.innerHTML = `<span>共 ${state.posts.length} 篇</span><button class="st-btn" id="st-new-post">新建</button>`;
    box.innerHTML = `<ul class="st-list">${state.posts
      .map((p) => {
        const d = p.parsed.data;
        const draft = d.draft === true;
        return `<li><button data-id="${esc(p.id)}" aria-current="${state.selected === p.id}">
          <span class="st-line"><span class="st-date">${esc(d.pubDate ?? '无日期')}</span><span class="st-name">${esc(
            d.title ?? p.id
          )}${draft ? ' <span class="st-sub">（草稿）</span>' : ''}</span></span>
          <span class="st-sub">${esc(Array.isArray(d.tags) ? (d.tags as string[]).join(' · ') : '无标签')}</span>
        </button></li>`;
      })
      .join('')}</ul>${state.posts.length ? '' : '<p class="st-empty">还没有文章。</p>'}`;
    $('#st-new-post')?.addEventListener('click', () => void createNewPost());
  } else if (state.collection === 'walls') {
    title.innerHTML = `<span>共 ${state.walls.length} 面墙</span><button class="st-btn" id="st-new-wall">新建</button>`;
    box.innerHTML = `<ul class="st-list">${state.walls
      .map(
        (w) => `<li><button data-id="${esc(w.id)}" aria-current="${state.selected === w.id}">
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
        <nav class="st-nav" id="st-nav"></nav>
        <div class="st-panel-title" id="st-list-title"></div>
        <div id="st-list"></div>
      </div>
      <div class="st-col st-col--edit" id="st-edit"></div>
      <div class="st-col st-col--preview" id="st-preview"></div>
    </div>`;
}

function renderApp(): void {
  renderShell();
  // 文章页不再有右侧预览栏（预览改成点按钮看真实页面），编辑区占满右侧
  const app = $('#st-app');
  if (app) app.classList.toggle('st-app--wide-edit', state.collection === 'posts');
  renderBar();
  renderNav();
  renderList();
  if (state.collection === 'posts') renderPostView();
  else if (state.collection === 'walls') renderWallView();
  else if (state.collection === 'links') renderLinksView();
  else renderSiteView();
}

function markDirty(): void {
  if (!state.dirty) {
    state.dirty = true;
    const btn = $<HTMLButtonElement>('#st-save');
    if (btn) btn.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   文章
   -------------------------------------------------------------------------- */
function currentPost(): PostEntry | null {
  return state.posts.find((p) => p.id === state.selected) ?? null;
}

function postDraft(): Draft['post'] {
  const entry = currentPost();
  if (!entry) return undefined;
  if (!state.draft.post || state.draft.post.entry.id !== entry.id) {
    state.draft.post = {
      entry,
      fields: {
        title: entry.parsed.data.title ?? '',
        pubDate: String(entry.parsed.data.pubDate ?? ''),
        description: entry.parsed.data.description ?? '',
        tags: [...(Array.isArray(entry.parsed.data.tags) ? (entry.parsed.data.tags as string[]) : [])],
        updatedDate: entry.parsed.data.updatedDate ? String(entry.parsed.data.updatedDate) : '',
        draft: entry.parsed.data.draft === true,
      },
      body: entry.parsed.body,
    };
  }
  return state.draft.post;
}

function renderPostView(): void {
  const edit = $('#st-edit');
  if (!edit) return;

  const d = postDraft();
  if (!d) {
    edit.innerHTML = '<p class="st-empty">左边选一篇文章，或者点「新建」。</p>';
    return;
  }

  const tags = (d.fields.tags as string[])
    .map((t) => `<span class="st-chip">${esc(t)}<button data-rm="${esc(t)}" title="移除">×</button></span>`)
    .join('');

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">${esc(d.fields.pubDate || '未填日期')} · ${esc(d.entry.path)}</div>
      <h2 id="st-live-title">${esc(d.fields.title)}</h2>
      <div class="st-head-actions">
        <button class="st-btn" id="st-preview-btn">按博客的样子预览</button>
        <span class="st-hint">打开一篇真实文章页，只把正文换成你现在的草稿</span>
      </div>
    </div>
    <div class="st-form">
      <div class="st-field"><label>标题</label><div>
        <input class="st-input" id="st-f-title" value="${esc(d.fields.title)}" />
      </div></div>
      <div class="st-field"><label>日期</label><div>
        <input class="st-input" id="st-f-date" value="${esc(d.fields.pubDate)}" style="max-width:10rem" />
        <div class="st-hint">格式 2026-03-09。决定文章在时间轴上的位置</div>
      </div></div>
      <div class="st-field"><label>标签</label><div>
        <div class="st-tags" id="st-tags">${tags}
          <input class="st-input" id="st-f-newtag" placeholder="＋ 加标签后回车" style="max-width:12rem" />
        </div>
      </div></div>
      <div class="st-field"><label>摘要</label><div>
        <textarea class="st-textarea" id="st-f-desc" rows="2">${esc(d.fields.description)}</textarea>
        <div class="st-hint">只用于 RSS 和搜索引擎，列表页不显示</div>
      </div></div>
      <div class="st-field"><label>修订于</label><div>
        <input class="st-input" id="st-f-updated" value="${esc(d.fields.updatedDate)}" style="max-width:10rem" placeholder="留空则不显示" />
      </div></div>
      <div class="st-field"><label>草稿</label><div class="st-check">
        <input type="checkbox" id="st-f-draft" ${d.fields.draft ? 'checked' : ''} />
        <span>打开后不出现在列表、RSS 和站点地图里（也不会生成页面）</span>
      </div></div>
    </div>
    <div class="st-editor-head">
      <span>正文</span>
      <span class="st-info">像写文档一样编辑；选中文字再用上面那排按钮加格式</span>
    </div>
    <div id="ed-host"></div>
    <div style="margin-top:var(--space-5);display:flex;gap:var(--space-2)">
      <button class="st-btn st-btn--danger" id="st-del-post">删除这篇文章</button>
    </div>`;

  // 字段绑定：只改草稿，不重画整个编辑区（否则输入框会失焦）
  const bindInput = (sel: string, key: string) =>
    $<HTMLInputElement>(sel)?.addEventListener('input', (e) => {
      d.fields[key] = (e.target as HTMLInputElement).value;
      markDirty();
      if (key === 'title') {
        const t = $('#st-live-title');
        if (t) t.textContent = String(d.fields.title ?? '');
      }
    });
  bindInput('#st-f-title', 'title');
  bindInput('#st-f-date', 'pubDate');
  bindInput('#st-f-desc', 'description');
  bindInput('#st-f-updated', 'updatedDate');

  $<HTMLInputElement>('#st-f-draft')?.addEventListener('change', (e) => {
    d.fields.draft = (e.target as HTMLInputElement).checked;
    markDirty();
  });
  $<HTMLInputElement>('#st-f-newtag')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Enter') return;
    const input = e.target as HTMLInputElement;
    const v = input.value.trim();
    if (v && !(d.fields.tags as string[]).includes(v)) {
      (d.fields.tags as string[]).push(v);
      markDirty();
      renderPostView();
    }
    input.value = '';
  });
  edit.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => {
      d.fields.tags = (d.fields.tags as string[]).filter((t) => t !== b.dataset.rm);
      markDirty();
      renderPostView();
    })
  );
  $('#st-del-post')?.addEventListener('click', () => void removePost(d.entry));

  // 预览：取一篇真实文章页当外壳，正文换成当前草稿
  $('#st-preview-btn')?.addEventListener('click', () => {
    const pubDate = String(d.fields.pubDate ?? '');
    const when = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? new Date(`${pubDate}T00:00:00`) : null;
    void openPreview({
      id: d.entry.id,
      title: String(d.fields.title ?? ''),
      dateText: when ? chineseFullDate(when) : '',
      bodyMarkdown: d.editor?.getMarkdown() ?? d.body,
      fallbackId: state.posts.find((p) => p.id !== d.entry.id)?.id ?? '',
    });
  });

  // 挂上所见即所得编辑器（正文不再裸露 Markdown）
  const host = $('#ed-host');
  if (host) {
    d.editor = createEditor(
      host,
      d.body,
      () => markDirty(),
      () => `相对路径，例如 ../../assets/posts/${d.entry.id}-01.png\n（图片文件放在 src/assets/posts/ 下）`
    );
  }
}

async function createNewPost(): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  const title = prompt('新文章的标题：');
  if (!title) return;
  const slug = prompt(
    '文件名（英文小写加连字符，决定网址，例如 my-first-post）：',
    title.replace(/[^\w一-龥]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'new-post'
  );
  if (!slug) return;
  if (state.posts.some((p) => p.id === slug)) {
    toast(`已经有一篇叫 ${slug} 的文章了`, true);
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  setBusy(true, '创建中…');
  try {
    await createPost(gh, slug, newPostTemplate(title, date, []));
    await loadAll();
    state.selected = slug;
    renderApp();
    toast('已创建');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

async function removePost(entry: PostEntry): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  if (!confirm(`确定删除「${postTitle(entry)}」？\n\n会从仓库删掉这个文件（git 历史里还能找回）。`)) return;
  setBusy(true, '删除中…');
  try {
    await deletePost(gh, entry);
    state.selected = null;
    state.draft = {};
    state.dirty = false;
    await loadAll();
    toast('已删除');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

/* --------------------------------------------------------------------------
   照片墙
   -------------------------------------------------------------------------- */
function currentWall(): WallEntry | null {
  return state.walls.find((w) => w.id === state.selected) ?? null;
}

function wallDraft(): WallEntry | undefined {
  const entry = currentWall();
  if (!entry) return undefined;
  if (!state.draft.wall || state.draft.wall.id !== entry.id) {
    state.draft.wall = JSON.parse(JSON.stringify(entry)) as WallEntry;
  }
  return state.draft.wall;
}

function renderWallView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview) return;

  const w = wallDraft();
  if (!w) {
    edit.innerHTML = '<p class="st-empty">左边选一面墙，或者点「新建」。</p>';
    preview.innerHTML = '';
    return;
  }

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">照片墙 · ${esc(w.path)}</div>
      <h2 id="st-live-title">${esc(w.title || '（未填标题）')}</h2>
      <div class="st-stats">${w.photos.length} 张照片</div>
    </div>
    <div class="st-form">
      <div class="st-field"><label>标题</label><div>
        <input class="st-input" id="st-w-title" value="${esc(w.title)}" placeholder="给这组照片起个名字" />
      </div></div>
      <div class="st-field"><label>时间</label><div>
        <input class="st-input" id="st-w-date" value="${esc(w.date)}" style="max-width:10rem" />
        <div class="st-hint">格式 2026-03-09，可留空。留空的墙排在时间轴最后</div>
      </div></div>
      <div class="st-field"><label>地点</label><div>
        <input class="st-input" id="st-w-place" value="${esc(w.place)}" placeholder="可留空" />
      </div></div>
      <div class="st-field"><label>记录</label><div>
        <textarea class="st-textarea" id="st-w-note" rows="4" placeholder="想留下的几句话，显示在照片页上，可留空">${esc(w.note)}</textarea>
      </div></div>
    </div>

    <div class="st-editor-head"><span>墙里的照片</span><span class="st-info">${w.photos.length} 张</span></div>
    <div class="st-photos" id="st-photos">
      ${
        w.photos.length
          ? w.photos
              .map(
                (p, i) => `<div class="st-photo-row">
                  <div>
                    <input class="st-input" data-cap="${i}" value="${esc(p.caption)}" placeholder="这一张的说明（可留空）" />
                    <div class="st-file">${esc(p.file)}</div>
                  </div>
                  <button class="st-btn st-btn--danger" data-rmphoto="${i}" title="从这面墙移除">移除</button>
                </div>`
              )
              .join('')
          : '<p class="st-empty">这面墙还没有照片。</p>'
      }
    </div>
    <div class="st-drop" id="st-drop">把图片拖到这里，或者 <button class="st-btn" id="st-pick-file">选择文件</button> 上传（会自动压到长边 2560px）</div>
    <input type="file" id="st-file" accept="image/*" multiple hidden />
    <div style="margin-top:var(--space-2)">
      <button class="st-btn" id="st-pick-existing">从已上传的图片里挑</button>
      <button class="st-btn st-btn--danger" id="st-del-wall" style="float:right">删除这面墙</button>
    </div>
    <div id="st-pick-box"></div>`;

  const bind = (sel: string, key: 'title' | 'date' | 'place' | 'note') =>
    $<HTMLInputElement>(sel)?.addEventListener('input', (e) => {
      w[key] = (e.target as HTMLInputElement).value;
      markDirty();
      const t = $('#st-live-title');
      if (t && key === 'title') t.textContent = w.title || '（未填标题）';
      renderWallPreview();
    });
  bind('#st-w-title', 'title');
  bind('#st-w-date', 'date');
  bind('#st-w-place', 'place');
  bind('#st-w-note', 'note');

  edit.querySelectorAll<HTMLInputElement>('[data-cap]').forEach((input) =>
    input.addEventListener('input', () => {
      const i = Number(input.dataset.cap);
      const p = w.photos[i];
      if (p) p.caption = input.value;
      markDirty();
      renderWallPreview();
    })
  );
  edit.querySelectorAll<HTMLButtonElement>('[data-rmphoto]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.rmphoto);
      const p = w.photos[i];
      if (!p) return;
      if (!confirm(`从这面墙移除「${p.file}」？\n\n只影响这面墙的清单，图片文件本身不会删。`)) return;
      w.photos.splice(i, 1);
      markDirty();
      renderWallView();
    })
  );

  $('#st-del-wall')?.addEventListener('click', () => void removeWall(w));
  $('#st-pick-file')?.addEventListener('click', () => $<HTMLInputElement>('#st-file')?.click());
  $('#st-file')?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) void uploadImages(w, Array.from(files));
  });
  $('#st-pick-existing')?.addEventListener('click', () => renderPickExisting(w));

  const drop = $('#st-drop');
  drop?.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('st-over');
  });
  drop?.addEventListener('dragleave', () => drop.classList.remove('st-over'));
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('st-over');
    const files = Array.from((e as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) void uploadImages(w, files);
  });

  renderWallPreview();
}

function renderPickExisting(w: WallEntry): void {
  const box = $('#st-pick-box');
  if (!box) return;
  const used = new Set(w.photos.map((p) => p.file));
  const free = state.photoFiles.filter((f) => !used.has(f));
  box.innerHTML = `<div class="st-pick">${
    free.length
      ? free.map((f) => `<button data-f="${esc(f)}">${esc(f)}</button>`).join('')
      : '<p class="st-empty">没有别的新图片了（都已在这面墙里）。</p>'
  }</div>`;
  box.querySelectorAll<HTMLButtonElement>('button[data-f]').forEach((b) =>
    b.addEventListener('click', () => {
      w.photos.push({ file: b.dataset.f ?? '', caption: '' });
      markDirty();
      renderWallView();
    })
  );
}

function renderWallPreview(): void {
  const box = $('#st-preview');
  const w = state.draft.wall;
  if (!box || !w) return;
  const meta = [w.date, w.place].filter(Boolean).join(' · ');
  box.innerHTML = `
    <p class="st-note">右边是这面墙在照片页上的样子（图片要等构建后才会真正显示，这里只列清单）。</p>
    <div class="st-preview">
      <h1 style="text-indent:0">${esc(w.title || '（未填标题）')}</h1>
      ${meta ? `<p style="text-indent:0;color:var(--muted);font-size:var(--text-xs)">${esc(meta)}</p>` : ''}
      ${w.note ? `<p>${esc(w.note)}</p>` : ''}
      <ul style="text-indent:0">
        ${w.photos
          .map((p) => `<li>${esc(p.file)}${p.caption ? ` —— ${esc(p.caption)}` : ''}</li>`)
          .join('')}
      </ul>
    </div>`;
}

async function uploadImages(w: WallEntry, files: File[]): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  setBusy(true, `压缩并上传 ${files.length} 张…`);
  try {
    for (const file of files) {
      const prepared = await prepareImage(file);
      const name = await uploadPhoto(gh, prepared, w.date, [...state.photoFiles, ...w.photos.map((p) => p.file)]);
      state.photoFiles.push(name);
      w.photos.push({ file: name, caption: '' });
      markDirty();
      toast(`${name}：${Math.round(prepared.originalBytes / 1024)}KB → ${Math.round(prepared.bytes.length / 1024)}KB，已上传。记得点保存`);
    }
    renderWallView();
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

async function createNewWall(): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  const title = prompt('新照片墙的标题（可以先留空，以后在后台填）：') ?? '';
  if (title === null) return;
  const id = prompt(
    '文件名（英文小写加连字符，例如 chongqing-2024）：',
    (title || 'new-wall').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'new-wall'
  );
  if (!id) return;
  if (state.walls.some((w) => w.id === id)) {
    toast(`已经有一面叫 ${id} 的墙了`, true);
    return;
  }
  const wall: WallEntry = { path: `src/content/photos/${id}.json`, sha: '', id, title, date: '', place: '', note: '', photos: [], extra: {} };
  setBusy(true, '创建中…');
  try {
    await createWall(gh, id, wall);
    await loadAll();
    state.selected = id;
    renderApp();
    toast('已创建');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

async function removeWall(wall: WallEntry): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  if (!confirm(`确定删除照片墙「${wall.title || wall.id}」？\n\n只删这个数据文件，照片本身不删。`)) return;
  setBusy(true, '删除中…');
  try {
    await deleteWall(gh, wall);
    state.selected = null;
    state.draft = {};
    state.dirty = false;
    await loadAll();
    toast('已删除');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

/* --------------------------------------------------------------------------
   友链
   -------------------------------------------------------------------------- */
function renderLinksView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview || !state.links) return;
  const links = state.links.links;

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">友链 · src/content/links.json</div>
      <h2>共 ${links.length} 条</h2>
      <div class="st-stats">顺序由页面按名称自动排序，这里不用管顺序</div>
    </div>
    <div class="st-form">
      ${links
        .map(
          (l, i) => `
        <div class="st-field"><label>第 ${i + 1} 条</label><div>
          <input class="st-input" data-k="name" data-i="${i}" value="${esc(l.name)}" placeholder="名称" style="margin-bottom:4px" />
          <input class="st-input" data-k="url" data-i="${i}" value="${esc(l.url)}" placeholder="https://..." style="margin-bottom:4px" />
          <input class="st-input" data-k="description" data-i="${i}" value="${esc(l.description)}" placeholder="描述（可留空）" style="margin-bottom:4px" />
          <input class="st-input" data-k="id" data-i="${i}" value="${esc(l.id)}" placeholder="标识（英文小写，唯一）" />
          <div style="margin-top:4px"><button class="st-btn st-btn--danger" data-del="${i}">删除这条</button></div>
        </div></div>`
        )
        .join('')}
    </div>
    <button class="st-btn" id="st-add-link">＋ 加一条友链</button>`;

  edit.querySelectorAll<HTMLInputElement>('[data-k]').forEach((input) =>
    input.addEventListener('input', () => {
      const i = Number(input.dataset.i);
      const k = input.dataset.k as 'name' | 'url' | 'description' | 'id';
      const item = links[i];
      if (item) item[k] = input.value;
      markDirty();
      renderLinksPreview();
    })
  );
  edit.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      links.splice(Number(b.dataset.del), 1);
      markDirty();
      renderApp();
    })
  );
  $('#st-add-link')?.addEventListener('click', () => {
    links.push({ id: `link-${Date.now().toString(36)}`, name: '', url: 'https://', description: '' });
    markDirty();
    renderApp();
  });

  renderLinksPreview();
}

function renderLinksPreview(): void {
  const box = $('#st-preview');
  if (!box) return;
  const links = state.links?.links ?? [];
  box.innerHTML = `<p class="st-note">右边是友链页卡片的样子。</p>
    <div class="st-preview">${links
      .map(
        (l) =>
          `<div style="text-indent:0;padding:var(--space-3) 0;border-bottom:1px solid var(--rule)">
            <div style="font-family:var(--kai);font-size:var(--text-md)">${esc(l.name || '（未命名）')}</div>
            <div style="color:var(--seal);font-size:var(--text-xs)">${esc(l.url)}</div>
            <div style="color:var(--muted);font-size:var(--text-xs)">${esc(l.description)}</div>
          </div>`
      )
      .join('')}</div>`;
}

/* --------------------------------------------------------------------------
   站点
   -------------------------------------------------------------------------- */
function siteDraft(): Record<string, unknown> {
  if (!state.draft.site) state.draft.site = JSON.parse(JSON.stringify(state.site?.data ?? {})) as Record<string, unknown>;
  return state.draft.site;
}

type Json = Record<string, unknown>;

function renderSiteView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview || !state.site) return;
  const data = siteDraft();
  const site = (data.site ?? {}) as Json;
  const home = (data.home ?? {}) as Json;
  const nav = Array.isArray(site.nav) ? (site.nav as Json[]) : [];
  const intro = Array.isArray(home.intro) ? (home.intro as string[]) : [];
  const sections = Array.isArray(home.sections) ? (home.sections as Json[]) : [];

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">站点与主页 · src/site.data.json</div>
      <h2>${esc(site.title ?? '')}</h2>
      <div class="st-stats">${esc(site.url ?? '')}</div>
    </div>
    <div class="st-form">
      <div class="st-field"><label>站点地址</label><div>
        <input class="st-input" data-p="site.url" value="${esc(site.url ?? '')}" />
        <div class="st-hint">换域名时必须改这里（RSS 与站点地图靠它拼链接）</div>
      </div></div>
      <div class="st-field"><label>站名</label><div><input class="st-input" data-p="site.title" value="${esc(site.title ?? '')}" /></div></div>
      <div class="st-field"><label>副标题</label><div><input class="st-input" data-p="site.tagline" value="${esc(site.tagline ?? '')}" /></div></div>
      <div class="st-field"><label>作者</label><div><input class="st-input" data-p="site.author" value="${esc(site.author ?? '')}" /></div></div>
      <div class="st-field"><label>描述</label><div><textarea class="st-textarea" data-p="site.description" rows="2">${esc(site.description ?? '')}</textarea></div></div>

      <div class="st-field"><label>主导航</label><div>
        ${nav
          .map(
            (n, i) => `<div style="display:flex;gap:var(--space-2);margin-bottom:6px">
              <input class="st-input" data-nav="${i}.label" value="${esc(n.label ?? '')}" style="max-width:9rem" />
              <input class="st-input" data-nav="${i}.href" value="${esc(n.href ?? '')}" />
            </div>`
          )
          .join('')}
        <div class="st-hint">加一个板块：这里加一行，另外在 src/pages/ 建对应页面</div>
      </div></div>

      <div class="st-field"><label>自我介绍</label><div>
        ${intro
          .map((t, i) => `<textarea class="st-textarea" data-intro="${i}" rows="2" style="margin-bottom:6px">${esc(t)}</textarea>`)
          .join('')}
        <div class="st-hint">每个段落一项</div>
      </div></div>

      <div class="st-field"><label>子页入口</label><div>
        ${sections
          .map(
            (s, i) => `<div style="display:flex;gap:var(--space-2);margin-bottom:6px">
              <input class="st-input" data-sec="${i}.title" value="${esc(s.title ?? '')}" style="max-width:6rem" />
              <input class="st-input" data-sec="${i}.href" value="${esc(s.href ?? '')}" style="max-width:8rem" />
              <input class="st-input" data-sec="${i}.desc" value="${esc(s.desc ?? '')}" />
            </div>`
          )
          .join('')}
        <div class="st-hint">顺序即主页上的显示顺序</div>
      </div></div>
    </div>`;

  const setPath = (root: Json, path: string, value: unknown) => {
    const [k, sub] = path.split('.');
    if (!k) return;
    if (!sub) {
      root[k] = value;
      return;
    }
    const target = (root[k] ?? {}) as Json;
    target[sub] = value;
    root[k] = target;
  };

  edit.querySelectorAll<HTMLInputElement>('[data-p]').forEach((input) =>
    input.addEventListener('input', () => {
      setPath(data, input.dataset.p ?? '', input.value);
      markDirty();
      renderSitePreview();
    })
  );
  edit.querySelectorAll<HTMLInputElement>('[data-nav]').forEach((input) =>
    input.addEventListener('input', () => {
      const [i, k] = (input.dataset.nav ?? '').split('.');
      const item = nav[Number(i)];
      if (item && k) item[k] = input.value;
      markDirty();
      renderSitePreview();
    })
  );
  edit.querySelectorAll<HTMLTextAreaElement>('[data-intro]').forEach((input) =>
    input.addEventListener('input', () => {
      intro[Number(input.dataset.intro)] = input.value;
      home.intro = intro;
      markDirty();
      renderSitePreview();
    })
  );
  edit.querySelectorAll<HTMLInputElement>('[data-sec]').forEach((input) =>
    input.addEventListener('input', () => {
      const [i, k] = (input.dataset.sec ?? '').split('.');
      const item = sections[Number(i)];
      if (item && k) item[k] = input.value;
      markDirty();
      renderSitePreview();
    })
  );

  renderSitePreview();
}

function renderSitePreview(): void {
  const box = $('#st-preview');
  if (!box) return;
  const data = state.draft.site ?? {};
  const site = (data.site ?? {}) as Json;
  const home = (data.home ?? {}) as Json;
  const nav = Array.isArray(site.nav) ? (site.nav as Json[]) : [];
  const intro = Array.isArray(home.intro) ? (home.intro as string[]) : [];
  const sections = Array.isArray(home.sections) ? (home.sections as Json[]) : [];
  box.innerHTML = `<p class="st-note">右边是主页结构的样子。</p>
    <div class="st-preview">
      <h1 style="text-align:center;text-indent:0">${esc(site.title ?? '')}</h1>
      <p style="text-align:center;text-indent:0;color:var(--muted);font-size:var(--text-xs);letter-spacing:.2em">${esc(
        site.tagline ?? ''
      )}</p>
      <p style="text-align:center;text-indent:0;color:var(--muted);font-size:var(--text-xs)">${nav
        .map((n) => esc(n.label ?? ''))
        .join(' · ')}</p>
      <hr />
      ${intro.map((t) => `<p>${esc(t)}</p>`).join('')}
      <hr />
      ${sections
        .map(
          (s) => `<div style="text-indent:0;padding:var(--space-3) 0;border-bottom:1px solid var(--rule)">
            <div style="font-size:var(--text-md)">${esc(s.title ?? '')}</div>
            <div style="color:var(--muted);font-size:var(--text-xs)">${esc(s.desc ?? '')}</div>
          </div>`
        )
        .join('')}
    </div>`;
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

async function savePostCurrent(gh: Github): Promise<void> {
  const d = state.draft.post;
  if (!d) return;
  const changed = diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]);
  const body = d.editor?.getMarkdown() ?? d.body;

  // 正文"其实没改"的判据：两边各自渲染成 HTML，语义比较。
  // 不能逐字节比 Markdown —— 富文本编辑器转回来的写法会被规整化（空行、缩进），
  // 那不叫改动。所以：渲染结果相同 → 保留**原文**，一个字节都不写。
  const bodySame = normalizeHtml(renderMarkdown(body)) === normalizeHtml(renderMarkdown(d.body));

  // 自检：把 Markdown 再渲染回来，和编辑器里看到的是不是一回事。
  // 万一有哪种格式"所见"转不成"所得"，在这里提醒一声 —— 不然会静默地改掉外观。
  if (d.editor && !bodySame) {
    const intended = normalizeHtml(d.editor.getHtml());
    const roundTripped = normalizeHtml(renderMarkdown(body, { forEditor: true }));
    if (intended !== roundTripped) {
      toast('注意：正文里有格式无法准确地转成 Markdown，保存后外观可能略有差异 —— 建议点「按博客的样子预览」确认', true);
    }
  }

  if (Object.keys(changed).length === 0 && bodySame) {
    toast('没有任何改动');
    return;
  }
  await savePost(gh, d.entry, changed, bodySame ? d.body : body);
  await refreshPost(d.entry.id);
}

/** 保存后重新拉这个文件：确认写入结果，并拿到新的 sha */
async function refreshPost(id: string): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  const entry = state.posts.find((p) => p.id === id);
  if (!entry) return;
  const remote = await gh.getFile(entry.path);
  if (!remote) return;
  const parsed = parsePost(remote.text);
  if (!parsed) return;
  entry.sha = remote.sha;
  entry.parsed = parsed;
  state.draft.post = {
    entry,
    fields: {
      title: parsed.data.title ?? '',
      pubDate: String(parsed.data.pubDate ?? ''),
      description: parsed.data.description ?? '',
      tags: [...(Array.isArray(parsed.data.tags) ? (parsed.data.tags as string[]) : [])],
      updatedDate: parsed.data.updatedDate ? String(parsed.data.updatedDate) : '',
      draft: parsed.data.draft === true,
    },
    body: parsed.body,
  };
  renderApp();
}

async function saveWallCurrent(gh: Github): Promise<void> {
  const w = state.draft.wall;
  if (!w) return;
  await saveWall(gh, w);
  await loadAll();
  state.selected = w.id;
  renderApp();
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

void boot();

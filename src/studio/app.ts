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
  buildPostText,
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
import { renderMarkdown, readingStats } from './md';
import { parsePost } from './frontmatter';
import { fetchVault, takeLegacyToken, unlockVault, VAULT_URL, type VaultBlob } from './vault';

/* --------------------------------------------------------------------------
   配置：仓库地址写死在这里（和 Sveltia 的 config.yml 是同一个值）
   -------------------------------------------------------------------------- */
const REPO = { owner: '94yesheng', repo: 'YeshengWiki', branch: 'main' };

/* --------------------------------------------------------------------------
   状态
   -------------------------------------------------------------------------- */
type Collection = 'posts' | 'walls' | 'links' | 'site';

interface Draft {
  /** 文章：字段缓冲 + 正文缓冲 */
  post?: { entry: PostEntry; fields: Record<string, unknown>; body: string };
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
    else renderLogin(e instanceof GithubError ? e.message : '登录失败');
  }
}

function renderLogin(message?: string, note?: string): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card">
        <h2>登录后台</h2>
        ${note ? `<p style="color:var(--seal)">${esc(note)}</p>` : ''}
        <p>后台直接读写 GitHub 上的私有仓库，不需要服务器。所以你要给它一个访问令牌。</p>
        <ol>
          <li>GitHub → 头像 → Settings → Developer settings</li>
          <li>Personal access tokens → <b>Fine-grained tokens</b> → Generate new token</li>
          <li>Repository access 选 <b>Only select repositories</b>，勾 <code>${esc(REPO.repo)}</code></li>
          <li>Permissions → Repository permissions → <b>Contents</b> 设为 <b>Read and write</b>。只想看不想改，就给 <b>Read-only</b></li>
          <li>生成后把那串令牌（<code>github_pat_...</code>）粘到下面</li>
        </ol>
        <input class="st-input" id="st-token" type="password" placeholder="github_pat_..." autocomplete="off" />
        ${message ? `<p style="margin-top:var(--space-3);color:var(--seal)">${esc(message)}</p>` : ''}

        <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2);align-items:center">
          <button class="st-btn st-btn--primary" id="st-login-go">登录</button>
          <span class="st-hint">令牌只发给 api.github.com，不经过任何第三方。别在公用电脑上登录。</span>
        </div>

        <div class="st-hint" style="margin-top:var(--space-5);border-top:1px solid var(--rule);padding-top:var(--space-3);line-height:1.9">
          <b>想以后只输账号密码？</b>在你自己电脑上跑 <code>node scripts/vault.mjs</code>：
          它会用你给的账号和密码，把令牌加密成一份密文，写进
          <code>public/studio/vault.json</code>。提交推送之后，任何设备打开后台都只需输账号和密码
          —— 密文放在站点上，生成留在本机，公网上不放"能生成密文的东西"。
        </div>
      </div>
    </div>`);

  const go = async () => {
    const token = $<HTMLInputElement>('#st-token')?.value.trim() ?? '';
    if (!token) return;
    await useToken(token);
  };
  $('#st-login-go')?.addEventListener('click', () => void go());
  $<HTMLInputElement>('#st-token')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void go();
  });
}

function renderUnlock(message?: string): void {
  showOnly(`
    <div class="st-login">
      <div class="st-card">
        <h2>解锁</h2>
        <p>站点上存着加密过的令牌（<code>${esc(VAULT_URL)}</code>）。输入账号和密码继续。</p>
        <input class="st-input" id="st-unlock-acct" placeholder="账号" autocomplete="off" style="margin-bottom:6px" />
        <div class="st-row">
          <input class="st-input" id="st-unlock-pw" type="password" placeholder="密码" autocomplete="current-password" />
          <button class="st-btn st-btn--primary" id="st-unlock-go">解锁</button>
        </div>
        ${message ? `<p style="margin-top:var(--space-3);color:var(--seal)">${esc(message)}</p>` : ''}
        <p class="st-hint" style="margin-top:var(--space-3)">
          两半都要对，大小写与空格必须和生成密文时完全一致 —— 它们是拼起来当钥匙用的，没有找回途径。
          密文本身是公开的（谁下载到都行），但**没有口令就解不开** —— 口令强度就是唯一的防线。
        </p>
        <p style="margin-top:var(--space-4)">
          忘了账号或密码，或者想换一个令牌？
          在你自己的电脑上跑 <code>node scripts/vault.mjs</code> 重新生成一份密文并提交。
          要用令牌直接登录（不经过密文），也可以：
          <button class="st-btn" id="st-use-token" style="margin-left:6px">改用令牌登录</button>
        </p>
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
  // 没有"清除本机密文"这回事了：密文在仓库里，改它要重新生成 + 提交
  $('#st-use-token')?.addEventListener('click', () => {
    renderLogin(undefined, '改用令牌登录。要更新站点上的密文，请在你自己的电脑上跑 node scripts/vault.mjs');
  });
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
    ${state.vault ? '<button class="st-btn" id="st-lock">锁定</button>' : ''}
    <button class="st-btn st-btn--ghost" id="st-logout">退出</button>`;
  $('#st-refresh')?.addEventListener('click', () => void loadAll());
  $('#st-save')?.addEventListener('click', () => void saveCurrent());

  // 锁定：令牌从内存里丢掉，回到解锁页（站点上的密文还在，输账密即可再进）
  $('#st-lock')?.addEventListener('click', () => {
    if (state.dirty && !confirm('有未保存的改动，确定锁定并丢弃吗？')) return;
    forgetSession();
    renderUnlock('已锁定');
  });

  // 退出：回登录页。没有"本机凭据"要清 —— 密文在仓库里，本机什么都不留
  $('#st-logout')?.addEventListener('click', () => {
    if (state.dirty && !confirm('有未保存的改动，确定退出并丢弃吗？')) return;
    forgetSession();
    renderLogin();
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
  const preview = $('#st-preview');
  if (!edit || !preview) return;

  const d = postDraft();
  if (!d) {
    edit.innerHTML = '<p class="st-empty">左边选一篇文章，或者点「新建」。</p>';
    preview.innerHTML = '';
    return;
  }

  const stats = readingStats(d.body);
  const tags = (d.fields.tags as string[])
    .map((t) => `<span class="st-chip">${esc(t)}<button data-rm="${esc(t)}" title="移除">×</button></span>`)
    .join('');

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">${esc(d.fields.pubDate || '未填日期')} · ${esc(d.entry.path)}</div>
      <h2 id="st-live-title">${esc(d.fields.title)}</h2>
      <div class="st-stats" id="st-live-stats">${stats.chars} 字 · 约 ${stats.minutes} 分钟</div>
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
      <span>正文（Markdown）</span>
      <span class="st-info">${d.body.split('\n').length} 行 · ${stats.chars} 字</span>
    </div>
    <textarea class="st-textarea st-source" id="st-f-body">${esc(d.body)}</textarea>
    <div style="margin-top:var(--space-5);display:flex;gap:var(--space-2)">
      <button class="st-btn st-btn--danger" id="st-del-post">删除这篇文章</button>
    </div>`;

  // 字段绑定：只改草稿，不重画整个编辑区（否则输入框会失焦）
  const bindInput = (sel: string, key: string) =>
    $<HTMLInputElement>(sel)?.addEventListener('input', (e) => {
      d.fields[key] = (e.target as HTMLInputElement).value;
      markDirty();
      refreshPostHeader();
    });
  bindInput('#st-f-title', 'title');
  bindInput('#st-f-date', 'pubDate');
  bindInput('#st-f-desc', 'description');
  bindInput('#st-f-updated', 'updatedDate');
  bindInput('#st-f-body', 'body');

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

  renderPostPreview();
}

function refreshPostHeader(): void {
  const d = state.draft.post;
  if (!d) return;
  const t = $('#st-live-title');
  if (t) t.textContent = String(d.fields.title ?? '');
  const s = $('#st-live-stats');
  if (s) {
    const st = readingStats(d.body);
    s.textContent = `${st.chars} 字 · 约 ${st.minutes} 分钟`;
  }
  const preview = $('#st-preview');
  if (preview) renderPostPreview();
}

function renderPostPreview(): void {
  const box = $('#st-preview');
  const d = state.draft.post;
  if (!box || !d) return;
  box.innerHTML = `
    <p class="st-note">右边是实时预览（排版按文章页的真实样式）。保存后会由构建流程生成正式页面。</p>
    <div class="st-preview">
      <p style="text-indent:0;color:var(--seal);font-size:var(--text-xs);letter-spacing:.15em">${esc(
        d.fields.pubDate || '（未填日期）'
      )}</p>
      <h1>${esc(d.fields.title)}</h1>
      ${renderMarkdown(d.body)}
    </div>`;
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
  // 判断"其实没改"最可靠的办法是比结果：把新全文生成出来，和原文逐字符比。
  // 这比"看哪些字段变了"更准 —— 界面用空串表示"没填"，那些字段会被判成变了却没实际写入。
  if (buildPostText(d.entry, changed, d.body) === d.entry.parsed.raw) {
    toast('没有任何改动');
    return;
  }
  await savePost(gh, d.entry, changed, d.body);
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
  // 顶栏与骨架先渲染出来，避免白屏
  renderLogin();

  // 曾经有版本把令牌明文存在浏览器里，也曾经把密文存在浏览器里。
  // 现在密文统一放在站点上（public/studio/vault.json），本机什么都不留 ——
  // 所以把那个旧键清掉，并告诉用户一声（它是明文凭据，不该继续留着）。
  const legacy = takeLegacyToken();
  if (legacy) {
    renderLogin(undefined, '本机曾经明文存过一个令牌，已经清除。请重新登录一次。');
    return;
  }

  // 站点上有密文 → 显示解锁页；没有 → 显示令牌登录页
  state.vault = await fetchVault();
  if (state.vault) renderUnlock();
}

void boot();

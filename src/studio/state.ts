/**
 * 后台的共享状态，以及「重渲染 / 重新拉取」两个钩子。
 *
 * 为什么把 state 单独拿出来：各视图模块都要读写它，而 app.ts 又要调用各视图 ——
 * 如果状态留在 app.ts 里，两边就会互相 import（循环依赖）。
 *
 * 这里再暴露 `rerender()` / `reload()`：app.ts 启动时把真正的实现注册进来
 * （见本文件末尾的 registerHooks），视图只管调用，不必知道 app 的存在。
 *
 * 依赖方向始终单向：**视图 → ui → state**。所以这个文件在运行时不 import
 * 任何 studio 模块，只用 `import type` 取类型 —— 类型编译后会被抹掉，不构成依赖，
 * 也就不会形成 ui ⇄ state 的环。
 */
import type { Github } from './github';
import type { EditorHandle } from './editor';
import type { LinksFile, PostEntry, SiteFile, WallEntry } from './content';
import type { VaultBlob } from './vault';

export const REPO = { owner: '94yesheng', repo: 'YeshengWiki', branch: 'main' };

/* --------------------------------------------------------------------------
   状态
   -------------------------------------------------------------------------- */
export type Collection = 'posts' | 'walls' | 'links' | 'site';

/**
 * 文章或照片墙。暂存那一套只用到 path / sha / id，但存的是**整条** ——
 * 保存时要拿它交给 `savePost` / `saveWall`（原文、布局、photos 都在里面）。
 */
export type Entry = PostEntry | WallEntry;

/**
 * 暂存的操作。
 *
 * 「＋」和「删除」**不碰仓库** —— 它们只往这里记一笔，界面当场就变（新增的一行立刻出现、
 * 待删的那一条立刻消失），真正写仓库要等点右上角「保存」。这样点一下不用等 API 往返，
 * 也符合"保存 = 一次把该写的都写下去"这个直觉。
 *
 * · `added`   新加的条目（`sha` 是空的 = 仓库里还没有这个文件）
 * · `removed` 待删的条目（**仍然留在 `state.posts` / `state.walls` 里**，只是列表不画它 ——
 *             这样"丢弃"只要把这一笔划掉，那一条就自己回来了，不必重新拉一遍仓库）
 */
export interface Staged {
  added: Entry[];
  removed: Entry[];
}

export interface Draft {
  /** 文章：字段缓冲 + 正文缓冲（正文的当前值由编辑器持有，body 是打开时的原文） */
  post?: {
    entry: PostEntry;
    fields: Record<string, unknown>;
    body: string;
    editor?: EditorHandle;
    /** 用户有没有亲手动过「修订于」—— 动过就让位，自动记录不覆盖它 */
    dateTouched?: boolean;
  };
  wall?: WallEntry;
  links?: LinksFile;
  site?: Record<string, unknown>;
}

export const state = {
  token: null as string | null,
  gh: null as Github | null,
  user: '',
  collection: 'posts' as Collection,
  selected: null as string | null,
  /**
   * 刚刚新建的那一条（文章的 slug / 墙的 id）。只为了让它出现在列表里时**滑出来**，
   * 画完就清掉 —— 留着的话每次重画都会重放一遍动画。
   */
  justAdded: null as string | null,
  busy: false,
  dirty: false,
  posts: [] as PostEntry[],
  walls: [] as WallEntry[],
  links: null as LinksFile | null,
  site: null as SiteFile | null,
  photoFiles: [] as string[],
  draft: {} as Draft,
  /** 暂存的新增 / 删除 —— 点「保存」才落盘，见 Staged */
  staged: { added: [], removed: [] } as Staged,
  /** 站点上的密文（没有就是 null —— 此时显示令牌登录页） */
  vault: null as VaultBlob | null,
};

/** 把当前会话的凭据从内存里丢掉（不动本机存的密文） */
export function forgetSession(): void {
  state.token = null;
  state.gh = null;
  state.user = '';
  state.dirty = false;
  state.draft = {};
  state.staged = { added: [], removed: [] };
  state.posts = [];
  state.walls = [];
  state.links = null;
  state.site = null;
  state.selected = null;
}

export function markDirty(): void {
  if (!state.dirty) {
    state.dirty = true;
    const btn = document.querySelector<HTMLButtonElement>('#st-save');
    if (btn) btn.disabled = false;
  }
}

/**
 * 离开当前这条之前收尾（换栏目 / 换条目 / 重新读取 / 又点了一次「＋」）——
 * 实现放在 app.ts，因为它要"暂存的新条目把改动并进去、仓库里已有的问一句"，
 * 那两件事分别在两个视图里。视图通过这个函数问，不必 import app.ts（会成环）。
 *
 * 返回 false = 用户反悔了，别走。
 */
export function settleBeforeLeaving(): boolean {
  return hooks.settle?.() ?? true;
}

/* --------------------------------------------------------------------------
   暂存：新增 / 删除
   -------------------------------------------------------------------------- */

/** 新加的（仓库里还没有这个文件） */
export function isStagedNew(entry: { path: string }): boolean {
  return state.staged.added.some((e) => e.path === entry.path);
}

/** 已经记下待删的（列表里不画它） */
export function isStagedGone(entry: { path: string }): boolean {
  return state.staged.removed.some((e) => e.path === entry.path);
}

export function stageAdd(entry: Entry): void {
  state.staged.added.push(entry);
}

/** 待删的条目里**真正要调删除接口**的那些（新加又反悔的 sha 是空的，仓库没这东西） */
export function stagedDeletes(): Entry[] {
  return state.staged.removed.filter((e) => e.sha !== '');
}

/**
 * 记下"要删这条"。刚加进来、还没写下去的，等于撤销新增 —— 不用记成一笔删除。
 */
export function stageRemove(entry: Entry): void {
  if (isStagedNew(entry)) {
    state.staged.added = state.staged.added.filter((e) => e.path !== entry.path);
    return;
  }
  if (!isStagedGone(entry)) state.staged.removed.push(entry);
}

/** 保存成功后调用：条目已经真的写进/删出仓库了，这里只把账清掉 */
export function clearStaged(): void {
  state.staged = { added: [], removed: [] };
}

/**
 * 丢弃暂存：**界面要跟着退回去**。
 * 待删的本来就没从列表里删掉（只是没画），把账清了它们就自己回来了；
 * 新加的得手动从列表里拿掉 —— 仓库里本来就没有它们。
 */
export function discardStaged(): void {
  for (const e of state.staged.added) {
    state.posts = state.posts.filter((p) => p.path !== e.path);
    state.walls = state.walls.filter((w) => w.path !== e.path);
    if (state.selected === e.id) state.selected = null;
  }
  state.staged = { added: [], removed: [] };
}

/* --------------------------------------------------------------------------
   重渲染钩子 —— 由 app.ts 启动时注册（registerHooks），视图只调用不实现。
   这样「视图 → app」这条反向依赖就不存在了，也就没有循环。
   -------------------------------------------------------------------------- */

interface Hooks {
  /** 重画整个界面（原来的 renderApp） */
  render?: () => void;
  /** 重新从仓库拉一遍内容（原来的 loadAll） */
  reload?: () => Promise<void>;
  /** 离开当前这条之前收尾（见 settleBeforeLeaving） */
  settle?: () => boolean;
}

const hooks: Hooks = {};

export function registerHooks(next: Hooks): void {
  Object.assign(hooks, next);
}

export function rerender(): void {
  hooks.render?.();
}

export async function reload(): Promise<void> {
  await hooks.reload?.();
}
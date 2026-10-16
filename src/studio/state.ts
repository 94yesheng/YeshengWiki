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

/* --------------------------------------------------------------------------
   重渲染钩子 —— 由 app.ts 启动时注册（registerHooks），视图只调用不实现。
   这样「视图 → app」这条反向依赖就不存在了，也就没有循环。
   -------------------------------------------------------------------------- */

interface Hooks {
  /** 重画整个界面（原来的 renderApp） */
  render?: () => void;
  /** 重新从仓库拉一遍内容（原来的 loadAll） */
  reload?: () => Promise<void>;
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
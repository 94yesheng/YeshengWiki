/**
 * 后台的共享状态，以及「重渲染 / 重新拉取」两个钩子。
 */
import type { Github } from './github';
import type { EditorHandle } from './editor';
import type { LinksFile, PostEntry, SiteFile, WallEntry } from './content';
import type { VaultBlob } from './vault';

export const REPO = { owner: '94yesheng', repo: 'YeshengWiki', branch: 'main' };

export type Collection = 'posts' | 'walls' | 'programs' | 'links' | 'site';

export type Entry = PostEntry | WallEntry;

export interface Staged {
  added: Entry[];
  removed: Entry[];
}

export interface Draft {
  post?: {
    entry: PostEntry;
    fields: Record<string, unknown>;
    /** 打开时的字段快照，用来判断"有没有真改过"（默认值不算改动） */
    baseline: Record<string, unknown>;
    body: string;
    editor?: EditorHandle;
    dateTouched?: boolean;
    /** 编辑器子模式：visual(富文本) | markdown(源码) | split(分栏对照) */
    editorMode?: 'visual' | 'markdown' | 'split';
    /** 右栏工具箱当前标签：format(格式与组件) | toc(章节目录) | rail(右侧伴读悬浮栏定制) */
    rightTab?: 'format' | 'toc' | 'rail';
  };
  wall?: WallEntry;
  /** 当前在照片墙里选中的单张照片索引（用于右侧光学检视台编辑与预览） */
  selectedPhotoIdx?: number;
  links?: LinksFile;
  site?: Record<string, unknown>;
}

export const state = {
  token: null as string | null,
  csrf: null as string | null,
  gh: null as Github | null,
  user: '',
  /** 演示模式标记：无需登录即可完整交互体验所有 UI 与逻辑 */
  demoMode: false,
  collection: 'posts' as Collection,
  selected: null as string | null,
  justAdded: null as string | null,
  busy: false,
  dirty: false,
  posts: [] as PostEntry[],
  walls: [] as WallEntry[],
  links: null as LinksFile | null,
  site: null as SiteFile | null,
  photoFiles: [] as string[],
  postAssetFiles: [] as string[],
  draft: {} as Draft,
  staged: { added: [], removed: [] } as Staged,
  vault: null as VaultBlob | null,
  listCollapsed: new Set<string>(),
  tagFilter: '',
  searchQuery: '',
};

export function forgetSession(): void {
  state.token = null;
  state.csrf = null;
  state.gh = null;
  state.user = '';
  state.demoMode = false;
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
    // 让顶栏的「有未保存修改」徽章立即出现，而不是等下一次整页重画
    hooks.dirty?.();
  }
}

export function settleBeforeLeaving(): boolean {
  return hooks.settle?.() ?? true;
}

/* --------------------------------------------------------------------------
   暂存：新增 / 删除
   -------------------------------------------------------------------------- */
export function isStagedNew(entry: { path: string }): boolean {
  return state.staged.added.some((e) => e.path === entry.path);
}

export function isStagedGone(entry: { path: string }): boolean {
  return state.staged.removed.some((e) => e.path === entry.path);
}

export function stageAdd(entry: Entry): void {
  state.staged.added.push(entry);
}

export function stagedDeletes(): Entry[] {
  return state.staged.removed.filter((e) => e.sha !== '');
}

export function stageRemove(entry: Entry): void {
  if (isStagedNew(entry)) {
    state.staged.added = state.staged.added.filter((e) => e.path !== entry.path);
    return;
  }
  if (!isStagedGone(entry)) state.staged.removed.push(entry);
}

export function clearStaged(): void {
  state.staged = { added: [], removed: [] };
}

export function discardStaged(): void {
  for (const e of state.staged.added) {
    state.posts = state.posts.filter((p) => p.path !== e.path);
    state.walls = state.walls.filter((w) => w.path !== e.path);
    if (state.selected === e.id) state.selected = null;
  }
  state.staged = { added: [], removed: [] };
}

/* --------------------------------------------------------------------------
   重渲染钩子
   -------------------------------------------------------------------------- */
interface Hooks {
  render?: () => void;
  reload?: () => Promise<void>;
  settle?: () => boolean;
  dirty?: () => void;
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

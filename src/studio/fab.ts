/**
 * 后台右下角的悬浮球 —— 外观与访客侧完全一样（样式在 `src/styles/fab.css`，
 * 那边照着同一份 DOM 约定写的），动作换成后台用得上的三个：
 *
 *   · 预览 —— 打开「按博客的样子预览」（原来那个按钮在编辑区顶部，现在收进这里）
 *   · 夜间模式 —— 和访客侧同一个开关（utils/theme.ts），后台以前没有
 *   · 回到顶部 —— 注意后台 body 是 `100vh`，**滚的是各列 `.st-col`**，
 *     `window.scrollTo` 在这儿是哑炮
 *
 * 【挂在哪】挂在三栏骨架里（`app.ts` 的 renderShell）—— 不能放在 studio.astro 的静态骨架，
 * 因为登录成功时 `#st-main` 会被整体替换，挂在外面会在登录页右下角留一个球。
 */
import { isDark, toggleTheme } from '../utils/theme';

export interface FabOptions {
  /** 点「预览」时干什么 */
  preview: () => void;
  /** 现在能不能预览（没有选中文章时按钮藏起来） */
  available: () => boolean;
}

export interface FabHandle {
  /** 重新判断预览按钮可不可用 —— 每次应用重画后调一次 */
  sync(): void;
}

/** 预览按钮的图标（用 Unicode 字形 + aria-label，跟站里其它地方一致） */
const PREVIEW_ICON = '▤';

export function mountFab(host: HTMLElement, opts: FabOptions): FabHandle {
  const wrap = document.createElement('div');
  wrap.className = 'fab';
  wrap.id = 'fab';
  wrap.innerHTML = `
    <div class="fab-actions" id="fab-actions">
      <button type="button" class="fab-btn" data-action="preview" title="按博客的样子预览" aria-label="按博客的样子预览">
        <span aria-hidden="true">${PREVIEW_ICON}</span>
      </button>
      <button type="button" class="fab-btn" data-action="theme" aria-label="切换到夜间模式">
        <span data-theme-icon aria-hidden="true">☾</span>
      </button>
      <button type="button" class="fab-btn" data-action="top" title="回到顶部" aria-label="回到顶部">
        <span aria-hidden="true">↑</span>
      </button>
    </div>
    <button type="button" class="fab-btn fab-btn--main" id="fab-main"
            aria-expanded="false" aria-controls="fab-actions" aria-label="更多操作">
      <span data-main-icon aria-hidden="true">+</span>
    </button>`;
  host.appendChild(wrap);

  const main = wrap.querySelector<HTMLButtonElement>('#fab-main');
  const themeBtn = wrap.querySelector<HTMLButtonElement>('[data-action="theme"]');
  const previewBtn = wrap.querySelector<HTMLButtonElement>('[data-action="preview"]');
  const icon = wrap.querySelector<HTMLElement>('[data-theme-icon]');

  const isOpen = () => wrap.dataset.open === 'true';

  const syncThemeBtn = () => {
    if (icon) icon.textContent = isDark() ? '☀' : '☾';
    themeBtn?.setAttribute('aria-label', isDark() ? '切换到白天模式' : '切换到夜间模式');
  };

  const setOpen = (open: boolean, focusPanel = true) => {
    if (open) wrap.dataset.open = 'true';
    else delete wrap.dataset.open;
    main?.setAttribute('aria-expanded', String(open));
    if (focusPanel) {
      const target = open ? wrap.querySelector<HTMLButtonElement>('.fab-actions button') : main;
      target?.focus();
    }
  };

  const sync = () => {
    // 只有「文章」集合且选中了文章时才谈得上预览
    if (previewBtn) previewBtn.hidden = !opts.available();
    syncThemeBtn();
  };

  main?.addEventListener('click', () => setOpen(!isOpen()));

  wrap.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape' && isOpen()) setOpen(false);
  });

  previewBtn?.addEventListener('click', () => {
    setOpen(false, false);
    opts.preview();
  });

  themeBtn?.addEventListener('click', () => {
    toggleTheme();
    syncThemeBtn();
  });

  wrap.querySelector('[data-action="top"]')?.addEventListener('click', () => {
    // 后台的滚动在列上，不在 window 上
    document.querySelectorAll<HTMLElement>('.st-col').forEach((col) => col.scrollTo({ top: 0 }));
    setOpen(false, false);
  });

  sync();
  return { sync };
}

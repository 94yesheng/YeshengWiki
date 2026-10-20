/**
 * 后台右下角的悬浮球 —— 与前台展示页（#fab）样式、结构、SVG 图标和展开动画 100% 统一。
 *
 * 比访客侧多一个「PREVIEW // 实景预览」按钮（仅在文章视图且有草稿时显示），
 * 以及「回到顶部」同时滚动后台三栏容器（#st-edit / .st-col--nav / #st-preview）。
 */
import { isDark, toggleTheme } from '../utils/theme';

export interface FabOptions {
  /** 当前页面是否提供「预览」动作（非文章页返回 false，预览按钮隐藏） */
  available: () => boolean;
  /** 点「预览」时要做的事 */
  preview: () => void;
}

export interface FabHandle {
  /** 外部改了主题或切换了集合后，刷新悬浮球上的文字与可见按钮 */
  sync: () => void;
}

const MOON_SVG = '<path d="M16.2 12.4A6.8 6.8 0 0 1 7.6 3.8a6.8 6.8 0 1 0 8.6 8.6Z"/>';
const SUN_SVG =
  '<circle cx="10" cy="10" r="3.6"/><line x1="10" y1="2" x2="10" y2="4.2"/><line x1="10" y1="15.8" x2="10" y2="18"/><line x1="2" y1="10" x2="4.2" y2="10"/><line x1="15.8" y1="10" x2="18" y2="10"/><line x1="4.3" y1="4.3" x2="5.9" y2="5.9"/><line x1="14.1" y1="14.1" x2="15.7" y2="15.7"/><line x1="15.7" y1="4.3" x2="14.1" y2="5.9"/><line x1="5.9" y1="14.1" x2="4.3" y2="15.7"/>';

export function mountFab(host: HTMLElement, opts: FabOptions): FabHandle {
  host.innerHTML = `
    <div class="fab" id="fab">
      <div class="fab-actions" id="fab-actions">
        <div class="fab-item" id="fab-preview-item">
          <span class="fab-chip-label">PREVIEW // 实景预览</span>
          <button type="button" class="fab-btn" data-action="preview" aria-label="预览文章" title="按博客前台真实样子预览">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/>
              <circle cx="10" cy="10" r="2.5"/>
            </svg>
          </button>
        </div>

        <div class="fab-item">
          <span class="fab-chip-label" id="fab-theme-label">NIGHT // 黑洞场</span>
          <button type="button" class="fab-btn" data-action="theme" aria-label="切换白天无限与夜间黑洞模式" title="切换白天（无限环）/ 夜间（黑洞）">
            <svg id="fab-theme-svg" viewBox="0 0 20 20" aria-hidden="true">
              ${MOON_SVG}
            </svg>
          </button>
        </div>

        <div class="fab-item">
          <span class="fab-chip-label">TOP // 回到顶部</span>
          <button type="button" class="fab-btn" data-action="top" aria-label="回到顶部" title="回到顶部">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 15.5V4.5"/>
              <path d="M5.5 9L10 4.5L14.5 9"/>
              <line x1="5" y1="3" x2="15" y2="3"/>
            </svg>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="fab-btn fab-btn--main"
        id="fab-main"
        aria-expanded="false"
        aria-controls="fab-actions"
        aria-label="展开快捷控制台"
      >
        <svg viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="7.5" stroke-opacity="0.45" stroke-width="1.2"/>
          <g class="fab-main-Cross" style="transform-origin: 11px 11px; transition: transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);">
            <line x1="11" y1="5.5" x2="11" y2="16.5" stroke-width="1.9"/>
            <line x1="5.5" y1="11" x2="16.5" y2="11" stroke-width="1.9"/>
          </g>
        </svg>
      </button>
    </div>`;

  const fab = host.querySelector<HTMLElement>('#fab')!;
  const main = fab.querySelector<HTMLButtonElement>('#fab-main')!;
  const previewItem = fab.querySelector<HTMLElement>('#fab-preview-item')!;
  const previewBtn = fab.querySelector<HTMLButtonElement>('[data-action="preview"]')!;
  const themeBtn = fab.querySelector<HTMLButtonElement>('[data-action="theme"]')!;
  const themeLabel = fab.querySelector<HTMLElement>('#fab-theme-label')!;
  const themeSvg = fab.querySelector<SVGElement>('#fab-theme-svg')!;
  const topBtn = fab.querySelector<HTMLButtonElement>('[data-action="top"]')!;

  const isOpen = () => fab.dataset.open === 'true';

  const setOpen = (open: boolean, moveFocus = true) => {
    if (open) fab.dataset.open = 'true';
    else delete fab.dataset.open;
    main.setAttribute('aria-expanded', String(open));
    if (moveFocus) {
      const firstVisible = fab.querySelector<HTMLButtonElement>(
        '.fab-actions .fab-item:not([hidden]) button, .fab-actions > button:not([hidden])'
      );
      (open ? firstVisible : main)?.focus();
    }
  };

  const sync = () => {
    const dark = isDark();
    themeLabel.textContent = dark ? 'DAY // 无限环' : 'NIGHT // 黑洞场';
    themeSvg.innerHTML = dark ? SUN_SVG : MOON_SVG;
    themeBtn.setAttribute('aria-label', dark ? '切换到白天无限模式' : '切换到夜间黑洞模式');
    const canPreview = opts.available();
    previewItem.hidden = !canPreview;
    previewBtn.hidden = !canPreview;
  };

  main.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!isOpen());
  });

  fab.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false);
  });

  document.addEventListener('click', (e) => {
    if (isOpen() && !fab.contains(e.target as Node)) {
      setOpen(false, false);
    }
  });

  previewBtn.addEventListener('click', () => {
    setOpen(false, false);
    opts.preview();
  });

  themeBtn.addEventListener('click', () => {
    toggleTheme();
    sync();
  });

  topBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll<HTMLElement>('#st-edit, .st-col--nav, #st-preview').forEach((el) => {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    });
    setOpen(false, false);
  });

  window.addEventListener('themechange', sync);
  sync();
  return { sync };
}

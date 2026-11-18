/**
 * 蓝图双模态正文编辑器（所见即所得 Visual ↔ Markdown 源码 ↔ 双栏对照 Split）
 *
 * 1. 支持「富文本蓝图视图」「Markdown 源码」「双栏同步对照」三种编辑模式无缝切换；
 * 2. 提供 HUD 文章页排版块接口：代码终端块（Codeblock）、行内代码（Inline Code）、
 *    可增删行列的表格（Table）、悬浮弹窗配图选择器与选中文本上方悬浮链接输入框；
 * 3. 支持「一键检测文章章节」功能：自动识别粗体小节、中式序号章节与现有 H1~H3 标题并生成章节坐标导览；
 * 4. 实时提取 H2/H3 章节坐标，与前台文章页同构渲染右栏目录，点击可滚动定位并高亮。
 */
import { extractRawHtml, htmlToMarkdown, renderMarkdown } from './md';
import { esc, toast } from './ui';

export interface HeadingItem {
  depth: number;
  text: string;
  num: string;
}

export interface EditorHandle {
  getMarkdown(): string;
  getHtml(): string;
  setMarkdown(md: string): void;
  isEmpty(): boolean;
  getHeadings(): HeadingItem[];
  setMode(mode: 'visual' | 'markdown' | 'split'): void;
  getMode(): 'visual' | 'markdown' | 'split';
  remount(areaHost: HTMLElement, barHost: HTMLElement): void;
  destroy(): void;
}

export interface EditorOptions {
  onInput: () => void;
  onHeadingsChange?: (headings: HeadingItem[]) => void;
  /** 当前文章已加载的配图（`<slug>/<file>` 或旧版扁平文件名） */
  getPostAssets?: () => string[];
  /** 上传一张图片，返回可直接写进正文的路径（如 ../../assets/posts/<slug>/<file>） */
  onUploadPostAsset?: (file: File) => Promise<string | null>;
}

/** GET /api/media 里这个编辑器用得到的字段（完整结构见 state.ts 的 MediaItem） */
interface StudioMediaItem {
  path: string;
  filename: string;
  mime: string | null;
  postTitle?: string | null;
}

/** 光标所在的表格上下文（行列操作都基于它） */
interface TableContext {
  table: HTMLTableElement;
  row: HTMLTableRowElement;
  cell: HTMLTableCellElement;
  rowIndex: number;
  cellIndex: number;
}

const BLOCK_PRESETS = [
  { value: 'h2', label: 'H2 · 章节标题' },
  { value: 'h3', label: 'H3 · 小节标题' },
  { value: 'p', label: 'P · 正文段落' },
  { value: 'blockquote', label: 'QUOTE · 引用' },
];

const HR_STYLES = [
  { cls: 'star', label: '星号分隔线', preview: 'ed-hr-preview--star' },
  { cls: 'sakura', label: '樱花分隔线', preview: 'ed-hr-preview--sakura' },
  { cls: 'dots', label: '三点分隔线', preview: 'ed-hr-preview--dots' },
  { cls: 'double', label: '双线分隔线', preview: 'ed-hr-preview--double' },
];

const ALIGN_ICONS: Record<string, string> = {
  left: '<path d="M1 3h12M1 6.5h8M1 10h10"/>',
  center: '<path d="M1 3h12M3 6.5h8M2 10h10"/>',
  right: '<path d="M1 3h12M5 6.5h8M3 10h10"/>',
};

/* 05 · 插入内容的纯图标按钮：统一 18×18 / 1.65px / currentColor 线性风格 */
const ICON_ATTRS = `viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"`;

const CODE_ICON = `<svg ${ICON_ATTRS}>
  <path d="M6 4.8 2.5 9 6 13.2"/>
  <path d="M12 4.8 15.5 9 12 13.2"/>
  <path d="M10.2 3.2 7.8 14.8"/>
</svg>`;

const TABLE_ICON = `<svg ${ICON_ATTRS}>
  <rect x="2.2" y="3" width="13.6" height="12" rx="1.6"/>
  <line x1="2.2" y1="7" x2="15.8" y2="7"/>
  <line x1="2.2" y1="11" x2="15.8" y2="11"/>
  <line x1="6.8" y1="7" x2="6.8" y2="15"/>
  <line x1="11.2" y1="7" x2="11.2" y2="15"/>
</svg>`;

const IMAGE_ICON = `<svg ${ICON_ATTRS}>
  <rect x="2.2" y="3.2" width="13.6" height="11.6" rx="1.6"/>
  <circle cx="12.1" cy="6.7" r="1.25"/>
  <path d="M2.8 13.1 6.4 9.5l2.7 2.7 2.3-2.1 3.8 3.4"/>
</svg>`;

const LINK_ICON = `<svg ${ICON_ATTRS}>
  <path d="M7.4 10.6a3 3 0 0 0 4.2.1l2.3-2.3a3 3 0 0 0-4.2-4.2L8.4 5.5"/>
  <path d="M10.6 7.4a3 3 0 0 0-4.2-.1L4.1 9.6a3 3 0 0 0 4.2 4.2l1.3-1.3"/>
</svg>`;

const ALIGN_BUTTONS = [
  { kind: 'left', title: '左对齐（默认）' },
  { kind: 'center', title: '居中对齐' },
  { kind: 'right', title: '右对齐' },
] as const;

let activeEditorCleanup: (() => void) | null = null;
let pasteSeq = 0;

export function createEditor(
  areaHost: HTMLElement,
  barHost: HTMLElement,
  initial: string,
  onInputOrOpts: (() => void) | EditorOptions,
  legacyImageHint?: () => string
): EditorHandle {
  if (activeEditorCleanup) {
    activeEditorCleanup();
    activeEditorCleanup = null;
  }
  const opts: EditorOptions =
    typeof onInputOrOpts === 'function'
      ? { onInput: onInputOrOpts }
      : onInputOrOpts;

  let raws: string[] = [];
  let mode: 'visual' | 'markdown' | 'split' = 'visual';
  let syncing = false;

  areaHost.innerHTML = `
    <div class="ed-shell" data-mode="visual">
      <div class="ed-mode-bar">
        <div class="ed-mode-tabs" role="tablist" aria-label="编辑器视图模式">
          <button type="button" class="ed-mode-tab" data-ed-mode="visual" aria-selected="true">VISUAL // 所见即所得</button>
          <button type="button" class="ed-mode-tab" data-ed-mode="markdown" aria-selected="false">SOURCE // Markdown 源码</button>
          <button type="button" class="ed-mode-tab" data-ed-mode="split" aria-selected="false">SPLIT // 双栏实时对照</button>
        </div>
        <div class="ed-mode-actions">
          <span class="ed-telemetry-stat" id="ed-inline-stat">0 字 · 约 1 分钟</span>
        </div>
      </div>

      <div class="ed-drawer" id="ed-drawer" hidden></div>

      <div class="ed-panes">
        <div class="ed-area article-prose-q" id="ed-area" contenteditable="true" spellcheck="false" aria-label="富文本正文编辑区"></div>
        <textarea class="ed-source" id="ed-source" spellcheck="false" aria-label="Markdown 源码编辑区" placeholder="在此输入 Markdown 源码..."></textarea>
      </div>
    </div>`;

  barHost.innerHTML = `
    <div class="ed-bar" role="toolbar" aria-label="正文排版与组件工具栏">
      <div class="ed-group">
        <span class="ed-glabel">01 · 段落层级</span>
        <div class="ed-row ed-row--grid ed-row--blocks">
          ${BLOCK_PRESETS.map(
            (o) => `<button type="button" class="ed-btn" data-block="${o.value}" aria-pressed="false">${o.label}</button>`
          ).join('')}
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">02 · 文字样式</span>
        <div class="ed-row ed-row--grid ed-row--styles">
          <button type="button" class="ed-btn ed-btn--sample" data-cmd="bold" aria-pressed="false" title="加粗（Ctrl+B）" aria-label="加粗">
            <span class="ed-sample-key">B</span>
            <span class="ed-sample ed-sample--bold">加粗</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample" data-cmd="italic" aria-pressed="false" title="斜体（Ctrl+I）" aria-label="斜体">
            <span class="ed-sample-key">I</span>
            <span class="ed-sample ed-sample--italic">斜体</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample" data-cmd="strikeThrough" aria-pressed="false" title="删除线" aria-label="删除线">
            <span class="ed-sample-key">S</span>
            <span class="ed-sample ed-sample--strike">删除线</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample ed-btn--mark" data-cmd="mark" aria-pressed="false" title="着重高亮（理性橙）" aria-label="着重色">
            <span class="ed-sample-key ed-sample-key--mark">M</span>
            <span class="ed-sample ed-sample--mark">着重色</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample ed-btn--sample-wide" data-cmd="inlineCode" aria-pressed="false" title="行内代码" aria-label="行内代码">
            <span class="ed-sample-key ed-sample-key--code">&lt;/&gt;</span>
            <span class="ed-sample ed-sample--code">行内代码</span>
          </button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">03 · 段落对齐</span>
        <div class="ed-row ed-row--align">
          ${ALIGN_BUTTONS.map(
            (a) => `<button type="button" class="ed-btn ed-btn--icon" data-align="${a.kind}" title="${a.title}" aria-label="${a.title}">
              <svg viewBox="0 0 14 14" width="16" height="16" aria-hidden="true" fill="none"
                   stroke="currentColor" stroke-width="1.65" stroke-linecap="round">${ALIGN_ICONS[a.kind]}</svg>
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">04 · 列表样式</span>
        <div class="ed-row ed-row--grid ed-row--lists">
          <button type="button" class="ed-btn" data-cmd="insertUnorderedList" title="无序列表">• 无序列表</button>
          <button type="button" class="ed-btn" data-cmd="insertOrderedList" title="有序列表">1. 有序列表</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">05 · 插入内容</span>
        <div class="ed-row ed-row--grid ed-row--insert">
          <button type="button" class="ed-btn ed-btn--icon" data-cmd="insertCodeblock" title="插入代码块" aria-label="插入代码块">
            ${CODE_ICON}
          </button>
          <button type="button" class="ed-btn ed-btn--icon" data-cmd="insertTable" title="插入表格" aria-label="插入表格">
            ${TABLE_ICON}
          </button>
          <button type="button" class="ed-btn ed-btn--icon" data-cmd="insertImage" title="从媒体库选择或上传照片" aria-label="插入或上传配图">
            ${IMAGE_ICON}
          </button>
          <button type="button" class="ed-btn ed-btn--icon" data-cmd="createLink" title="选中正文文字后插入超链接" aria-label="插入链接">
            ${LINK_ICON}
          </button>
        </div>
        <!-- 光标在表格内才显示：增删行列 / 删除表格（源码模式下隐藏） -->
        <div class="ed-table-tools" id="ed-table-tools" role="group" aria-label="表格行列操作" hidden>
          <span class="ed-table-tools-label">TABLE // 表格</span>
          <button type="button" class="ed-btn" data-table-action="row-add" title="在光标行下方插入一行">+ 行</button>
          <button type="button" class="ed-btn" data-table-action="row-del" title="删除光标所在行">− 行</button>
          <button type="button" class="ed-btn" data-table-action="col-add" title="在光标列右侧插入一列">+ 列</button>
          <button type="button" class="ed-btn" data-table-action="col-del" title="删除光标所在列">− 列</button>
          <button type="button" class="ed-btn ed-btn--danger" data-table-action="table-del" title="删除整个表格">删除表格</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">06 · 章节分隔线</span>
        <div class="ed-row ed-row--hr">
          ${HR_STYLES.map(
            (h) => `<button type="button" class="ed-btn ed-hr-btn" data-hr="${h.cls}" title="${h.label}" aria-label="${h.label}">
              <span class="ed-hr-preview ${h.preview}" aria-hidden="true"></span>
              <span class="ed-hr-label">${h.label}</span>
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="ed-group ed-group--toc">
        <div class="ed-glabel ed-glabel--row">
          <span>07 · 章节坐标预览</span>
          <button type="button" class="ed-toc-detect-btn" id="ed-auto-toc-btn" title="智能检测正文中的章节标题并生成目录" aria-label="一键检测文章章节">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none"
                 stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.2 3.8h11.6M2.2 8h7.2M2.2 12.2h4.8"/>
              <circle cx="11.8" cy="11" r="2.2"/>
              <path d="m13.5 12.7 1.4 1.4"/>
            </svg>
            <span>检测章节</span>
          </button>
        </div>
        <div class="ed-toc-preview" id="ed-toc-preview"></div>
      </div>

      <span class="ed-count" id="ed-count"></span>
    </div>`;

  function must<T extends HTMLElement>(host: HTMLElement, sel: string): T {
    const el = host.querySelector<T>(sel);
    if (!el) throw new Error(`编辑器挂载失败：找不到 ${sel}`);
    return el;
  }

  const shell = must<HTMLElement>(areaHost, '.ed-shell');
  const area = must<HTMLElement>(areaHost, '#ed-area');
  const sourceArea = must<HTMLTextAreaElement>(areaHost, '#ed-source');
  const drawer = must<HTMLElement>(areaHost, '#ed-drawer');
  const bar = must<HTMLElement>(barHost, '.ed-bar');

  try {
    document.execCommand('styleWithCSS', false, 'false');
  } catch {
    /* ignore */
  }

  // 目录项对应的正文标题节点（每次重绘时同步刷新，点击目录用它滚动定位）
  let tocHeadingEls: HTMLElement[] = [];
  let tocActiveTimer: number | undefined;
  let headingFlashTimer: number | undefined;

  // 弹窗/浮层打开前保存的正文选区
  let savedRange: Range | null = null;
  let lastValidRange: Range | null = null;
  // 异步请求令牌：关闭后，迟到的 fetch 结果不再往弹窗里写
  let drawerSeq = 0;
  // 给刚插入的表格打临时标记，插入后靠它找回 DOM 并把光标放进第一个单元格
  let tableSeq = 0;

  let activeImgModal: HTMLElement | null = null;
  let activeLinkPopover: HTMLElement | null = null;
  let linkPopoverCleanup: (() => void) | null = null;

  function collectHeadings(): Array<{ el: HTMLElement; depth: number; text: string }> {
    const list: Array<{ el: HTMLElement; depth: number; text: string }> = [];
    area.querySelectorAll<HTMLElement>('h1, h2, h3').forEach((node) => {
      const text = (node.textContent ?? '').trim();
      if (!text) return;
      list.push({ el: node, depth: node.tagName === 'H3' ? 3 : 2, text });
    });
    return list;
  }

  function getHeadings(): HeadingItem[] {
    return collectHeadings().map((h, idx) => ({
      depth: h.depth,
      text: h.text,
      num: String(idx + 1).padStart(2, '0'),
    }));
  }

  function renderTocPreview(): void {
    const tocBox = bar.querySelector<HTMLElement>('#ed-toc-preview');
    const headings = collectHeadings();
    tocHeadingEls = headings.map((h) => h.el);
    opts.onHeadingsChange?.(
      headings.map((h, idx) => ({
        depth: h.depth,
        text: h.text,
        num: String(idx + 1).padStart(2, '0'),
      }))
    );
    if (!tocBox) return;
    const tocTitle = `<h2 class="toc-box-title">INDEX // 章节坐标导览 (${headings.length})</h2>`;
    if (!headings.length) {
      tocBox.innerHTML = `${tocTitle}<p class="toc-empty">尚未检测到 H2/H3 章节标题（点击上方「检测章节」可智能识别正文小节）</p>`;
      return;
    }
    interface EdTocGroup {
      idx: number;
      text: string;
      num: string;
      children: Array<{ idx: number; text: string; num: string }>;
    }
    const groups: EdTocGroup[] = [];
    let h2Count = 0;
    headings.forEach((h, idx) => {
      if (h.depth === 2 || groups.length === 0) {
        h2Count += 1;
        groups.push({
          idx,
          text: h.text,
          num: String(h2Count).padStart(2, '0'),
          children: [],
        });
      } else {
        const parent = groups[groups.length - 1]!;
        const subNo = parent.children.length + 1;
        parent.children.push({
          idx,
          text: h.text,
          num: `${parent.num}.${subNo}`,
        });
      }
    });

    tocBox.innerHTML = `${tocTitle}<ul class="toc-list">${groups
      .map((g) => {
        if (!g.children.length) {
          return `<li class="toc-item toc-item--h2"><div class="toc-row"><a href="#ed-heading-${g.idx}" data-toc-index="${g.idx}" data-toc-level="2"><span class="toc-num">${g.num}</span><span class="toc-text">${esc(g.text)}</span></a></div></li>`;
        }
        const subHtml = g.children
          .map(
            (sub) =>
              `<li class="toc-subitem"><a href="#ed-heading-${sub.idx}" data-toc-index="${sub.idx}" data-toc-level="3" class="is-h3 toc-link--h3"><span class="toc-num">${sub.num}</span><span class="toc-text">${esc(sub.text)}</span></a></li>`
          )
          .join('');
        return `<li class="toc-item toc-item--h2 toc-item--has-children" data-toc-group data-collapsed="true"><div class="toc-row"><a href="#ed-heading-${g.idx}" data-toc-index="${g.idx}" data-toc-level="2"><span class="toc-num">${g.num}</span><span class="toc-text">${esc(g.text)}</span></a><button type="button" class="toc-fold-btn" data-ed-toc-toggle aria-expanded="false" title="展开/收起二级标题 (${g.children.length})"><span class="toc-sub-count">${g.children.length}</span><span class="toc-fold-chevron" aria-hidden="true">▸</span></button></div><div class="toc-sublist-wrap"><ul class="toc-sublist">${subHtml}</ul></div></li>`;
      })
      .join('')}</ul>`;
  }

  // 点击目录：滚动到对应标题并短暂高亮（不移动光标、不触发保存）
  function jumpToHeading(index: number, link: HTMLAnchorElement): void {
    bar.querySelectorAll<HTMLAnchorElement>('.ed-toc-preview .toc-list a[data-active]').forEach((a) => {
      if (a !== link) a.removeAttribute('data-active');
    });
    link.setAttribute('data-active', 'true');
    window.clearTimeout(tocActiveTimer);
    tocActiveTimer = window.setTimeout(() => link.removeAttribute('data-active'), 1200);

    const heading = tocHeadingEls[index];
    if (!heading || !heading.isConnected) return;
    if (mode === 'markdown') return;

    area.querySelectorAll('.is-toc-heading-flash').forEach((el) => el.classList.remove('is-toc-heading-flash'));
    window.clearTimeout(headingFlashTimer);
    heading.classList.add('is-toc-heading-flash');
    headingFlashTimer = window.setTimeout(() => heading.classList.remove('is-toc-heading-flash'), 1200);
    heading.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function previewAssetSrc(src: string): string {
    return src
      .replace(/^\.\.\/\.\.\/assets\/posts\//, '/uploads/posts/')
      .replace(/^\.\.\/\.\.\/assets\/photos\//, '/uploads/photos/')
      .replace(/^\/src\/assets\/posts\//, '/uploads/posts/')
      .replace(/^\/src\/assets\/photos\//, '/uploads/photos/');
  }

  function normalizeEditorImagePreviews(): void {
    area.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      if (img.dataset.edAsset) return;
      const src = img.getAttribute('src') ?? '';
      const preview = previewAssetSrc(src);
      if (!src || preview === src) return;
      img.dataset.edAsset = src;
      img.setAttribute('src', preview);
    });
  }

  function editorHtmlForMarkdown(): string {
    return area.innerHTML.replace(/<img\b[^>]*>/g, (tag) => {
      const m = /\bdata-ed-asset="([^"]*)"/.exec(tag);
      if (!m) return tag;
      return tag.replace(/\bsrc="[^"]*"/, `src="${m[1]!}"`).replace(/\sdata-ed-asset="[^"]*"/, '');
    });
  }

  /** 确保编辑区始终以块级段落承载文字：裸文本包进 <p>，空内容补一个空段落 */
  function ensureParagraphBlocks(): void {
    const kids = Array.from(area.childNodes);
    const hasBlock = kids.some(
      (n) => n.nodeType === 1 && /^(P|H[1-6]|UL|OL|BLOCKQUOTE|PRE|TABLE|HR|FIGURE|DIV|SECTION)$/.test((n as Element).tagName)
    );
    if (!hasBlock) {
      for (const node of kids) {
        if (node.nodeType === 3 && (node.textContent ?? '').trim()) {
          const p = document.createElement('p');
          node.parentNode?.replaceChild(p, node);
          p.appendChild(node);
        }
      }
    }
    if (!area.querySelector('p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, table, hr, figure')) {
      area.innerHTML = '<p><br></p>';
    }
  }

  function setMarkdown(mdText: string): void {
    syncing = true;
    const extracted = extractRawHtml(mdText);
    raws = extracted.raws;
    area.innerHTML = renderMarkdown(mdText, { forEditor: true });
    ensureParagraphBlocks();
    normalizeEditorImagePreviews();
    sourceArea.value = mdText;
    syncing = false;
    updateCount();
    renderTocPreview();
  }

  function syncVisualToSource(): void {
    if (syncing) return;
    syncing = true;
    const mdText = htmlToMarkdown(editorHtmlForMarkdown(), raws);
    sourceArea.value = mdText;
    syncing = false;
  }

  function syncSourceToVisual(): void {
    if (syncing) return;
    syncing = true;
    const mdText = sourceArea.value;
    const extracted = extractRawHtml(mdText);
    raws = extracted.raws;
    area.innerHTML = renderMarkdown(mdText, { forEditor: true });
    ensureParagraphBlocks();
    normalizeEditorImagePreviews();
    syncing = false;
  }

  function setMode(nextMode: 'visual' | 'markdown' | 'split'): void {
    if (mode === 'markdown' && nextMode !== 'markdown') {
      syncSourceToVisual();
    } else if (mode === 'visual' && nextMode !== 'visual') {
      syncVisualToSource();
    }
    mode = nextMode;
    shell.dataset.mode = nextMode;
    shell.querySelectorAll<HTMLButtonElement>('[data-ed-mode]').forEach((btn) => {
      btn.setAttribute('aria-selected', String(btn.dataset.edMode === nextMode));
    });
    updateCount();
    renderTocPreview();
    updateTableTools();
  }

  setMarkdown(initial);

  shell.querySelectorAll<HTMLButtonElement>('[data-ed-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = (btn.dataset.edMode ?? 'visual') as 'visual' | 'markdown' | 'split';
      setMode(m);
    });
  });

  function detectAndPromoteChapters(): void {
    if (mode === 'markdown') {
      syncSourceToVisual();
    }
    const curMd = mode === 'markdown' ? sourceArea.value : htmlToMarkdown(editorHtmlForMarkdown(), raws);
    let promotedCount = 0;
    let inFence = false;
    let hasSeenH2 = false;

    const converted = curMd
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (/^```/.test(trimmed)) {
          inFence = !inFence;
          return line;
        }
        if (inFence || !trimmed) return line;

        const h1Match = /^#\s+(.+)$/.exec(trimmed);
        if (h1Match) {
          promotedCount++;
          hasSeenH2 = true;
          return `## ${h1Match[1]!.trim()}`;
        }

        if (/^##\s+/.test(trimmed)) {
          hasSeenH2 = true;
          return line;
        }
        if (/^#{3,6}\s+/.test(trimmed)) {
          return line;
        }

        const cleanLine = trimmed.replace(/^\*\*([^*]+)\*\*$/, '$1').replace(/^<strong>([^<]+)<\/strong>$/i, '$1').trim();

        // 二级标题模式（如 1.1 / 2.3 / （一） / (1) / 步骤一）
        const h3Pattern =
          /^(?:\d+\.\d+(?:\.\d+)?\s+|[（(][一二三四五六七八九十0-9]+[)）]\s*|步骤[一二三四五六七八九十0-9]+[：:\s]*|[0-9]{1,2}[、.．]\s*)([^\n]{1,38})$/.exec(
            cleanLine
          );
        if (h3Pattern && hasSeenH2 && !/[。！？；]$/.test(cleanLine) && !cleanLine.includes('http')) {
          const cleanTitle = cleanLine.replace(/[：:]$/, '').trim();
          promotedCount++;
          return `### ${cleanTitle}`;
        }

        // 一级标题模式（如 第一章/节/部分 / 一、二、）
        const h2Pattern =
          /^(?:第[一二三四五六七八九十百0-9]+[章节篇天部分]|[一二三四五六七八九十]+[、，.．])\s*([^\n]{1,38})$/.exec(
            cleanLine
          );
        if (h2Pattern && !/[。！？；]$/.test(cleanLine) && !cleanLine.includes('http')) {
          const cleanTitle = cleanLine.replace(/[：:]$/, '').trim();
          promotedCount++;
          hasSeenH2 = true;
          return `## ${cleanTitle}`;
        }

        const boldMatch = /^(?:\*\*([^*]{2,52})\*\*|<strong>([^<]{2,52})<\/strong>)$/i.exec(trimmed);
        if (boldMatch) {
          const rawInner = (boldMatch[1] ?? boldMatch[2] ?? '').replace(/[：:]$/, '').trim();
          const isSignoff = /^[-—─\s]*the\s+end[-—─\s]*$/i.test(rawInner) || /^[-—─]+$/.test(rawInner);
          const isPureIntroLabel = rawInner === '前言';
          if (rawInner && !isSignoff && !isPureIntroLabel && !/[。！？]$/.test(rawInner)) {
            promotedCount++;
            if (hasSeenH2 && /^(?:\d+\.\d+|[（(]|[a-zA-Z0-9]{1,2}[.、）)])/.test(rawInner)) {
              return `### ${rawInner}`;
            }
            hasSeenH2 = true;
            return `## ${rawInner}`;
          }
        }

        return line;
      })
      .join('\n');

    if (promotedCount > 0) {
      setMarkdown(converted);
      opts.onInput();
      const total = collectHeadings().length;
      toast(`已智能识别并升级 ${promotedCount} 处章节标题，当前共 ${total} 个章节坐标`);
    } else {
      renderTocPreview();
      const total = collectHeadings().length;
      if (total > 0) {
        toast(`章节检测完成：当前共识别到 ${total} 个章节坐标`);
      } else {
        toast('未检测到章节标题，可选中标题行点击上方「H2 / H3」或使用加粗单行小节', true);
      }
    }

    const tocBox = bar.querySelector<HTMLElement>('#ed-toc-preview');
    if (tocBox) {
      tocBox.classList.remove('is-toc-box-flash');
      void tocBox.offsetWidth;
      tocBox.classList.add('is-toc-box-flash');
    }
  }

  bar.querySelector('#ed-auto-toc-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    detectAndPromoteChapters();
  });

  function currentBlock(): HTMLElement | null {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node) return null;
    let el: HTMLElement | null =
      node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    while (el && el !== area) {
      if (el.parentElement === area) return el;
      el = el.parentElement;
    }
    return null;
  }

  function hasAncestorTag(tagName: string): boolean {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node) return false;
    let el: HTMLElement | null =
      node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    while (el && el !== area) {
      if (el.tagName === tagName) return true;
      el = el.parentElement;
    }
    return false;
  }

  function wrapSelection(tag: string): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      toast('请先在正文中拖选一段文字', true);
      return;
    }
    const range = sel.getRangeAt(0);
    const el = document.createElement(tag);
    try {
      range.surroundContents(el);
    } catch {
      el.appendChild(range.extractContents());
      range.insertNode(el);
    }
    sel.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(el);
    sel.addRange(after);
    changed();
  }

  const ALIGNABLE = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE']);

  function applyBlock(tag: string): void {
    if (mode === 'markdown') {
      const prefix = tag === 'h2' ? '## ' : tag === 'h3' ? '### ' : tag === 'blockquote' ? '> ' : '';
      insertInTextarea(prefix, '');
      return;
    }
    area.focus();
    const cur = currentBlock()?.tagName.toLowerCase();
    const next = cur === tag && tag !== 'p' ? 'p' : tag;
    document.execCommand('formatBlock', false, next);
    changed();
  }

  function unwrapTag(tagName: string): boolean {
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    let el: HTMLElement | null =
      node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node?.parentElement ?? null);
    while (el && el !== area) {
      if (el.tagName === tagName) {
        const parent = el.parentNode;
        if (!parent) return false;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function alignBlock(kind: 'left' | 'center' | 'right'): void {
    const block = currentBlock();
    if (!block || !ALIGNABLE.has(block.tagName)) {
      toast('对齐作用于整段：请先把光标放进正文段落、标题或引用块内', true);
      return;
    }
    if (block.querySelector('img')) {
      toast('含图片的段落无需设置对齐（图片默认按版心自适应）', true);
      return;
    }
    block.classList.remove('center', 'right', 'left');
    if (kind !== 'left') block.classList.add(kind);
    changed();
  }

  function insertHr(cls: string): void {
    const html = `<hr class="${cls || 'star'}">`;
    if (mode === 'markdown') {
      insertInTextarea(`\n\n${html}\n\n`, '');
      return;
    }
    area.focus();
    document.execCommand('insertHTML', false, html + '<p><br></p>');
    // 光标移到分割线下方的新段落，避免继续输入和 <hr> 同一行
    const hrs = area.querySelectorAll('hr');
    const lastHr = hrs[hrs.length - 1];
    const next = lastHr?.nextElementSibling;
    if (next && next.tagName === 'P') {
      const range = document.createRange();
      range.selectNodeContents(next);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    changed();
  }

  function insertInTextarea(before: string, after: string): void {
    const start = sourceArea.selectionStart ?? 0;
    const end = sourceArea.selectionEnd ?? 0;
    const val = sourceArea.value;
    const selected = val.slice(start, end) || '文本内容';
    sourceArea.value = val.slice(0, start) + before + selected + after + val.slice(end);
    sourceArea.focus();
    syncSourceToVisual();
    changed();
  }

  /** 源码模式插入完整块（表格 / 图片）：不追加「文本内容」占位，直接替换选区 */
  function insertMarkdownBlock(text: string): void {
    const start = sourceArea.selectionStart ?? 0;
    const end = sourceArea.selectionEnd ?? 0;
    const val = sourceArea.value;
    sourceArea.value = val.slice(0, start) + text + val.slice(end);
    const caret = start + text.length;
    sourceArea.focus();
    sourceArea.setSelectionRange(caret, caret);
    syncSourceToVisual();
    changed();
  }

  /* ---------------- 悬浮弹窗与选中文本上方浮层：插入链接 / 配图 ---------------- */

  function closeLinkPopover(): void {
    if (linkPopoverCleanup) {
      linkPopoverCleanup();
      linkPopoverCleanup = null;
    }
    if (activeLinkPopover) {
      activeLinkPopover.remove();
      activeLinkPopover = null;
    }
  }

  function closeImageModal(): void {
    drawerSeq += 1;
    if (activeImgModal) {
      activeImgModal.remove();
      activeImgModal = null;
    }
    drawer.hidden = true;
    drawer.innerHTML = '';
  }

  function closeDrawer(): void {
    closeLinkPopover();
    closeImageModal();
    savedRange = null;
  }

  function captureSelection(): void {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (area.contains(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
        lastValidRange = range.cloneRange();
        return;
      }
    }
    if (lastValidRange && area.contains(lastValidRange.commonAncestorContainer)) {
      savedRange = lastValidRange.cloneRange();
    } else {
      savedRange = null;
    }
  }

  function focusAreaWithRange(range: Range | null): void {
    area.focus();
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (range && area.contains(range.commonAncestorContainer)) {
      sel.addRange(range);
      return;
    }
    const end = document.createRange();
    end.selectNodeContents(area);
    end.collapse(false);
    sel.addRange(end);
  }

  function insertHtmlAtRange(html: string, range: Range | null): void {
    focusAreaWithRange(range);
    document.execCommand('insertHTML', false, html);
  }

  function insertImages(items: Array<{ src: string; alt: string }>, range: Range | null = savedRange): void {
    if (!items.length || !area.isConnected) return;
    if (mode === 'markdown') {
      const md = items.map((it) => `![${it.alt}](${it.src})`).join('\n\n');
      insertMarkdownBlock(`\n\n${md}\n\n`);
      return;
    }
    const html = items.map((it) => `<p><img src="${esc(it.src)}" alt="${esc(it.alt)}"></p>`).join('');
    insertHtmlAtRange(html, range);
    normalizeEditorImagePreviews();
    savedRange = null;
    changed();
  }

  function isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|svg|heic|heif)$/i.test(file.name);
  }

  async function uploadImages(files: File[]): Promise<Array<{ src: string; alt: string }>> {
    if (!opts.onUploadPostAsset) {
      toast('当前没有上传通道，请重新登录后台后再试', true);
      return [];
    }
    const out: Array<{ src: string; alt: string }> = [];
    for (const file of files) {
      let rel: string | null = null;
      try {
        rel = await opts.onUploadPostAsset(file);
      } catch {
        rel = null;
      }
      if (!rel) {
        toast(`「${file.name}」上传失败`, true);
        continue;
      }
      out.push({ src: rel, alt: file.name.replace(/\.[^.]+$/, '') });
    }
    return out;
  }

  function isImageMedia(item: StudioMediaItem): boolean {
    return (item.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(item.path);
  }

  /**
   * 链接插入功能：选中一段正文文字后，在所选文字正上方弹出悬浮输入框输入链接
   */
  function openLinkDrawer(): void {
    closeDrawer();
    captureSelection();

    if (mode === 'markdown') {
      const start = sourceArea.selectionStart ?? 0;
      const end = sourceArea.selectionEnd ?? 0;
      const selectedText = sourceArea.value.slice(start, end).trim();
      if (!selectedText) {
        toast('请先在正文中拖选需要添加链接的文字', true);
        return;
      }
      const srcRect = sourceArea.getBoundingClientRect();
      mountLinkPopover({
        anchorRect: new DOMRect(srcRect.left + srcRect.width / 2 - 40, srcRect.top + 36, 80, 24),
        initialUrl: '',
        selectedLabel: selectedText,
        onConfirm: (url) => {
          sourceArea.setSelectionRange(start, end);
          insertInTextarea('[', `](${url})`);
        },
      });
      return;
    }

    // 检查是否光标在已有 <a> 内但未拖选文字：自动选中该 <a> 的文字
    let existingHref = '';
    if ((!savedRange || savedRange.collapsed) && window.getSelection()?.anchorNode) {
      const node = window.getSelection()!.anchorNode!;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
      const anchor = el?.closest<HTMLAnchorElement>('a');
      if (anchor && area.contains(anchor)) {
        const r = document.createRange();
        r.selectNodeContents(anchor);
        savedRange = r;
        lastValidRange = r.cloneRange();
        existingHref = anchor.getAttribute('href') ?? '';
      }
    }

    if (!savedRange || savedRange.collapsed || !savedRange.toString().trim()) {
      toast('请先在正文中选中一段文字，再点击插入链接', true);
      return;
    }

    const selectedText = savedRange.toString().trim();
    if (!existingHref) {
      const commonEl =
        savedRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (savedRange.commonAncestorContainer as HTMLElement)
          : savedRange.commonAncestorContainer.parentElement;
      const anchor = commonEl?.closest<HTMLAnchorElement>('a');
      if (anchor && area.contains(anchor)) {
        existingHref = anchor.getAttribute('href') ?? '';
      }
    }

    const rects = savedRange.getClientRects();
    const firstRect = rects.length > 0 ? rects[0]! : savedRange.getBoundingClientRect();
    const fallbackRect = area.getBoundingClientRect();
    const anchorRect =
      firstRect.width > 0 || firstRect.height > 0
        ? firstRect
        : new DOMRect(fallbackRect.left + fallbackRect.width / 2 - 40, fallbackRect.top + 48, 80, 24);

    const rangeToUse = savedRange.cloneRange();

    mountLinkPopover({
      anchorRect,
      initialUrl: existingHref,
      selectedLabel: selectedText,
      onConfirm: (finalUrl) => {
        insertHtmlAtRange(
          `<a href="${esc(finalUrl)}" target="_blank" rel="noopener noreferrer">${esc(selectedText)}</a>`,
          rangeToUse
        );
        savedRange = null;
        changed();
      },
    });
  }

  function mountLinkPopover(params: {
    anchorRect: DOMRect;
    initialUrl: string;
    selectedLabel: string;
    onConfirm: (url: string) => void;
  }): void {
    const pop = document.createElement('div');
    pop.className = 'ed-link-popover';
    pop.id = 'ed-link-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', '插入超链接');

    const shortLabel =
      params.selectedLabel.length > 18
        ? `${params.selectedLabel.slice(0, 18)}…`
        : params.selectedLabel;

    pop.innerHTML = `
      <div class="ed-link-popover-head">
        <span class="ed-link-popover-icon" aria-hidden="true">${LINK_ICON}</span>
        <span class="ed-link-popover-target">为「${esc(shortLabel)}」添加链接</span>
      </div>
      <div class="ed-link-popover-row">
        <input
          type="url"
          class="st-input ed-link-popover-input"
          id="ed-link-url"
          value="${esc(params.initialUrl)}"
          placeholder="输入或粘贴链接 https://..."
          autocomplete="off"
        />
        <button type="button" class="st-btn st-btn--primary ed-link-popover-ok" id="ed-link-confirm">确定</button>
        <button type="button" class="stage-mini-btn ed-link-popover-cancel" id="ed-link-close" title="取消 (Esc)">×</button>
      </div>
      <span class="ed-link-popover-arrow" aria-hidden="true"></span>`;

    document.body.appendChild(pop);
    activeLinkPopover = pop;

    const positionPopover = () => {
      if (!activeLinkPopover) return;
      const popRect = pop.getBoundingClientRect();
      const targetCenterX = params.anchorRect.left + params.anchorRect.width / 2;
      const margin = 14;
      const left = Math.max(
        margin,
        Math.min(window.innerWidth - popRect.width - margin, targetCenterX - popRect.width / 2)
      );
      let top = params.anchorRect.top - popRect.height - 12;
      let isBelow = false;
      if (top < margin) {
        top = Math.min(window.innerHeight - popRect.height - margin, params.anchorRect.bottom + 12);
        isBelow = true;
      }
      pop.classList.toggle('is-below', isBelow);
      pop.style.left = `${Math.round(left)}px`;
      pop.style.top = `${Math.round(top)}px`;
      const arrowX = Math.max(18, Math.min(popRect.width - 18, targetCenterX - left));
      pop.style.setProperty('--arrow-x', `${Math.round(arrowX)}px`);
    };

    positionPopover();

    const urlInput = pop.querySelector<HTMLInputElement>('#ed-link-url');
    if (urlInput) {
      urlInput.focus();
      urlInput.select();
    }

    const submit = () => {
      const raw = (urlInput?.value ?? '').trim();
      if (!raw || raw === 'https://' || raw === 'http://') {
        toast('请输入有效的链接地址', true);
        urlInput?.focus();
        return;
      }
      const normalized = /^(https?:\/\/|mailto:|tel:|\/|#|\.)/i.test(raw) ? raw : `https://${raw}`;
      params.onConfirm(normalized);
      closeLinkPopover();
    };

    pop.querySelector('#ed-link-confirm')?.addEventListener('click', submit);
    pop.querySelector('#ed-link-close')?.addEventListener('click', () => {
      closeLinkPopover();
      focusAreaWithRange(savedRange);
    });

    urlInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeLinkPopover();
        focusAreaWithRange(savedRange);
      }
    });

    const onOutsideDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t || pop.contains(t)) return;
      if ((t as HTMLElement).closest?.('[data-cmd="createLink"]')) return;
      closeLinkPopover();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLinkPopover();
      }
    };
    window.addEventListener('mousedown', onOutsideDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    linkPopoverCleanup = () => {
      window.removeEventListener('mousedown', onOutsideDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }

  /**
   * 配图插入功能：弹出居中悬浮弹窗（从媒体库选择大图或上传本地照片，去除「已载入配图」项，提示字号 18px）
   */
  function openImageDrawer(): void {
    closeDrawer();
    captureSelection();
    drawerSeq += 1;
    const seq = drawerSeq;
    const hintText = legacyImageHint
      ? legacyImageHint()
      : '上传的照片会自动归档到 src/assets/posts/<文章 slug>/，并在媒体库中按文章分组展示。';

    const backdrop = document.createElement('div');
    backdrop.className = 'ed-img-modal-backdrop';
    backdrop.id = 'ed-img-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', '选择或上传文章配图');

    backdrop.innerHTML = `
      <div class="ed-img-modal">
        <div class="ed-img-modal-head">
          <div class="ed-img-modal-title-group">
            <span class="ed-img-modal-kicker">INSERT IMAGE // 媒体库与本地上传</span>
            <h3 class="ed-img-modal-title">从媒体库选择或上传照片</h3>
          </div>
          <button type="button" class="stage-mini-btn ed-img-modal-close" id="ed-drawer-close" aria-label="关闭弹窗">关闭 ×</button>
        </div>

        <div class="ed-img-modal-body">
          <section class="ed-img-section">
            <div class="ed-img-section-head">
              <span>01 // 从媒体库中选择照片（点击缩略图直接插入正文）</span>
              <span class="ed-img-section-count" id="ed-media-count-label">读取中…</span>
            </div>
            <div class="ed-media-grid" id="ed-media-grid">
              <p class="ed-media-empty">正在读取媒体库中的照片…</p>
            </div>
          </section>

          <section class="ed-img-section">
            <div class="ed-img-section-head">
              <span>02 // 上传本地照片</span>
            </div>
            <div class="ed-dropzone" id="ed-img-dropzone" role="button" tabindex="0" aria-label="上传本地图片">
              <div class="ed-dropzone-content">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>把照片拖到这里，或点击选择本地照片上传（支持多选）</span>
              </div>
              <input type="file" id="ed-img-upload" accept="image/*" multiple hidden />
            </div>
          </section>

          <section class="ed-img-section">
            <div class="ed-img-section-head">
              <span>03 // 手填图片路径或外部图床链接（兜底）</span>
            </div>
            <div class="ed-drawer-grid ed-drawer-grid--image">
              <input class="st-input" id="ed-img-src" value="" placeholder="../../assets/posts/xxx.png 或 /uploads/posts/<slug>/xxx.jpg" />
              <input class="st-input" id="ed-img-alt" value="" placeholder="图片说明文字（Alt / 图注，可选）" />
              <button type="button" class="st-btn st-btn--primary" id="ed-img-confirm">插入图片</button>
            </div>
            <div class="st-hint ed-img-modal-hint">${esc(hintText)}</div>
          </section>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    activeImgModal = backdrop;

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onEsc);
        closeImageModal();
      }
    };
    window.addEventListener('keydown', onEsc);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        window.removeEventListener('keydown', onEsc);
        closeImageModal();
      }
    });

    backdrop.querySelector('#ed-drawer-close')?.addEventListener('click', () => {
      window.removeEventListener('keydown', onEsc);
      closeImageModal();
    });

    const grid = backdrop.querySelector<HTMLElement>('#ed-media-grid');
    const countLabel = backdrop.querySelector<HTMLElement>('#ed-media-count-label');
    if (grid) {
      void (async () => {
        try {
          const res = await fetch('/api/media', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { media?: StudioMediaItem[] };
          if (seq >= drawerSeq && activeImgModal === backdrop) {
            const list = (Array.isArray(data.media) ? data.media : []).filter(isImageMedia);
            if (countLabel) countLabel.textContent = `共 ${list.length} 张照片`;
            if (!list.length) {
              grid.innerHTML = `<p class="ed-media-empty">媒体库还没有照片，请使用下方上传区上传照片。</p>`;
            } else {
              grid.innerHTML = list
                .map(
                  (item) => `
                  <button type="button" class="ed-media-item" data-media-path="${esc(item.path)}"
                          data-media-name="${esc(item.filename)}"
                          title="${esc(item.filename)}${item.postTitle ? ` · ${esc(item.postTitle)}` : ''}">
                    <div class="ed-media-thumb-box">
                      <img src="${esc(item.path)}" alt="${esc(item.filename)}" loading="lazy" />
                    </div>
                    <div class="ed-media-caption">
                      <span class="ed-media-name">${esc(item.filename)}</span>
                      ${item.postTitle ? `<span class="ed-media-owner">${esc(item.postTitle)}</span>` : ''}
                    </div>
                  </button>`
                )
                .join('');
            }
          }
        } catch (error) {
          if (seq >= drawerSeq && activeImgModal === backdrop) {
            if (countLabel) countLabel.textContent = '读取失败';
            grid.innerHTML = `<p class="ed-media-empty ed-media-empty--error">媒体库读取失败（${esc(
              (error as Error).message
            )}），可以使用下方上传区或手动填写路径。</p>`;
          }
        }
      })();

      grid.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-media-path]');
        if (!btn) return;
        insertImages([{ src: btn.dataset.mediaPath ?? '', alt: btn.dataset.mediaName ?? '' }]);
        window.removeEventListener('keydown', onEsc);
        closeImageModal();
      });
    }

    const uploadInput = backdrop.querySelector<HTMLInputElement>('#ed-img-upload');
    const dropzone = backdrop.querySelector<HTMLElement>('#ed-img-dropzone');
    const handleFiles = async (files: File[]): Promise<void> => {
      if (!files.length) return;
      const images = files.filter(isImageFile);
      if (!images.length) {
        toast('请选择图片文件', true);
        return;
      }
      dropzone?.classList.add('is-dragover');
      const items = await uploadImages(images);
      if (seq !== drawerSeq) return;
      if (!items.length) {
        dropzone?.classList.remove('is-dragover');
        return;
      }
      insertImages(items);
      window.removeEventListener('keydown', onEsc);
      closeImageModal();
    };
    const pickFiles = () => uploadInput?.click();
    dropzone?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('input')) return;
      pickFiles();
    });
    dropzone?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      pickFiles();
    });
    uploadInput?.addEventListener('change', () => {
      const files = Array.from(uploadInput.files ?? []);
      uploadInput.value = '';
      void handleFiles(files);
    });
    dropzone?.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dropzone.classList.add('is-dragover');
    });
    dropzone?.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && dropzone.contains(e.relatedTarget as Node)) return;
      dropzone.classList.remove('is-dragover');
    });
    dropzone?.addEventListener('drop', (e) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      void handleFiles(Array.from(e.dataTransfer.files ?? []));
    });

    backdrop.querySelector('#ed-img-confirm')?.addEventListener('click', () => {
      const src = (backdrop.querySelector<HTMLInputElement>('#ed-img-src')?.value ?? '').trim();
      const alt = (backdrop.querySelector<HTMLInputElement>('#ed-img-alt')?.value ?? '').trim();
      if (!src) {
        toast('请填写图片路径，或从媒体库选一张照片', true);
        return;
      }
      insertImages([{ src, alt }]);
      window.removeEventListener('keydown', onEsc);
      closeImageModal();
    });
  }

  /* ---------------- 表格上下文：增删行列 / 删除表格 ---------------- */

  function tableContext(): TableContext | null {
    if (mode === 'markdown') return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode;
    const el = node?.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : (node?.parentElement ?? null);
    const cell = el?.closest<HTMLTableCellElement>('td, th') ?? null;
    const table = cell?.closest<HTMLTableElement>('table') ?? null;
    if (!cell || !table || !area.contains(table)) return null;
    const row = cell.closest<HTMLTableRowElement>('tr');
    if (!row) return null;
    return {
      table,
      row,
      cell,
      rowIndex: Array.prototype.indexOf.call(table.rows, row),
      cellIndex: Array.prototype.indexOf.call(row.cells, cell),
    };
  }

  function updateTableTools(): void {
    const tools = bar.querySelector<HTMLElement>('#ed-table-tools');
    if (!tools) return;
    const ctx = tableContext();
    tools.hidden = !ctx;
    if (!ctx) return;
    const rowDel = tools.querySelector<HTMLButtonElement>('[data-table-action="row-del"]');
    const colDel = tools.querySelector<HTMLButtonElement>('[data-table-action="col-del"]');
    if (rowDel) rowDel.disabled = ctx.table.rows.length <= 1;
    if (colDel) colDel.disabled = (ctx.table.rows[0]?.cells.length ?? 0) <= 1;
  }

  function focusTableCell(cell: HTMLTableCellElement | null | undefined): void {
    if (!cell) return;
    area.focus();
    const range = document.createRange();
    range.setStart(cell, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    updateTableTools();
  }

  function newTableRow(columns: number): HTMLTableRowElement {
    const row = document.createElement('tr');
    for (let i = 0; i < Math.max(1, columns); i++) row.appendChild(document.createElement('td'));
    return row;
  }

  function tableBody(table: HTMLTableElement): HTMLTableSectionElement {
    return table.tBodies[0] ?? table.createTBody();
  }

  function applyTableAction(action: string): void {
    const ctx = tableContext();
    if (!ctx) {
      toast('请先把光标放进表格内', true);
      updateTableTools();
      return;
    }
    const { table, row, cellIndex, rowIndex } = ctx;
    const columnCount = table.rows[0]?.cells.length ?? 1;
    const inHead = row.parentElement?.nodeName === 'THEAD';

    if (action === 'row-add' || action === 'row-add-above') {
      const nextRow = newTableRow(columnCount);
      if (inHead) {
        const body = tableBody(table);
        body.insertBefore(nextRow, body.firstElementChild);
      } else {
        row.parentElement?.insertBefore(nextRow, action === 'row-add' ? row.nextSibling : row);
      }
      focusTableCell(nextRow.cells[cellIndex] ?? nextRow.cells[0] ?? null);
      changed();
      return;
    }

    if (action === 'row-del') {
      if (table.rows.length <= 1) {
        toast('表格至少保留一行', true);
        return;
      }
      if (inHead) {
        row.remove();
        const promoted = table.tBodies[0]?.rows[0] ?? null;
        if (promoted) {
          let head = table.tHead;
          if (!head) {
            head = document.createElement('thead');
            table.insertBefore(head, table.firstChild);
          }
          head.appendChild(promoted);
          for (const oldCell of Array.from(promoted.cells)) {
            const th = document.createElement('th');
            th.innerHTML = oldCell.innerHTML;
            promoted.replaceChild(th, oldCell);
          }
          focusTableCell(promoted.cells[cellIndex] ?? promoted.cells[0] ?? null);
        }
      } else {
        const fallback = (row.nextElementSibling ?? row.previousElementSibling) as HTMLTableRowElement | null;
        row.remove();
        focusTableCell(
          fallback?.cells[cellIndex] ??
            table.tHead?.rows[0]?.cells[cellIndex] ??
            table.tHead?.rows[0]?.cells[0] ??
            null
        );
      }
      changed();
      return;
    }

    if (action === 'col-add') {
      const index = cellIndex + 1;
      for (const r of Array.from(table.rows)) {
        const header = r.parentElement?.nodeName === 'THEAD';
        const nextCell = document.createElement(header ? 'th' : 'td');
        r.insertBefore(nextCell, r.cells[index] ?? null);
      }
      const targetRow = table.rows[rowIndex];
      focusTableCell(targetRow?.cells[index] ?? targetRow?.cells[targetRow.cells.length - 1] ?? null);
      changed();
      return;
    }

    if (action === 'col-del') {
      const columns = table.rows[0]?.cells.length ?? 0;
      if (columns <= 1) {
        toast('表格至少保留一列', true);
        return;
      }
      for (const r of Array.from(table.rows)) {
        const target = r.cells[cellIndex];
        if (target) target.remove();
      }
      const targetRow = table.rows[Math.min(rowIndex, table.rows.length - 1)];
      focusTableCell(
        targetRow?.cells[Math.min(cellIndex, targetRow.cells.length - 1)] ?? null
      );
      changed();
      return;
    }

    if (action === 'table-del') {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<br>';
      table.replaceWith(paragraph);
      area.focus();
      const range = document.createRange();
      range.setStart(paragraph, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      changed();
    }
  }

  const ACTIONS: Record<string, () => void> = {
    bold: () => {
      if (mode === 'markdown') insertInTextarea('**', '**');
      else document.execCommand('bold');
    },
    italic: () => {
      if (mode === 'markdown') insertInTextarea('*', '*');
      else document.execCommand('italic');
    },
    strikeThrough: () => {
      if (mode === 'markdown') insertInTextarea('~~', '~~');
      else document.execCommand('strikeThrough');
    },
    insertUnorderedList: () => {
      if (mode === 'markdown') insertInTextarea('\n- ', '');
      else document.execCommand('insertUnorderedList');
    },
    insertOrderedList: () => {
      if (mode === 'markdown') insertInTextarea('\n1. ', '');
      else document.execCommand('insertOrderedList');
    },
    mark: () => {
      if (mode === 'markdown') {
        insertInTextarea('<mark>', '</mark>');
        return;
      }
      if (!unwrapTag('MARK')) wrapSelection('mark');
    },
    inlineCode: () => {
      if (mode === 'markdown') {
        insertInTextarea('`', '`');
        return;
      }
      if (!unwrapTag('CODE')) wrapSelection('code');
    },
    insertCodeblock: () => {
      if (mode === 'markdown') {
        insertInTextarea('\n```bash\n# 在此输入命令或代码\n', '\n```\n');
      } else {
        area.focus();
        document.execCommand('insertHTML', false, `<pre><code># 在此输入命令或代码\njava -Xms4G -Xmx4G -jar server.jar nogui</code></pre><p><br></p>`);
        changed();
      }
    },
    insertTable: () => {
      if (mode === 'markdown') {
        insertMarkdownBlock('\n\n|  |  |\n| --- | --- |\n|  |  |\n\n');
        return;
      }
      area.focus();
      tableSeq += 1;
      const marker = `ed-table-new-${tableSeq}`;
      const before = new Set<HTMLTableElement>(Array.from(area.querySelectorAll('table')));
      document.execCommand(
        'insertHTML',
        false,
        `<table data-ed-new-table="${marker}"><thead><tr><th></th><th></th></tr></thead><tbody><tr><td></td><td></td></tr></tbody></table><p><br></p>`
      );
      const table =
        area.querySelector<HTMLTableElement>(`table[data-ed-new-table="${marker}"]`) ??
        Array.from(area.querySelectorAll('table')).find((t) => !before.has(t)) ??
        null;
      table?.removeAttribute('data-ed-new-table');
      focusTableCell(table?.tHead?.rows[0]?.cells[0] ?? table?.rows[0]?.cells[0] ?? null);
      changed();
    },
    createLink: () => openLinkDrawer(),
    insertImage: () => openImageDrawer(),
  };

  bar.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.ed-bar')) e.preventDefault();
  });

  bar.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const tocToggle = target.closest<HTMLButtonElement>('[data-ed-toc-toggle]');
    if (tocToggle) {
      e.preventDefault();
      const group = tocToggle.closest<HTMLElement>('[data-toc-group]');
      if (group) {
        const isCollapsed = group.dataset.collapsed !== 'false';
        group.dataset.collapsed = isCollapsed ? 'false' : 'true';
        tocToggle.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
      }
      return;
    }

    const tocLink = target.closest<HTMLAnchorElement>('.ed-toc-preview .toc-list a');
    if (tocLink) {
      e.preventDefault();
      const parentGroup = tocLink.closest<HTMLElement>('[data-toc-group]');
      if (parentGroup && parentGroup.dataset.collapsed !== 'false') {
        parentGroup.dataset.collapsed = 'false';
        parentGroup.querySelector('[data-ed-toc-toggle]')?.setAttribute('aria-expanded', 'true');
      }
      const idx = tocLink.dataset.tocIndex;
      if (idx !== undefined && /^\d+$/.test(idx)) jumpToHeading(Number(idx), tocLink);
      return;
    }

    const blockBtn = target.closest<HTMLButtonElement>('button[data-block]');
    if (blockBtn) {
      applyBlock(blockBtn.dataset.block ?? 'p');
      return;
    }

    const tableBtn = target.closest<HTMLButtonElement>('button[data-table-action]');
    if (tableBtn) {
      applyTableAction(tableBtn.dataset.tableAction ?? '');
      return;
    }

    const alignBtn = target.closest<HTMLButtonElement>('button[data-align]');
    if (alignBtn) {
      alignBlock((alignBtn.dataset.align ?? 'left') as 'left' | 'center' | 'right');
      return;
    }

    const hrBtn = target.closest<HTMLButtonElement>('button[data-hr]');
    if (hrBtn) {
      insertHr(hrBtn.dataset.hr ?? '');
      return;
    }

    const btn = target.closest<HTMLButtonElement>('button[data-cmd]');
    if (!btn) return;
    const cmd = btn.dataset.cmd ?? '';
    if (cmd !== 'createLink' && cmd !== 'insertImage' && mode !== 'markdown') {
      area.focus();
    }
    ACTIONS[cmd]?.();
    if (cmd !== 'createLink' && cmd !== 'insertImage') {
      changed();
    }
  });

  try {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  } catch {
    /* 非 Chromium 环境忽略 */
  }

  area.addEventListener('input', () => {
    ensureParagraphBlocks();
    if (mode === 'split') syncVisualToSource();
    scheduleHeavy(120);
  });

  sourceArea.addEventListener('input', () => {
    syncSourceToVisual();
    updateCount();
    renderTocPreview();
    opts.onInput();
  });

  function extractClipboardImages(dt: DataTransfer | null): File[] {
    if (!dt) return [];
    const rawFiles: File[] = [];
    if (dt.files && dt.files.length > 0) {
      for (const f of Array.from(dt.files)) {
        if (isImageFile(f)) rawFiles.push(f);
      }
    }
    if (rawFiles.length === 0 && dt.items) {
      for (const item of Array.from(dt.items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) rawFiles.push(f);
        }
      }
    }
    return rawFiles.map((file) => {
      if (!file.name || /^image\.[a-z0-9]+$/i.test(file.name)) {
        pasteSeq += 1;
        const ext = (file.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
        return new File([file], `paste-${Date.now()}-${pasteSeq}.${ext}`, {
          type: file.type || `image/${ext}`,
          lastModified: file.lastModified || Date.now(),
        });
      }
      return file;
    });
  }

  area.addEventListener('paste', (e) => {
    const images = extractClipboardImages(e.clipboardData);
    if (images.length > 0) {
      e.preventDefault();
      captureSelection();
      const targetRange = savedRange ? savedRange.cloneRange() : null;
      void (async () => {
        const items = await uploadImages(images);
        if (items.length) insertImages(items, targetRange);
      })();
      return;
    }
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  sourceArea.addEventListener('paste', (e) => {
    const images = extractClipboardImages(e.clipboardData);
    if (images.length === 0) return;
    e.preventDefault();
    void (async () => {
      const items = await uploadImages(images);
      if (!items.length) return;
      const md = items.map((it) => `![${it.alt}](${it.src})`).join('\n\n');
      insertMarkdownBlock(`\n\n${md}\n\n`);
    })();
  });

  function dropHasFiles(dt: DataTransfer | null): boolean {
    return !!dt && Array.from(dt.types).includes('Files');
  }

  function dropRangeAt(x: number, y: number): Range {
    let range: Range | null = null;
    if (typeof document.caretRangeFromPoint === 'function') {
      range = document.caretRangeFromPoint(x, y);
    } else if (typeof document.caretPositionFromPoint === 'function') {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }
    if (!range || !area.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(area);
      range.collapse(false);
    }
    return range;
  }

  area.addEventListener('dragover', (e) => {
    if (!dropHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    area.classList.add('is-drop-target');
  });
  area.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && area.contains(e.relatedTarget as Node)) return;
    area.classList.remove('is-drop-target');
  });
  area.addEventListener('drop', (e) => {
    area.classList.remove('is-drop-target');
    if (!dropHasFiles(e.dataTransfer)) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []).filter(isImageFile);
    if (!files.length) {
      toast('只能把图片文件拖进正文', true);
      return;
    }
    if (mode === 'markdown') {
      toast('源码模式下请用「插入或上传配图」按钮上传图片', true);
      return;
    }
    const range = dropRangeAt(e.clientX, e.clientY);
    void (async () => {
      const items = await uploadImages(files);
      if (items.length) insertImages(items, range);
    })();
  });

  area.addEventListener('keyup', () => {
    captureSelection();
    changed();
  });
  area.addEventListener('mouseup', () => {
    captureSelection();
    syncToolbar();
  });
  area.addEventListener('focus', () => updateTableTools());
  area.addEventListener('click', () => updateTableTools());

  const onSelectionChange = (): void => {
    if (!area.isConnected) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      if (area.contains(r.commonAncestorContainer)) {
        lastValidRange = r.cloneRange();
      }
    }
    updateTableTools();
    syncToolbar();
  };
  document.addEventListener('selectionchange', onSelectionChange);

  const destroyEditor = (): void => {
    document.removeEventListener('selectionchange', onSelectionChange);
    closeDrawer();
    if (tocActiveTimer !== undefined) window.clearTimeout(tocActiveTimer);
    if (headingFlashTimer !== undefined) window.clearTimeout(headingFlashTimer);
    if (activeEditorCleanup === destroyEditor) {
      activeEditorCleanup = null;
    }
  };
  activeEditorCleanup = destroyEditor;

  let heavyTimer = 0;

  /** 高频编辑（连续插入分割线等）时合并重活：Markdown 同步、目录、字数与外部回调 */
  function scheduleHeavy(delay = 160): void {
    if (heavyTimer) window.clearTimeout(heavyTimer);
    heavyTimer = window.setTimeout(() => {
      heavyTimer = 0;
      if (mode !== 'markdown') syncVisualToSource();
      updateCount();
      renderTocPreview();
      opts.onInput();
    }, delay);
  }

  function changed(): void {
    if (mode === 'split') syncVisualToSource();
    syncToolbar();
    scheduleHeavy();
  }

  function syncToolbar(): void {
    const block = currentBlock();
    const tag = block?.tagName.toLowerCase() ?? '';

    bar.querySelectorAll<HTMLButtonElement>('button[data-block]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.block === tag));
    });

    const isCenter = block?.classList.contains('center') ?? false;
    const isRight = block?.classList.contains('right') ?? false;
    bar.querySelectorAll<HTMLButtonElement>('button[data-align]').forEach((b) => {
      const want = b.dataset.align;
      const on = want === 'center' ? isCenter : want === 'right' ? isRight : !isCenter && !isRight;
      b.setAttribute('aria-pressed', String(on));
    });

    if (mode !== 'markdown' && area.contains(window.getSelection()?.anchorNode ?? null)) {
      const queryState = (cmd: string): boolean => {
        try {
          return document.queryCommandState(cmd);
        } catch {
          return false;
        }
      };
      bar.querySelector<HTMLButtonElement>('button[data-cmd="bold"]')?.setAttribute('aria-pressed', String(queryState('bold') || hasAncestorTag('STRONG') || hasAncestorTag('B')));
      bar.querySelector<HTMLButtonElement>('button[data-cmd="italic"]')?.setAttribute('aria-pressed', String(queryState('italic') || hasAncestorTag('EM') || hasAncestorTag('I')));
      bar.querySelector<HTMLButtonElement>('button[data-cmd="strikeThrough"]')?.setAttribute('aria-pressed', String(queryState('strikeThrough') || hasAncestorTag('DEL') || hasAncestorTag('S') || hasAncestorTag('STRIKE')));
      bar.querySelector<HTMLButtonElement>('button[data-cmd="mark"]')?.setAttribute('aria-pressed', String(hasAncestorTag('MARK')));
      bar.querySelector<HTMLButtonElement>('button[data-cmd="inlineCode"]')?.setAttribute('aria-pressed', String(hasAncestorTag('CODE')));
    }

    updateTableTools();
  }

  function updateCount(): void {
    const text = (area.textContent ?? '').replace(/\s/g, '');
    const chars = text.length;
    const mins = Math.max(1, Math.round(chars / 400));
    const el = bar.querySelector('#ed-count');
    if (el) el.textContent = `WORD COUNT // ${chars.toLocaleString('zh-CN')} 字 · 预计阅读 ${mins} 分钟`;
    const inlineStat = shell.querySelector('#ed-inline-stat');
    if (inlineStat) inlineStat.textContent = `${chars.toLocaleString('zh-CN')} 字 · 约 ${mins} 分钟`;
  }

  return {
    getMarkdown: () => (mode === 'markdown' ? sourceArea.value : htmlToMarkdown(editorHtmlForMarkdown(), raws)),
    getHtml: () => area.innerHTML,
    getHeadings,
    setMode,
    getMode: () => mode,
    remount: (areaHostNext, barHostNext) => {
      areaHostNext.appendChild(shell);
      barHostNext.appendChild(bar);
      updateCount();
      renderTocPreview();
      syncToolbar();
    },
    setMarkdown,
    isEmpty: () => (area.textContent ?? '').trim() === '' && area.querySelectorAll('img, hr').length === 0,
    destroy: destroyEditor,
  };
}

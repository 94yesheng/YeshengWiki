/**
 * 蓝图双模态正文编辑器（所见即所得 Visual ↔ Markdown 源码 ↔ 双栏对照 Split）
 *
 * 相比旧版调整与新增：
 *   1. 支持「富文本蓝图视图」「Markdown 源码」「双栏同步对照」三种编辑模式无缝切换；
 *   2. 新增 HUD 文章页专属排版块接口：代码终端块（Codeblock）、行内代码（Inline Code）、
 *      可增删行列的表格（Table）；
 *   3. 新增「一键识别粗体小节为 H2 章节坐标」功能（按钮是 07 组标题行的纯图标，解决旧文章只有 **加粗** 导致 TOC 目录为空的问题）；
 *   4. 移除阻塞式 window.prompt / window.alert，改用页内 HUD 抽屉插入链接、上传/挑选文章配图；
 *   5. 实时提取 H2/H3 章节坐标，用与前台文章页同构的 .toc-box-title / .toc-list / .toc-num 渲染右栏目录，点击可定位并短暂高亮。
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

/* 05 · 插入内容的纯图标按钮：与 03 栏共用 16×16 / 1.6px / currentColor 的线性风格 */
const ICON_ATTRS = `viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none"
  stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;

const CODE_ICON = `<svg ${ICON_ATTRS}>
  <path d="M5.4 4.2 2.2 8l3.2 3.8"/>
  <path d="M10.6 4.2 13.8 8l-3.2 3.8"/>
  <path d="M9.2 2.7 6.8 13.3"/>
</svg>`;

const IMAGE_ICON = `<svg ${ICON_ATTRS}>
  <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.2"/>
  <circle cx="10.9" cy="5.9" r="1.15"/>
  <path d="M2.4 11.6 5.6 8.4l2.5 2.5 2.1-1.9 3.4 3.1"/>
</svg>`;

const LINK_ICON = `<svg ${ICON_ATTRS}>
  <path d="M6.6 9.4a2.7 2.7 0 0 0 3.8.1l2.1-2.1a2.7 2.7 0 0 0-3.8-3.8l-1.2 1.2"/>
  <path d="M9.4 6.6a2.7 2.7 0 0 0-3.8-.1L3.5 8.6a2.7 2.7 0 0 0 3.8 3.8l1.2-1.2"/>
</svg>`;

const ALIGN_BUTTONS = [
  { kind: 'left', title: '左对齐（默认）' },
  { kind: 'center', title: '居中' },
  { kind: 'right', title: '右对齐' },
] as const;

export function createEditor(
  areaHost: HTMLElement,
  barHost: HTMLElement,
  initial: string,
  onInputOrOpts: (() => void) | EditorOptions,
  legacyImageHint?: () => string
): EditorHandle {
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

      <!-- 页内插入面板（替代浏览器原生 prompt，支持链接/配图/表格/提示框） -->
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
          <button type="button" class="ed-btn ed-btn--sample" data-cmd="bold" title="加粗（Ctrl+B）" aria-label="加粗">
            <span class="ed-sample-key">B</span><span class="ed-sample ed-sample--bold">示例</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample" data-cmd="italic" title="斜体（Ctrl+I）" aria-label="斜体">
            <span class="ed-sample-key">I</span><span class="ed-sample ed-sample--italic">示例</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample" data-cmd="strikeThrough" title="删除线" aria-label="删除线">
            <span class="ed-sample-key">S</span><span class="ed-sample ed-sample--strike">示例</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample ed-btn--mark" data-cmd="mark" title="着重色（Claude 橙）" aria-label="着重色">
            <span class="ed-sample-key ed-sample-key--mark">D</span><span class="ed-sample ed-sample--mark">示例</span>
          </button>
          <button type="button" class="ed-btn ed-btn--sample" data-cmd="inlineCode" title="行内代码" aria-label="行内代码">
            <span class="ed-sample-key ed-sample-key--code">&lt;/&gt;</span><span class="ed-sample ed-sample--code">示例</span>
          </button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">03 · 段落对齐</span>
        <div class="ed-row ed-row--align">
          ${ALIGN_BUTTONS.map(
            (a) => `<button type="button" class="ed-btn ed-btn--icon" data-align="${a.kind}" title="${a.title}" aria-label="${a.title}">
              <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" fill="none"
                   stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${ALIGN_ICONS[a.kind]}</svg>
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
          <button type="button" class="ed-btn" data-cmd="insertTable" title="插入表格">表格</button>
          <button type="button" class="ed-btn ed-btn--icon" data-cmd="insertImage" title="插入或上传配图" aria-label="插入或上传配图">
            ${IMAGE_ICON}
          </button>
          <button type="button" class="ed-btn ed-btn--icon" data-cmd="createLink" title="插入链接" aria-label="插入链接">
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
          <span>07 · 实时章节坐标预览</span>
          <!-- 纯图标按钮：把正文里独占一行的 **粗体小节** 识别为 H2 目录（事件绑定见下方） -->
          <button type="button" class="ed-btn ed-btn--icon ed-glabel-action" id="ed-auto-toc-btn" title="识别粗体小节为 H2 目录" aria-label="识别粗体小节为 H2 目录">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none"
                 stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3.1 1.9h5L11.2 5v5.2"/>
              <path d="M2.1 2.9v10.2a1 1 0 0 0 1 1h3.6"/>
              <path d="M8.1 1.9V5h3.1"/>
              <path d="M4.4 6.4h4.1M4.4 8.6h3.2M4.4 10.8h2.2"/>
              <path d="M12.7 10.3v4M10.7 12.3h4"/>
            </svg>
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

  // 抽屉打开前保存的正文选区：点抽屉里的图片/上传按钮后仍能插回原光标处
  let savedRange: Range | null = null;
  // 抽屉的异步请求令牌：关闭后，迟到的 fetch 结果不再往抽屉里写
  let drawerSeq = 0;
  // 给刚插入的表格打临时标记，插入后靠它找回 DOM 并把光标放进第一个单元格
  let tableSeq = 0;

  function collectHeadings(): Array<{ el: HTMLElement; depth: number; text: string }> {
    const list: Array<{ el: HTMLElement; depth: number; text: string }> = [];
    area.querySelectorAll<HTMLElement>('h2, h3').forEach((node) => {
      const text = (node.textContent ?? '').trim();
      if (!text) return;
      list.push({ el: node, depth: node.tagName === 'H2' ? 2 : 3, text });
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
    const tocBox = barHost.querySelector<HTMLElement>('#ed-toc-preview');
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
    // 与前台文章页同一套结构：.toc-box-title + ul.toc-list + li > a > .toc-num
    const tocTitle = `<h2 class="toc-box-title">INDEX // 章节坐标导览</h2>`;
    if (!headings.length) {
      tocBox.innerHTML = `${tocTitle}<p class="toc-empty">尚未检测到 H2/H3 章节标题（点击右上角图标可一键识别粗体小节）</p>`;
      return;
    }
    // 前台编号规则：H2/H3 统一按出现顺序两位数字编号，H3 不缩进
    tocBox.innerHTML = `${tocTitle}<ul class="toc-list">${headings
      .map(
        (h, idx) =>
          `<li><a href="#ed-heading-${idx}" data-toc-index="${idx}"><span class="toc-num">${String(
            idx + 1
          ).padStart(2, '0')}</span><span>${esc(h.text)}</span></a></li>`
      )
      .join('')}</ul>`;
  }

  // 点击目录：滚动到对应标题并短暂高亮（不移动光标、不触发保存）
  function jumpToHeading(index: number, link: HTMLAnchorElement): void {
    barHost.querySelectorAll<HTMLAnchorElement>('.ed-toc-preview .toc-list a[data-active]').forEach((a) => {
      if (a !== link) a.removeAttribute('data-active');
    });
    link.setAttribute('data-active', 'true');
    window.clearTimeout(tocActiveTimer);
    tocActiveTimer = window.setTimeout(() => link.removeAttribute('data-active'), 1200);

    const heading = tocHeadingEls[index];
    if (!heading || !heading.isConnected) return;
    // 源码模式正文区隐藏，只保留目录项的激活态
    if (mode === 'markdown') return;

    area.querySelectorAll('.is-toc-heading-flash').forEach((el) => el.classList.remove('is-toc-heading-flash'));
    window.clearTimeout(headingFlashTimer);
    heading.classList.add('is-toc-heading-flash');
    headingFlashTimer = window.setTimeout(() => heading.classList.remove('is-toc-heading-flash'), 1200);
    heading.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /**
   * 编辑器里图片的显示路径：正文里存的是 `../../assets/posts/...`，
   * 在 /studio/ 页面按相对路径解析会 404；预览时换成 /uploads/...，
   * 原路径记在 data-ed-asset 里，保存/同步时再换回去。
   */
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

  /** 序列化前把预览用的 /uploads/... 换回相对路径，保证正文仍可迁移 */
  function editorHtmlForMarkdown(): string {
    return area.innerHTML.replace(/<img\b[^>]*>/g, (tag) => {
      const m = /\bdata-ed-asset="([^"]*)"/.exec(tag);
      if (!m) return tag;
      return tag.replace(/\bsrc="[^"]*"/, `src="${m[1]!}"`).replace(/\sdata-ed-asset="[^"]*"/, '');
    });
  }

  function setMarkdown(mdText: string): void {
    syncing = true;
    const extracted = extractRawHtml(mdText);
    raws = extracted.raws;
    area.innerHTML = renderMarkdown(mdText, { forEditor: true });
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

  // 一键将独占一行的 **粗体小节** 转换为 H2 标题（按钮位于右栏 07 组标题行）
  bar.querySelector('#ed-auto-toc-btn')?.addEventListener('click', () => {
    const curMd = mode === 'markdown' ? sourceArea.value : htmlToMarkdown(editorHtmlForMarkdown(), raws);
    let count = 0;
    const converted = curMd
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        // 匹配独占一行的 **一、xxx** 或 **1. xxx** 或 **xxx：**
        const m = /^\*\*([^*]{2,36})\*\*$/.exec(trimmed);
        if (m) {
          const inner = m[1]!.replace(/[：:]$/, '').trim();
          if (inner && !inner.startsWith('前言') && !inner.includes('The End')) {
            count++;
            return `## ${inner}`;
          }
        }
        return line;
      })
      .join('\n');

    if (count === 0) {
      // 如果没有粗体行，则在光标处插入一个示例 H2 章节
      area.focus();
      document.execCommand('insertHTML', false, '<h2>新章节标题</h2><p>在此输入章节正文…</p>');
      changed();
      toast('已插入 H2 章节标题节点');
      return;
    }
    setMarkdown(converted);
    opts.onInput();
    toast(`已自动将 ${count} 处粗体小节升级为 H2 章节坐标，左侧 TOC 目录已同步生成`);
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
    // 四种样式都带类名插入：md.ts 的 styledHr 规则会把 `<hr class="…">` 原样留在 Markdown 里。
    // （用户在源码模式手写不带类的 <hr> 时，仍由 md.ts 的默认规则转成 `* * *`。）
    const html = `<hr class="${cls || 'star'}">`;
    if (mode === 'markdown') {
      insertInTextarea(`\n\n${html}\n\n`, '');
      return;
    }
    area.focus();
    document.execCommand('insertHTML', false, html);
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

  /* ---------------- 页内抽屉：插入链接 / 配图 / 表格 ---------------- */

  function closeDrawer(): void {
    drawerSeq += 1;
    drawer.hidden = true;
    drawer.innerHTML = '';
    savedRange = null;
  }

  /** 记下正文里的当前选区：点抽屉按钮 / 媒体库缩略图后还能插回原光标处 */
  function captureSelection(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      savedRange = null;
      return;
    }
    const range = sel.getRangeAt(0);
    savedRange = area.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
  }

  /** 把焦点和选区还给正文；没有可用落点就退到正文末尾 */
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
    // 刚插入的相对路径立即换成 /uploads/... 预览，序列化时会自动换回去
    normalizeEditorImagePreviews();
    savedRange = null;
    changed();
  }

  function isImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|svg|heic|heif)$/i.test(file.name);
  }

  /** 逐张上传（父级负责压缩与报错 toast），返回可直接写进正文的图片条目 */
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

  /** getPostAssets 可能是文件名、<slug>/<file>，也可能已经是正文相对路径 */
  function localAssetSrc(entry: string): string {
    if (/^(https?:|data:|blob:)/.test(entry)) return entry;
    if (entry.startsWith('/') || entry.startsWith('../')) return entry;
    return `../../assets/posts/${entry}`;
  }

  function isImageMedia(item: StudioMediaItem): boolean {
    return (item.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(item.path);
  }

  function openLinkDrawer(): void {
    captureSelection();
    drawerSeq += 1;
    const sel = window.getSelection();
    const selectedText = sel && !sel.isCollapsed ? sel.toString().trim() : '';
    drawer.hidden = false;
    drawer.innerHTML = `
      <div class="ed-drawer-card">
        <div class="ed-drawer-head">
          <span>INSERT HYPERLINK // 插入超链接</span>
          <button type="button" class="stage-mini-btn" id="ed-drawer-close">关闭 ×</button>
        </div>
        <div class="ed-drawer-grid">
          <input class="st-input" id="ed-link-text" value="${esc(selectedText)}" placeholder="链接显示文字（如：Adoptium 官网）" />
          <input class="st-input" id="ed-link-url" value="https://" placeholder="https://..." />
          <button type="button" class="st-btn st-btn--primary" id="ed-link-confirm">插入链接</button>
        </div>
      </div>`;
    drawer.querySelector('#ed-drawer-close')?.addEventListener('click', closeDrawer);
    drawer.querySelector('#ed-link-confirm')?.addEventListener('click', () => {
      const text = (drawer.querySelector<HTMLInputElement>('#ed-link-text')?.value ?? '').trim() || '链接文字';
      const url = (drawer.querySelector<HTMLInputElement>('#ed-link-url')?.value ?? '').trim();
      if (!url || url === 'https://') {
        toast('请输入有效的链接地址', true);
        return;
      }
      if (mode === 'markdown') {
        insertInTextarea(`[${text}](${url})`, '');
      } else {
        insertHtmlAtRange(
          `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`,
          savedRange
        );
        savedRange = null;
        changed();
      }
      closeDrawer();
    });
  }

  function openImageDrawer(): void {
    captureSelection();
    drawerSeq += 1;
    const seq = drawerSeq;
    const assets = (opts.getPostAssets?.() ?? []).filter((name) => !!name);
    const hintText = legacyImageHint
      ? legacyImageHint()
      : '上传的图片会自动归档到 src/assets/posts/<文章 slug>/，媒体库按文章分组显示';
    drawer.hidden = false;
    drawer.innerHTML = `
      <div class="ed-drawer-card ed-drawer-card--img">
        <div class="ed-drawer-head">
          <span>INSERT POST IMAGE // 插入或上传配图</span>
          <button type="button" class="stage-mini-btn" id="ed-drawer-close">关闭 ×</button>
        </div>

        <section class="ed-img-section">
          <div class="ed-img-section-head">01 // 从媒体库选择</div>
          <div class="ed-media-grid" id="ed-media-grid">
            <p class="ed-media-empty">正在读取媒体库…</p>
          </div>
        </section>

        <section class="ed-img-section">
          <div class="ed-img-section-head">02 // 上传本地图片</div>
          <div class="ed-dropzone" id="ed-img-dropzone" role="button" tabindex="0" aria-label="上传本地图片">
            <span>把图片拖到这里，或点击选择文件</span>
            <input type="file" id="ed-img-upload" accept="image/*" multiple hidden />
          </div>
        </section>

        <section class="ed-img-section">
          <div class="ed-img-section-head">03 // 手填路径（兜底）</div>
          <div class="ed-drawer-grid ed-drawer-grid--image">
            <input class="st-input" id="ed-img-src" value="" placeholder="../../assets/posts/xxx.png 或 /uploads/posts/<slug>/xxx.jpg" />
            <input class="st-input" id="ed-img-alt" value="" placeholder="图片说明文字（Alt / 图注，可选）" />
            <button type="button" class="st-btn st-btn--primary" id="ed-img-confirm">插入图片</button>
          </div>
          <div class="st-hint">${esc(hintText)}</div>
          ${
            assets.length
              ? `<div class="ed-asset-chips">
                  <span class="ed-asset-label">已载入的本地配图：</span>
                  ${assets
                    .map(
                      (name) =>
                        `<button type="button" class="stage-mini-btn" data-pick-asset="${esc(localAssetSrc(name))}">${esc(
                          name
                        )}</button>`
                    )
                    .join('')}
                </div>`
              : ''
          }
        </section>
      </div>`;

    drawer.querySelector('#ed-drawer-close')?.addEventListener('click', closeDrawer);

    // 1) 媒体库：GET /api/media（只读，带 cookie 即可），过滤出图片后按缩略图网格展示
    const grid = drawer.querySelector<HTMLElement>('#ed-media-grid');
    if (grid) {
      void (async () => {
        try {
          const res = await fetch('/api/media', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { media?: StudioMediaItem[] };
          // 抽屉已关闭 / 又打开了新的抽屉：迟到的响应丢弃
          if (seq >= drawerSeq && !drawer.hidden) {
            const list = (Array.isArray(data.media) ? data.media : []).filter(isImageMedia);
            if (!list.length) {
              grid.innerHTML = `<p class="ed-media-empty">媒体库还没有图片，先用下面的上传区传一张吧。</p>`;
            } else {
              grid.innerHTML = list
                .map(
                  (item) => `
                  <button type="button" class="ed-media-item" data-media-path="${esc(item.path)}"
                          data-media-name="${esc(item.filename)}"
                          title="${esc(item.filename)}${item.postTitle ? ` · ${esc(item.postTitle)}` : ''}">
                    <img src="${esc(item.path)}" alt="${esc(item.filename)}" loading="lazy" />
                    <span class="ed-media-name">${esc(item.filename)}</span>
                  </button>`
                )
                .join('');
            }
          }
        } catch (error) {
          if (seq >= drawerSeq && !drawer.hidden) {
            grid.innerHTML = `<p class="ed-media-empty ed-media-empty--error">媒体库读取失败（${esc(
              (error as Error).message
            )}），可以用下面的上传区或手填路径。</p>`;
          }
        }
      })();

      grid.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-media-path]');
        if (!btn) return;
        insertImages([{ src: btn.dataset.mediaPath ?? '', alt: btn.dataset.mediaName ?? '' }]);
        closeDrawer();
      });
    }

    // 2) 上传本地图片：文件选择 + 抽屉内拖拽
    const uploadInput = drawer.querySelector<HTMLInputElement>('#ed-img-upload');
    const dropzone = drawer.querySelector<HTMLElement>('#ed-img-dropzone');
    const handleFiles = async (files: File[]): Promise<void> => {
      if (!files.length) return;
      const images = files.filter(isImageFile);
      if (!images.length) {
        toast('请选择图片文件', true);
        return;
      }
      dropzone?.classList.add('is-dragover');
      const items = await uploadImages(images);
      // 上传期间抽屉被关掉 / 换成另一个抽屉：文件已上传，但不再往正文里插
      if (seq !== drawerSeq) return;
      if (!items.length) {
        dropzone?.classList.remove('is-dragover');
        return;
      }
      insertImages(items);
      closeDrawer();
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
      // 清空 value，失败后再选同一个文件也能重新触发 change
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

    // 3) 手填路径 / Alt（兜底）与本地已加载配图
    drawer.querySelectorAll<HTMLButtonElement>('[data-pick-asset]').forEach((b) => {
      b.addEventListener('click', () => {
        const input = drawer.querySelector<HTMLInputElement>('#ed-img-src');
        if (input) {
          input.value = b.dataset.pickAsset ?? '';
          input.focus();
        }
      });
    });

    drawer.querySelector('#ed-img-confirm')?.addEventListener('click', () => {
      const src = (drawer.querySelector<HTMLInputElement>('#ed-img-src')?.value ?? '').trim();
      const alt = (drawer.querySelector<HTMLInputElement>('#ed-img-alt')?.value ?? '').trim();
      if (!src) {
        toast('请填写图片路径，或从媒体库选一张', true);
        return;
      }
      insertImages([{ src, alt }]);
      closeDrawer();
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

  /** 05 组下方的表格操作条：只在光标位于表格内、且不是源码模式时显示 */
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
        // 表头固定留在第一行：在表头行上点「加行」时插到表体顶部
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
        // 删表头时把表体第一行提上来当新表头，保证 Markdown 表格仍有分隔行
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
      // 2 行 × 2 列的空表：表头 + 一行表体；单元格不写任何示例文字，插入后光标落在第一个单元格
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

    // 07 栏目录：滚动定位 + 1.2s 高亮，不移动光标、不写回正文
    const tocLink = target.closest<HTMLAnchorElement>('.ed-toc-preview .toc-list a');
    if (tocLink) {
      e.preventDefault();
      const idx = tocLink.dataset.tocIndex;
      if (idx !== undefined && /^\d+$/.test(idx)) jumpToHeading(Number(idx), tocLink);
      return;
    }

    const blockBtn = target.closest<HTMLButtonElement>('button[data-block]');
    if (blockBtn) {
      applyBlock(blockBtn.dataset.block ?? 'p');
      return;
    }

    // 05 组下方的表格上下文操作（只在光标位于表格内时可见）
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

  area.addEventListener('input', () => {
    if (mode === 'split') syncVisualToSource();
    updateCount();
    renderTocPreview();
    opts.onInput();
  });

  sourceArea.addEventListener('input', () => {
    syncSourceToVisual();
    updateCount();
    renderTocPreview();
    opts.onInput();
  });

  area.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  function dropHasFiles(dt: DataTransfer | null): boolean {
    return !!dt && Array.from(dt.types).includes('Files');
  }

  /** 找到拖放落点；浏览器不支持或落在正文外时退回正文末尾 */
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

  // 正文拖拽上传：高亮提示 + 在落点插入（拿不到落点就插到文末）
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
    // 抽屉开着时用户又回正文改光标：刷新保存的落点
    if (!drawer.hidden) captureSelection();
    changed();
  });
  area.addEventListener('mouseup', () => {
    if (!drawer.hidden) captureSelection();
    syncToolbar();
  });
  area.addEventListener('focus', () => updateTableTools());
  area.addEventListener('click', () => updateTableTools());

  // 光标进出表格时刷新 05 组下方的操作条；源码模式下 tableContext 直接返回 null
  document.addEventListener('selectionchange', () => {
    if (!area.isConnected) return;
    updateTableTools();
  });

  function changed(): void {
    if (mode !== 'markdown') syncVisualToSource();
    updateCount();
    renderTocPreview();
    opts.onInput();
    syncToolbar();
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

    updateTableTools();
  }

  function updateCount(): void {
    const text = (area.textContent ?? '').replace(/\s/g, '');
    const chars = text.length;
    const mins = Math.max(1, Math.round(chars / 400));
    const el = barHost.querySelector('#ed-count');
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
  };
}

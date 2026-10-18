/**
 * 蓝图双模态正文编辑器（所见即所得 Visual ↔ Markdown 源码 ↔ 双栏对照 Split）
 *
 * 相比旧版调整与新增：
 *   1. 支持「富文本蓝图视图」「Markdown 源码」「双栏同步对照」三种编辑模式无缝切换；
 *   2. 新增 HUD 文章页专属排版块接口：蓝图提示卡（Callout）、代码终端块（Codeblock）、
 *      行内代码（Inline Code）、规格数据表格（Spec Table）；
 *   3. 新增「一键识别粗体小节为 H2 章节坐标」功能（解决旧文章只有 **加粗** 导致左侧 TOC 目录为空的问题）；
 *   4. 移除阻塞式 window.prompt / window.alert，改用页内 HUD 抽屉插入链接、上传/挑选文章配图；
 *   5. 实时提取 H2/H3 章节坐标列表供右栏「INDEX // 章节坐标导览」预览。
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
  getPostAssets?: () => string[];
  onUploadPostAsset?: (file: File) => Promise<string | null>;
}

const BLOCK_PRESETS = [
  { value: 'h2', label: 'H2 · 章节标题' },
  { value: 'h3', label: 'H3 · 小节标题' },
  { value: 'p', label: 'P · 正文段落' },
  { value: 'blockquote', label: 'QUOTE · 引用' },
];

const HR_STYLES = [
  { cls: '', preview: 'ed-hr-preview--star', title: '星号分隔线（＊ ＊ ＊）' },
  { cls: 'sakura', preview: 'ed-hr-preview--sakura', title: '樱花分隔线' },
];

const ALIGN_ICONS: Record<string, string> = {
  left: '<path d="M1 3h12M1 6.5h8M1 10h10"/>',
  center: '<path d="M1 3h12M3 6.5h8M2 10h10"/>',
  right: '<path d="M1 3h12M5 6.5h8M3 10h10"/>',
};

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
          <button type="button" class="stage-mini-btn" id="ed-auto-toc-btn" title="将正文里独占一行的 **一、标题** 自动转换为 H2 章节标题，生成左侧目录">一键识别粗体小节为 H2 目录</button>
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
        <span class="ed-glabel">01 · 段落层级与着重</span>
        <div class="ed-row">
          ${BLOCK_PRESETS.map(
            (o) => `<button type="button" class="ed-btn" data-block="${o.value}" aria-pressed="false">${o.label}</button>`
          ).join('')}
          <button type="button" class="ed-btn ed-btn--mark" data-cmd="mark" title="着重色（Claude 橙）">着重色</button>
          <button type="button" class="ed-btn" data-cmd="inlineCode" title="行内代码">&lt;/&gt; 行内代码</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">02 · 字形修饰与对齐</span>
        <div class="ed-row">
          <button type="button" class="ed-btn" data-cmd="bold" title="加粗（Ctrl+B）"><b>B 粗体</b></button>
          <button type="button" class="ed-btn" data-cmd="italic" title="斜体（Ctrl+I）"><i>I 斜体</i></button>
          <button type="button" class="ed-btn" data-cmd="strikeThrough" title="删除线"><s>S 删除线</s></button>
          ${ALIGN_BUTTONS.map(
            (a) => `<button type="button" class="ed-btn ed-btn--icon" data-align="${a.kind}" title="${a.title}" aria-label="${a.title}">
              <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true" fill="none"
                   stroke="currentColor" stroke-width="1.6" stroke-linecap="round">${ALIGN_ICONS[a.kind]}</svg>
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">03 · 列表与 HUD 专属组件</span>
        <div class="ed-row">
          <button type="button" class="ed-btn" data-cmd="insertUnorderedList" title="无序列表">• 无序列表</button>
          <button type="button" class="ed-btn" data-cmd="insertOrderedList" title="有序列表">1. 有序列表</button>
          <button type="button" class="ed-btn" data-cmd="insertCallout" title="插入文章页蓝图摘录提示框">蓝图摘录框</button>
          <button type="button" class="ed-btn" data-cmd="insertCodeblock" title="插入代码块">▤ 代码块</button>
          <button type="button" class="ed-btn" data-cmd="insertTable" title="插入规格对比表">⊞ 规格表格</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">04 · 媒体配图与超链接</span>
        <div class="ed-row">
          <button type="button" class="ed-btn" data-cmd="insertImage" title="上传或从图库插入文章配图">插入/上传配图</button>
          <button type="button" class="ed-btn" data-cmd="createLink" title="插入超链接">插入链接</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">05 · 章节分隔线</span>
        <div class="ed-row ed-row--hr">
          ${HR_STYLES.map(
            (h) => `<button type="button" class="ed-btn ed-hr-btn" data-hr="${h.cls}" title="${h.title}" aria-label="${h.title}">
              <span class="ed-hr-preview ${h.preview}"></span>
            </button>`
          ).join('')}
        </div>
      </div>

      <div class="ed-group">
        <div class="ed-glabel">06 · 实时章节坐标预览</div>
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

  function getHeadings(): HeadingItem[] {
    const list: HeadingItem[] = [];
    const nodes = area.querySelectorAll('h2, h3');
    nodes.forEach((node, idx) => {
      const text = (node.textContent ?? '').trim();
      if (!text) return;
      list.push({
        depth: node.tagName === 'H2' ? 2 : 3,
        text,
        num: String(idx + 1).padStart(2, '0'),
      });
    });
    return list;
  }

  function renderTocPreview(): void {
    const tocBox = barHost.querySelector<HTMLElement>('#ed-toc-preview');
    const headings = getHeadings();
    opts.onHeadingsChange?.(headings);
    if (!tocBox) return;
    if (!headings.length) {
      tocBox.innerHTML = `<div class="ed-toc-empty">尚未检测到 H2/H3 章节标题（可点击上方「一键识别粗体小节」自动生成）</div>`;
      return;
    }
    tocBox.innerHTML = `<ul class="ed-toc-list">${headings
      .map(
        (h) =>
          `<li class="ed-toc-item ed-toc-item--d${h.depth}"><span class="ed-toc-num">${h.num}</span><span>${esc(
            h.text
          )}</span></li>`
      )
      .join('')}</ul>`;
  }

  function setMarkdown(mdText: string): void {
    syncing = true;
    const extracted = extractRawHtml(mdText);
    raws = extracted.raws;
    area.innerHTML = renderMarkdown(mdText, { forEditor: true });
    sourceArea.value = mdText;
    syncing = false;
    updateCount();
    renderTocPreview();
  }

  function syncVisualToSource(): void {
    if (syncing) return;
    syncing = true;
    const mdText = htmlToMarkdown(area.innerHTML, raws);
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
  }

  setMarkdown(initial);

  shell.querySelectorAll<HTMLButtonElement>('[data-ed-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = (btn.dataset.edMode ?? 'visual') as 'visual' | 'markdown' | 'split';
      setMode(m);
    });
  });

  // 一键将独占一行的 **粗体小节** 转换为 H2 标题
  shell.querySelector('#ed-auto-toc-btn')?.addEventListener('click', () => {
    const curMd = mode === 'markdown' ? sourceArea.value : htmlToMarkdown(area.innerHTML, raws);
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
    if (mode === 'markdown') {
      insertInTextarea(cls ? `\n\n<hr class="${cls}">\n\n` : '\n\n* * *\n\n', '');
      return;
    }
    area.focus();
    document.execCommand('insertHTML', false, cls ? `<hr class="${cls}">` : '<hr>');
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

  /* ---------------- 页内抽屉：插入链接 / 配图 / 表格 / 蓝图摘录框 ---------------- */
  function closeDrawer(): void {
    drawer.hidden = true;
    drawer.innerHTML = '';
  }

  function openLinkDrawer(): void {
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
        area.focus();
        document.execCommand(
          'insertHTML',
          false,
          `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`
        );
        changed();
      }
      closeDrawer();
    });
  }

  function openImageDrawer(): void {
    const assets = opts.getPostAssets?.() ?? [];
    const hintText = legacyImageHint ? legacyImageHint() : '存放于 src/assets/posts/ 目录';
    drawer.hidden = false;
    drawer.innerHTML = `
      <div class="ed-drawer-card">
        <div class="ed-drawer-head">
          <span>INSERT POST IMAGE // 插入或上传文章配图</span>
          <button type="button" class="stage-mini-btn" id="ed-drawer-close">关闭 ×</button>
        </div>
        <div class="ed-drawer-grid">
          <input class="st-input" id="ed-img-src" value="../../assets/posts/" placeholder="图片路径（如 ../../assets/posts/xxx.png 或完整 URL）" />
          <input class="st-input" id="ed-img-alt" value="" placeholder="图片说明文字（Alt / 图注，可选）" />
          <button type="button" class="st-btn st-btn--primary" id="ed-img-confirm">插入图片</button>
          ${
            opts.onUploadPostAsset
              ? `<label class="st-btn" style="cursor:pointer;display:inline-flex;align-items:center;">
                  <span>↑ 上传本地配图</span>
                  <input type="file" id="ed-img-upload" accept="image/*" hidden />
                </label>`
              : ''
          }
        </div>
        <div class="st-hint" style="margin-top:0.35rem;">${esc(hintText)}</div>
        ${
          assets.length
            ? `<div class="ed-asset-chips" style="margin-top:0.5rem;">
                <span class="ed-asset-label">点击快速选用已有配图：</span>
                ${assets
                  .map(
                    (f) =>
                      `<button type="button" class="stage-mini-btn" data-pick-asset="../../assets/posts/${esc(f)}">${esc(
                        f
                      )}</button>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </div>`;

    drawer.querySelector('#ed-drawer-close')?.addEventListener('click', closeDrawer);
    drawer.querySelectorAll<HTMLButtonElement>('[data-pick-asset]').forEach((b) => {
      b.addEventListener('click', () => {
        const input = drawer.querySelector<HTMLInputElement>('#ed-img-src');
        if (input) input.value = b.dataset.pickAsset ?? '';
      });
    });

    drawer.querySelector<HTMLInputElement>('#ed-img-upload')?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file || !opts.onUploadPostAsset) return;
      const uploadedName = await opts.onUploadPostAsset(file);
      if (uploadedName) {
        const input = drawer.querySelector<HTMLInputElement>('#ed-img-src');
        if (input) input.value = `../../assets/posts/${uploadedName}`;
      }
    });

    drawer.querySelector('#ed-img-confirm')?.addEventListener('click', () => {
      const src = (drawer.querySelector<HTMLInputElement>('#ed-img-src')?.value ?? '').trim();
      const alt = (drawer.querySelector<HTMLInputElement>('#ed-img-alt')?.value ?? '').trim();
      if (!src || src === '../../assets/posts/') {
        toast('请填写或选择一张配图路径', true);
        return;
      }
      if (mode === 'markdown') {
        insertInTextarea(`\n\n![${alt}](${src})\n\n`, '');
      } else {
        area.focus();
        document.execCommand('insertHTML', false, `<p><img src="${esc(src)}" alt="${esc(alt)}"></p>`);
        changed();
      }
      closeDrawer();
    });
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
    insertCallout: () => {
      const snippet = `\n\n> **NOTE // 蓝图伴读摘录：** 在这里输入关键提示或随笔感悟。\n\n`;
      if (mode === 'markdown') {
        insertInTextarea(snippet, '');
      } else {
        area.focus();
        document.execCommand(
          'insertHTML',
          false,
          `<blockquote><p><strong>NOTE // 蓝图伴读摘录：</strong>在这里输入关键提示或随笔感悟。</p></blockquote><p><br></p>`
        );
        changed();
      }
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
      const mdTable = `\n\n| 参数项 (KEY) | 推荐配置 (VALUE) | 说明 (NOTE) |\n| --- | --- | --- |\n| JDK 版本 | Temurin 21 LTS | Minecraft 1.20.5+ 必需 |\n| 堆内存分配 | -Xms4G -Xmx4G | 避免动态扩容卡顿 |\n\n`;
      if (mode === 'markdown') {
        insertInTextarea(mdTable, '');
      } else {
        area.focus();
        document.execCommand(
          'insertHTML',
          false,
          `<table><thead><tr><th>参数项 (KEY)</th><th>推荐配置 (VALUE)</th><th>说明 (NOTE)</th></tr></thead><tbody><tr><td>JDK 版本</td><td>Temurin 21 LTS</td><td>Minecraft 1.20.5+ 必需</td></tr><tr><td>堆内存分配</td><td>-Xms4G -Xmx4G</td><td>避免动态扩容卡顿</td></tr></tbody></table><p><br></p>`
        );
        changed();
      }
    },
    createLink: () => openLinkDrawer(),
    insertImage: () => openImageDrawer(),
  };

  bar.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('.ed-bar')) e.preventDefault();
  });

  bar.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const blockBtn = target.closest<HTMLButtonElement>('button[data-block]');
    if (blockBtn) {
      applyBlock(blockBtn.dataset.block ?? 'p');
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

  area.addEventListener('drop', (e) => e.preventDefault());
  area.addEventListener('keyup', () => changed());
  area.addEventListener('mouseup', () => syncToolbar());

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
    getMarkdown: () => (mode === 'markdown' ? sourceArea.value : htmlToMarkdown(area.innerHTML, raws)),
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

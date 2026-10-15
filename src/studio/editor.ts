/**
 * 所见即所得正文编辑器
 *
 * 目标：不要让人看见 Markdown 源码。正文渲染成"文章的样子"，工具栏按钮对**选中的文字**
 * 加粗 / 变成小标题 / 加上着重色……保存时再由 md.ts 转回 Markdown。
 *
 * 【用 execCommand 这件事】它被标为过时，但在 Chromium 里是唯一不用引入大依赖就能拿到
 * 富文本行为的办法（斜体、列表、引用、撤销重做都靠它）。自己用 Range 实现一遍，
 * 代码量会大得多、坑也多。所以：用它，但把输出限制在**少数几个语义标签**里
 * （strong/em/s/h2-h3/blockquote/ul/li/hr/img/mark），这样转回 Markdown 才可靠。
 *
 * 【三条防线】
 *   1. 粘进来的一律当纯文本 —— 从网页/Word 复制过来的东西带一堆 style 和 class，
 *      转成 Markdown 会很难看，甚至带进垃圾
 *   2. 原始 HTML 块（比如你那个音乐播放器）在编辑器里是个**不可编辑的标签**，
 *      碰不到它，保存时原样还回去
 *   3. 工具栏只暴露"能干净地表达成 Markdown"的操作
 */
import { extractRawHtml, htmlToMarkdown, renderMarkdown } from './md';

export interface EditorHandle {
  /** 取出当前内容，转成 Markdown */
  getMarkdown(): string;
  /** 取出当前内容的 HTML —— 用于"转成 Markdown 再渲染回来是否一致"的自检 */
  getHtml(): string;
  /** 重新载入内容（例如换了另一篇文章） */
  setMarkdown(md: string): void;
  /** 是否为空（没写过东西） */
  isEmpty(): boolean;
}

/** 标题用下拉，其余是按钮 */
const BLOCK_OPTIONS = [
  { value: 'p', label: '正文' },
  { value: 'h2', label: '大标题' },
  { value: 'h3', label: '小标题' },
  { value: 'blockquote', label: '引用' },
];

export function createEditor(
  host: HTMLElement,
  initial: string,
  onInput: () => void,
  /** 插入图片时给个提示（列出当前文章已有的图片文件名） */
  imageHint: () => string
): EditorHandle {
  let raws: string[] = [];

  host.innerHTML = `
    <div class="ed">
      <div class="ed-bar" role="toolbar" aria-label="正文格式">
        <select class="ed-select" id="ed-block" title="段落样式">
          ${BLOCK_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <span class="ed-sep"></span>
        <button class="ed-btn" data-cmd="bold" title="加粗（Ctrl+B）"><b>粗</b></button>
        <button class="ed-btn" data-cmd="italic" title="斜体（Ctrl+I）"><i>斜</i></button>
        <button class="ed-btn" data-cmd="strikeThrough" title="删除线"><s>删</s></button>
        <button class="ed-btn ed-btn--mark" data-cmd="mark" title="着重色（朱红）">着重</button>
        <span class="ed-sep"></span>
        <button class="ed-btn" data-cmd="insertUnorderedList" title="无序列表">• 列表</button>
        <button class="ed-btn" data-cmd="insertOrderedList" title="有序列表">1. 列表</button>
        <button class="ed-btn" data-cmd="insertHorizontalRule" title="分隔线">✳ 分隔</button>
        <span class="ed-sep"></span>
        <button class="ed-btn" data-cmd="createLink" title="链接">链接</button>
        <button class="ed-btn" data-cmd="insertImage" title="插入图片">图片</button>
        <span class="ed-grow"></span>
        <span class="ed-count" id="ed-count"></span>
      </div>
      <div class="ed-area" id="ed-area" contenteditable="true" spellcheck="false"></div>
    </div>`;

  /** 找不到就抛 —— 这样拿到的引用一定非空，下面的闭包也不会被 TS 挑"可能是 null" */
  function must(sel: string): HTMLElement {
    const el = host.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`编辑器挂载失败：找不到 ${sel}`);
    return el;
  }
  const area = must('#ed-area');
  const bar = must('.ed-bar');

  // 让 execCommand 产出语义标签（<b>/<i>），而不是 <span style="…"> ——
  // 后者转成 Markdown 会很难看
  try {
    document.execCommand('styleWithCSS', false, 'false');
  } catch {
    /* 个别浏览器不支持，忽略 */
  }

  function setMarkdown(md: string): void {
    const extracted = extractRawHtml(md);
    raws = extracted.raws;
    area.innerHTML = renderMarkdown(md, { forEditor: true });
    updateCount();
  }

  setMarkdown(initial);

  /* ---------------- 工具栏 ---------------- */

  /** 把选区包进一个语义标签（execCommand 没有 mark，只能自己来） */
  function wrapSelection(tag: string): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const el = document.createElement(tag);
    try {
      range.surroundContents(el);
    } catch {
      // 选区跨了多个块（surroundContents 会抛）—— 退而求其次：抽出内容再包
      el.appendChild(range.extractContents());
      range.insertNode(el);
    }
    sel.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(el);
    sel.addRange(after);
    changed();
  }

  const ACTIONS: Record<string, (h: HTMLElement) => void> = {
    bold: () => document.execCommand('bold'),
    italic: () => document.execCommand('italic'),
    strikeThrough: () => document.execCommand('strikeThrough'),
    insertUnorderedList: () => document.execCommand('insertUnorderedList'),
    insertOrderedList: () => document.execCommand('insertOrderedList'),
    insertHorizontalRule: () => document.execCommand('insertHorizontalRule'),
    mark: () => wrapSelection('mark'),
    createLink: () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        window.alert('先选中要加链接的文字');
        return;
      }
      const url = window.prompt('链接地址：', 'https://');
      if (url) document.execCommand('createLink', false, url);
    },
    insertImage: () => {
      const path = window.prompt(`图片地址（可以用相对路径）：\n\n${imageHint()}`, '../../assets/posts/');
      if (path) document.execCommand('insertHTML', false, `<img src="${path.replace(/"/g, '')}" alt="">`);
    },
  };

  bar.addEventListener('mousedown', (e) => {
    // 点工具栏不要把选区弄丢
    if ((e.target as HTMLElement).closest('.ed-bar')) e.preventDefault();
  });

  bar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cmd]');
    if (!btn) return;
    area.focus();
    const action = ACTIONS[btn.dataset.cmd ?? ''];
    if (action) action(area);
    changed();
  });

  const blockSelect = host.querySelector<HTMLSelectElement>('#ed-block');
  blockSelect?.addEventListener('change', () => {
    area.focus();
    document.execCommand('formatBlock', false, blockSelect.value);
    changed();
  });

  /* ---------------- 输入 ---------------- */

  area.addEventListener('input', () => {
    updateCount();
    onInput();
  });

  // 粘贴：一律当纯文本，避免把外部的样式和垃圾结构带进来
  area.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  });

  // 拖进来的东西也拦掉（图片会变成 base64 塞进正文，那是灾难）
  area.addEventListener('drop', (e) => e.preventDefault());

  // 快捷键 Ctrl+B/I 由浏览器自带（execCommand 体系支持），这里只需在改动后通知外面
  area.addEventListener('keyup', () => changed());

  function changed(): void {
    updateCount();
    onInput();
    syncBlockSelect();
  }

  /** 光标所在块是什么，下拉框就跟着显示什么 */
  function syncBlockSelect(): void {
    if (!blockSelect) return;
    const sel = window.getSelection();
    const node = sel?.anchorNode;
    if (!node) return;
    let el: HTMLElement | null =
      node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    while (el && el !== area) {
      const tag = el.tagName.toLowerCase();
      if (BLOCK_OPTIONS.some((o) => o.value === tag)) {
        blockSelect.value = tag;
        return;
      }
      if (tag === 'li') {
        // 列表项不属于"段落样式"这一档，下拉框就显示正文
        blockSelect.value = 'p';
        return;
      }
      el = el.parentElement;
    }
    blockSelect.value = 'p';
  }

  function updateCount(): void {
    const el = host.querySelector('#ed-count');
    if (!el) return;
    const text = (area.textContent ?? '').replace(/\s/g, '');
    el.textContent = `${text.length} 字`;
  }

  return {
    getMarkdown: () => htmlToMarkdown(area.innerHTML, raws),
    getHtml: () => area.innerHTML,
    setMarkdown,
    isEmpty: () => (area.textContent ?? '').trim() === '' && area.querySelectorAll('img, hr').length === 0,
  };
}

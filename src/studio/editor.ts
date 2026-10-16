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
 *
 * 【工具栏为什么分成两个宿主】它现在渲染到右侧的「格式」面板里（`barHost`），
 * 正文待在自己那一栏（`areaHost`）。**bar 上那句 mousedown→preventDefault 不能丢** ——
 * 点按钮时浏览器默认会把焦点从编辑区挪走、选区当场塌掉，命令就全部静默失效了。
 */
import { extractRawHtml, htmlToMarkdown, renderMarkdown } from './md';
import { toast } from './ui';

export interface EditorHandle {
  /** 取出当前内容，转成 Markdown */
  getMarkdown(): string;
  /** 取出当前内容的 HTML —— 用于"转成 Markdown 再渲染回来是否一致"的自检 */
  getHtml(): string;
  /** 重新载入内容（例如换了另一篇文章） */
  setMarkdown(md: string): void;
  /** 是否为空（没写过东西） */
  isEmpty(): boolean;
  /**
   * 把现有的编辑区与工具栏**搬到新的宿主元素里**。
   * 给"只重画了表单外壳"的场景用（比如增删标签）—— 直接用 setMarkdown(d.body) 重建
   * 会把未保存的正文改动丢掉。
   */
  remount(areaHost: HTMLElement, barHost: HTMLElement): void;
}

/** 段落预设：点一下就把光标所在块换成它 */
const BLOCK_PRESETS = [
  { value: 'h2', label: '大标题' },
  { value: 'h3', label: '小标题' },
  { value: 'p', label: '正文' },
  { value: 'blockquote', label: '引用' },
];

/**
 * 分隔线的样式。**无类的那档是"默认"**，与现有文章的 `* * *` 完全兼容 ——
 * 老文章一个字节都不会变。
 */
const HR_STYLES = [
  { cls: '', label: '＊ ＊ ＊', title: '星号（默认）' },
  { cls: 'sakura', label: '❀', title: '樱花' },
];

export function createEditor(
  areaHost: HTMLElement,
  barHost: HTMLElement,
  initial: string,
  onInput: () => void,
  /** 插入图片时给个提示（列出当前文章已有的图片文件名） */
  imageHint: () => string
): EditorHandle {
  let raws: string[] = [];

  areaHost.innerHTML = `<div class="ed-area" id="ed-area" contenteditable="true" spellcheck="false"></div>`;

  barHost.innerHTML = `
    <div class="ed-bar" role="toolbar" aria-label="正文格式">
      <div class="ed-group">
        <span class="ed-glabel">预设</span>
        <div class="ed-row">
          ${BLOCK_PRESETS.map(
            (o) => `<button class="ed-btn" data-block="${o.value}" aria-pressed="false">${o.label}</button>`
          ).join('')}
          <button class="ed-btn ed-btn--mark" data-cmd="mark" title="着重色（朱红）">着重</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">字形</span>
        <div class="ed-row">
          <button class="ed-btn" data-cmd="bold" title="加粗（Ctrl+B）"><b>粗</b></button>
          <button class="ed-btn" data-cmd="italic" title="斜体（Ctrl+I）"><i>斜</i></button>
          <button class="ed-btn" data-cmd="strikeThrough" title="删除线"><s>删</s></button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">对齐</span>
        <div class="ed-row">
          <button class="ed-btn" data-align="left" title="左对齐（默认）">左</button>
          <button class="ed-btn" data-align="center" title="居中">中</button>
          <button class="ed-btn" data-align="right" title="右对齐">右</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">列表与图片</span>
        <div class="ed-row">
          <button class="ed-btn" data-cmd="insertUnorderedList" title="无序列表">• 列表</button>
          <button class="ed-btn" data-cmd="insertOrderedList" title="有序列表">1. 列表</button>
          <button class="ed-btn" data-cmd="createLink" title="链接">链接</button>
          <button class="ed-btn" data-cmd="insertImage" title="插入图片">图片</button>
        </div>
      </div>

      <div class="ed-group">
        <span class="ed-glabel">分隔线</span>
        <div class="ed-row">
          ${HR_STYLES.map(
            (h) => `<button class="ed-btn" data-hr="${h.cls}" title="${h.title}">${h.label}</button>`
          ).join('')}
        </div>
      </div>

      <span class="ed-count" id="ed-count"></span>
    </div>`;

  /** 找不到就抛 —— 这样拿到的引用一定非空，下面的闭包也不会被 TS 挑"可能是 null" */
  function must<T extends HTMLElement>(host: HTMLElement, sel: string): T {
    const el = host.querySelector<T>(sel);
    if (!el) throw new Error(`编辑器挂载失败：找不到 ${sel}`);
    return el;
  }
  const area = must<HTMLElement>(areaHost, '#ed-area');
  const bar = must<HTMLElement>(barHost, '.ed-bar');

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

  /* ---------------- 光标所在块 ---------------- */

  /** 光标落在正文的哪个**顶层块**上（p / h2 / blockquote / li / hr …） */
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

  /** 段落预设：把当前块换成 h2 / h3 / p / blockquote */
  function applyBlock(tag: string): void {
    area.focus();
    document.execCommand('formatBlock', false, tag);
    changed();
  }

  /**
   * 对齐整段。
   *
   * 【为什么是 <p class="center"> 这种原始 HTML，而不是 execCommand('justifyCenter')】
   * 后者写的是行内样式 `style="text-align:center"`，转成 Markdown 只能是垃圾；
   * 而且站点那边本来就有 `.prose > p.center` 这个钩子。所以用类，turndown 里
   * 有对应规则（见 md.ts 的 alignParagraph）。
   *
   * 【为什么含图片的段落不给对齐】原始 HTML 里的 <img> 不会被 Astro 构建时重写路径，
   * 线上会 404 —— 而预览看不出来（预览会把所有 img 的路径都改一遍）。
   * 正文图片本来就是栏宽，居中也没视觉效果，所以直接挡住。
   */
  function alignBlock(kind: 'left' | 'center' | 'right'): void {
    const block = currentBlock();
    if (!block || block.tagName !== 'P') {
      toast('对齐只能用在整段文字上：把光标放进那一段再点', true);
      return;
    }
    if (block.querySelector('img')) {
      toast('这一段里有图片 —— 对齐会让图片丢掉构建时重写的路径（线上打不开）。把图片单独放一段就行', true);
      return;
    }
    block.classList.remove('center', 'right');
    if (kind !== 'left') block.classList.add(kind);
    changed();
  }

  /** 插入一条分隔线；`cls` 空串 = 默认那档 */
  function insertHr(cls: string): void {
    area.focus();
    document.execCommand('insertHTML', false, cls ? `<hr class="${cls}">` : '<hr>');
    changed();
  }

  const ACTIONS: Record<string, () => void> = {
    bold: () => document.execCommand('bold'),
    italic: () => document.execCommand('italic'),
    strikeThrough: () => document.execCommand('strikeThrough'),
    insertUnorderedList: () => document.execCommand('insertUnorderedList'),
    insertOrderedList: () => document.execCommand('insertOrderedList'),
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
      // 反向的那一道拦截：先对齐、再往里塞图片，一样会造出坏块
      const block = currentBlock();
      if (block?.classList.contains('center') || block?.classList.contains('right')) {
        toast('这一段已经对齐了 —— 图片放进去会丢路径。先点「左」取消对齐，再把图片单独放一段', true);
        return;
      }
      const path = window.prompt(`图片地址（可以用相对路径）：\n\n${imageHint()}`, '../../assets/posts/');
      if (path) document.execCommand('insertHTML', false, `<img src="${path.replace(/"/g, '')}" alt="">`);
    },
  };

  bar.addEventListener('mousedown', (e) => {
    // 点工具栏不要把选区弄丢 —— 这是所有命令能生效的前提，别删
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
    area.focus();
    ACTIONS[btn.dataset.cmd ?? '']?.();
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
    syncToolbar();
  }

  /** 光标所在块的样式 → 工具栏上哪几个按钮是"按下"状态 */
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
    const el = barHost.querySelector('#ed-count');
    if (!el) return;
    const text = (area.textContent ?? '').replace(/\s/g, '');
    el.textContent = `${text.length} 字`;
  }

  return {
    getMarkdown: () => htmlToMarkdown(area.innerHTML, raws),
    getHtml: () => area.innerHTML,
    remount: (areaHostNext, barHostNext) => {
      areaHostNext.appendChild(area);
      barHostNext.appendChild(bar);
      updateCount();
      syncToolbar();
    },
    setMarkdown,
    isEmpty: () => (area.textContent ?? '').trim() === '' && area.querySelectorAll('img, hr').length === 0,
  };
}

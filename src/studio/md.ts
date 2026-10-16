/**
 * Markdown 的渲染与序列化 —— 编辑器、预览、保存都走这里
 *
 * 【为什么需要"原始 HTML 占位"这一层】
 * 正文里可能有原始 HTML（你有一篇里嵌了网易云的播放器 `<div class="embed"><iframe…>`）。
 * 所见即所得编辑器要在 Markdown ↔ HTML 之间来回转，而**转换是有损的**：turndown 遇到
 * 不认识的标签会把标签丢掉、只留文字 —— 播放器就这么没了，而且不会有任何提示。
 *
 * 做法：进编辑器之前，把这类块级原始 HTML 抽出来，原地留一个记号 `%%RAWHTML0%%`；
 *   · 渲染给"预览"看时 → 把原始 HTML 原样填回去（看到的就是真实效果）
 *   · 渲染给"编辑器"看时 → 留一个不可编辑的小标签（你不会误碰它）
 *   · 保存时 → turndown 转完再把记号替换回原始 HTML（一个字节都没动）
 *
 * 判据：以这些"块级 HTML 标签"开头的行，就当作原文里的原始 HTML（markdown-it 自己
 * 生成的是 p/h2/ul/img 之类，不会生成 div/iframe/table）。
 *
 * 一致性：这个文件的渲染结果要和站点构建时（Astro 用 remark/rehype）尽量一致 ——
 * 预览才可信。参数上刻意关掉 typographer（不把引号变弯引号），避免两边的差异。
 */
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/** 会被当作"块级原始 HTML"起头的标签 */
const BLOCK_HTML = /^<(div|iframe|video|audio|figure|figcaption|table|script|style|nav|section|article|aside|form|svg|details|summary|embed|object|picture|source)\b/i;

const md = new MarkdownIt({
  html: true,        // 让原始 HTML 原样通过
  linkify: false,
  typographer: false // 与站点构建保持一致：不把引号/破折号变成排版符号
});

/* --------------------------------------------------------------------------
   原始 HTML 的抽取与回填
   -------------------------------------------------------------------------- */

const MARK = (i: number) => `%%RAWHTML${i}%%`;

/**
 * 把块级原始 HTML 换成记号。
 * 支持多行：从起头那行开始，按标签配对找到闭合行（配不上就以空行或文末收尾）。
 */
export function extractRawHtml(source: string): { markdown: string; raws: string[] } {
  const lines = source.split('\n');
  const raws: string[] = [];
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!BLOCK_HTML.test(line.trim())) {
      out.push(line);
      continue;
    }
    // 收集这一个 HTML 块
    const block = [line];
    const tag = /^<([a-zA-Z0-9]+)/.exec(line.trim())?.[1]?.toLowerCase() ?? '';
    const openRe = new RegExp(`<${tag}\\b`, 'gi');
    const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
    const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
    let depth = count(line, openRe) - count(line, closeRe);

    while (depth > 0 && i + 1 < lines.length) {
      const next = lines[i + 1] ?? '';
      if (next.trim() === '') break; // 空行就断开，别把整篇都吞了
      block.push(next);
      depth += count(next, openRe) - count(next, closeRe);
      i += 1;
    }

    raws.push(block.join('\n'));
    out.push(MARK(raws.length - 1));
  }

  return { markdown: out.join('\n'), raws };
}

/** 把记号换回原始 HTML（给"真实预览"用） */
export function restoreRawHtml(text: string, raws: string[]): string {
  return text.replace(/%%RAWHTML(\d+)%%/g, (whole, n: string) => raws[Number(n)] ?? whole);
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */

export interface RenderOptions {
  /**
   * true = 给编辑器用：原始 HTML 留成一个不可编辑的记号；
   * false（默认）= 给预览用：原始 HTML 原样填回，和线上一致。
   */
  forEditor?: boolean;
}

export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const { markdown, raws } = extractRawHtml(source);
  let html = md.render(markdown);
  if (options.forEditor) {
    // 给编辑器：记号变成一个不可编辑的小标签（外面能看出"这里有一块原始 HTML"）
    html = html.replace(
      /<p>%%RAWHTML(\d+)%%<\/p>/g,
      (_whole, n: string) =>
        `<div class="raw-block" contenteditable="false" data-raw="${n}">原始 HTML 块（${raws[Number(n)]?.length ?? 0} 字符，<span class="raw-kind">${rawKind(raws[Number(n)] ?? '')}</span>）</div>`
    );
  } else {
    html = restoreRawHtml(html, raws);
  }
  return html;
}

/** 猜一下这块原始 HTML 是什么，给编辑器里的标签显示用 */
function rawKind(html: string): string {
  const tag = /^<([a-zA-Z0-9]+)/.exec(html.trim())?.[1]?.toLowerCase() ?? 'html';
  const names: Record<string, string> = {
    div: 'div 容器',
    iframe: '内嵌页面',
    video: '视频',
    audio: '音频',
    figure: '图片组',
    table: '表格',
    svg: '矢量图',
  };
  return names[tag] ?? tag;
}

/* --------------------------------------------------------------------------
   序列化：HTML → Markdown
   -------------------------------------------------------------------------- */

/** 只建一次；turndown 的规则是全局的 */
function makeTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',        // # 标题，不写 === 下划线
    hr: '* * *',                // 与现有文章的写法一致
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',           // 用 *斜体*（turndown 默认是 _斜体_）
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  // 着重色：正文里写成原始 <mark>…</mark>，由站点的 prose.css 上色
  td.addRule('mark', {
    filter: 'mark',
    replacement: (content) => `<mark>${content}</mark>`,
  });

  /**
   * 加粗 / 斜体：**只在 `**…**` 这种写法确实不成立时**才改用原始 HTML。
   *
   * 为什么需要这个判断：CommonMark 对加粗的定界符有讲究 —— `**` 能不能开/合，
   * 取决于它前后相邻的字符。典型反例是 `进入**[链接](url)**进行下载`：
   * 开头的 `**` 后面紧跟 `[`（标点）、前面是汉字，于是**不构成加粗**，两个星号被当成普通文字。
   * 你的 mc-server 那篇里就有这个老问题（站点上一直显示着字面的 `**`）。
   *
   * 如果不处理：编辑器允许你给链接加粗，存下去却渲染不出来 —— "所见"和"所得"不一致。
   * 但也不能一律改用 HTML ✗ 那会给现有文章里**本来正常**的加粗制造无意义的 diff
   * （试过，mc-server 字符数凭空涨了 146）。所以按规则精确判断：
   *   左侧定界符合法 = 后面不是空白 且（后面不是标点 或 前面是空白/标点/行首）
   *   右侧同理。两边都合法才用 Markdown，否则退回 HTML。
   */
  const PUNCT = /[\p{P}\p{S}]/u;
  function emphasisNeedsHtml(node: Node, content: string): boolean {
    const before = (node.previousSibling?.textContent ?? '').slice(-1);
    const after = (node.nextSibling?.textContent ?? '').slice(0, 1);
    const left = content.slice(0, 1);
    const right = content.slice(-1);
    const okLeft =
      left !== '' && !/\s/.test(left) && (!PUNCT.test(left) || before === '' || /\s/.test(before) || PUNCT.test(before));
    const okRight =
      right !== '' && !/\s/.test(right) && (!PUNCT.test(right) || after === '' || /\s/.test(after) || PUNCT.test(after));
    return !(okLeft && okRight);
  }

  td.addRule('strong', {
    filter: 'strong',
    replacement: (content, node) =>
      emphasisNeedsHtml(node, content) ? `<strong>${content}</strong>` : `**${content}**`,
  });
  td.addRule('em', {
    filter: 'em',
    replacement: (content, node) =>
      emphasisNeedsHtml(node, content) ? `<em>${content}</em>` : `*${content}*`,
  });

  /**
   * 对齐段：正文里写成原始 HTML `<p class="center">…</p>`。
   *
   * 为什么这么写而不是加个 Markdown 扩展语法：站点那边本来就有 `.prose > p.center` 这个钩子，
   * 而 `p` 不在 BLOCK_HTML 白名单里 —— 所以它**不会被抽成不可编辑的原始 HTML 块**，
   * markdown-it 原样输出、编辑器里是真 DOM、光标能进去改字。
   *
   * 【两头必须带空行】否则 markdown-it 会把它当成上一段的**内联** HTML，
   * 浏览器把段落拆开，保存前后的往返自检会当场误报。
   *
   * 【为什么用 node.innerHTML 而不是 turndown 转过的 content】HTML 块里的 Markdown
   * **不会被解析** —— 里面的 `<strong>粗</strong>` 若转成 `**粗**`，渲染出来就是两个星号。
   */
  td.addRule('alignParagraph', {
    filter: (node) =>
      node.nodeName === 'P' &&
      ((node as HTMLElement).classList?.contains('center') || (node as HTMLElement).classList?.contains('right')),
    replacement: (_content, node) => {
      const cls = (node as HTMLElement).classList.contains('center') ? 'center' : 'right';
      return `

<p class="${cls}">${(node as HTMLElement).innerHTML}</p>

`;
    },
  });

  /**
   * 有样式的分隔线：`<hr class="sakura">`。**没类的走上面那个默认选项**（`* * *`），
   * 所以现有文章的写法一个字节都不会变。
   */
  td.addRule('styledHr', {
    filter: (node) => node.nodeName === 'HR' && ((node as HTMLElement).getAttribute('class') ?? '') !== '',
    replacement: (_content, node) => `

<hr class="${(node as HTMLElement).getAttribute('class')}">

`,
  });

  // 编辑器里那个"原始 HTML 块"的小标签 → 还原成记号（外面再替换回原文）
  td.addRule('rawBlock', {
    filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute?.('data-raw'),
    replacement: (_content, node) => {
      const idx = (node as HTMLElement).getAttribute('data-raw') ?? '0';
      return `\n\n%%RAWHTML${idx}%%\n\n`;
    },
  });

  // 空段落不要产出多余空行。
  // 注意 `children.length === 0` 这个条件不能少：只放一张图的那一段
  // （<p><img …></p>）textContent 也是空的，漏了这个判断会把图片整段删掉 ——
  // 你的文章几乎每张图都是单独一段，踩过，5 篇全中。
  td.addRule('dropEmptyParagraph', {
    filter: (node) =>
      node.nodeName === 'P' && (node.textContent ?? '').trim() === '' && node.children.length === 0,
    replacement: () => '',
  });

  // 删除线 / 表格 / 任务列表 —— turndown 核心不含这三样
  td.use(gfm);

  // 覆盖插件里的删除线：它输出的是单个 ~，而标准要两个才是删除线
  // （单个 ~ 会被 markdown-it 当普通文字，往返后内容就变了）。规则后加的优先，所以放这里。
  td.addRule('strikethrough', {
    // 用函数判断而不是标签名数组：'strike' 是废弃标签，类型里没有
    filter: (node) => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
    replacement: (content) => `~~${content}~~`,
  });

  return td;
}

/**
 * 编辑器里的 HTML → Markdown（并把原始 HTML 块还原回去）。
 *
 * @param html 编辑器容器的 innerHTML
 * @param raws extractRawHtml 抽出来的原始 HTML（顺序必须一致）
 */
export function htmlToMarkdown(html: string, raws: string[]): string {
  const td = makeTurndown();
  let out = td.turndown(html);
  out = restoreRawHtml(out, raws);
  // 收尾：去掉行尾空格、压掉三个以上连续空行、保证末尾一个换行
  out = out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/, '');
  return out;
}

/* --------------------------------------------------------------------------
   渲染结果的"语义等同"比较
   -------------------------------------------------------------------------- */

/**
 * 渲染结果的"语义等同"比较 —— 用来判断"这次保存是不是其实没改内容"。
 * 只比较结构，忽略空白差异：这样"打开就保存"不会产生无意义的 diff。
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .replace(/\s*\/>$/, '>')
    .trim();
}

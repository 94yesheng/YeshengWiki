/**
 * 极简 Markdown 渲染 —— 只给后台的实时预览用
 *
 * 站点本身用的是 Astro 的完整 CommonMark 解析器；这里故意不追求对等：
 * 预览的作用是"边写边看结构对不对"，不是像素级还原。覆盖标题、加粗、斜体、
 * 行内代码、链接、图片、列表、引用、分隔线、段落这些日常用到的就够了。
 *
 * 图片只渲染成占位框并显示文件名：后台拿不到构建后的图片地址，
 * 而为了预览去下载原图不值当。
 */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join('<br />')}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`);
      list = null;
    }
  };

  const inline = (t: string): string =>
    t
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, _alt, src: string) => {
        const name = src.split('/').pop() ?? src;
        return `<span class="md-img">图片：${name}</span>`;
      })
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (/^\*\s*\*\s*\*$/.test(line.trim()) || /^---+$/.test(line.trim())) {
      flushPara();
      flushList();
      out.push('<hr />');
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      const n = Math.min((h[1]?.length ?? 1) + 1, 6);
      out.push(`<h${n}>${inline(h[2] ?? '')}</h${n}>`);
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      if (!list || list.tag !== 'ul') {
        flushList();
        list = { tag: 'ul', items: [] };
      }
      list.items.push(inline(ul[1] ?? ''));
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      if (!list || list.tag !== 'ol') {
        flushList();
        list = { tag: 'ol', items: [] };
      }
      list.items.push(inline(ol[1] ?? ''));
      continue;
    }
    const bq = /^&gt;\s?(.*)$/.exec(line);
    if (bq) {
      flushPara();
      flushList();
      out.push(`<blockquote>${inline(bq[1] ?? '')}</blockquote>`);
      continue;
    }
    flushList();
    para.push(inline(line));
  }
  flushPara();
  flushList();
  return out.join('\n');
}

/** 中文阅读时长：与站点的估算一致（每分钟 300 字） */
export function readingStats(body: string): { chars: number; minutes: number } {
  const chars = (body.replace(/\s/g, '') || '').length;
  return { chars, minutes: Math.max(1, Math.round(chars / 300)) };
}

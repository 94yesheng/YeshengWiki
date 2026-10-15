/**
 * 「按博客里的真实样子预览」
 *
 * 做法：**取一篇真实文章页，只把它里面的正文换掉**，然后整页塞进一个覆盖层的 iframe 里。
 * 这样看到的就是站点自己的 CSS、字体、页头页脚、题头日期排版 —— 不是"另画一个像它的东西"。
 *
 * 草稿还没有对应的页面时（新建的文章），借一篇现有文章当外壳。
 *
 * 【图片】正文里的图片路径是相对 .md 文件的（`../../assets/posts/x.jpg`），那是给构建
 * 用的，直接放进预览取不到。所以：
 *   · 开发模式下改写成 `/src/assets/posts/x.jpg` —— Vite 直接提供源文件，能看到真图
 *   · 线上（部署后的后台）取不到源文件，图会加载失败，由 onerror 换成一个占位说明
 *     （宁可显示"这里有一张图"也不显示错位的图）
 */
import { renderMarkdown } from './md';
import { readingTime } from '../utils/date';
import { cjkSpacing } from '../utils/typography';

export interface PreviewInput {
  /** 文章 id；有对应页面就直接用它当外壳 */
  id: string;
  title: string;
  /** 已经排好版的中文日期，例如 二〇二六年三月十三日 */
  dateText: string;
  bodyMarkdown: string;
  /** 借用的外壳页面（新建文章时用） */
  fallbackId: string;
}

/** 把正文里的相对图片路径改写成开发服务器能提供的地址 */
function fixImagePaths(html: string): string {
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (_whole, head: string, src: string, tail: string) => {
    if (/^(https?:|data:|\/)/.test(src)) return `${head}${src}${tail}`;
    // ../../assets/posts/x.jpg → /src/assets/posts/x.jpg
    const m = /\.\.\/\.\.\/(assets\/[^"]+)$/.exec(src);
    const fixed = m ? `/src/${m[1]}` : src;
    return `${head}${fixed}${tail}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pv-missing',textContent:'图片：${src.split('/').pop() ?? ''}（预览取不到，发布后正常）'}))`;
  });
}

async function fetchShellPage(id: string, fallbackId: string): Promise<string | null> {
  for (const candidate of [id, fallbackId]) {
    if (!candidate) continue;
    try {
      const res = await fetch(`/posts/${encodeURIComponent(candidate)}/`, { credentials: 'same-origin' });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('class="prose"')) return text;
      }
    } catch {
      /* 试下一个 */
    }
  }
  return null;
}

export async function openPreview(input: PreviewInput): Promise<void> {
  const page = await fetchShellPage(input.id, input.fallbackId);

  const overlay = document.createElement('div');
  overlay.className = 'pv-overlay';
  overlay.innerHTML = `
    <div class="pv-bar">
      <span class="pv-tag">预览</span>
      <span class="pv-note">这是草稿在真实文章页里的样子${page ? '' : '（没找到可借用的页面，仅显示正文）'}</span>
      <span class="pv-grow"></span>
      <button class="pv-close" type="button">关闭（Esc）</button>
    </div>
    <div class="pv-frame"></div>`;

  const frameHost = overlay.querySelector<HTMLElement>('.pv-frame');
  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  overlay.querySelector('.pv-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  const bodyHtml = fixImagePaths(renderMarkdown(input.bodyMarkdown));

  if (page) {
    const doc = new DOMParser().parseFromString(page, 'text/html');
    // 换掉正文
    const prose = doc.querySelector('.prose');
    if (prose) prose.innerHTML = bodyHtml;

    // 换掉题头。选择器要**精确**：站点页头里的站名也是个 <h1>，
    // 早先用 `h1` 模糊匹配，结果把站名换成了文章标题（页头那块就错了）。
    // 文章页里是 <article> 下的 .dateline / .article-title / .article-meta。
    const article = doc.querySelector('article') ?? doc;
    const titleEl = article.querySelector('.article-title, h1');
    // 标题要过一遍"盘古之白"，否则中英之间少一个空隙 —— 站点渲染标题时就是这么做的
    if (titleEl) titleEl.textContent = cjkSpacing(input.title);
    const dateEl = article.querySelector('.dateline');
    if (dateEl && input.dateText) dateEl.textContent = input.dateText;
    // 字数与阅读时长按草稿重算（页面上那份是按已发布的正文算的）。
    // 用站点自己的 readingTime，保证数字和发布后一致 —— 自己另写一套必然对不上。
    const metaEl = article.querySelector('.article-meta');
    if (metaEl) {
      const { chars, minutes } = readingTime(input.bodyMarkdown);
      metaEl.textContent = `${chars} 字 · 约 ${minutes} 分钟`;
    }

    // 页面里的脚本（开发工具条之类）不要带进预览
    doc.querySelectorAll('script').forEach((s) => s.remove());
    const iframe = document.createElement('iframe');
    iframe.className = 'pv-page';
    frameHost?.append(iframe);
    iframe.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
  } else {
    // 兜底：没有可借用的页面时，至少把正文按文章排版显示出来
    if (frameHost) {
      frameHost.innerHTML = `<div class="pv-fallback"><div class="prose">${bodyHtml}</div></div>`;
    }
  }

  document.body.append(overlay);
}

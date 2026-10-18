/**
 * 「按博客里的真实样子预览」—— 适配 HUD 象限蓝图文章页（#article-prose-body / .article-prose-q）
 */
import { renderMarkdown } from './md';
import { readingTime } from '../utils/date';
import { cjkSpacing } from '../utils/typography';

export interface PreviewInput {
  id: string;
  title: string;
  dateText: string;
  bodyMarkdown: string;
  fallbackId: string;
}

function fixImagePaths(html: string): string {
  return html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (_whole, head: string, src: string, tail: string) => {
    if (/^(https?:|data:|blob:|\/)/.test(src)) return `${head}${src}${tail}`;
    const m = /\.\.\/\.\.\/(assets\/[^"]+)$/.exec(src);
    const fixed = m ? `/src/${m[1]}` : src;
    return `${head}${fixed}${tail} onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'pv-missing',textContent:'图片：${src.split('/').pop() ?? ''}（预览环境未挂载原图，发布后正常）'}))"`;
  });
}

async function fetchShellPage(id: string, fallbackId: string): Promise<string | null> {
  for (const candidate of [id, fallbackId]) {
    if (!candidate) continue;
    try {
      const res = await fetch(`/posts/${encodeURIComponent(candidate)}/`, { credentials: 'same-origin' });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('article-prose-body') || text.includes('class="prose"')) return text;
      }
    } catch {
      /* try next */
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
      <span class="pv-tag">LIVE HUD PREVIEW // 真实文章页预览</span>
      <span class="pv-note">/posts/${input.id}/ · ${input.title || '未命名草稿'}</span>
      <span class="pv-grow"></span>
      <button class="pv-close" type="button">关闭预览 (ESC)</button>
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
  const { chars, minutes } = readingTime(input.bodyMarkdown);

  if (page) {
    const doc = new DOMParser().parseFromString(page, 'text/html');
    const prose = doc.querySelector('#article-prose-body, .article-prose-q, .prose');
    if (prose) prose.innerHTML = bodyHtml;

    const titleEl = doc.querySelector('#detail-main-title, .article-main-title, .article-title');
    if (titleEl) titleEl.textContent = cjkSpacing(input.title);

    const dateEl = doc.querySelector('#detail-meta-date, .dateline');
    if (dateEl && input.dateText) dateEl.textContent = input.dateText;

    const wordsEl = doc.querySelector('#detail-meta-words');
    if (wordsEl) wordsEl.textContent = `约 ${chars.toLocaleString('zh-CN')} 字`;

    const readEl = doc.querySelector('#detail-meta-reading');
    if (readEl) readEl.textContent = `约 ${minutes} 分钟`;

    const loaderEl = doc.querySelector('#infinity-loader');
    if (loaderEl) loaderEl.remove();

    doc.querySelectorAll('script').forEach((s) => s.remove());
    const iframe = document.createElement('iframe');
    iframe.className = 'pv-page';
    frameHost?.append(iframe);
    iframe.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
  } else if (frameHost) {
    frameHost.innerHTML = `
      <div class="pv-fallback" style="padding:2rem 3rem;">
        <div style="border:1px solid var(--rule);padding:1.5rem 2rem;background:var(--paper);">
          <div style="font-family:var(--mono);font-size:0.72rem;color:var(--accent);">ARCHIVE COORDINATE // /posts/${input.id}/</div>
          <h1 style="font-family:var(--kai);font-size:2rem;font-weight:400;margin:0.4rem 0;">${cjkSpacing(input.title)}</h1>
          <div style="font-family:var(--mono);font-size:0.75rem;color:var(--muted);padding-bottom:1rem;border-bottom:1px solid var(--rule);">
            PUBLISHED: ${input.dateText || '今天'} · WORDS: 约 ${chars} 字 · READING: 约 ${minutes} 分钟
          </div>
          <div class="ed-area" style="padding:1.5rem 0;min-height:auto;">${bodyHtml}</div>
        </div>
      </div>`;
  }

  document.body.append(overlay);
}

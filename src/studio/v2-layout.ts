/**
 * v2 桌面布局：在经典文章页渲染完成后，把 DOM 重新编排成「正文优先 + 右侧检查器」。
 *
 * 为什么移动 DOM 而不是重写一版 posts.ts：
 *   · 经典版的所有字段绑定、编辑器、标签、右栏逻辑都已经挂好；
 *   · 移动节点会保留事件监听与编辑器实例，零逻辑复制；
 *   · 经典版 /studio/ 不调用这里，完全不受影响。
 *
 * 布局目标：
 *   · .st-head 变 sticky 文档头，标题输入框搬进来；
 *   · 正文 section（含编辑器 + 工具栏）移到最上面；
 *   · 01/02/右栏三个元数据 section 搬到右栏检查器；
 *   · 原来的「格式工具/右侧悬浮栏」dock 丢弃（工具栏已上移）。
 */
import type { Draft } from './state';

export function applyV2PostLayout(d: NonNullable<Draft['post']>): void {
  const edit = document.querySelector<HTMLElement>('#st-edit');
  const panel = document.querySelector<HTMLElement>('#st-preview');
  const card = edit?.querySelector<HTMLElement>('.st-q-card');
  if (!edit || !panel || !card) return;

  const head = card.querySelector<HTMLElement>('.st-head');
  const editorHost = card.querySelector<HTMLElement>('#ed-host');
  const editorSection = editorHost?.closest<HTMLElement>('.st-section-box') ?? null;
  const titleField = card.querySelector<HTMLElement>('#st-f-title')?.closest<HTMLElement>('.st-field') ?? null;
  const toolbar = panel.querySelector<HTMLElement>('#ed-bar-host');

  // 1) 标题输入框搬进文档头；原来的只读 h2 删掉。
  if (head && titleField) {
    head.classList.add('v2-doc-head');
    head.querySelector('h2')?.remove();
    titleField.classList.add('v2-title-field');
    titleField.querySelector('label')?.remove();
    const topRow = head.querySelector<HTMLElement>('.st-head-top-row');
    const headLeft = topRow?.firstElementChild as HTMLElement | null;
    if (headLeft) headLeft.append(titleField);
    else if (topRow) topRow.prepend(titleField);
    else head.prepend(titleField);
  }

  // 2) 正文 section 提到最前面，工具栏放到编辑器上方。
  if (editorSection) {
    editorSection.classList.add('v2-editor-section');
    card.insertBefore(editorSection, card.querySelector('.st-section-box'));
    if (toolbar) {
      toolbar.classList.add('v2-editor-toolbar');
      const host = editorSection.querySelector('#ed-host');
      if (host) editorSection.insertBefore(toolbar, host);
      else editorSection.append(toolbar);
    }
  }

  // 3) 元数据 section 搬进右栏检查器；dock 的格式/伴读 tab 不再使用。
  const sections = Array.from(card.querySelectorAll<HTMLElement>('.st-section-box')).filter(
    (s) => s !== editorSection
  );

  panel.innerHTML = '';
  const inspector = document.createElement('div');
  inspector.className = 'v2-inspector';
  inspector.innerHTML = `
    <div class="v2-inspector-head">
      <span class="v2-inspector-kicker">DOCUMENT INSPECTOR</span>
      <h2>文章设置</h2>
      <p>标题与正文在左侧；这里只放发布元数据、封面与伴读栏。</p>
    </div>
    <div class="v2-inspector-body"></div>`;
  const body = inspector.querySelector<HTMLElement>('.v2-inspector-body');
  if (body) {
    for (const s of sections) body.appendChild(s);
  }
  panel.appendChild(inspector);

  // 「预览 →」按钮会切回旧 dock；v2 里直接去掉，预览走文档头的「页面预览」。
  document.querySelector('#st-switch-rail-preview')?.remove();

  // 4) 给编辑器一个稳定的初始焦点候选（不抢焦点，只记录）。
  editorHost?.setAttribute('data-v2-editor', 'true');
  void d;
}

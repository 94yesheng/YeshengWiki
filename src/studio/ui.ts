/**
 * 后台界面用的小工具 —— DOM 查询、转义、提示条、忙碌遮罩、错误提示、内联确认对话框。
 *
 * 这是 studio 里最底层的一块，放在依赖链的末端：只依赖共享状态
 * （setBusy 要把忙碌标记写进 state），不依赖任何视图。
 * 依赖方向始终单向：**视图 → ui → state**，所以不会卷进循环。
 */
import { GithubError } from './github';
import { state } from './state';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(
  sel: string,
  root: ParentNode = document
): T[] => Array.from(root.querySelectorAll<T>(sel));
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
};

export const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/* --------------------------------------------------------------------------
   提示与忙碌态
   -------------------------------------------------------------------------- */
let toastTimer: number | undefined;
export function toast(msg: string, isError = false): void {
  const box = $('#st-toast');
  if (!box) return;
  box.textContent = msg;
  box.classList.toggle('st-toast--err', isError);
  box.classList.add('st-show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => box.classList.remove('st-show'), isError ? 6000 : 3200);
}

export function setBusy(on: boolean, text = '处理中…'): void {
  state.busy = on;
  const old = $('#st-busy');
  if (old) old.remove();
  if (on) document.body.append(el('div', { id: 'st-busy', class: 'st-busy', text }));
}

export function reportError(e: unknown): void {
  const msg = e instanceof GithubError ? `${e.message}${e.hint ? ` —— ${e.hint}` : ''}` : e instanceof Error ? e.message : String(e);
  toast(msg, true);
  console.error(e);
}

/* --------------------------------------------------------------------------
   内联确认对话框（替代原生 confirm()，无跳出感，视觉与后台统一）

   用法：
     const ok = await showConfirm({ title: '删除文章', body: '此操作不可撤销。' });
     if (!ok) return;

   可选参数：
     type:    'warn'（默认）| 'info'
     confirm: 确认按钮文字，默认「确认」
     cancel:  取消按钮文字，默认「取消」
   -------------------------------------------------------------------------- */
interface ConfirmOptions {
  title: string;
  body?: string;
  type?: 'warn' | 'info';
  confirm?: string;
  cancel?: string;
}

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const { title, body, type = 'warn', confirm: confirmLabel = '确认', cancel: cancelLabel = '取消' } = opts;

    const icon = type === 'warn' ? '!' : 'i';
    const iconClass = type === 'warn' ? 'st-dialog-icon--warn' : 'st-dialog-icon--info';

    const backdrop = document.createElement('div');
    backdrop.className = 'st-dialog-backdrop';
    backdrop.innerHTML = `
      <div class="st-dialog" role="alertdialog" aria-modal="true" aria-labelledby="st-dlg-title">
        <div class="st-dialog-header">
          <div class="st-dialog-icon ${iconClass}" aria-hidden="true">${icon}</div>
          <div class="st-dialog-title" id="st-dlg-title">${esc(title)}</div>
        </div>
        ${body ? `<div class="st-dialog-body">${esc(body)}</div>` : ''}
        <div class="st-dialog-footer">
          <button type="button" class="st-btn" id="st-dlg-cancel">${esc(cancelLabel)}</button>
          <button type="button" class="st-btn st-btn--primary" id="st-dlg-confirm">${esc(confirmLabel)}</button>
        </div>
      </div>`;

    let onKey: (e: KeyboardEvent) => void = () => {};
    const close = (result: boolean) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };

    backdrop.querySelector('#st-dlg-cancel')?.addEventListener('click', () => close(false));
    backdrop.querySelector('#st-dlg-confirm')?.addEventListener('click', () => close(true));

    // 点击背景关闭（等同于取消）
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });

    // ESC / Enter 键关闭
    onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(backdrop);

    // 自动聚焦确认按钮
    (backdrop.querySelector('#st-dlg-confirm') as HTMLButtonElement)?.focus();
  });
}

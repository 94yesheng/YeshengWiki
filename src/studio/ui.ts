/**
 * 后台界面用的小工具 —— DOM 查询、转义、提示条、忙碌遮罩、错误提示。
 *
 * 这是 studio 里最底层的一块，放在依赖链的末端：只依赖共享状态
 * （setBusy 要把忙碌标记写进 state），不依赖任何视图。
 * 依赖方向始终单向：**视图 → ui → state**，所以不会卷进循环。
 */
import { GithubError } from './github';
import { state } from './state';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
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
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
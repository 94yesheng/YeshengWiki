/**
 * 友链视图 —— src/content/links.json 里那个数组的增删改。
 */
import { $, esc } from '../ui';
import { state, markDirty, rerender } from '../state';

export function renderLinksView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview || !state.links) return;
  const links = state.links.links;

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">友链 · src/content/links.json</div>
      <h2>共 ${links.length} 条</h2>
      <div class="st-stats">顺序由页面按名称自动排序，这里不用管顺序</div>
    </div>
    <div class="st-form">
      ${links
        .map(
          (l, i) => `
        <div class="st-field"><label>第 ${i + 1} 条</label><div>
          <input class="st-input" data-k="name" data-i="${i}" value="${esc(l.name)}" placeholder="名称" style="margin-bottom:4px" />
          <input class="st-input" data-k="url" data-i="${i}" value="${esc(l.url)}" placeholder="https://..." style="margin-bottom:4px" />
          <input class="st-input" data-k="description" data-i="${i}" value="${esc(l.description)}" placeholder="描述（可留空）" style="margin-bottom:4px" />
          <input class="st-input" data-k="id" data-i="${i}" value="${esc(l.id)}" placeholder="标识（英文小写，唯一）" />
          <div style="margin-top:4px"><button class="st-btn st-btn--danger" data-del="${i}">删除这条</button></div>
        </div></div>`
        )
        .join('')}
    </div>
    <button class="st-btn" id="st-add-link">＋ 加一条友链</button>`;

  edit.querySelectorAll<HTMLInputElement>('[data-k]').forEach((input) =>
    input.addEventListener('input', () => {
      const i = Number(input.dataset.i);
      const k = input.dataset.k as 'name' | 'url' | 'description' | 'id';
      const item = links[i];
      if (item) item[k] = input.value;
      markDirty();
      renderLinksPreview();
    })
  );
  edit.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      links.splice(Number(b.dataset.del), 1);
      markDirty();
      rerender();
    })
  );
  $('#st-add-link')?.addEventListener('click', () => {
    links.push({ id: `link-${Date.now().toString(36)}`, name: '', url: 'https://', description: '' });
    markDirty();
    rerender();
  });

  renderLinksPreview();
}

function renderLinksPreview(): void {
  const box = $('#st-preview');
  if (!box) return;
  const links = state.links?.links ?? [];
  box.innerHTML = `<p class="st-note">右边是友链页卡片的样子。</p>
    <div class="st-preview">${links
      .map(
        (l) =>
          // 名字这一行用 --text-lg 而不是站点上的 --text-md：站点那边 md 是 23px，
          // 但后台在 .st-body 里把整套字号压回了旧值（md = 18px），18px 配楷体违反
          // 「楷体不得低于 20px」。这里取后台能给的最高一档，也离站点的 23px 更近一点。
          `<div style="text-indent:0;padding:var(--space-3) 0;border-bottom:1px solid var(--rule)">
            <div style="font-family:var(--kai);font-size:var(--text-lg)">${esc(l.name || '（未命名）')}</div>
            <div style="color:var(--seal);font-size:var(--text-xs)">${esc(l.url)}</div>
            <div style="color:var(--muted);font-size:var(--text-xs)">${esc(l.description)}</div>
          </div>`
      )
      .join('')}</div>`;
}
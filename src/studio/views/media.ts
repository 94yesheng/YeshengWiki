/**
 * 媒体库视图 —— 按文章归档展示 `/uploads` 下的图片（只读为主，允许删除）。
 *
 * 数据由视图自己拉：`GET /api/media` → 缓存到 `state.media`，
 * 不走 `loadAll()`（媒体库不参与「保存草稿」那套流程）。
 */
import { $, $$, esc, showConfirm, toast } from '../ui';
import { rerender, state, type MediaItem } from '../state';

/** 视图自己的请求状态，不放进共享 state：它们是纯 UI 细节 */
let loading = false;
let loadError: string | null = null;

interface MediaGroup {
  owner: string | null;
  items: MediaItem[];
}

export function renderMediaView(): void {
  const edit = $('#st-edit');
  if (!edit) return;

  // 首次渲染时拉一次；之后走 state.media 缓存，刷新按钮才会重新拉。
  // loadError 存在时停在错误态，等用户点「重试」，避免每次重画都重新请求。
  if (!state.mediaLoaded && !loading && !loadError) void loadMedia();

  const items = state.media;
  const groups = groupByOwner(items);
  const totalSize = items.reduce((sum, item) => sum + (item.size ?? 0), 0);

  edit.innerHTML = `
    <div class="st-media-view">
      <div class="st-head">
        <div class="st-head-top-row">
          <div>
            <div class="st-kicker">MEDIA LIBRARY // /uploads/posts/&lt;slug&gt;/</div>
            <h2>媒体库 · 共 ${items.length} 个文件</h2>
          </div>
          <div class="st-head-btns">
            <button type="button" class="st-btn" id="st-media-refresh" ${loading ? 'disabled' : ''}>重新读取</button>
          </div>
        </div>
      </div>

      <div class="st-section-box st-media-summary">
        <div class="st-media-stat">
          <span class="st-media-stat-num">${items.length}</span>
          <span class="st-media-stat-label">文件总数</span>
        </div>
        <div class="st-media-stat">
          <span class="st-media-stat-num">${esc(formatSize(totalSize))}</span>
          <span class="st-media-stat-label">总占用体积</span>
        </div>
        <div class="st-media-stat">
          <span class="st-media-stat-num">${groups.length}</span>
          <span class="st-media-stat-label">归档分组</span>
        </div>
      </div>

      <div id="st-media-body">${bodyHtml(items, groups)}</div>
    </div>`;

  $('#st-media-refresh')?.addEventListener('click', () => refreshMedia());
  $('#st-media-retry')?.addEventListener('click', () => refreshMedia());

  $$<HTMLButtonElement>('[data-media-act]', edit).forEach((btn) => {
    const mediaPath = btn.dataset.path ?? '';
    btn.addEventListener('click', () => {
      const act = btn.dataset.mediaAct;
      if (act === 'copy') void copyMediaUrl(mediaPath);
      else if (act === 'open') window.open(mediaPath, '_blank', 'noopener');
      else if (act === 'delete') void removeMedia(mediaPath);
    });
  });

  renderMediaPreview(items, groups);
}

/* --------------------------------------------------------------------------
   数据拉取
   -------------------------------------------------------------------------- */

function refreshMedia(): void {
  if (loading) return;
  state.mediaLoaded = false;
  loadError = null;
  void loadMedia();
}

async function loadMedia(): Promise<void> {
  if (loading) return;
  loading = true;
  loadError = null;

  const body = $('#st-media-body');
  if (body) body.innerHTML = '<p class="st-empty">正在读取媒体库…</p>';

  try {
    const res = await fetch('/api/media', {
      headers: { 'X-CSRF-Token': state.csrf ?? '' },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { media?: MediaItem[] };
    state.media = Array.isArray(data.media) ? data.media : [];
    state.mediaLoaded = true;
  } catch (error) {
    loadError = error instanceof Error ? error.message : '网络错误';
    toast(`读取媒体库失败：${loadError}`, true);
  } finally {
    loading = false;
    rerender();
  }
}

/* --------------------------------------------------------------------------
   渲染
   -------------------------------------------------------------------------- */

function bodyHtml(items: MediaItem[], groups: MediaGroup[]): string {
  if (loadError) {
    return `
      <div class="st-section-box st-media-error">
        <p class="st-error">读取媒体库失败：${esc(loadError)}</p>
        <button type="button" class="st-btn" id="st-media-retry">重试</button>
      </div>`;
  }
  if (loading && items.length === 0) return '<p class="st-empty">正在读取媒体库…</p>';
  if (items.length === 0) {
    return `
      <div class="st-media-empty">
        <div class="st-media-empty-title">暂无媒体</div>
        <p class="st-empty">在文章里插入图片后会自动归档到这里。</p>
      </div>`;
  }
  return groups.map(groupHtml).join('');
}

function groupHtml(group: MediaGroup): string {
  const label = groupLabel(group);
  const link =
    group.owner === 'photos'
      ? '<a class="st-media-owner-link" href="/photos/" target="_blank" rel="noopener">/photos/</a>'
      : group.owner
        ? `<a class="st-media-owner-link" href="/posts/${encodeURIComponent(group.owner)}/" target="_blank" rel="noopener">/posts/${esc(group.owner)}/</a>`
        : '<span class="st-media-owner-path">/uploads/posts/</span>';
  const size = group.items.reduce((sum, item) => sum + (item.size ?? 0), 0);

  return `
    <section class="st-section-box st-media-group">
      <div class="st-section-head">
        <div class="st-media-group-title">
          <span class="st-media-owner">${esc(label)}</span>
          ${link}
        </div>
        <span class="st-sec-tag">${group.items.length} 张 · ${esc(formatSize(size))}</span>
      </div>
      <div class="st-media-grid">
        ${group.items.map(cardHtml).join('')}
      </div>
    </section>`;
}

function cardHtml(item: MediaItem): string {
  const dims = item.width && item.height ? `${item.width} × ${item.height}` : '尺寸未知';
  return `
    <figure class="st-media-card">
      <a class="st-media-thumb" href="${esc(item.path)}" target="_blank" rel="noopener" title="新窗口打开 ${esc(item.filename)}">
        <img src="${esc(item.path)}" alt="${esc(item.filename)}" loading="lazy" decoding="async" />
      </a>
      <figcaption class="st-media-meta">
        <span class="st-media-name" title="${esc(item.path)}">${esc(item.filename)}</span>
        <span class="st-media-sub">${esc(dims)} · ${esc(formatSize(item.size))}</span>
      </figcaption>
      <div class="st-media-actions">
        <button type="button" class="stage-mini-btn" data-media-act="copy" data-path="${esc(item.path)}">复制 URL</button>
        <button type="button" class="stage-mini-btn" data-media-act="open" data-path="${esc(item.path)}">打开</button>
        <button type="button" class="stage-mini-btn st-btn--danger" data-media-act="delete" data-path="${esc(item.path)}">删除</button>
      </div>
    </figure>`;
}

function renderMediaPreview(items: MediaItem[], groups: MediaGroup[]): void {
  const box = $('#st-preview');
  if (!box) return;

  const totalSize = items.reduce((sum, item) => sum + (item.size ?? 0), 0);
  const biggest = items.reduce<MediaItem | null>(
    (max, item) => ((item.size ?? 0) > (max?.size ?? 0) ? item : max),
    null
  );

  box.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-head">
        <span>MEDIA ARCHIVE // 媒体库归档概览</span>
      </div>

      ${
        loading
          ? '<p class="st-hint">正在读取 /api/media…</p>'
          : loadError
            ? '<p class="st-hint">媒体库尚未读取，请点「重试」。</p>'
            : `
        <div class="st-media-preview-stats">
          <div class="st-media-preview-row"><span>归档分组</span><strong>${groups.length}</strong></div>
          <div class="st-media-preview-row"><span>文件总数</span><strong>${items.length}</strong></div>
          <div class="st-media-preview-row"><span>总占用</span><strong>${esc(formatSize(totalSize))}</strong></div>
          ${
            biggest
              ? `<div class="st-media-preview-row"><span>最大文件</span><strong title="${esc(biggest.filename)}">${esc(formatSize(biggest.size))}</strong></div>`
              : ''
          }
        </div>

        <div class="st-sub-kicker st-media-preview-label">GROUPS // 归档分组</div>
        <ul class="st-media-preview-groups">
          ${groups
            .map(
              (group) =>
                `<li><span>${esc(groupLabel(group))}</span><span class="st-media-preview-count">${group.items.length}</span></li>`
            )
            .join('')}
        </ul>`
      }

      <div class="st-sub-kicker st-media-preview-label">PATH CONVENTION // 路径约定</div>
      <ul class="st-media-path-list">
        <li><code>/uploads/posts/&lt;slug&gt;/</code> 文章图片</li>
        <li><code>/uploads/posts/</code> 历史未归档</li>
        <li><code>/uploads/photos/</code> 照片墙</li>
      </ul>
      <p class="st-hint">删除会同时删掉数据库记录与 uploads 下的真实文件，操作不可撤销。</p>
    </div>`;
}

/* --------------------------------------------------------------------------
   操作
   -------------------------------------------------------------------------- */

async function copyMediaUrl(mediaPath: string): Promise<void> {
  const url = new URL(mediaPath, window.location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    toast(`已复制媒体 URL：${url}`);
  } catch {
    toast('复制失败，请右键图片选择「复制链接」', true);
  }
}

async function removeMedia(mediaPath: string): Promise<void> {
  const item = state.media.find((media) => media.path === mediaPath);
  const label = item?.filename ?? mediaPath;
  const ok = await showConfirm({
    title: '删除媒体文件？',
    body: `会删除 ${label} 以及 uploads 下的真实文件，且不可撤销。`,
    confirm: '删除文件',
    cancel: '取消',
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/media?path=${encodeURIComponent(mediaPath)}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': state.csrf ?? '' },
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

    state.media = state.media.filter((media) => media.path !== mediaPath);
    toast(`已删除 ${label}`);
    rerender();
  } catch (error) {
    toast(`删除失败：${error instanceof Error ? error.message : '网络错误'}`, true);
  }
}

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */

function groupByOwner(items: MediaItem[]): MediaGroup[] {
  const groups = new Map<string, MediaGroup>();
  for (const item of items) {
    // listMedia() 已经按 owner 排好序，这里靠 Map 的插入顺序保序。
    const key = item.owner ?? '';
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { owner: item.owner, items: [item] });
  }
  return [...groups.values()];
}

function groupLabel(group: MediaGroup): string {
  if (group.owner === 'photos') return '照片墙';
  if (group.owner === null) return '未归档';
  return group.items[0]?.postTitle || group.owner;
}

function formatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

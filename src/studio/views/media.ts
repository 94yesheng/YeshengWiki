/**
 * 媒体库视图 —— 按分类（图片影像 / 音频曲库）与文章归档展示 `/uploads` 下的媒体文件。
 *
 * 数据由视图自己拉：`GET /api/media` → 缓存到 `state.media`，
 * 支持分类筛选（全部 / 图片 / 音频）与直接上传音频文件到媒体库。
 */
import { uploadAudioAsset } from '../content';
import { $, $$, esc, reportError, setBusy, showConfirm, toast } from '../ui';
import { rerender, state, type MediaItem } from '../state';

let loading = false;
let loadError: string | null = null;
let currentMediaCategory: 'all' | 'image' | 'audio' = 'all';

interface MediaGroup {
  owner: string | null;
  items: MediaItem[];
}

const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i;

export function isAudioMediaItem(item: MediaItem): boolean {
  return (item.mime ?? '').startsWith('audio/') || item.owner === 'audio' || AUDIO_EXT_RE.test(item.path);
}

export function renderMediaView(): void {
  const edit = $('#st-edit');
  if (!edit) return;

  if (!state.mediaLoaded && !loading && !loadError) void loadMedia();

  const allItems = state.media;
  const audioItems = allItems.filter(isAudioMediaItem);
  const imageItems = allItems.filter((item) => !isAudioMediaItem(item));
  const filteredItems =
    currentMediaCategory === 'audio'
      ? audioItems
      : currentMediaCategory === 'image'
        ? imageItems
        : allItems;

  const groups = groupByOwner(filteredItems);
  const totalSize = allItems.reduce((sum, item) => sum + (item.size ?? 0), 0);

  edit.innerHTML = `
    <div class="st-media-view">
      <div class="st-head">
        <div class="st-head-top-row">
          <div>
            <div class="st-kicker">MEDIA LIBRARY // /uploads/{posts,photos,audio}/</div>
            <h2>媒体库 · 共 ${allItems.length} 个文件（图片 ${imageItems.length} · 音频 ${audioItems.length}）</h2>
          </div>
          <div class="st-head-btns">
            <label class="st-btn st-btn--primary" style="cursor:pointer;display:inline-flex;align-items:center;gap:0.35rem;">
              <span>＋ 上传音频至媒体库</span>
              <input type="file" id="st-media-upload-audio" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus" hidden />
            </label>
            <button type="button" class="st-btn" id="st-media-refresh" ${loading ? 'disabled' : ''}>重新读取</button>
          </div>
        </div>
      </div>

      <div class="st-section-box st-media-summary" style="grid-template-columns:repeat(4,minmax(0,1fr));">
        <div class="st-media-stat">
          <span class="st-media-stat-num">${allItems.length}</span>
          <span class="st-media-stat-label">文件总数</span>
        </div>
        <div class="st-media-stat">
          <span class="st-media-stat-num">${imageItems.length}</span>
          <span class="st-media-stat-label">图片影像</span>
        </div>
        <div class="st-media-stat">
          <span class="st-media-stat-num">${audioItems.length}</span>
          <span class="st-media-stat-label">音频曲目</span>
        </div>
        <div class="st-media-stat">
          <span class="st-media-stat-num">${esc(formatSize(totalSize))}</span>
          <span class="st-media-stat-label">总占用体积</span>
        </div>
      </div>

      <div class="st-section-box" style="padding:0.75rem 1rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;">
        <div class="st-seg-row" role="tablist" aria-label="媒体库分类筛选">
          <button type="button" class="stage-mini-btn" data-media-cat="all" aria-pressed="${currentMediaCategory === 'all'}">全部媒体 (${allItems.length})</button>
          <button type="button" class="stage-mini-btn" data-media-cat="image" aria-pressed="${currentMediaCategory === 'image'}">图片影像 (${imageItems.length})</button>
          <button type="button" class="stage-mini-btn" data-media-cat="audio" aria-pressed="${currentMediaCategory === 'audio'}">音频曲库 (${audioItems.length})</button>
        </div>
        <span style="font-family:var(--mono);font-size:0.72rem;color:var(--faint);">
          AUDIO &amp; IMAGE ARCHIVE // 支持在文章右侧「音乐播放模块」中直接调用音频
        </span>
      </div>

      <div id="st-media-body">${bodyHtml(filteredItems, groups)}</div>
    </div>`;

  $('#st-media-refresh')?.addEventListener('click', () => refreshMedia());
  $('#st-media-retry')?.addEventListener('click', () => refreshMedia());

  $$<HTMLButtonElement>('[data-media-cat]', edit).forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMediaCategory = (btn.dataset.mediaCat as 'all' | 'image' | 'audio') || 'all';
      renderMediaView();
    });
  });

  const audioUploadInput = $<HTMLInputElement>('#st-media-upload-audio', edit);
  audioUploadInput?.addEventListener('change', async () => {
    const file = audioUploadInput.files?.[0];
    audioUploadInput.value = '';
    if (!file || !state.gh) return;
    setBusy(true, '正在上传音频至媒体库…');
    try {
      await uploadAudioAsset(state.gh, file);
      toast(`音频「${file.name}」已上传至媒体库`);
      currentMediaCategory = 'audio';
      state.mediaLoaded = false;
      await loadMedia();
    } catch (err) {
      reportError(err);
    } finally {
      setBusy(false);
    }
  });

  $$<HTMLButtonElement>('[data-media-act]', edit).forEach((btn) => {
    const mediaPath = btn.dataset.path ?? '';
    btn.addEventListener('click', () => {
      const act = btn.dataset.mediaAct;
      if (act === 'copy') void copyMediaUrl(mediaPath);
      else if (act === 'open') window.open(mediaPath, '_blank', 'noopener');
      else if (act === 'delete') void removeMedia(mediaPath);
    });
  });

  renderMediaPreview(allItems, groupByOwner(allItems), audioItems.length, imageItems.length);
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
        <div class="st-media-empty-title">${
          currentMediaCategory === 'audio' ? '音频分类下暂无文件' : '暂无媒体文件'
        }</div>
        <p class="st-empty">${
          currentMediaCategory === 'audio'
            ? '点击右上角「＋ 上传音频至媒体库」或在文章编辑页的音乐播放模块中上传音频后，会自动归档到这里。'
            : '在文章里插入图片或上传音频后会自动归档到这里。'
        }</p>
      </div>`;
  }
  return groups.map(groupHtml).join('');
}

function groupHtml(group: MediaGroup): string {
  const label = groupLabel(group);
  const link =
    group.owner === 'photos'
      ? '<a class="st-media-owner-link" href="/photos/" target="_blank" rel="noopener">/photos/</a>'
      : group.owner === 'audio'
        ? '<span class="st-media-owner-path">/uploads/audio/ · 伴读音频曲库</span>'
        : group.owner
          ? `<a class="st-media-owner-link" href="/posts/${encodeURIComponent(group.owner)}/" target="_blank" rel="noopener">/posts/${esc(group.owner)}/</a>`
          : '<span class="st-media-owner-path">/uploads/posts/</span>';
  const size = group.items.reduce((sum, item) => sum + (item.size ?? 0), 0);
  const unit = group.owner === 'audio' ? '首' : '个';

  return `
    <section class="st-section-box st-media-group">
      <div class="st-section-head">
        <div class="st-media-group-title">
          <span class="st-media-owner">${esc(label)}</span>
          ${link}
        </div>
        <span class="st-sec-tag">${group.items.length} ${unit} · ${esc(formatSize(size))}</span>
      </div>
      <div class="st-media-grid">
        ${group.items.map(cardHtml).join('')}
      </div>
    </section>`;
}

function cardHtml(item: MediaItem): string {
  if (isAudioMediaItem(item)) {
    const ext = (item.filename.split('.').pop() || 'AUDIO').toUpperCase();
    return `
      <figure class="st-media-card st-media-card--audio">
        <div class="st-media-thumb st-media-audio-thumb" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.45rem;padding:0.9rem;background:color-mix(in srgb, var(--accent) 7%, var(--canvas));">
          <svg viewBox="0 0 48 48" width="38" height="38" fill="none" stroke="var(--accent)" stroke-width="1.5" aria-hidden="true">
            <circle cx="24" cy="24" r="20" stroke-opacity="0.45"/>
            <circle cx="24" cy="24" r="14" stroke-dasharray="3 3" stroke-opacity="0.35"/>
            <circle cx="24" cy="24" r="4.5" fill="var(--paper)" stroke="var(--accent)"/>
            <circle cx="24" cy="24" r="1.5" fill="var(--accent)"/>
          </svg>
          <audio controls preload="metadata" src="${esc(item.path)}" style="width:100%;height:28px;"></audio>
        </div>
        <figcaption class="st-media-meta">
          <span class="st-media-name" title="${esc(item.path)}">${esc(item.filename)}</span>
          <span class="st-media-sub">${esc(ext)} 音频 · ${esc(formatSize(item.size))}${
            item.postTitle ? ` · ${esc(item.postTitle)}` : ''
          }</span>
        </figcaption>
        <div class="st-media-actions">
          <button type="button" class="stage-mini-btn" data-media-act="copy" data-path="${esc(item.path)}">复制 URL</button>
          <button type="button" class="stage-mini-btn" data-media-act="open" data-path="${esc(item.path)}">打开</button>
          <button type="button" class="stage-mini-btn st-btn--danger" data-media-act="delete" data-path="${esc(item.path)}">删除</button>
        </div>
      </figure>`;
  }

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

function renderMediaPreview(
  items: MediaItem[],
  groups: MediaGroup[],
  audioCount: number,
  imageCount: number
): void {
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
          <div class="st-media-preview-row"><span>图片影像</span><strong>${imageCount}</strong></div>
          <div class="st-media-preview-row"><span>音频曲目</span><strong>${audioCount}</strong></div>
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
        <li><code>/uploads/posts/&lt;slug&gt;/</code> 文章配图与封面</li>
        <li><code>/uploads/audio/</code> 音频曲库（供文章音乐模块调用）</li>
        <li><code>/uploads/photos/</code> 照片墙影像</li>
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
    toast('复制失败，请手动复制链接', true);
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
    const key = isAudioMediaItem(item) ? 'audio' : (item.owner ?? '');
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { owner: key === '' ? null : key, items: [item] });
  }
  return [...groups.values()];
}

function groupLabel(group: MediaGroup): string {
  if (group.owner === 'audio') return '音频曲库 (AUDIO)';
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

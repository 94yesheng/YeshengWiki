/**
 * 照片墙视图 —— 一面墙的字段、照片清单、上传与移除，以及"保存这一面墙"。
 */
import {
  createWall,
  deleteWall,
  draftId,
  prepareImage,
  saveWall,
  uploadPhoto,
  type WallEntry,
} from '../content';
import { $, esc, reportError, setBusy, toast } from '../ui';
import { state, markDirty, reload, rerender } from '../state';
import { isoDate } from '../../utils/date';
import type { Github } from '../github';

function currentWall(): WallEntry | null {
  return state.walls.find((w) => w.id === state.selected) ?? null;
}

function wallDraft(): WallEntry | undefined {
  const entry = currentWall();
  if (!entry) return undefined;
  if (!state.draft.wall || state.draft.wall.id !== entry.id) {
    state.draft.wall = JSON.parse(JSON.stringify(entry)) as WallEntry;
  }
  return state.draft.wall;
}

export function renderWallView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview) return;

  const w = wallDraft();
  if (!w) {
    edit.innerHTML = '<p class="st-empty">左边选一面墙；新建就点列表最上面那一行的「＋」。</p>';
    preview.innerHTML = '';
    return;
  }

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">照片墙 · ${esc(w.path)}</div>
      <h2 id="st-live-title">${esc(w.title || '（未填标题）')}</h2>
      <div class="st-stats">${w.photos.length} 张照片</div>
    </div>
    <div class="st-form">
      <div class="st-field"><label>标题</label><div>
        <input class="st-input" id="st-w-title" value="${esc(w.title)}" placeholder="给这组照片起个名字" />
      </div></div>
      <div class="st-field"><label>时间</label><div>
        <input class="st-input" id="st-w-date" value="${esc(w.date)}" style="max-width:10rem" />
        <div class="st-hint">格式 2026-03-09，可留空。留空的墙排在时间轴最后</div>
      </div></div>
      <div class="st-field"><label>地点</label><div>
        <input class="st-input" id="st-w-place" value="${esc(w.place)}" placeholder="可留空" />
      </div></div>
      <div class="st-field"><label>记录</label><div>
        <textarea class="st-textarea" id="st-w-note" rows="4" placeholder="想留下的几句话，显示在照片页上，可留空">${esc(w.note)}</textarea>
      </div></div>
    </div>

    <div class="st-editor-head"><span>墙里的照片</span><span class="st-info">${w.photos.length} 张</span></div>
    <div class="st-photos" id="st-photos">
      ${
        w.photos.length
          ? w.photos
              .map(
                (p, i) => `<div class="st-photo-row">
                  <div>
                    <input class="st-input" data-cap="${i}" value="${esc(p.caption)}" placeholder="这一张的说明（可留空）" />
                    <div class="st-file">${esc(p.file)}</div>
                  </div>
                  <button class="st-btn st-btn--danger" data-rmphoto="${i}" title="从这面墙移除">移除</button>
                </div>`
              )
              .join('')
          : '<p class="st-empty">这面墙还没有照片。</p>'
      }
    </div>
    <div class="st-drop" id="st-drop">把图片拖到这里，或者 <button class="st-btn" id="st-pick-file">选择文件</button> 上传（会自动压到长边 2560px）</div>
    <input type="file" id="st-file" accept="image/*" multiple hidden />
    <div style="margin-top:var(--space-2)">
      <button class="st-btn" id="st-pick-existing">从已上传的图片里挑</button>
      <button class="st-btn st-btn--danger" id="st-del-wall" style="float:right">删除这面墙</button>
    </div>
    <div id="st-pick-box"></div>`;

  const bind = (sel: string, key: 'title' | 'date' | 'place' | 'note') =>
    $<HTMLInputElement>(sel)?.addEventListener('input', (e) => {
      w[key] = (e.target as HTMLInputElement).value;
      markDirty();
      const t = $('#st-live-title');
      if (t && key === 'title') t.textContent = w.title || '（未填标题）';
      renderWallPreview();
    });
  bind('#st-w-title', 'title');
  bind('#st-w-date', 'date');
  bind('#st-w-place', 'place');
  bind('#st-w-note', 'note');

  edit.querySelectorAll<HTMLInputElement>('[data-cap]').forEach((input) =>
    input.addEventListener('input', () => {
      const i = Number(input.dataset.cap);
      const p = w.photos[i];
      if (p) p.caption = input.value;
      markDirty();
      renderWallPreview();
    })
  );
  edit.querySelectorAll<HTMLButtonElement>('[data-rmphoto]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = Number(b.dataset.rmphoto);
      const p = w.photos[i];
      if (!p) return;
      if (!confirm(`从这面墙移除「${p.file}」？\n\n只影响这面墙的清单，图片文件本身不会删。`)) return;
      w.photos.splice(i, 1);
      markDirty();
      renderWallView();
    })
  );

  $('#st-del-wall')?.addEventListener('click', () => void removeWall(w));
  $('#st-pick-file')?.addEventListener('click', () => $<HTMLInputElement>('#st-file')?.click());
  $('#st-file')?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) void uploadImages(w, Array.from(files));
  });
  $('#st-pick-existing')?.addEventListener('click', () => renderPickExisting(w));

  const drop = $('#st-drop');
  drop?.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('st-over');
  });
  drop?.addEventListener('dragleave', () => drop.classList.remove('st-over'));
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('st-over');
    const files = Array.from((e as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) void uploadImages(w, files);
  });

  renderWallPreview();
}

function renderPickExisting(w: WallEntry): void {
  const box = $('#st-pick-box');
  if (!box) return;
  const used = new Set(w.photos.map((p) => p.file));
  const free = state.photoFiles.filter((f) => !used.has(f));
  box.innerHTML = `<div class="st-pick">${
    free.length
      ? free.map((f) => `<button data-f="${esc(f)}">${esc(f)}</button>`).join('')
      : '<p class="st-empty">没有别的新图片了（都已在这面墙里）。</p>'
  }</div>`;
  box.querySelectorAll<HTMLButtonElement>('button[data-f]').forEach((b) =>
    b.addEventListener('click', () => {
      w.photos.push({ file: b.dataset.f ?? '', caption: '' });
      markDirty();
      renderWallView();
    })
  );
}

function renderWallPreview(): void {
  const box = $('#st-preview');
  const w = state.draft.wall;
  if (!box || !w) return;
  const meta = [w.date, w.place].filter(Boolean).join(' · ');
  box.innerHTML = `
    <p class="st-note">右边是这面墙在照片页上的样子（图片要等构建后才会真正显示，这里只列清单）。</p>
    <div class="st-preview">
      <h1 style="text-indent:0">${esc(w.title || '（未填标题）')}</h1>
      ${meta ? `<p style="text-indent:0;color:var(--muted);font-size:var(--text-xs)">${esc(meta)}</p>` : ''}
      ${w.note ? `<p>${esc(w.note)}</p>` : ''}
      <ul style="text-indent:0">
        ${w.photos
          .map((p) => `<li>${esc(p.file)}${p.caption ? ` —— ${esc(p.caption)}` : ''}</li>`)
          .join('')}
      </ul>
    </div>`;
}

async function uploadImages(w: WallEntry, files: File[]): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  setBusy(true, `压缩并上传 ${files.length} 张…`);
  try {
    for (const file of files) {
      const prepared = await prepareImage(file);
      const name = await uploadPhoto(gh, prepared, w.date, [...state.photoFiles, ...w.photos.map((p) => p.file)]);
      state.photoFiles.push(name);
      w.photos.push({ file: name, caption: '' });
      markDirty();
      toast(`${name}：${Math.round(prepared.originalBytes / 1024)}KB → ${Math.round(prepared.bytes.length / 1024)}KB，已上传。记得点保存`);
    }
    renderWallView();
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

/**
 * 新建照片墙：和新建文章同一套 —— 不问名字，直接出来一面空墙（标题「草稿」、日期今天）。
 * 日期一定要给：照片墙是按日期倒序排的，**没有日期的会沉到最后**，那就看不见刚加的这一面了。
 */
export async function createNewWall(): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  const id = draftId((x) => state.walls.some((w) => w.id === x));
  const wall: WallEntry = {
    path: `src/content/photos/${id}.json`,
    sha: '',
    id,
    title: '草稿',
    date: isoDate(new Date()),
    place: '',
    note: '',
    photos: [],
    extra: {},
  };
  setBusy(true, '创建中…');
  try {
    await createWall(gh, id, wall);
    await reload();
    state.selected = id;
    state.justAdded = id; // 让它滑出来（画完就清）
    rerender();
    state.justAdded = null;
    toast('已新建一面空墙 —— 往里面拖图片就行');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

async function removeWall(wall: WallEntry): Promise<void> {
  const gh = state.gh;
  if (!gh) return;
  if (!confirm(`确定删除照片墙「${wall.title || wall.id}」？\n\n只删这个数据文件，照片本身不删。`)) return;
  setBusy(true, '删除中…');
  try {
    await deleteWall(gh, wall);
    state.selected = null;
    state.draft = {};
    state.dirty = false;
    await reload();
    toast('已删除');
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

export async function saveWallCurrent(gh: Github): Promise<void> {
  const w = state.draft.wall;
  if (!w) return;
  await saveWall(gh, w);
  await reload();
  state.selected = w.id;
  rerender();
}
/**
 * 照片墙与光学档案视图（自动读取 EXIF 摄影信息 + 手动修改 + 用户侧缺失信息艺术化模糊乱码预览）
 *
 * 1. 上传或拖入照片时，先调 `extractPhotoTelemetryFromFile` 从原始二进制流解析 EXIF
 *    （机身、镜头、光圈/快门/ISO、拍摄日期、GPS 经纬、色彩空间）并采样计算宽高比与 16 段亮度直方图；
 * 2. 支持点击任意照片进入「单张照片 EXIF 光学检视与手动覆写」面板；
 * 3. 若某项摄影参数未能从 EXIF 读取且未手动填写，在用户侧展示与右侧实时检视台中
 *    自动以「模糊化乱码（Artistic Blurred Cipher）」进行艺术化处理。
 */
import {
  draftId,
  newWallEntry,
  prepareImage,
  saveWall,
  uploadPhoto,
  wallToJson,
  type WallEntry,
  type WallPhoto,
} from '../content';
import {
  EXIF_FIELD_META,
  extractPhotoTelemetryFromFile,
  renderExifValueOrCipherHtml,
  type ExifFieldKey,
} from '../exif';
import { $, esc, reportError, setBusy, toast } from '../ui';
import { isStagedNew, markDirty, rerender, settleBeforeLeaving, stageAdd, stageRemove, state } from '../state';
import { chineseFullDate, isoDate } from '../../utils/date';
import type { Github } from '../github';

/** 映射已知的展示页静态图片，方便在后台直接看到真实缩略图 */
const DEMO_IMG_MAP: Record<string, string> = {
  '2024-10-07-日落.jpg': '/artifact/home/images/photo-01-large.jpg',
  '2022-06-01-IMG_20220601_195659.jpg': '/artifact/home/images/photo-02-large.jpg',
  '2024-07-17-山城竖幅.jpg': '/artifact/home/images/photo-03-large.jpg',
  '2026-03-09-城市壁纸.png': '/artifact/home/images/photo-04-large.jpg',
  '2024-07-17-chongqing.jpg': '/artifact/home/images/photo-05-large.jpg',
  '2024-07-08-2R9A9476.jpg': '/artifact/home/images/photo-06-large.jpg',
  '2026-03-09-鸡煲.jpg': '/artifact/home/images/post-cover-jibao.jpg',
};

/**
 * 生产环境没有 Vite 的 /src/ 静态服务，`/src/assets/photos/...` 会 404。
 * 已知的展示图走 DEMO_IMG_MAP；其余先给占位图，等 hydratePhotoPreviews 用
 * GitHub Contents API 取回二进制后换成 blob URL。
 */
function resolvePhotoPreviewUrl(file: string): string {
  if (!file) return '/studio/photo-placeholder.svg';
  if (file.startsWith('blob:') || file.startsWith('data:') || file.startsWith('http') || file.startsWith('/')) {
    return file;
  }
  return DEMO_IMG_MAP[file] ?? '/studio/photo-placeholder.svg';
}

/** 图片预览缓存：文件名 → blob URL；同一张只取一次 */
const previewCache = new Map<string, string>();
const previewLoading = new Map<string, Promise<string | null>>();

function mimeOf(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function loadPhotoPreview(file: string): Promise<string | null> {
  if (!file) return null;
  // 已知的展示图 / 刚上传的本地预览先用本地 URL，不浪费一次 API 请求。
  const local = DEMO_IMG_MAP[file];
  if (local) return local;
  if (state.demoMode || !state.gh) return null;
  const cached = previewCache.get(file);
  if (cached) return cached;
  const pending = previewLoading.get(file);
  if (pending) return pending;

  const job = (async () => {
    try {
      const bin = await state.gh!.getBinary(`src/assets/photos/${file}`);
      if (!bin) return null;
      const bytes = new Uint8Array(bin.bytes);
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: mimeOf(file) }));
      previewCache.set(file, url);
      return url;
    } catch {
      return null; // 预览失败就保留占位图，不打断编辑
    } finally {
      previewLoading.delete(file);
    }
  })();
  previewLoading.set(file, job);
  return job;
}

/** 把页面里带 data-photo-preview 的占位图换成真实图片 */
function hydratePhotoPreviews(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>('img[data-photo-preview]').forEach((img) => {
    const file = img.dataset.photoPreview;
    if (!file) return;
    void loadPhotoPreview(file).then((url) => {
      if (url && img.isConnected) img.src = url;
    });
  });
}

function currentWall(): WallEntry | null {
  return state.walls.find((w) => w.id === state.selected) ?? null;
}

function wallDraft(): WallEntry | undefined {
  const entry = currentWall();
  if (!entry) return undefined;
  if (!state.draft.wall || state.draft.wall.id !== entry.id) {
    state.draft.wall = JSON.parse(JSON.stringify(entry)) as WallEntry;
    state.draft.selectedPhotoIdx = 0;
  }
  return state.draft.wall;
}

export function renderWallView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview) return;

  const w = wallDraft();
  if (!w) {
    edit.innerHTML = '<p class="st-empty">左边选一面照片墙；新建就点列表最上面那一行的「＋」。</p>';
    preview.innerHTML = '';
    return;
  }

  const selIdx = Math.max(0, Math.min(w.photos.length - 1, state.draft.selectedPhotoIdx ?? 0));
  state.draft.selectedPhotoIdx = selIdx;
  const activePhoto: WallPhoto | undefined = w.photos[selIdx];

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">OPTICS // 02</span>
          <span>PHOTO WALL &amp; EXIF TELEMETRY // 照片墙与摄影信息自动读取/乱码艺术工作台</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">${w.photos.length} FRAMES</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-head-top-row">
          <div>
            <div class="st-kicker">ALBUM ARCHIVE // ${esc(w.path)}</div>
            <h2 id="st-live-title">${esc(w.title || '（未填标题）')}</h2>
          </div>
          <div class="st-head-btns">
            <button type="button" class="stage-mini-btn st-btn--danger" id="st-del-wall">删除这面照片墙</button>
          </div>
        </div>
      </div>

      <!-- 第一块：影集墙整体信息（对应主页 02 屏与照片页分组头） -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>01 // WALL METADATA · 影集墙分组信息（对应主页 02 · PHOTOS 与影集归档）</span>
          <span class="st-sec-tag">ALBUM GROUP</span>
        </div>
        <div class="st-grid-3">
          <div class="st-field">
            <label>影集标题</label>
            <div><input class="st-input" id="st-w-title" value="${esc(w.title)}" placeholder="如：山城与暮色切片（最新一组）" /></div>
          </div>
          <div class="st-field">
            <label>归档日期</label>
            <div><input class="st-input" id="st-w-date" value="${esc(w.date)}" placeholder="2024-10-07" /></div>
          </div>
          <div class="st-field">
            <label>拍摄地域</label>
            <div><input class="st-input" id="st-w-place" value="${esc(w.place)}" placeholder="如：重庆 · 日常切片" /></div>
          </div>
        </div>
        <div class="st-field" style="margin-top:0.65rem;">
          <label>影集导言</label>
          <div>
            <textarea class="st-textarea" id="st-w-note" rows="2" placeholder="显示在主页照片栏顶部的影集记录说明">${esc(w.note)}</textarea>
          </div>
        </div>
      </div>

      <!-- 第二块：照片上传（自动提取 EXIF + 影调直方图）与墙内胶片序列 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>02 // FILMSTRIP &amp; AUTO EXIF INGEST · 胶片序列与自动读取摄影信息（点击任意卡片编辑详情）</span>
          <div style="display:flex;gap:0.4rem;">
            <button type="button" class="stage-mini-btn" id="st-sim-noexif-btn" title="添加一张部分摄影信息缺失的照片，直观测试用户侧的模糊乱码艺术效果">模拟导入缺失 EXIF 照片</button>
            <button type="button" class="stage-mini-btn" id="st-pick-existing">从媒体库挑选</button>
          </div>
        </div>

        <div class="st-drop" id="st-drop">
          <div class="st-drop-title">拖拽原图到此，或 <button type="button" class="st-btn st-btn--primary" id="st-pick-file">选择照片上传并自动读取 EXIF</button></div>
          <div class="st-hint">上传前自动从二进制头部读取相机机身、镜头、曝光参数、拍摄日期、GPS 经纬与 16 段影调直方图；未读取到且未手填的项将在用户侧自动转为「模糊化乱码」艺术效果。</div>
        </div>
        <input type="file" id="st-file" accept="image/*" multiple hidden />
        <div id="st-pick-box"></div>

        ${
          w.photos.length
            ? `<div class="st-filmstrip-cards" id="st-photos">
                ${w.photos
                  .map((p, i) => {
                    const missingCount = EXIF_FIELD_META.filter((m) => !String(p[m.key] ?? '').trim()).length;
                    const isSelected = i === selIdx;
                    return `<div class="st-photo-card${isSelected ? ' is-selected' : ''}" data-select-photo="${i}">
                      <div class="st-photo-card-thumb">
                        <img src="${esc(resolvePhotoPreviewUrl(p.file))}" data-photo-preview="${esc(p.file)}" alt="${esc(p.title || p.caption || p.file)}" loading="lazy" />
                        <span class="st-photo-idx">#${String(i + 1).padStart(2, '0')}</span>
                        <span class="st-photo-ratio">${esc(p.ratioPill?.split(' ')[0] || '16:9')}</span>
                      </div>
                      <div class="st-photo-card-meta">
                        <div class="st-photo-card-title">${esc(p.title || p.caption || p.file)}</div>
                        <div class="st-photo-card-sub">
                          ${
                            missingCount === 0
                              ? `<span class="st-exif-badge st-exif-badge--ok">EXIF 完整 (9/9)</span>`
                              : `<span class="st-exif-badge st-exif-badge--cipher">${missingCount} 项未填 → 艺术乱码</span>`
                          }
                        </div>
                      </div>
                    </div>`;
                  })
                  .join('')}
              </div>`
            : '<p class="st-empty">这面墙还没有照片，请点击上方上传或模拟导入。</p>'
        }
      </div>

      <!-- 第三块：当前选中照片的完整摄影参数与 EXIF 编辑器（1:1 对应 /photos/ 光学检视台） -->
      ${
        activePhoto
          ? renderSinglePhotoEditorHtml(activePhoto, selIdx, w.photos.length)
          : ''
      }
    </div>`;

  // 绑定墙级字段
  const bindWall = (sel: string, key: 'title' | 'date' | 'place' | 'note') =>
    $<HTMLInputElement | HTMLTextAreaElement>(sel)?.addEventListener('input', (e) => {
      w[key] = (e.target as HTMLInputElement).value;
      markDirty();
      const t = $('#st-live-title');
      if (t && key === 'title') t.textContent = w.title || '（未填标题）';
      renderWallPreview();
    });
  bindWall('#st-w-title', 'title');
  bindWall('#st-w-date', 'date');
  bindWall('#st-w-place', 'place');
  bindWall('#st-w-note', 'note');

  // 切换选中的单张照片
  edit.querySelectorAll<HTMLElement>('[data-select-photo]').forEach((card) =>
    card.addEventListener('click', () => {
      state.draft.selectedPhotoIdx = Number(card.dataset.selectPhoto);
      renderWallView();
    })
  );

  // 绑定单张照片的编辑器交互
  if (activePhoto) {
    wireSinglePhotoEditor(edit, w, activePhoto, selIdx);
  }

  $('#st-del-wall')?.addEventListener('click', () => removeWall(w));
  $('#st-pick-file')?.addEventListener('click', () => $<HTMLInputElement>('#st-file')?.click());
  $('#st-file')?.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) void uploadImages(w, Array.from(files));
  });
  $('#st-pick-existing')?.addEventListener('click', () => renderPickExisting(w));

  // 模拟导入一张无 EXIF 的照片（用于测试自动读取 + 未读字段乱码模糊）
  $('#st-sim-noexif-btn')?.addEventListener('click', () => {
    const newIdx = w.photos.length + 1;
    w.photos.push({
      file: `2026-10-18-UNREAD-SAMPLE-0${newIdx}.jpg`,
      caption: '街头未知切片（部分 EXIF 缺失演示）',
      title: `街头未知光影切片 #0${newIdx}`,
      story: '这张照片模拟从社交软件或截图导入：仅自动识别出 16:9 画幅与影调直方图，器材机身、镜头焦段、曝光参数与经纬坐标均未读取，在右侧用户视图中自动应用「模糊化乱码」艺术处理。',
      group: 'latest',
      coord: `FRAME #0${newIdx} // GROUP 01 · CIPHER`,
      date: chineseFullDate(new Date()),
      location: '',
      aspect: '16:9 横幅 (2560×1440)',
      ar: 1.7778,
      ratioPill: '16:9 HORIZONTAL',
      camera: '',
      lens: '',
      exposure: '',
      color: '',
      gps: '',
      ev: 'EV -0.4 · AUTO METERING',
      hist: [22, 35, 58, 76, 88, 72, 54, 42, 48, 64, 70, 52, 36, 24, 16, 12],
      autoFields: ['date', 'aspect', 'ev'],
    });
    state.draft.selectedPhotoIdx = w.photos.length - 1;
    markDirty();
    renderWallView();
    toast('已模拟导入缺省 EXIF 照片 —— 请看右栏用户侧预览中的「模糊化乱码」艺术效果');
  });

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
  hydratePhotoPreviews(edit);
}

function renderSinglePhotoEditorHtml(p: WallPhoto, idx: number, total: number): string {
  const autoSet = new Set(p.autoFields ?? []);
  return `
    <div class="st-section-box st-photo-inspector-editor">
      <div class="st-section-head">
        <span>03 // FRAME #${String(idx + 1).padStart(2, '0')} OPTICAL &amp; EXIF EDITOR · 单张摄影参数编辑（留空项在用户侧自动转为模糊乱码）</span>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
          <button type="button" class="stage-mini-btn" id="st-photo-clear-some" title="清空机身、镜头、GPS 等字段，立即测试用户侧模糊乱码艺术效果">置空部分参数以预览乱码效果</button>
          <button type="button" class="stage-mini-btn" id="st-photo-fill-demo" title="一键补全标准 Canon R6 摄影参数">填入示例完整 EXIF</button>
          <button type="button" class="stage-mini-btn st-btn--danger" id="st-photo-remove">移除此张 (${idx + 1}/${total})</button>
        </div>
      </div>

      <div class="st-grid-3">
        <div class="st-field">
          <label>照片标题</label>
          <div><input class="st-input" data-p-basic="title" value="${esc(p.title ?? p.caption)}" placeholder="如：暮色天际线 · 山城日落切片" /></div>
        </div>
        <div class="st-field">
          <label>归档分组</label>
          <div>
            <select class="st-select" data-p-basic="group">
              <option value="latest"${(p.group ?? 'latest') === 'latest' ? ' selected' : ''}>latest · 最新一组（山城光影）</option>
              <option value="earlier"${p.group === 'earlier' ? ' selected' : ''}>earlier · 早期与数字造物</option>
            </select>
          </div>
        </div>
        <div class="st-field">
          <label>坐标编号</label>
          <div><input class="st-input" data-p-basic="coord" value="${esc(p.coord ?? `FRAME #${String(idx + 1).padStart(2, '0')} // GROUP 01`)}" placeholder="FRAME #01 // GROUP 01 · LATEST" /></div>
        </div>
      </div>

      <div class="st-grid-2" style="margin-top:0.65rem;">
        <div class="st-field">
          <label>影像叙事</label>
          <div>
            <textarea class="st-textarea" data-p-basic="story" rows="2" placeholder="对应照片检视台右侧的叙事段落 (#insp-story)">${esc(p.story ?? p.caption)}</textarea>
          </div>
        </div>
        <div class="st-field">
          <label>灯箱简注</label>
          <div>
            <textarea class="st-textarea" data-p-basic="caption" rows="2" placeholder="对应全屏灯箱底部与瀑布流卡片简注">${esc(p.caption)}</textarea>
            <div class="st-hint">关联文件：<code>${esc(p.file)}</code></div>
          </div>
        </div>
      </div>

      <div class="st-sub-kicker" style="margin-top:0.85rem;">
        <span>EXIF TELEMETRY MATRIX // 9 项核心摄影遥测参数（自动读取 + 手动覆写 + 缺省乱码模糊兜底）</span>
      </div>

      <div class="st-exif-editor-grid">
        ${EXIF_FIELD_META.map((m) => {
          const val = String(p[m.key] ?? '').trim();
          const isAuto = autoSet.has(m.key);
          const statusBadge = !val
            ? `<span class="st-field-state st-field-state--cipher" title="未读取且未手动填写：用户侧将渲染为模糊化乱码">乱码模糊兜底</span>`
            : isAuto
            ? `<span class="st-field-state st-field-state--auto">EXIF 自动读取</span>`
            : `<span class="st-field-state st-field-state--manual">已手动覆写</span>`;

          return `
            <div class="st-exif-edit-cell${!val ? ' is-cipher-active' : ''}">
              <div class="st-exif-edit-head">
                <span class="st-exif-code">${esc(m.code)}</span>
                ${statusBadge}
              </div>
              <div style="display:flex;gap:0.35rem;">
                <input class="st-input" data-p-exif="${m.key}" value="${esc(p[m.key] ?? '')}" placeholder="${esc(m.placeholder)}" />
                <button type="button" class="stage-mini-btn" data-clear-exif="${m.key}" title="清空此项以在用户侧显示模糊化乱码">置空</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function wireSinglePhotoEditor(edit: HTMLElement, w: WallEntry, p: WallPhoto, idx: number): void {
  edit.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-p-basic]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.pBasic as 'title' | 'group' | 'coord' | 'story' | 'caption';
      p[k] = inp.value;
      if (k === 'title' && !p.caption) p.caption = inp.value;
      markDirty();
      renderWallPreview();
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-p-exif]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.pExif as ExifFieldKey;
      p[k] = inp.value;
      if (p.autoFields) {
        p.autoFields = p.autoFields.filter((x) => x !== k);
      }
      const cell = inp.closest('.st-exif-edit-cell');
      const badge = cell?.querySelector('.st-field-state');
      const hasVal = inp.value.trim().length > 0;
      cell?.classList.toggle('is-cipher-active', !hasVal);
      if (badge) {
        badge.className = `st-field-state ${hasVal ? 'st-field-state--manual' : 'st-field-state--cipher'}`;
        badge.textContent = hasVal ? '已手动覆写' : '乱码模糊兜底';
      }
      markDirty();
      renderWallPreview();
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-clear-exif]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const k = btn.dataset.clearExif as ExifFieldKey;
      p[k] = '';
      markDirty();
      renderWallView();
    })
  );

  $('#st-photo-clear-some')?.addEventListener('click', () => {
    p.camera = '';
    p.lens = '';
    p.exposure = '';
    p.gps = '';
    p.location = '';
    markDirty();
    renderWallView();
    toast('已置空机身、镜头、曝光、地点与经纬 —— 右栏用户侧预览已实时切换为模糊乱码艺术效果');
  });

  $('#st-photo-fill-demo')?.addEventListener('click', () => {
    p.camera = p.camera || 'Canon EOS R6';
    p.lens = p.lens || 'RF 35mm F1.8 · 定焦';
    p.exposure = p.exposure || 'f/4.0 · 1/250s · ISO 160';
    p.location = p.location || (w.place || '重庆 · 南滨路江畔');
    p.gps = p.gps || '29°33\'18"N · 106°34\'42"E';
    p.color = p.color || 'WARM AMBER // 暖调直出';
    p.date = p.date || chineseFullDate(new Date());
    p.ev = p.ev || 'EV -0.3 · HIGH DYNAMIC';
    p.aspect = p.aspect || '16:9 横幅 (2560×1440)';
    markDirty();
    renderWallView();
    toast('已补全全部摄影参数');
  });

  $('#st-photo-remove')?.addEventListener('click', () => {
    w.photos.splice(idx, 1);
    state.draft.selectedPhotoIdx = Math.max(0, idx - 1);
    markDirty();
    renderWallView();
    toast('已从当前照片墙移除该照片');
  });
}

function renderPickExisting(w: WallEntry): void {
  const box = $('#st-pick-box');
  if (!box) return;
  const used = new Set(w.photos.map((p) => p.file));
  const free = state.photoFiles.filter((f) => !used.has(f));
  box.innerHTML = `<div class="st-pick">${
    free.length
      ? free.map((f) => `<button type="button" data-f="${esc(f)}">＋ ${esc(f)}</button>`).join('')
      : '<p class="st-empty">媒体库里的所有照片均已加入当前照片墙。</p>'
  }</div>`;
  box.querySelectorAll<HTMLButtonElement>('button[data-f]').forEach((b) =>
    b.addEventListener('click', () => {
      const fname = b.dataset.f ?? '';
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fname);
      const autoDate = m ? chineseFullDate(new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`)) : '';
      w.photos.push({
        file: fname,
        caption: '',
        title: fname.replace(/\.[^.]+$/, ''),
        date: autoDate,
        aspect: '16:9 横幅',
        ar: 1.7778,
        ratioPill: '16:9 HORIZONTAL',
        autoFields: autoDate ? ['date', 'aspect'] : ['aspect'],
      });
      state.draft.selectedPhotoIdx = w.photos.length - 1;
      markDirty();
      renderWallView();
    })
  );
}

/**
 * 右栏实时预览：1:1 还原 `/photos/` 用户侧的「光学检视台 + 8 格 EXIF 遥测矩阵 + 16 段直方图」
 * 任何未读取且未手动填写的字段均在此处渲染为模糊化的艺术乱码！
 */
function renderWallPreview(): void {
  const box = $('#st-preview');
  const w = state.draft.wall;
  if (!box || !w) return;

  const selIdx = Math.max(0, Math.min(w.photos.length - 1, state.draft.selectedPhotoIdx ?? 0));
  const p = w.photos[selIdx];

  if (!p) {
    box.innerHTML = `<div class="st-col-inner"><p class="st-empty">添加照片后，此处将实时渲染用户侧 /photos/ 光学检视台与乱码艺术效果。</p></div>`;
    return;
  }

  const hist = Array.isArray(p.hist) && p.hist.length === 16
    ? p.hist
    : [28, 42, 64, 82, 90, 74, 58, 46, 62, 78, 88, 70, 52, 36, 24, 16];
  const seed = p.file || `frame-${selIdx}`;

  box.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-head">
        <span>USER-SIDE OPTICAL INSPECTOR // 用户侧展示实时预览</span>
      </div>
      <div class="st-hint" style="margin-bottom:0.65rem;">
        下方 1:1 还原用户访问 <code>/photos/</code> 时的右侧检视面板：读取不到且未手动填写的项自动以<strong>模糊化乱码</strong>进行艺术化呈现（鼠标悬停乱码可微距检视）。
      </div>

      <div class="rail-blueprint-card st-user-photo-preview">
        <div class="rail-card-kicker">
          <span>PHOTO SPECIFICATION // 影像档案与拍摄信息</span>
          <span>${esc(p.group === 'earlier' ? 'ARCHIVE GROUP' : 'LATEST GROUP')}</span>
        </div>

        <div class="st-user-photo-stage">
          <img src="${esc(resolvePhotoPreviewUrl(p.file))}" data-photo-preview="${esc(p.file)}" alt="${esc(p.title || p.caption || p.file)}" />
          <span class="cover-ratio-pill">${esc(p.ratioPill || '16:9 HORIZONTAL')}</span>
        </div>

        <div class="st-user-photo-coord">${esc(p.coord || `FRAME #${String(selIdx + 1).padStart(2, '0')} // ${w.title}`)}</div>
        <h3 class="st-user-photo-title">${esc(p.title || p.caption || '（未命名影像）')}</h3>
        <p class="st-user-photo-story">${esc(p.story || p.caption || w.note || '暂无文字叙事。')}</p>

        <div class="photo-exif-spec-grid st-preview-exif-grid">
          <div class="exif-cell">
            <span>DATE // 拍摄日期</span>
            ${renderExifValueOrCipherHtml('date', p.date, seed)}
          </div>
          <div class="exif-cell">
            <span>LOCATION // 拍摄地点</span>
            ${renderExifValueOrCipherHtml('location', p.location, seed)}
          </div>
          <div class="exif-cell">
            <span>ASPECT // 原生画幅</span>
            ${renderExifValueOrCipherHtml('aspect', p.aspect, seed)}
          </div>
          <div class="exif-cell">
            <span>CAMERA // 器材机身</span>
            ${renderExifValueOrCipherHtml('camera', p.camera, seed)}
          </div>
          <div class="exif-cell">
            <span>LENS // 镜头焦段</span>
            ${renderExifValueOrCipherHtml('lens', p.lens, seed)}
          </div>
          <div class="exif-cell">
            <span>EXPOSURE // 曝光参数</span>
            ${renderExifValueOrCipherHtml('exposure', p.exposure, seed)}
          </div>
          <div class="exif-cell">
            <span>COLOR // 色彩科学</span>
            ${renderExifValueOrCipherHtml('color', p.color, seed)}
          </div>
          <div class="exif-cell">
            <span>COORDINATES // 经纬</span>
            ${renderExifValueOrCipherHtml('gps', p.gps, seed)}
          </div>
        </div>

        <div class="photo-histogram-box" style="margin-top:0.55rem;">
          <div class="histogram-head">
            <span>LUMINANCE &amp; SPECTRUM // 影调直方分布</span>
            <span class="telemetry-accent">${renderExifValueOrCipherHtml('ev', p.ev, seed)}</span>
          </div>
          <div class="histogram-bars" aria-hidden="true">
            ${hist.map((h) => `<span style="height:${Math.max(8, Math.min(100, h))}%"></span>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  hydratePhotoPreviews(box);
}

async function uploadImages(w: WallEntry, files: File[]): Promise<void> {
  setBusy(true, `解析 EXIF 光学参数并处理 ${files.length} 张照片…`);
  try {
    for (const file of files) {
      // 关键步骤：在 canvas 压缩剥离 EXIF 之前，先从原文件二进制流读取 EXIF 与直方图！
      const telemetry = await extractPhotoTelemetryFromFile(file, w.date);
      const prepared = await prepareImage(file);

      let savedName = `${w.date ? `${w.date}-` : ''}${prepared.filename}`;
      if (!state.demoMode && state.gh) {
        savedName = await uploadPhoto(state.gh, prepared, w.date, [...state.photoFiles, ...w.photos.map((p) => p.file)]);
      }
      // 无论真实上传还是演示模式，都先用压缩后的字节生成本地预览：
      // 上传完立刻能看到图，不必再等一次 GitHub API。
      const blobUrl = URL.createObjectURL(
        new Blob([new Uint8Array(prepared.bytes).buffer as ArrayBuffer], { type: 'image/jpeg' })
      );
      DEMO_IMG_MAP[savedName] = blobUrl;
      previewCache.set(savedName, blobUrl);

      state.photoFiles.push(savedName);
      const autoCount = telemetry.autoFields?.length ?? 0;
      w.photos.push({
        file: savedName,
        caption: '',
        title: file.name.replace(/\.[^.]+$/, ''),
        story: '',
        group: 'latest',
        coord: `FRAME #${String(w.photos.length + 1).padStart(2, '0')} // GROUP 01 · LATEST`,
        date: telemetry.date ?? '',
        location: telemetry.location ?? w.place ?? '',
        aspect: telemetry.aspect ?? `${prepared.width}×${prepared.height}`,
        ar: telemetry.ar ?? Number((prepared.width / prepared.height).toFixed(4)),
        ratioPill: telemetry.ratioPill ?? '16:9 HORIZONTAL',
        camera: telemetry.camera ?? '',
        lens: telemetry.lens ?? '',
        exposure: telemetry.exposure ?? '',
        color: telemetry.color ?? '',
        gps: telemetry.gps ?? '',
        ev: telemetry.ev ?? '',
        hist: telemetry.hist,
        autoFields: telemetry.autoFields ?? [],
      });
      state.draft.selectedPhotoIdx = w.photos.length - 1;
      markDirty();
      toast(
        `${savedName} 已导入：自动读取了 ${autoCount} 项摄影参数，其余未读项已默认启用用户侧模糊乱码兜底`
      );
    }
    renderWallView();
  } catch (e) {
    reportError(e);
  } finally {
    setBusy(false);
  }
}

export function createNewWall(): void {
  if (!settleBeforeLeaving()) return;

  const id = draftId((x) => state.walls.some((w) => w.id === x));
  const wall = newWallEntry(id, isoDate(new Date()));
  state.walls.unshift(wall);
  stageAdd(wall);
  state.selected = id;
  state.draft = {};
  markDirty();

  state.justAdded = id;
  rerender();
  state.justAdded = null;

  toast('已新建照片墙草稿 —— 可直接拖入照片自动读取 EXIF 信息');
}

function removeWall(wall: WallEntry): void {
  if (isStagedNew(wall)) {
    state.walls = state.walls.filter((w) => w.path !== wall.path);
    stageRemove(wall);
    state.selected = state.walls[0]?.id ?? null;
    state.draft = {};
    rerender();
    toast('已移除新建的照片墙草稿');
    return;
  }

  stageRemove(wall);
  state.selected = state.walls.find((w) => w.path !== wall.path)?.id ?? null;
  state.draft = {};
  markDirty();
  rerender();
  toast('已暂存删除照片墙 —— 点右上角「保存」正式提交');
}

export function wallDraftEdited(): boolean {
  const w = state.draft.wall;
  if (!w) return false;
  const entry = state.walls.find((x) => x.path === w.path);
  if (!entry) return false;
  return JSON.stringify(wallToJson(w)) !== JSON.stringify(wallToJson(entry));
}

export function foldStagedWallDraft(): void {
  const w = state.draft.wall;
  if (!w) return;
  if (state.demoMode || isStagedNew(w)) {
    const entry = state.walls.find((x) => x.path === w.path);
    if (!entry) return;
    entry.title = w.title;
    entry.date = w.date;
    entry.place = w.place;
    entry.note = w.note;
    entry.photos = JSON.parse(JSON.stringify(w.photos));
  }
}

export async function saveWallCurrent(gh: Github): Promise<boolean> {
  const w = state.draft.wall;
  if (!w) return true;
  await saveWall(gh, w);
  return true;
}
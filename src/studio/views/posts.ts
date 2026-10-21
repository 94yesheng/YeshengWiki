/**
 * 文章视图 —— HUD 蓝图双象限元数据表单（克制细线网格划分） + 双模态正文编辑器 + 高自定义信息悬浮窗 + 1:1 实景预览
 */
import {
  buildPostText,
  diffFields,
  DIRS,
  draftId,
  newPostEntry,
  POST_FIELDS,
  prepareImage,
  savePost,
  uploadAudioAsset,
  uploadPostAsset,
  type PostEntry,
} from '../content';
import { parsePost } from '../frontmatter';
import { createEditor } from '../editor';
import { normalizeHtml, renderMarkdown } from '../md';
import { openPreview } from '../preview';
import { chineseFullDate, isoDate, readingTime } from '../../utils/date';
import {
  normalizeMediaAssetUrl,
  normalizePostRailConfig,
  renderArticleRailSlots,
  type PostRailConfig,
  type RailKvItem,
  type RailWidgetCard,
  type RailWidgetType,
} from '../../utils/article-rail';
import { THEME_COVER_SVG_HTML } from '../../utils/cover-svg';
import {
  extractAudioMetadataFromFile,
  extractAudioMetadataFromUrl,
  isDefaultAudioArtist,
  isDefaultAudioTitle,
  parseAudioMetadataFromFilename,
} from '../../utils/audio-meta';
import type { ArticleRailConfig, SiteConfig } from '../../site.config';
import { $, $$, esc, reportError, setBusy, showConfirm, toast } from '../ui';
import { isV2Layout } from '../layout';
import { applyV2PostLayout } from '../v2-layout';
import {
  isStagedNew,
  markDirty,
  rerender,
  settleBeforeLeaving,
  stageAdd,
  stageRemove,
  state,
  type Draft,
} from '../state';
import type { Github } from '../github';

type PostDraftUi = NonNullable<Draft['post']> & {
  /** 「信息悬浮窗」小节是否展开 */
  railOpen?: boolean;
};

interface StudioMediaItem {
  path: string;
  filename: string;
  mime: string | null;
  postTitle?: string | null;
}

function previewCoverSrc(src: string): string {
  const s = src.trim();
  if (!s) return '';
  return s
    .replace(/^\.\.\/\.\.\/assets\/posts\//, '/uploads/posts/')
    .replace(/^\.\.\/\.\.\/assets\/photos\//, '/uploads/photos/')
    .replace(/^\/src\/assets\/posts\//, '/uploads/posts/')
    .replace(/^\/src\/assets\/photos\//, '/uploads/photos/');
}

function autoUpdatedDefault(): boolean {
  const data = state.site?.data as Record<string, unknown> | undefined;
  const studio = data?.studio as Record<string, unknown> | undefined;
  return studio?.autoUpdated !== false;
}

function postAutoUpdated(fields: Record<string, unknown>): boolean {
  const v = fields.autoUpdated;
  return typeof v === 'boolean' ? v : autoUpdatedDefault();
}

function currentPost(): PostEntry | null {
  return state.posts.find((p) => p.id === state.selected) ?? null;
}

function extractAutoLeadFromMarkdown(mdText: string): string {
  const blocks = mdText.split(/\n\s*\n/);
  const parts: string[] = [];
  for (const b of blocks) {
    const raw = b.trim();
    if (!raw || /^</.test(raw) || /^\*(\s+\*)+$/.test(raw) || /^(#{1,6}\s|>|\||```)/.test(raw)) continue;
    const clean = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean.length < 10) continue;
    parts.push(clean);
    if (parts.join(' ').length >= 55 || parts.length >= 2) break;
  }
  return parts.join(' ');
}

function createDefaultWidget(type: RailWidgetType): RailWidgetCard {
  const id = `card-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 5)}`;
  if (type === 'music') {
    return {
      id,
      enabled: true,
      type: 'music',
      kicker: 'AUDIO PLAYER // 伴读音乐盒',
      badge: 'AUDIO',
      audioUrl: '',
      audioTitle: '伴读音乐 · 未命名曲目',
      audioArtist: '夜笙 · ACOUSTIC BGM',
      loop: true,
      autoplay: false,
    };
  }
  if (type === 'kv') {
    return {
      id,
      enabled: true,
      type: 'kv',
      kicker: 'SPEC // 核心参数',
      badge: 'SPEC',
      items: [
        { label: '环境 / 工具', value: 'v1.0' },
        { label: '状态', value: '已验证' },
      ],
    };
  }
  if (type === 'links') {
    return {
      id,
      enabled: true,
      type: 'links',
      kicker: 'LINKS // 相关资源与参考',
      badge: 'REF',
      links: [{ label: '参考文档 / 项目地址', url: 'https://', note: '官方文档' }],
    };
  }
  if (type === 'list') {
    return {
      id,
      enabled: true,
      type: 'list',
      kicker: 'KEYPOINTS // 核心要点',
      badge: 'SUMMARY',
      bullets: ['要点一：在此输入核心步骤或结论', '要点二：补充注意事项'],
    };
  }
  return {
    id,
    enabled: true,
    type: 'note',
    kicker: 'READER NOTE // 伴读便签',
    badge: 'NOTE',
    content: '在此输入本文的背景补充、修订说明或伴读提示。',
  };
}

function postDraft(): PostDraftUi | undefined {
  const entry = currentPost();
  if (!entry) return undefined;
  if (!state.draft.post || state.draft.post.entry.id !== entry.id) {
    const d = entry.parsed.data;
    const rawSpecs = Array.isArray(d.railSpecs) ? (d.railSpecs as RailKvItem[]) : [];
    const normalizedCfg = normalizePostRailConfig(d.railTopology);
    const rawMode = String(d.railMode ?? '');
    const initialMode =
      rawMode === 'custom' || rawMode === 'minimal' || rawMode === 'follow'
        ? rawMode
        : rawSpecs.length || (normalizedCfg.cards && normalizedCfg.cards.length)
          ? 'custom'
          : 'follow';

    const fields: Record<string, unknown> = {
      title: d.title ?? '',
      pubDate: String(d.pubDate ?? ''),
      description: d.description ?? '',
      lead: d.lead ?? '',
      tags: [...(Array.isArray(d.tags) ? (d.tags as string[]) : [])],
      entryBadge: d.entryBadge ?? '',
      cover: d.cover ? String(d.cover) : '',
      coverCaption: d.coverCaption ?? '',
      featured: d.featured === true,
      kineticCaption: d.kineticCaption ?? '',
      railMode: initialMode,
      railSpecs: rawSpecs.map((r) => ({ label: String(r.label ?? ''), value: String(r.value ?? '') })),
      railTopology: JSON.parse(JSON.stringify(normalizedCfg)) as PostRailConfig,
      updatedDate: d.updatedDate ? String(d.updatedDate) : '',
      draft: d.draft === true,
      autoUpdated: typeof d.autoUpdated === 'boolean' ? d.autoUpdated : undefined,
    };
    state.draft.post = {
      entry,
      fields,
      baseline: JSON.parse(JSON.stringify(fields)) as Record<string, unknown>,
      body: entry.parsed.body,
      dateTouched: false,
      rightTab: 'format',
    };
  }
  return state.draft.post;
}

function renderRailCustomCardsEditor(cards: RailWidgetCard[]): string {
  if (!cards.length) {
    return `<div class="st-rail-empty-box">
      <p>当前尚未添加本文专属悬浮卡片。点击下方按钮可自由组合「参数速查表」「伴读便签」「参考链接」或「核心要点清单」。</p>
    </div>`;
  }

  return cards
    .map((card, cIdx) => {
      const type = card.type || 'note';
      const items = card.items ?? [];
      const links = card.links ?? [];
      const bulletsText = (card.bullets ?? []).join('\n');

      let bodyEditorHtml = '';
      if (type === 'music') {
        const previewAudioSrc = normalizeMediaAssetUrl(card.audioUrl ?? '');
        bodyEditorHtml = `
          <div class="st-grid-2" style="margin-top:0.55rem;">
            <div class="st-field">
              <label>曲目名称</label>
              <div><input class="st-input" data-rc-audio-title="${cIdx}" value="${esc(card.audioTitle ?? '')}" placeholder="如：Cornfield Chase" /></div>
            </div>
            <div class="st-field">
              <label>艺术家 / 副标</label>
              <div><input class="st-input" data-rc-audio-artist="${cIdx}" value="${esc(card.audioArtist ?? '')}" placeholder="如：Hans Zimmer · 伴读声轨" /></div>
            </div>
          </div>
          <div class="st-field" style="margin-top:0.55rem;">
            <label>音频文件源</label>
            <div style="display:flex;flex-direction:column;gap:0.45rem;">
              <div style="display:flex;gap:0.45rem;align-items:center;flex-wrap:wrap;">
                <input class="st-input" style="flex:1;min-width:14rem;" data-rc-audio-url="${cIdx}" value="${esc(card.audioUrl ?? '')}" placeholder="/uploads/audio/... 或点击右侧从媒体库选择/上传" />
                <button type="button" class="stage-mini-btn st-btn--preview" data-rc-pick-audio="${cIdx}">选择 / 上传音频</button>
              </div>
              ${
                previewAudioSrc
                  ? `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.38rem 0.6rem;border:1px solid var(--rule);border-radius:3px;background:color-mix(in srgb, var(--accent) 5%, var(--paper));">
                      <span style="font-family:var(--mono);font-size:0.7rem;color:var(--accent);">AUDIO READY</span>
                      <audio controls preload="metadata" src="${esc(previewAudioSrc)}" style="height:28px;flex:1;"></audio>
                    </div>`
                  : `<div class="st-hint">尚未绑定音频文件，点击「选择 / 上传音频」可从媒体库「音频」分类选择或从本地上传。</div>`
              }
              <div class="st-check-row" style="margin-top:0.15rem;">
                <label class="st-check"><input type="checkbox" data-rc-audio-loop="${cIdx}" ${card.loop !== false ? 'checked' : ''} /><span>单曲循环播放 (LOOP)</span></label>
                <label class="st-check"><input type="checkbox" data-rc-audio-autoplay="${cIdx}" ${card.autoplay === true ? 'checked' : ''} /><span>进入文章尝试自动播放</span></label>
              </div>
            </div>
          </div>`;
      } else if (type === 'kv') {
        bodyEditorHtml = `
          <div class="st-kv-editor-list" style="margin-top:0.55rem;">
            ${items
              .map(
                (it, rIdx) => `
              <div class="st-kv-row">
                <input class="st-input" data-rc-kv-k="${cIdx}.${rIdx}" value="${esc(it.label)}" placeholder="字段名（如：适用版本）" />
                <input class="st-input" data-rc-kv-v="${cIdx}.${rIdx}" value="${esc(it.value)}" placeholder="字段值（如：Node 22+）" />
                <button type="button" class="stage-mini-btn st-btn--danger" data-rc-kv-del="${cIdx}.${rIdx}">删除</button>
              </div>`
              )
              .join('')}
          </div>
          <button type="button" class="stage-mini-btn" data-rc-kv-add="${cIdx}" style="margin-top:0.45rem;">＋ 添加一行键值</button>`;
      } else if (type === 'links') {
        bodyEditorHtml = `
          <div class="st-kv-editor-list" style="margin-top:0.55rem;">
            ${links
              .map(
                (lk, lIdx) => `
              <div class="st-kv-row st-kv-row--3">
                <input class="st-input" data-rc-lk-label="${cIdx}.${lIdx}" value="${esc(lk.label)}" placeholder="链接标题（如：源码仓库）" />
                <input class="st-input" data-rc-lk-note="${cIdx}.${lIdx}" value="${esc(lk.note ?? '')}" placeholder="副标说明（如：GitHub）" />
                <input class="st-input" data-rc-lk-url="${cIdx}.${lIdx}" value="${esc(lk.url)}" placeholder="https://... 或 /posts/..." />
                <button type="button" class="stage-mini-btn st-btn--danger" data-rc-lk-del="${cIdx}.${lIdx}">删除</button>
              </div>`
              )
              .join('')}
          </div>
          <button type="button" class="stage-mini-btn" data-rc-lk-add="${cIdx}" style="margin-top:0.45rem;">＋ 添加一条链接</button>`;
      } else if (type === 'list') {
        bodyEditorHtml = `
          <div class="st-field" style="margin-top:0.55rem;">
            <label>要点列表</label>
            <div>
              <textarea class="st-textarea" rows="3" data-rc-bullets="${cIdx}" placeholder="每行一条核心要点，前台自动生成 01 / 02 编号列表">${esc(
                bulletsText
              )}</textarea>
              <div class="st-hint">一行一条要点，前台自动带序号展示</div>
            </div>
          </div>`;
      } else {
        bodyEditorHtml = `
          <div class="st-field" style="margin-top:0.55rem;">
            <label>便签内容</label>
            <div>
              <textarea class="st-textarea" rows="3" data-rc-content="${cIdx}" placeholder="输入伴读提示、背景导读或补充说明（支持多行分段）">${esc(
                card.content ?? ''
              )}</textarea>
            </div>
          </div>`;
      }

      return `
        <div class="st-rail-widget-card" data-rc-idx="${cIdx}">
          <div class="st-rail-widget-head">
            <label class="st-check">
              <input type="checkbox" data-rc-enabled="${cIdx}" ${card.enabled !== false ? 'checked' : ''} />
              <strong>卡片 #${String(cIdx + 1).padStart(2, '0')}</strong>
            </label>
            <select class="st-select st-rail-type-select" data-rc-type="${cIdx}" aria-label="卡片类型">
              <option value="music"${type === 'music' ? ' selected' : ''}>音乐播放卡 (Music)</option>
              <option value="kv"${type === 'kv' ? ' selected' : ''}>键值参数表 (KV)</option>
              <option value="note"${type === 'note' ? ' selected' : ''}>伴读便签卡 (Note)</option>
              <option value="links"${type === 'links' ? ' selected' : ''}>参考链接卡 (Links)</option>
              <option value="list"${type === 'list' ? ' selected' : ''}>核心要点卡 (List)</option>
            </select>
            <div class="st-rail-widget-actions">
              <button type="button" class="stage-mini-btn" data-rc-move="${cIdx}:-1" ${cIdx === 0 ? 'disabled' : ''} title="上移卡片">↑</button>
              <button type="button" class="stage-mini-btn" data-rc-move="${cIdx}:1" ${cIdx === cards.length - 1 ? 'disabled' : ''} title="下移卡片">↓</button>
              <button type="button" class="stage-mini-btn st-btn--danger" data-rc-del="${cIdx}">删除</button>
            </div>
          </div>
          <div class="st-grid-2">
            <div class="st-field">
              <label>卡片顶栏标</label>
              <div><input class="st-input" data-rc-field="${cIdx}.kicker" value="${esc(card.kicker)}" placeholder="如：SPEC // 环境参数" /></div>
            </div>
            <div class="st-field">
              <label>右侧副徽标</label>
              <div><input class="st-input" data-rc-field="${cIdx}.badge" value="${esc(card.badge)}" placeholder="如：INFO / REF" /></div>
            </div>
          </div>
          ${bodyEditorHtml}
        </div>`;
    })
    .join('');
}

let activeCoverModal: HTMLElement | null = null;
let coverModalSeq = 0;

function closeCoverModal(): void {
  coverModalSeq += 1;
  if (activeCoverModal) {
    activeCoverModal.remove();
    activeCoverModal = null;
  }
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|svg|heic|heif)$/i.test(file.name);
}

function isImageMedia(item: StudioMediaItem): boolean {
  return (item.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(item.path);
}

function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i.test(file.name);
}

function isAudioMedia(item: StudioMediaItem): boolean {
  return (item.mime ?? '').startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i.test(item.path);
}

let activeAudioModal: HTMLElement | null = null;
let audioModalSeq = 0;

function closeAudioModal(): void {
  audioModalSeq += 1;
  if (activeAudioModal) {
    activeAudioModal.remove();
    activeAudioModal = null;
  }
}

/**
 * 打开音乐播放模块的音频选择/本地上传悬浮模态框（支持从媒体库「音频」分类选择或本地上传）
 */
function openAudioPickerModal(
  d: PostDraftUi,
  cardIdx: number,
  onUpdated: (updatedCfg: PostRailConfig) => void,
  liveCards?: RailWidgetCard[]
): void {
  closeAudioModal();
  audioModalSeq += 1;
  const seq = audioModalSeq;
  const railCfg = normalizePostRailConfig(d.fields.railTopology);
  const cards = liveCards ?? railCfg.cards ?? [];
  railCfg.cards = cards;
  const card = cards[cardIdx];
  if (!card) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'ed-img-modal-backdrop';
  backdrop.id = 'st-audio-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', '选择或上传伴读音频');

  backdrop.innerHTML = `
    <div class="ed-img-modal">
      <div class="ed-img-modal-head">
        <div class="ed-img-modal-title-group">
          <span class="ed-img-modal-kicker">RAIL MUSIC MODULE // 文章右侧悬浮窗 · 伴读音乐配置</span>
          <h3 class="ed-img-modal-title">从媒体库「音频」分类选择或从本地上传音频</h3>
        </div>
        <button type="button" class="stage-mini-btn ed-img-modal-close" id="st-audio-modal-close" aria-label="关闭弹窗">关闭 ×</button>
      </div>

      <div class="ed-img-modal-body">
        <section class="ed-img-section">
          <div class="ed-img-section-head">
            <span>01 // 从媒体库「音频」分类中选择（点击曲目卡片或「选用此音频」立即自动导入并读取作者与标题）</span>
            <span class="ed-img-section-count" id="st-audio-media-count">读取中…</span>
          </div>
          <div class="ed-media-grid" id="st-audio-media-grid" style="grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));">
            <p class="ed-media-empty">正在读取媒体库中的音频文件…</p>
          </div>
        </section>

        <section class="ed-img-section">
          <div class="ed-img-section-head">
            <span>02 // 从本地上传音频文件（自动读取音频作者与标题并归档至媒体库「音频」分类）</span>
          </div>
          <div class="ed-dropzone" id="st-audio-dropzone" role="button" tabindex="0" aria-label="上传本地音频文件">
            <div class="ed-dropzone-content">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
              <span>把本地音频文件（MP3 / WAV / OGG / M4A / FLAC）拖到这里，或点击选择上传</span>
            </div>
            <input type="file" id="st-audio-modal-upload" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus" hidden />
          </div>
        </section>

        <section class="ed-img-section">
          <div class="ed-img-section-head">
            <span>03 // 手动核对曲目信息与音频地址</span>
          </div>
          <div class="ed-drawer-grid ed-drawer-grid--image" style="grid-template-columns:1fr 1fr;">
            <input class="st-input" id="st-audio-modal-src" style="grid-column:1 / -1;" value="${esc(card.audioUrl ?? '')}" placeholder="/uploads/audio/... 或 https://... 外部音频直链" />
            <input class="st-input" id="st-audio-modal-title" value="${esc(card.audioTitle ?? '')}" placeholder="曲目名称（自动读取，失败则保留默认）" />
            <input class="st-input" id="st-audio-modal-artist" value="${esc(card.audioArtist ?? '')}" placeholder="音频作者 / 艺术家（自动读取，失败则保留默认）" />
            <div style="grid-column:1 / -1;display:flex;gap:0.45rem;justify-content:flex-end;">
              <button type="button" class="st-btn st-btn--primary" id="st-audio-modal-confirm">确认设置</button>
              <button type="button" class="stage-mini-btn st-btn--danger" id="st-audio-modal-clear">清空音频</button>
            </div>
          </div>
        </section>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  activeAudioModal = backdrop;

  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onEsc);
      closeAudioModal();
    }
  };
  window.addEventListener('keydown', onEsc);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      window.removeEventListener('keydown', onEsc);
      closeAudioModal();
    }
  });

  backdrop.querySelector('#st-audio-modal-close')?.addEventListener('click', () => {
    window.removeEventListener('keydown', onEsc);
    closeAudioModal();
  });

  const applyAudio = (nextUrl: string, nextTitle?: string, nextArtist?: string) => {
    card.audioUrl = nextUrl.trim();
    if (nextTitle !== undefined && nextTitle.trim()) {
      card.audioTitle = nextTitle.trim();
    } else if (!card.audioTitle || !card.audioTitle.trim()) {
      card.audioTitle = '伴读音乐 · 未命名曲目';
    }
    if (nextArtist !== undefined && nextArtist.trim()) {
      card.audioArtist = nextArtist.trim();
    } else if (!card.audioArtist || !card.audioArtist.trim()) {
      card.audioArtist = '夜笙 · ACOUSTIC BGM';
    }
    railCfg.cards = cards;
    d.fields.railTopology = railCfg;
    markDirty();
    window.removeEventListener('keydown', onEsc);
    closeAudioModal();
    onUpdated(railCfg);
  };

  const grid = backdrop.querySelector<HTMLElement>('#st-audio-media-grid');
  const countLabel = backdrop.querySelector<HTMLElement>('#st-audio-media-count');
  if (grid) {
    void (async () => {
      try {
        const res = await fetch('/api/media', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { media?: StudioMediaItem[] };
        if (seq >= audioModalSeq && activeAudioModal === backdrop) {
          const list = (Array.isArray(data.media) ? data.media : []).filter(isAudioMedia);
          if (countLabel) countLabel.textContent = `共 ${list.length} 首音频`;
          if (!list.length) {
            grid.innerHTML = `<p class="ed-media-empty">媒体库「音频」分类下还没有文件，请使用下方上传区上传本地音频。</p>`;
          } else {
            grid.innerHTML = list
              .map((item) => {
                const cleanName = item.filename.replace(/\.[^.]+$/, '');
                const parsedGuess = parseAudioMetadataFromFilename(item.filename);
                const subHint = parsedGuess.artist
                  ? `${parsedGuess.artist} · ${parsedGuess.title || cleanName}`
                  : item.postTitle || '媒体库 · 音频分类（点击选用）';
                return `
                <div class="ed-media-item" data-pick-audio-card="${esc(item.path)}" data-pick-audio-filename="${esc(item.filename)}" data-pick-audio-name="${esc(cleanName)}" style="display:flex;flex-direction:column;justify-content:space-between;padding:0.65rem;gap:0.45rem;cursor:pointer;">
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="var(--accent)" stroke-width="1.5" aria-hidden="true" style="flex-shrink:0;">
                      <circle cx="16" cy="16" r="13"/>
                      <circle cx="16" cy="16" r="3.5" fill="var(--accent)"/>
                    </svg>
                    <div style="min-width:0;flex:1;">
                      <div class="ed-media-name" style="font-weight:600;" title="${esc(item.filename)}">${esc(item.filename)}</div>
                      <div class="ed-media-owner">${esc(subHint)}</div>
                    </div>
                  </div>
                  <audio controls preload="metadata" src="${esc(item.path)}" style="width:100%;height:26px;"></audio>
                  <button type="button" class="stage-mini-btn st-btn--primary" data-pick-audio-path="${esc(item.path)}" data-pick-audio-filename="${esc(item.filename)}" data-pick-audio-name="${esc(cleanName)}" style="width:100%;justify-content:center;background:var(--accent);color:#fff;border-color:var(--accent);">
                    ✓ 选用此音频（自动导入）
                  </button>
                </div>`;
              })
              .join('');
          }
        }
      } catch (error) {
        if (seq >= audioModalSeq && activeAudioModal === backdrop) {
          if (countLabel) countLabel.textContent = '读取失败';
          grid.innerHTML = `<p class="ed-media-empty ed-media-empty--error">媒体库读取失败（${esc(
            (error as Error).message
          )}），请使用下方上传区或手动填写路径。</p>`;
        }
      }
    })();

    grid.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      // 若点击的是 <audio> 控件本身，则仅试听不触发关闭
      if (target.closest('audio')) return;
      const trigger =
        target.closest<HTMLElement>('[data-pick-audio-path]') ??
        target.closest<HTMLElement>('[data-pick-audio-card]');
      if (!trigger) return;
      const pickedPath =
        trigger.dataset.pickAudioPath ?? trigger.dataset.pickAudioCard ?? '';
      const pickedFilename =
        trigger.dataset.pickAudioFilename ?? trigger.dataset.pickAudioName ?? '';
      if (!pickedPath) return;

      // 先从文件名快速提取兜底，立即导入地址并渲染 UI
      const fallbackMeta = parseAudioMetadataFromFilename(pickedFilename || pickedPath);
      const initialTitle = fallbackMeta.title || card.audioTitle || '伴读音乐 · 未命名曲目';
      const initialArtist = fallbackMeta.artist || card.audioArtist || '夜笙 · ACOUSTIC BGM';
      applyAudio(pickedPath, initialTitle, initialArtist);
      toast(`已自动导入音频：${initialTitle}`);

      // 再异步读取音频文件内置 ID3 / FLAC / Vorbis / M4A 标签，读取成功则更新作者与标题，失败则保留默认
      void extractAudioMetadataFromUrl(pickedPath, pickedFilename).then((meta) => {
        let changed = false;
        if (meta.title && meta.title.trim()) {
          card.audioTitle = meta.title.trim();
          changed = true;
        }
        if (meta.artist && meta.artist.trim()) {
          card.audioArtist = meta.artist.trim();
          changed = true;
        }
        if (changed) {
          railCfg.cards = cards;
          d.fields.railTopology = railCfg;
          markDirty();
          onUpdated(railCfg);
          toast(`已自动读取音频信息：${card.audioArtist} - ${card.audioTitle}`);
        }
      });
    });
  }

  const uploadInput = backdrop.querySelector<HTMLInputElement>('#st-audio-modal-upload');
  const dropzone = backdrop.querySelector<HTMLElement>('#st-audio-dropzone');

  const handleUploadAudio = async (file: File | undefined) => {
    if (!file) return;
    if (!isAudioFile(file)) {
      toast('请选择音频格式文件（MP3 / WAV / OGG / M4A / FLAC）', true);
      return;
    }
    dropzone?.classList.add('is-dragover');
    try {
      // 自动读取本地音频文件的 ID3/Vorbis/MP4 作者与标题标签，若读取失败则保留默认
      const meta = await extractAudioMetadataFromFile(file);
      const nextTitle = meta.title || card.audioTitle || '伴读音乐 · 未命名曲目';
      const nextArtist = meta.artist || card.audioArtist || '夜笙 · ACOUSTIC BGM';

      if (state.gh) {
        setBusy(true, '正在读取音频标签并上传至媒体库…');
        const publicUrl = await uploadAudioAsset(state.gh, file, d.entry.id);
        state.mediaLoaded = false;
        applyAudio(publicUrl, nextTitle, nextArtist);
        toast(`音频已上传并自动导入：${nextArtist} - ${nextTitle}`);
      } else {
        const fallbackUrl = `/uploads/audio/${file.name.replace(/\s+/g, '-')}`;
        applyAudio(fallbackUrl, nextTitle, nextArtist);
        toast(`已自动导入音频：${nextArtist} - ${nextTitle}`);
      }
    } catch (err) {
      dropzone?.classList.remove('is-dragover');
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  dropzone?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input')) return;
    uploadInput?.click();
  });
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    uploadInput?.click();
  });
  uploadInput?.addEventListener('change', () => {
    const file = uploadInput.files?.[0];
    uploadInput.value = '';
    void handleUploadAudio(file);
  });
  dropzone?.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && dropzone.contains(e.relatedTarget as Node)) return;
    dropzone.classList.remove('is-dragover');
  });
  dropzone?.addEventListener('drop', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    void handleUploadAudio(e.dataTransfer.files?.[0]);
  });

  backdrop.querySelector('#st-audio-modal-confirm')?.addEventListener('click', () => {
    const src = backdrop.querySelector<HTMLInputElement>('#st-audio-modal-src')?.value ?? '';
    const title = backdrop.querySelector<HTMLInputElement>('#st-audio-modal-title')?.value ?? '';
    const artist = backdrop.querySelector<HTMLInputElement>('#st-audio-modal-artist')?.value ?? '';
    applyAudio(src, title, artist);
    toast(src.trim() ? '已更新音乐播放模块配置' : '已清空音频路径');
  });

  backdrop.querySelector('#st-audio-modal-clear')?.addEventListener('click', () => {
    applyAudio('');
    toast('已清除当前音乐播放模块的音频源');
  });
}

function syncCoverUi(d: PostDraftUi): void {
  const rawCover = String(d.fields.cover ?? '').trim();
  const previewUrl = rawCover ? previewCoverSrc(rawCover) : '';
  const input = $<HTMLInputElement>('#st-f-cover');
  if (input && input.value !== rawCover) input.value = rawCover;

  const img = $<HTMLImageElement>('#st-cover-preview-img');
  const svgHost = $('#st-cover-svg-fallback');
  const pill = $('#st-cover-mode-pill');
  const clearBtn = $<HTMLButtonElement>('#st-clear-cover-btn');

  if (previewUrl) {
    if (img) {
      img.hidden = false;
      img.style.opacity = '1';
      img.src = previewUrl;
    }
    if (svgHost) svgHost.hidden = true;
    if (pill) pill.textContent = '16:9 COVER';
    if (clearBtn) clearBtn.disabled = false;
  } else {
    if (img) {
      img.hidden = true;
      img.removeAttribute('src');
    }
    if (svgHost) svgHost.hidden = false;
    if (pill) pill.textContent = 'AUTO SVG // ∞ ↔ 黑洞';
    if (clearBtn) clearBtn.disabled = true;
  }
}

/**
 * 打开封面图片选择/上传悬浮模态弹窗（与 05 · 插入内容 → 插入配图 完全一致的弹窗逻辑与样式）
 */
function openCoverPickerModal(d: PostDraftUi): void {
  closeCoverModal();
  coverModalSeq += 1;
  const seq = coverModalSeq;
  const curCover = String(d.fields.cover ?? '').trim();

  const backdrop = document.createElement('div');
  backdrop.className = 'ed-img-modal-backdrop';
  backdrop.id = 'st-cover-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', '选择或上传文章封面');

  backdrop.innerHTML = `
    <div class="ed-img-modal">
      <div class="ed-img-modal-head">
        <div class="ed-img-modal-title-group">
          <span class="ed-img-modal-kicker">ARTICLE COVER // 16:9 宽银幕封面配置</span>
          <h3 class="ed-img-modal-title">从媒体库选择或上传封面照片</h3>
        </div>
        <button type="button" class="stage-mini-btn ed-img-modal-close" id="st-cover-modal-close" aria-label="关闭弹窗">关闭 ×</button>
      </div>

      <div class="ed-img-modal-body">
        <section class="ed-img-section">
          <div class="ed-img-section-head">
            <span>01 // 从媒体库中选择照片作为封面（点击缩略图直接设为封面）</span>
            <span class="ed-img-section-count" id="st-cover-media-count">读取中…</span>
          </div>
          <div class="ed-media-grid" id="st-cover-media-grid">
            <p class="ed-media-empty">正在读取媒体库中的照片…</p>
          </div>
        </section>

        <section class="ed-img-section">
          <div class="ed-img-section-head">
            <span>02 // 从本地上传封面照片</span>
          </div>
          <div class="ed-dropzone" id="st-cover-dropzone" role="button" tabindex="0" aria-label="上传本地封面图片">
            <div class="ed-dropzone-content">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>把封面照片拖到这里，或点击选择本地照片上传（自动归档至本文目录）</span>
            </div>
            <input type="file" id="st-cover-modal-upload" accept="image/*" hidden />
          </div>
        </section>

        <section class="ed-img-section">
          <div class="ed-img-section-head">
            <span>03 // 手动填写封面路径或设为空白（无封面）</span>
          </div>
          <div class="ed-drawer-grid ed-drawer-grid--image">
            <input class="st-input" id="st-cover-modal-src" value="${esc(curCover)}" placeholder="留空表示无封面（自动展示昼/夜主题 SVG 图案）" />
            <input class="st-input" id="st-cover-modal-cap" value="${esc(d.fields.coverCaption ?? '')}" placeholder="封面图注说明（如：16:9 WIDESCREEN COVER，可选）" />
            <div style="display:flex;gap:0.45rem;">
              <button type="button" class="st-btn st-btn--primary" id="st-cover-modal-confirm">确认设置</button>
              <button type="button" class="stage-mini-btn st-btn--danger" id="st-cover-modal-blank">设为空白（无封面）</button>
            </div>
          </div>
          <div class="st-hint ed-img-modal-hint">默认选项为空白：当文章没有封面时，前台与后台会自动绘制符合主题的 SVG 图案（昼主题对应无限流形 ∞，夜主题对应卡冈图雅黑洞）。</div>
        </section>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  activeCoverModal = backdrop;

  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.removeEventListener('keydown', onEsc);
      closeCoverModal();
    }
  };
  window.addEventListener('keydown', onEsc);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      window.removeEventListener('keydown', onEsc);
      closeCoverModal();
    }
  });

  backdrop.querySelector('#st-cover-modal-close')?.addEventListener('click', () => {
    window.removeEventListener('keydown', onEsc);
    closeCoverModal();
  });

  const applyCover = (nextCover: string, nextCap?: string) => {
    d.fields.cover = nextCover.trim();
    if (nextCap !== undefined) {
      d.fields.coverCaption = nextCap.trim();
      const capInp = $<HTMLInputElement>('#st-f-covercap');
      if (capInp) capInp.value = String(d.fields.coverCaption);
    }
    markDirty();
    syncCoverUi(d);
    window.removeEventListener('keydown', onEsc);
    closeCoverModal();
  };

  const grid = backdrop.querySelector<HTMLElement>('#st-cover-media-grid');
  const countLabel = backdrop.querySelector<HTMLElement>('#st-cover-media-count');
  if (grid) {
    void (async () => {
      try {
        const res = await fetch('/api/media', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { media?: StudioMediaItem[] };
        if (seq >= coverModalSeq && activeCoverModal === backdrop) {
          const list = (Array.isArray(data.media) ? data.media : []).filter(isImageMedia);
          if (countLabel) countLabel.textContent = `共 ${list.length} 张照片`;
          if (!list.length) {
            grid.innerHTML = `<p class="ed-media-empty">媒体库还没有照片，请使用下方上传区上传照片。</p>`;
          } else {
            grid.innerHTML = list
              .map(
                (item) => `
                <button type="button" class="ed-media-item" data-media-path="${esc(item.path)}"
                        data-media-name="${esc(item.filename)}"
                        title="${esc(item.filename)}${item.postTitle ? ` · ${esc(item.postTitle)}` : ''}">
                  <div class="ed-media-thumb-box">
                    <img src="${esc(item.path)}" alt="${esc(item.filename)}" loading="lazy" />
                  </div>
                  <div class="ed-media-caption">
                    <span class="ed-media-name">${esc(item.filename)}</span>
                    ${item.postTitle ? `<span class="ed-media-owner">${esc(item.postTitle)}</span>` : ''}
                  </div>
                </button>`
              )
              .join('');
          }
        }
      } catch (error) {
        if (seq >= coverModalSeq && activeCoverModal === backdrop) {
          if (countLabel) countLabel.textContent = '读取失败';
          grid.innerHTML = `<p class="ed-media-empty ed-media-empty--error">媒体库读取失败（${esc(
            (error as Error).message
          )}），可以使用下方上传区或手动填写路径。</p>`;
        }
      }
    })();

    grid.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-media-path]');
      if (!btn) return;
      const picked = btn.dataset.mediaPath ?? '';
      if (!picked) return;
      applyCover(picked);
      toast(`已从媒体库选择封面：${btn.dataset.mediaName ?? picked}`);
    });
  }

  const uploadInput = backdrop.querySelector<HTMLInputElement>('#st-cover-modal-upload');
  const dropzone = backdrop.querySelector<HTMLElement>('#st-cover-dropzone');

  const handleUploadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isImageFile(file)) {
      toast('请选择图片文件', true);
      return;
    }
    dropzone?.classList.add('is-dragover');
    try {
      if (state.gh) {
        setBusy(true, '压缩并上传封面…');
        const prepared = await prepareImage(file);
        const rel = await uploadPostAsset(state.gh, prepared, d.entry.id, state.postAssetFiles);
        if (!state.postAssetFiles.includes(rel)) state.postAssetFiles.push(rel);
        applyCover(rel);
        toast(`封面已上传并归档到 ${rel}`);
      } else {
        const rel = `../../assets/posts/${file.name.replace(/\s+/g, '-')}`;
        applyCover(rel);
        toast(`已加载封面：${file.name}`);
      }
    } catch (err) {
      dropzone?.classList.remove('is-dragover');
      reportError(err);
    } finally {
      setBusy(false);
    }
  };

  dropzone?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input')) return;
    uploadInput?.click();
  });
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    uploadInput?.click();
  });
  uploadInput?.addEventListener('change', () => {
    const file = uploadInput.files?.[0];
    uploadInput.value = '';
    void handleUploadFile(file);
  });
  dropzone?.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && dropzone.contains(e.relatedTarget as Node)) return;
    dropzone.classList.remove('is-dragover');
  });
  dropzone?.addEventListener('drop', (e) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    void handleUploadFile(e.dataTransfer.files?.[0]);
  });

  backdrop.querySelector('#st-cover-modal-confirm')?.addEventListener('click', () => {
    const src = backdrop.querySelector<HTMLInputElement>('#st-cover-modal-src')?.value ?? '';
    const cap = backdrop.querySelector<HTMLInputElement>('#st-cover-modal-cap')?.value ?? '';
    applyCover(src, cap);
    toast(src.trim() ? '已更新文章封面设置' : '已设为无封面（使用昼/夜主题 SVG 图案）');
  });

  backdrop.querySelector('#st-cover-modal-blank')?.addEventListener('click', () => {
    const cap = backdrop.querySelector<HTMLInputElement>('#st-cover-modal-cap')?.value ?? '';
    applyCover('', cap);
    toast('已清除封面，当前使用昼/夜主题 SVG 图案替代');
  });
}

export function renderPostView(): void {
  const edit = $('#st-edit');
  if (!edit) return;

  const d = postDraft();
  if (!d) {
    edit.innerHTML = '<p class="st-empty">左边选一篇文章；新建就点列表最上面那一行的「＋」。</p>';
    return;
  }

  const globalAuto = autoUpdatedDefault();
  const curAuto = d.fields.autoUpdated;
  const autoValue = curAuto === true ? 'on' : curAuto === false ? 'off' : 'follow';
  const railMode = String(d.fields.railMode ?? 'follow');
  const railSpecs = (d.fields.railSpecs as RailKvItem[]) ?? [];
  const railCfg = normalizePostRailConfig(d.fields.railTopology);
  d.fields.railTopology = railCfg;
  const customCards = railCfg.cards ?? [];

  const tags = (d.fields.tags as string[])
    .map((t) => `<span class="st-chip">${esc(t)}<button type="button" data-rm="${esc(t)}" title="移除">×</button></span>`)
    .join('');

  const allKnownTags = Array.from(
    new Set(
      state.posts.flatMap((p) => (Array.isArray(p.parsed.data.tags) ? p.parsed.data.tags.map(String) : []))
    )
  ).filter((t) => !(d.fields.tags as string[]).includes(t));

  const entryIndex = state.posts.findIndex((p) => p.id === d.entry.id) + 1;
  const entryNo = String(Math.max(1, entryIndex)).padStart(2, '0');
  const rawCover = String(d.fields.cover ?? '').trim();
  const previewCoverUrl = rawCover ? previewCoverSrc(rawCover) : '';

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">#${entryNo}</span>
          <span>文章编辑</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">/posts/${esc(d.entry.id)}/</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-head-top-row">
          <div>
            <div class="st-kicker">${esc(d.fields.pubDate || '未设日期')} · ${esc(d.entry.path)}</div>
            <h2 id="st-live-title">${esc(d.fields.title || '（未填标题）')}</h2>
          </div>
          <div class="st-head-btns">
            <button type="button" class="st-btn" id="st-quick-add-music-btn" title="在文章右侧悬浮窗中快速调用/插入音乐播放模块">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="vertical-align:-2px;margin-right:4px;">
                <path d="M6 12.5V3.5l8-1.5v9"/>
                <circle cx="4" cy="12.5" r="2"/>
                <circle cx="12" cy="11" r="2"/>
              </svg>
              <span>调用音乐播放模块</span>
            </button>
            <button type="button" class="st-btn st-btn--preview" id="st-btn-preview-post">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" style="vertical-align:-2px;margin-right:4px;">
                <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8Z"/>
                <circle cx="8" cy="8" r="2.1"/>
              </svg>
              <span>前台实景预览</span>
            </button>
            <button type="button" class="stage-mini-btn st-btn--danger" id="st-del-post">删除文章</button>
          </div>
        </div>
      </div>

      <!-- 第一象限：核心元数据（克制细线网格划分） -->
      <div class="st-section-box st-post-meta-section">
        <div class="st-section-head">
          <span>01 // CORE TELEMETRY · 文章基本信息（标题、路由、时间轴坐标与分类）</span>
          <span class="st-sec-tag">REQUIRED</span>
        </div>

        <div class="st-meta-sheet">
          <!-- 第一行：文章标题 + 路由标识 -->
          <div class="st-meta-row st-meta-row--primary">
            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-title">
                  <span class="st-meta-idx">01</span>
                  <span>文章标题</span>
                </label>
                <span class="st-meta-hint-inline">中英文间自动盘古留白</span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-title" value="${esc(d.fields.title)}" placeholder="请输入文章主标题…" />
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-slug">
                  <span class="st-meta-idx">02</span>
                  <span>路由标识</span>
                </label>
                <span class="st-meta-hint-inline"><code>/posts/${esc(d.entry.id)}/</code></span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-slug" value="${esc(d.entry.id)}" placeholder="英文连字符，如 my-first-post" />
              </div>
            </div>
          </div>

          <!-- 第二行：发布日期 + 坐标徽标 + 修订日期 + 自动记修订 -->
          <div class="st-meta-row st-meta-row--quad">
            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-date">
                  <span class="st-meta-idx">03</span>
                  <span>发布日期</span>
                </label>
                <span class="st-meta-hint-inline">YYYY-MM-DD</span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-date" value="${esc(d.fields.pubDate)}" placeholder="2026-03-13" />
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-badge">
                  <span class="st-meta-idx">04</span>
                  <span>坐标徽标</span>
                </label>
                <span class="st-meta-hint-inline">ENTRY #${entryNo}</span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-badge" value="${esc(d.fields.entryBadge)}" placeholder="如：LATEST / ESSAY / NOTE" />
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-updated">
                  <span class="st-meta-idx">05</span>
                  <span>修订日期</span>
                </label>
                <span class="st-meta-hint-inline">可选</span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-updated" value="${esc(d.fields.updatedDate)}" placeholder="留空不显示修订时间" />
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-auto">
                  <span class="st-meta-idx">06</span>
                  <span>自动记修订</span>
                </label>
                <span class="st-meta-hint-inline">保存策略</span>
              </div>
              <div class="st-meta-cell-body">
                <select class="st-select st-meta-input" id="st-f-auto">
                  <option value="follow"${autoValue === 'follow' ? ' selected' : ''}>跟随全局（${globalAuto ? '自动记录' : '不记录'}）</option>
                  <option value="on"${autoValue === 'on' ? ' selected' : ''}>始终自动记录</option>
                  <option value="off"${autoValue === 'off' ? ' selected' : ''}>本篇不自动记录</option>
                </select>
              </div>
            </div>
          </div>

          <!-- 第三行：象限分类标签 -->
          <div class="st-meta-row st-meta-row--single">
            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-newtag">
                  <span class="st-meta-idx">07</span>
                  <span>象限标签</span>
                </label>
                ${
                  allKnownTags.length
                    ? `<div class="st-quick-tags st-meta-quick-tags">
                        <span>常用快选：</span>
                        ${allKnownTags
                          .map((t) => `<button type="button" class="stage-mini-btn" data-add-tag="${esc(t)}">＋ ${esc(t)}</button>`)
                          .join('')}
                      </div>`
                    : `<span class="st-meta-hint-inline">输入标签名按回车添加</span>`
                }
              </div>
              <div class="st-meta-cell-body">
                <div class="st-tags st-meta-tags-bar" id="st-tags">
                  ${tags}
                  <input class="st-input st-meta-tag-input" id="st-f-newtag" placeholder="＋ 输入新标签回车添加…" />
                </div>
              </div>
            </div>
          </div>

          <!-- 第四行：发布状态与主页焦点开关 -->
          <div class="st-meta-row st-meta-row--duo">
            <div class="st-meta-cell st-meta-cell--toggle st-field">
              <label class="st-meta-toggle-label" for="st-f-draft">
                <div class="st-meta-toggle-text">
                  <span class="st-meta-toggle-title"><span class="st-meta-idx">08</span>发布状态 · 存为草稿</span>
                  <span class="st-meta-toggle-desc">开启后仅后台可见，不出现在公开归档、RSS 与 Sitemap 中</span>
                </div>
                <input type="checkbox" id="st-f-draft" ${d.fields.draft ? 'checked' : ''} />
              </label>
            </div>

            <div class="st-meta-cell st-meta-cell--toggle st-field">
              <label class="st-meta-toggle-label" for="st-f-featured">
                <div class="st-meta-toggle-text">
                  <span class="st-meta-toggle-title"><span class="st-meta-idx">09</span>主页焦点 · SPOTLIGHT</span>
                  <span class="st-meta-toggle-desc">设为主页「01 · POSTS」右侧默认高亮焦点文章</span>
                </div>
                <input type="checkbox" id="st-f-featured" ${d.fields.featured ? 'checked' : ''} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- 第二象限：导语梗概、16:9 封面与三体画布遥测接口（细线网格对齐） -->
      <div class="st-section-box st-post-meta-section">
        <div class="st-section-head">
          <span>02 // VISUAL &amp; LEAD INTERFACE · 首屏导语、16:9 宽银幕封面与三体画布遥测</span>
          <button type="button" class="stage-mini-btn" id="st-auto-lead-btn">从正文自动提取导语</button>
        </div>

        <div class="st-meta-sheet st-meta-sheet--visual">
          <div class="st-meta-visual-col st-meta-visual-col--left">
            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-lead">
                  <span class="st-meta-idx">01</span>
                  <span>首屏导语 (Lead)</span>
                </label>
                <span class="st-meta-hint-inline">留空则自动抽取正文首段</span>
              </div>
              <div class="st-meta-cell-body">
                <textarea class="st-textarea st-meta-input" id="st-f-lead" rows="3" placeholder="显示在文章详细页标题下方、主页焦点摘要与归档时间轴卡片上…">${esc(
                  d.fields.lead
                )}</textarea>
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-desc">
                  <span class="st-meta-idx">02</span>
                  <span>SEO 摘要 (Description)</span>
                </label>
                <span class="st-meta-hint-inline">RSS 与搜索引擎描述</span>
              </div>
              <div class="st-meta-cell-body">
                <textarea class="st-textarea st-meta-input" id="st-f-desc" rows="2" placeholder="用于 RSS 源与搜索引擎 meta description…">${esc(
                  d.fields.description
                )}</textarea>
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-kinetic">
                  <span class="st-meta-idx">03</span>
                  <span>三体副标题铭牌</span>
                </label>
                <span class="st-meta-hint-inline">文章页右上角引力轨迹画布底栏</span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-kinetic" value="${esc(d.fields.kineticCaption)}" placeholder="默认：3-BODY GRAVITY // CHAOTIC ORBIT" />
              </div>
            </div>
          </div>

          <div class="st-meta-visual-col st-meta-visual-col--right">
            <div class="st-meta-cell st-meta-cell--cover-preview">
              <div class="st-meta-cell-head">
                <span><span class="st-meta-idx">04</span><span>16:9 封面画面（无封面时显示主题 SVG）</span></span>
                <div style="display:inline-flex;gap:0.38rem;align-items:center;">
                  <button type="button" class="stage-mini-btn st-btn--preview" id="st-pick-cover-btn">选择 / 上传封面</button>
                  <button type="button" class="stage-mini-btn st-btn--danger" id="st-clear-cover-btn" ${previewCoverUrl ? '' : 'disabled'} title="清除封面，恢复为昼/夜主题 SVG 图案">清除封面</button>
                </div>
              </div>
              <div class="st-cover-preview-wrap st-cover-preview-clickable" id="st-cover-preview-box" role="button" tabindex="0" title="点击从媒体库选择或上传本地封面照片">
                <img id="st-cover-preview-img" src="${esc(previewCoverUrl)}" alt="封面预览" ${previewCoverUrl ? '' : 'hidden'} onerror="this.hidden=true;var s=document.getElementById('st-cover-svg-fallback');if(s)s.hidden=false;" />
                <div class="st-cover-svg-host" id="st-cover-svg-fallback" ${previewCoverUrl ? 'hidden' : ''}>
                  ${THEME_COVER_SVG_HTML}
                </div>
                <span class="cover-ratio-pill" id="st-cover-mode-pill">${previewCoverUrl ? '16:9 COVER' : 'AUTO SVG // ∞ ↔ 黑洞'}</span>
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-cover">
                  <span class="st-meta-idx">05</span>
                  <span>封面图片路径</span>
                </label>
                <span class="st-meta-hint-inline">默认空白（无封面）</span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-cover" value="${esc(rawCover)}" placeholder="默认空白（允许文章无封面，自动用昼/夜主题 SVG 替代）" />
              </div>
            </div>

            <div class="st-meta-cell st-field">
              <div class="st-meta-cell-head">
                <label for="st-f-covercap">
                  <span class="st-meta-idx">06</span>
                  <span>封面图注说明</span>
                </label>
                <span class="st-meta-hint-inline">可选</span>
              </div>
              <div class="st-meta-cell-body">
                <input class="st-input st-meta-input" id="st-f-covercap" value="${esc(d.fields.coverCaption)}" placeholder="如：16:9 WIDESCREEN COVER" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 第三象限：高自定义信息悬浮窗（Article Right Rail） -->
      <div class="st-section-box is-collapsible${d.railOpen ? ' is-open' : ''}" id="st-rail-section">
        <div class="st-section-head" id="st-rail-head" role="button" tabindex="0" aria-expanded="${d.railOpen ? 'true' : 'false'}" aria-controls="st-rail-body" aria-label="信息悬浮窗：点击展开或收起">
          <span>03 // FLOATING RAIL STUDIO · 信息悬浮窗高自定义工作台（对应前台文章右侧伴读栏）</span>
          <span class="st-sec-mono" style="font-family:var(--mono);font-size:0.75rem;letter-spacing:0.06em;color:var(--accent);">
            ${railMode === 'custom' ? `独立定制 (${customCards.length} 卡片)` : railMode === 'minimal' ? '极简模式' : '跟随全局'} · 点击展开/收起
          </span>
          <span class="st-collapse-icon">›</span>
        </div>
        <div class="st-section-body" id="st-rail-body">
          <div style="padding-top:0.6rem;">
            <div class="st-field">
              <label>悬浮窗模式</label>
              <div class="st-seg-row">
                <button type="button" class="stage-mini-btn" data-rail-mode="follow" aria-pressed="${railMode === 'follow'}">跟随全局默认</button>
                <button type="button" class="stage-mini-btn" data-rail-mode="custom" aria-pressed="${railMode === 'custom'}">本文独立定制（推荐）</button>
                <button type="button" class="stage-mini-btn" data-rail-mode="minimal" aria-pressed="${railMode === 'minimal'}">极简模式（仅展示本文卡片）</button>
              </div>
            </div>

            <div id="st-rail-custom-editor" ${railMode === 'follow' ? 'hidden' : ''} style="margin-top:1rem;">
              <!-- 模块 A：文档速查卡与本文参数 -->
              <div class="st-rail-block">
                <div class="st-pages-subhead">
                  <div class="st-sub-kicker">A // 文档速查与附加键值（DOC SPEC &amp; KV PARAMS）</div>
                  <div class="st-pages-subhead-actions">
                    <label class="st-check">
                      <input type="checkbox" id="st-rail-show-docspec" ${railCfg.showDocSpec !== false ? 'checked' : ''} />
                      <span>显示文档基础速查项</span>
                    </label>
                    <label class="st-check">
                      <input type="checkbox" id="st-rail-sep-specs" ${railCfg.separateSpecsCard === true ? 'checked' : ''} />
                      <span>附加参数独立成卡</span>
                    </label>
                  </div>
                </div>

                <div class="st-check-row" style="margin-bottom:0.65rem;">
                  <label class="st-check"><input type="checkbox" data-rail-bool="showPublished" ${railCfg.showPublished !== false ? 'checked' : ''} /><span>发布日期 (PUBLISHED)</span></label>
                  <label class="st-check"><input type="checkbox" data-rail-bool="showChars" ${railCfg.showChars !== false ? 'checked' : ''} /><span>字数统计 (CHARS)</span></label>
                  <label class="st-check"><input type="checkbox" data-rail-bool="showReading" ${railCfg.showReading !== false ? 'checked' : ''} /><span>阅读时长 (READING)</span></label>
                  <label class="st-check"><input type="checkbox" data-rail-bool="showTags" ${railCfg.showTags !== false ? 'checked' : ''} /><span>分类标签 (TAGS)</span></label>
                </div>

                <div class="st-grid-2" style="margin-bottom:0.65rem;">
                  <div class="st-field">
                    <label>速查卡标题</label>
                    <div><input class="st-input" data-rail-cfg="specKicker" value="${esc(railCfg.specKicker ?? '')}" placeholder="留空使用全局默认（DOC SPEC // 文档速查卡）" /></div>
                  </div>
                  <div class="st-field">
                    <label>右侧副徽标</label>
                    <div><input class="st-input" data-rail-cfg="specBadge" value="${esc(railCfg.specBadge ?? '')}" placeholder="留空使用默认（BASELINE / CUSTOM）" /></div>
                  </div>
                </div>

                <div class="st-sub-kicker">本文附加键值行（如：适用环境、阅读难度、耗时、项目状态）</div>
                <div class="st-kv-editor-list" id="st-rail-specs-list">
                  ${railSpecs
                    .map(
                      (row, i) => `
                    <div class="st-kv-row">
                      <input class="st-input" data-spec-k="${i}" value="${esc(row.label)}" placeholder="字段名（如：环境版本）" />
                      <input class="st-input" data-spec-v="${i}" value="${esc(row.value)}" placeholder="字段值（如：Astro 7 + SQLite）" />
                      <button type="button" class="stage-mini-btn st-btn--danger" data-spec-del="${i}">删除</button>
                    </div>`
                    )
                    .join('')}
                </div>
                <div style="margin-top:0.55rem;display:flex;gap:0.5rem;flex-wrap:wrap;">
                  <button type="button" class="stage-mini-btn" id="st-add-spec-row">＋ 新增键值参数行</button>
                </div>
              </div>

              <!-- 模块 B：本文专属自定义悬浮卡片列表 -->
              <div class="st-rail-block" style="margin-top:1rem;">
                <div class="st-pages-subhead">
                  <div class="st-sub-kicker">B // 本文专属悬浮卡片（支持多卡片自由组合与排序）</div>
                  <div class="st-rail-add-bar">
                    <button type="button" class="stage-mini-btn st-btn--preview" data-add-widget="music">♫ ＋ 音乐播放卡</button>
                    <button type="button" class="stage-mini-btn" data-add-widget="kv">＋ 参数表卡</button>
                    <button type="button" class="stage-mini-btn" data-add-widget="note">＋ 伴读便签卡</button>
                    <button type="button" class="stage-mini-btn" data-add-widget="links">＋ 参考链接卡</button>
                    <button type="button" class="stage-mini-btn" data-add-widget="list">＋ 核心要点卡</button>
                  </div>
                </div>
                <div class="st-rail-widgets-list" id="st-rail-widgets-list">
                  ${renderRailCustomCardsEditor(customCards)}
                </div>
              </div>

              <!-- 模块 C：全局卡片与相关文章联动 -->
              <div class="st-rail-block" style="margin-top:1rem;" ${railMode === 'minimal' ? 'hidden' : ''}>
                <div class="st-sub-kicker">C // 全局悬浮模块联动显示</div>
                <div class="st-check-row">
                  <label class="st-check">
                    <input type="checkbox" data-rail-bool="showGlobalCards" ${railCfg.showGlobalCards !== false ? 'checked' : ''} />
                    <span>同时展示全局伴读卡片（在「页面 → 文章」中维护的全局卡片）</span>
                  </label>
                  <label class="st-check">
                    <input type="checkbox" data-rail-bool="showRelated" ${railCfg.showRelated !== false ? 'checked' : ''} />
                    <span>底部展示「同系列文章切换」列表</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 正文编辑器 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>04 // ARTICLE BODY · 正文内容编辑器</span>
          <span class="st-sec-tag">WYSIWYG ↔ Markdown</span>
        </div>
        <div id="ed-host"></div>
      </div>
    </div>`;

  // 绑定字段输入
  const bindInput = (sel: string, key: string) =>
    $<HTMLInputElement | HTMLTextAreaElement>(sel)?.addEventListener('input', (e) => {
      d.fields[key] = (e.target as HTMLInputElement).value;
      markDirty();
      if (key === 'title') {
        const t = $('#st-live-title');
        if (t) t.textContent = String(d.fields.title || '（未填标题）');
      }
      if (key === 'cover') {
        syncCoverUi(d);
      }
      if (d.rightTab === 'rail') renderRightRailPreview(d);
    });

  bindInput('#st-f-title', 'title');
  bindInput('#st-f-date', 'pubDate');
  bindInput('#st-f-badge', 'entryBadge');
  bindInput('#st-f-updated', 'updatedDate');
  bindInput('#st-f-lead', 'lead');
  bindInput('#st-f-desc', 'description');
  bindInput('#st-f-kinetic', 'kineticCaption');
  bindInput('#st-f-cover', 'cover');
  bindInput('#st-f-covercap', 'coverCaption');

  // 封面选择 / 上传悬浮弹窗与清除封面
  $('#st-pick-cover-btn')?.addEventListener('click', () => openCoverPickerModal(d));
  $('#st-cover-preview-box')?.addEventListener('click', () => openCoverPickerModal(d));
  $('#st-cover-preview-box')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
      e.preventDefault();
      openCoverPickerModal(d);
    }
  });
  $('#st-clear-cover-btn')?.addEventListener('click', () => {
    d.fields.cover = '';
    markDirty();
    syncCoverUi(d);
    toast('已清除文章封面，当前使用昼/夜主题 SVG 图案');
  });

  // 路由标识修改
  $<HTMLInputElement>('#st-f-slug')?.addEventListener('change', (e) => {
    const nextSlug = (e.target as HTMLInputElement).value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!nextSlug || nextSlug === d.entry.id) return;
    if (state.posts.some((p) => p.id === nextSlug && p !== d.entry)) {
      toast(`路由标识「${nextSlug}」已被其它文章占用`, true);
      (e.target as HTMLInputElement).value = d.entry.id;
      return;
    }
    if (!d.entry.prevPath) {
      d.entry.prevPath = d.entry.path;
      d.entry.prevSha = d.entry.sha;
    }
    d.entry.id = nextSlug;
    d.entry.path = `${DIRS.posts}/${nextSlug}.md`;
    state.selected = nextSlug;
    markDirty();
    rerender();
    toast(`文章路由已更新为 /posts/${nextSlug}/`);
  });

  $('#st-f-updated')?.addEventListener('input', () => {
    d.dateTouched = true;
  });

  $<HTMLSelectElement>('#st-f-auto')?.addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    d.fields.autoUpdated = v === 'follow' ? undefined : v === 'on';
    markDirty();
  });

  $<HTMLInputElement>('#st-f-draft')?.addEventListener('change', (e) => {
    d.fields.draft = (e.target as HTMLInputElement).checked;
    markDirty();
  });

  $<HTMLInputElement>('#st-f-featured')?.addEventListener('change', (e) => {
    d.fields.featured = (e.target as HTMLInputElement).checked;
    markDirty();
  });

  // 可折叠 section
  $$<HTMLElement>('.st-section-box.is-collapsible > .st-section-head', edit).forEach((head) => {
    const box = head.closest<HTMLElement>('.st-section-box');
    if (!box) return;

    const setOpen = (open: boolean) => {
      box.classList.toggle('is-open', open);
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (box.id === 'st-rail-section') d.railOpen = open;
    };
    const toggle = (e: Event) => {
      if ((e.target as HTMLElement).closest('a, button, input, select, textarea, label, summary, [data-no-collapse]')) {
        return;
      }
      setOpen(!box.classList.contains('is-open'));
    };

    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggle(e);
    });
  });

  // 自动提取导语
  $('#st-auto-lead-btn')?.addEventListener('click', () => {
    const mdBody = d.editor?.getMarkdown() ?? d.body;
    const extracted = extractAutoLeadFromMarkdown(mdBody);
    if (!extracted) {
      toast('正文中尚未找到足够长的段落来提取导语', true);
      return;
    }
    d.fields.lead = extracted;
    const leadEl = $<HTMLTextAreaElement>('#st-f-lead');
    if (leadEl) leadEl.value = extracted;
    markDirty();
    toast('已从正文首段自动提取导语');
  });

  // 标签增删
  $<HTMLInputElement>('#st-f-newtag')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Enter') return;
    e.preventDefault();
    const input = e.target as HTMLInputElement;
    const v = input.value.trim();
    if (v && !(d.fields.tags as string[]).includes(v)) {
      (d.fields.tags as string[]).push(v);
      markDirty();
      renderPostView();
      $<HTMLInputElement>('#st-f-newtag')?.focus();
    }
    input.value = '';
  });

  edit.querySelectorAll<HTMLButtonElement>('[data-add-tag]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.addTag ?? '';
      if (t && !(d.fields.tags as string[]).includes(t)) {
        (d.fields.tags as string[]).push(t);
        markDirty();
        renderPostView();
        $<HTMLInputElement>('#st-f-newtag')?.focus();
      }
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => {
      d.fields.tags = (d.fields.tags as string[]).filter((t) => t !== b.dataset.rm);
      markDirty();
      renderPostView();
      $<HTMLInputElement>('#st-f-newtag')?.focus();
    })
  );

  // 信息悬浮窗：事件绑定
  wireRailEditorEvents(edit, d, railCfg, railSpecs, customCards);

  $('#st-quick-add-music-btn')?.addEventListener('click', () => {
    let musicIdx = customCards.findIndex((c) => c.type === 'music');
    if (musicIdx === -1) {
      customCards.unshift(createDefaultWidget('music'));
      musicIdx = 0;
    }
    railCfg.cards = customCards;
    d.fields.railTopology = railCfg;
    if (d.fields.railMode === 'follow') d.fields.railMode = 'custom';
    d.railOpen = true;
    d.rightTab = 'rail';
    markDirty();
    renderPostView();
    const sec = $('#st-rail-section');
    sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    openAudioPickerModal(
      d,
      musicIdx,
      (updatedCfg) => {
        customCards.splice(0, customCards.length, ...(updatedCfg.cards ?? []));
        railCfg.cards = customCards;
        d.fields.railTopology = railCfg;
        d.railOpen = true;
        renderPostView();
      },
      customCards
    );
  });

  $('#st-btn-preview-post')?.addEventListener('click', () => previewCurrentPost());
  $('#st-del-post')?.addEventListener('click', () => {
    if (!isV2Layout()) {
      removePost(d.entry);
      return;
    }
    void showConfirm({
      title: '删除这篇文章？',
      body: '会先暂存删除，点「保存当前」才真正从数据库删除；保存前可以点「重新读取」撤销。',
      confirm: '暂存删除',
    }).then((ok) => {
      if (ok) removePost(d.entry);
    });
  });

  renderRightDock(d);
  if (isV2Layout()) applyV2PostLayout(d);
}

function wireRailEditorEvents(
  root: HTMLElement,
  d: PostDraftUi,
  railCfg: PostRailConfig,
  railSpecs: RailKvItem[],
  customCards: RailWidgetCard[]
): void {
  const syncRail = (fullRerender = false) => {
    railCfg.cards = customCards;
    d.fields.railTopology = railCfg;
    markDirty();
    if (fullRerender) {
      d.railOpen = true;
      renderPostView();
    } else if (d.rightTab === 'rail') {
      renderRightRailPreview(d);
    }
  };

  root.querySelectorAll<HTMLButtonElement>('[data-rail-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      d.fields.railMode = btn.dataset.railMode ?? 'follow';
      d.rightTab = 'rail';
      d.railOpen = true;
      markDirty();
      renderPostView();
    })
  );

  $<HTMLInputElement>('#st-rail-show-docspec', root)?.addEventListener('change', (e) => {
    railCfg.showDocSpec = (e.target as HTMLInputElement).checked;
    syncRail(false);
  });

  $<HTMLInputElement>('#st-rail-sep-specs', root)?.addEventListener('change', (e) => {
    railCfg.separateSpecsCard = (e.target as HTMLInputElement).checked;
    syncRail(false);
  });

  root.querySelectorAll<HTMLInputElement>('[data-rail-bool]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const k = inp.dataset.railBool as keyof PostRailConfig;
      (railCfg as Record<string, unknown>)[k] = inp.checked;
      syncRail(false);
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rail-cfg]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.railCfg as keyof PostRailConfig;
      (railCfg as Record<string, unknown>)[k] = inp.value;
      syncRail(false);
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-spec-k]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.specK);
      if (railSpecs[idx]) railSpecs[idx]!.label = inp.value;
      syncRail(false);
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-spec-v]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.specV);
      if (railSpecs[idx]) railSpecs[idx]!.value = inp.value;
      syncRail(false);
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-spec-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      railSpecs.splice(Number(btn.dataset.specDel), 1);
      syncRail(true);
    })
  );

  $('#st-add-spec-row', root)?.addEventListener('click', () => {
    railSpecs.push({ label: '参数项', value: '参数内容' });
    d.rightTab = 'rail';
    syncRail(true);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-add-widget]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const type = (btn.dataset.addWidget ?? 'note') as RailWidgetType;
      customCards.push(createDefaultWidget(type));
      if (d.fields.railMode === 'follow') d.fields.railMode = 'custom';
      d.rightTab = 'rail';
      syncRail(true);
      toast('已添加本文专属悬浮卡片，可在右侧实时预览效果');
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-enabled]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.rcEnabled);
      if (customCards[idx]) customCards[idx]!.enabled = inp.checked;
      syncRail(false);
    })
  );

  root.querySelectorAll<HTMLSelectElement>('[data-rc-type]').forEach((sel) =>
    sel.addEventListener('change', () => {
      const idx = Number(sel.dataset.rcType);
      const card = customCards[idx];
      if (!card) return;
      const nextType = sel.value as RailWidgetType;
      card.type = nextType;
      if (nextType === 'music') {
        card.kicker = 'AUDIO PLAYER // 伴读音乐盒';
        card.badge = 'AUDIO';
        if (!card.audioTitle) card.audioTitle = '伴读音乐 · 未命名曲目';
        if (!card.audioArtist) card.audioArtist = '夜笙 · ACOUSTIC BGM';
        if (card.loop === undefined) card.loop = true;
      } else if (nextType === 'kv' && (!card.items || !card.items.length)) {
        card.items = [{ label: '参数名', value: '参数值' }];
      } else if (nextType === 'links' && (!card.links || !card.links.length)) {
        card.links = [{ label: '相关链接', url: 'https://', note: '参考' }];
      } else if (nextType === 'list' && (!card.bullets || !card.bullets.length)) {
        card.bullets = ['核心要点 1', '核心要点 2'];
      }
      syncRail(true);
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-rc-move]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const [idxStr, dirStr] = (btn.dataset.rcMove ?? '').split(':');
      const idx = Number(idxStr);
      const nextIdx = idx + Number(dirStr);
      if (idx < 0 || nextIdx < 0 || idx >= customCards.length || nextIdx >= customCards.length) return;
      const temp = customCards[idx]!;
      customCards[idx] = customCards[nextIdx]!;
      customCards[nextIdx] = temp;
      syncRail(true);
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-rc-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      customCards.splice(Number(btn.dataset.rcDel), 1);
      syncRail(true);
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-field]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [idxStr, key] = (inp.dataset.rcField ?? '').split('.');
      const card = customCards[Number(idxStr)];
      if (card && (key === 'kicker' || key === 'badge')) {
        card[key] = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLTextAreaElement>('[data-rc-content]').forEach((ta) =>
    ta.addEventListener('input', () => {
      const card = customCards[Number(ta.dataset.rcContent)];
      if (card) {
        card.content = ta.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLTextAreaElement>('[data-rc-bullets]').forEach((ta) =>
    ta.addEventListener('input', () => {
      const card = customCards[Number(ta.dataset.rcBullets)];
      if (card) {
        card.bullets = ta.value
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-kv-k]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [cIdx, rIdx] = (inp.dataset.rcKvK ?? '').split('.').map(Number);
      const item = customCards[cIdx]?.items?.[rIdx];
      if (item) {
        item.label = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-kv-v]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [cIdx, rIdx] = (inp.dataset.rcKvV ?? '').split('.').map(Number);
      const item = customCards[cIdx]?.items?.[rIdx];
      if (item) {
        item.value = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-rc-kv-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const [cIdx, rIdx] = (btn.dataset.rcKvDel ?? '').split('.').map(Number);
      customCards[cIdx]?.items?.splice(rIdx, 1);
      syncRail(true);
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-rc-kv-add]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const cIdx = Number(btn.dataset.rcKvAdd);
      const card = customCards[cIdx];
      if (!card) return;
      if (!card.items) card.items = [];
      card.items.push({ label: '参数名', value: '参数值' });
      syncRail(true);
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-lk-label]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [cIdx, lIdx] = (inp.dataset.rcLkLabel ?? '').split('.').map(Number);
      const item = customCards[cIdx]?.links?.[lIdx];
      if (item) {
        item.label = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-lk-note]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [cIdx, lIdx] = (inp.dataset.rcLkNote ?? '').split('.').map(Number);
      const item = customCards[cIdx]?.links?.[lIdx];
      if (item) {
        item.note = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-lk-url]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [cIdx, lIdx] = (inp.dataset.rcLkUrl ?? '').split('.').map(Number);
      const item = customCards[cIdx]?.links?.[lIdx];
      if (item) {
        item.url = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-rc-lk-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const [cIdx, lIdx] = (btn.dataset.rcLkDel ?? '').split('.').map(Number);
      customCards[cIdx]?.links?.splice(lIdx, 1);
      syncRail(true);
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-rc-lk-add]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const cIdx = Number(btn.dataset.rcLkAdd);
      const card = customCards[cIdx];
      if (!card) return;
      if (!card.links) card.links = [];
      card.links.push({ label: '参考链接', url: 'https://', note: '外部资源' });
      syncRail(true);
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-audio-title]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const card = customCards[Number(inp.dataset.rcAudioTitle)];
      if (card) {
        card.audioTitle = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-audio-artist]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const card = customCards[Number(inp.dataset.rcAudioArtist)];
      if (card) {
        card.audioArtist = inp.value;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-audio-url]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const card = customCards[Number(inp.dataset.rcAudioUrl)];
      if (card) {
        card.audioUrl = inp.value.trim();
        syncRail(false);
      }
    });
    inp.addEventListener('change', () => {
      const card = customCards[Number(inp.dataset.rcAudioUrl)];
      if (!card) return;
      const nextUrl = inp.value.trim();
      card.audioUrl = nextUrl;
      syncRail(true);
      if (nextUrl) {
        void extractAudioMetadataFromUrl(nextUrl).then((meta) => {
          let updated = false;
          if (meta.title && isDefaultAudioTitle(card.audioTitle)) {
            card.audioTitle = meta.title;
            updated = true;
          }
          if (meta.artist && isDefaultAudioArtist(card.audioArtist)) {
            card.audioArtist = meta.artist;
            updated = true;
          }
          if (updated) syncRail(true);
        });
      }
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-rc-audio-loop]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const card = customCards[Number(inp.dataset.rcAudioLoop)];
      if (card) {
        card.loop = inp.checked;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLInputElement>('[data-rc-audio-autoplay]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const card = customCards[Number(inp.dataset.rcAudioAutoplay)];
      if (card) {
        card.autoplay = inp.checked;
        syncRail(false);
      }
    })
  );

  root.querySelectorAll<HTMLButtonElement>('[data-rc-pick-audio]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const cIdx = Number(btn.dataset.rcPickAudio);
      openAudioPickerModal(
        d,
        cIdx,
        (updatedCfg) => {
          if (updatedCfg && Array.isArray(updatedCfg.cards)) {
            customCards.splice(0, customCards.length, ...updatedCfg.cards);
          }
          syncRail(true);
        },
        customCards
      );
    })
  );
}

function renderRightDock(d: PostDraftUi): void {
  const panel = $('#st-preview');
  if (!panel) return;
  const activeTab = d.rightTab ?? 'format';

  panel.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-tabs" role="tablist" aria-label="右侧工具面板切换">
        <button type="button" class="st-dock-tab" data-dock-tab="format" role="tab" aria-selected="${activeTab === 'format'}">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2.5 3.8h11M2.5 8h7.2M2.5 12.2h9.2"/>
          </svg>
          <span>格式工具</span>
        </button>
        <button type="button" class="st-dock-tab" data-dock-tab="rail" role="tab" aria-selected="${activeTab === 'rail'}">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="2.5" width="12" height="11" rx="1.6"/>
            <line x1="9.2" y1="2.5" x2="9.2" y2="13.5"/>
          </svg>
          <span>信息悬浮窗</span>
        </button>
      </div>
      <div id="ed-bar-host" ${activeTab === 'format' ? '' : 'hidden'}></div>
      <div id="st-rail-preview-host" ${activeTab === 'rail' ? '' : 'hidden'}></div>
    </div>`;

  panel.querySelectorAll<HTMLButtonElement>('[data-dock-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      d.rightTab = (b.dataset.dockTab ?? 'format') as 'format' | 'rail';
      renderRightDock(d);
    })
  );

  const areaHost = $('#ed-host');
  const barHost = $('#ed-bar-host');
  if (areaHost && barHost) {
    if (d.editor) {
      d.editor.remount(areaHost, barHost);
    } else {
      d.editor = createEditor(areaHost, barHost, d.body, {
        onInput: () => {
          markDirty();
          if (d.rightTab === 'rail') renderRightRailPreview(d);
        },
        getPostAssets: () => state.postAssetFiles,
        onUploadPostAsset: async (file: File) => {
          if (!state.gh) {
            const name = file.name.replace(/\s+/g, '-');
            const rel = `../../assets/posts/${name}`;
            if (!state.postAssetFiles.includes(rel)) state.postAssetFiles.push(rel);
            toast(`已载入配图「${name}」（会话失效，未上传到服务器）`);
            return rel;
          }
          setBusy(true, '压缩并上传文章配图…');
          try {
            const prepared = await prepareImage(file);
            const rel = await uploadPostAsset(state.gh, prepared, d.entry.id, state.postAssetFiles);
            if (!state.postAssetFiles.includes(rel)) state.postAssetFiles.push(rel);
            toast(`配图已上传并归档到 ${rel}`);
            return rel;
          } catch (err) {
            reportError(err);
            return null;
          } finally {
            setBusy(false);
          }
        },
      });
    }
  }

  if (activeTab === 'rail') {
    renderRightRailPreview(d);
  }
}

function renderRightRailPreview(d: PostDraftUi): void {
  const host = $('#st-rail-preview-host');
  if (!host) return;

  const siteData = (state.draft.site ?? state.site?.data ?? {}) as Record<string, unknown>;
  const globalRail = (siteData.articleRail ?? {}) as ArticleRailConfig;

  const mdText = d.editor?.getMarkdown() ?? d.body;
  const { chars, minutes } = readingTime(mdText);
  const pubDate = String(d.fields.pubDate ?? '');
  const when = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? new Date(`${pubDate}T00:00:00`) : null;
  const dateText = when ? chineseFullDate(when) : pubDate || '未填日期';
  const tags = (d.fields.tags as string[]) ?? [];
  const tagText = tags.length ? tags.join(' · ') : '未分类';

  const railMode = String(d.fields.railMode ?? 'follow');
  const postSpecs = (d.fields.railSpecs as RailKvItem[]) ?? [];
  const postCfg = normalizePostRailConfig(d.fields.railTopology);

  const railSlots = renderArticleRailSlots({
    slug: d.entry.id,
    dateText,
    chars,
    minutes,
    tagText,
    tags,
    railMode,
    railSpecs: postSpecs,
    railConfig: postCfg as unknown as Record<string, unknown>,
    globalRail,
    relatedPosts: state.posts.map((p, idx) => ({
      slug: p.id,
      title: String(p.parsed.data.title ?? p.id),
      tags: Array.isArray(p.parsed.data.tags) ? p.parsed.data.tags.map(String) : [],
      indexNo: idx + 1,
    })),
    totalPostsCount: state.posts.length,
    isStudioDockPreview: true,
  });

  host.innerHTML = `
    <div class="st-rail-preview-wrap">
      <div class="st-rail-dock-quick">
        <div class="st-rail-dock-quick-head">
          <span>快捷模式与卡片构建</span>
          <button type="button" class="stage-mini-btn" id="st-dock-open-rail-sec">展开左侧详细配置</button>
        </div>
        <div class="st-seg-row" style="margin-top:0.4rem;">
          <button type="button" class="stage-mini-btn" data-dock-rail-mode="follow" aria-pressed="${railMode === 'follow'}">跟随全局</button>
          <button type="button" class="stage-mini-btn" data-dock-rail-mode="custom" aria-pressed="${railMode === 'custom'}">独立定制</button>
          <button type="button" class="stage-mini-btn" data-dock-rail-mode="minimal" aria-pressed="${railMode === 'minimal'}">极简</button>
        </div>
        <div class="st-rail-dock-add-grid">
          <button type="button" class="ed-btn" data-dock-add-card="music" style="grid-column:1 / -1;border-color:color-mix(in srgb, var(--accent) 55%, var(--rule));color:var(--accent);font-weight:600;">♫ ＋ 调用音乐播放模块 (Music Player)</button>
          <button type="button" class="ed-btn" data-dock-add-card="kv">＋ 参数速查卡</button>
          <button type="button" class="ed-btn" data-dock-add-card="note">＋ 伴读便签卡</button>
          <button type="button" class="ed-btn" data-dock-add-card="links">＋ 参考链接卡</button>
          <button type="button" class="ed-btn" data-dock-add-card="list">＋ 核心要点卡</button>
        </div>
      </div>

      <div class="st-sub-kicker" style="margin:0.85rem 0 0.45rem;">LIVE RAIL PREVIEW // 前台文章右侧悬浮窗 1:1 实时预览</div>
      <div class="st-rail-live-cards">
        ${railSlots.topCardsHtml}
        ${railSlots.specAndCustomHtml}
        ${railSlots.relatedCardHtml}
      </div>
    </div>`;

  host.querySelector('#st-dock-open-rail-sec')?.addEventListener('click', () => {
    d.railOpen = true;
    renderPostView();
    const sec = $('#st-rail-section');
    sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  host.querySelectorAll<HTMLButtonElement>('[data-dock-rail-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      d.fields.railMode = btn.dataset.dockRailMode ?? 'follow';
      d.railOpen = d.fields.railMode !== 'follow';
      markDirty();
      renderPostView();
    })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-dock-add-card]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const type = (btn.dataset.dockAddCard ?? 'note') as RailWidgetType;
      const cfg = normalizePostRailConfig(d.fields.railTopology);
      if (!cfg.cards) cfg.cards = [];
      cfg.cards.push(createDefaultWidget(type));
      d.fields.railTopology = cfg;
      if (d.fields.railMode === 'follow') d.fields.railMode = 'custom';
      d.railOpen = true;
      markDirty();
      renderPostView();
      const sec = $('#st-rail-section');
      sec?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const addedIdx = cfg.cards.length - 1;
      if (type === 'music') {
        openAudioPickerModal(d, addedIdx, () => {
          d.railOpen = true;
          renderPostView();
        });
      } else {
        toast('已添加悬浮卡片并展开左侧配置区');
      }
    })
  );

  // 为右侧实时预览中的音乐播放卡绑定播放/暂停交互
  host.querySelectorAll<HTMLElement>('[data-rail-music-player]').forEach((cardEl) => {
    const audio = cardEl.querySelector<HTMLAudioElement>('[data-music-audio]');
    const playBtn = cardEl.querySelector<HTMLButtonElement>('[data-music-toggle]');
    const seek = cardEl.querySelector<HTMLInputElement>('[data-music-seek]');
    const fill = cardEl.querySelector<HTMLElement>('[data-music-fill]');
    const curEl = cardEl.querySelector<HTMLElement>('[data-music-cur]');
    const durEl = cardEl.querySelector<HTMLElement>('[data-music-dur]');
    const badgeEl = cardEl.querySelector<HTMLElement>('[data-music-badge]');
    const loopBtn = cardEl.querySelector<HTMLButtonElement>('[data-music-loop]');
    const muteBtn = cardEl.querySelector<HTMLButtonElement>('[data-music-mute]');
    if (!audio) return;

    const fmt = (sec: number) => {
      if (!Number.isFinite(sec) || sec < 0) return '00:00';
      const m = Math.floor(sec / 60);
      const sSec = Math.floor(sec % 60);
      return `${String(m).padStart(2, '0')}:${String(sSec).padStart(2, '0')}`;
    };

    audio.addEventListener('loadedmetadata', () => {
      if (durEl) durEl.textContent = fmt(audio.duration);
    });
    audio.addEventListener('timeupdate', () => {
      if (curEl) curEl.textContent = fmt(audio.currentTime);
      const pct = audio.duration > 0 ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
      if (fill) fill.style.width = `${pct.toFixed(1)}%`;
      if (seek) seek.value = String(pct);
    });
    audio.addEventListener('play', () => {
      cardEl.dataset.playing = 'true';
      if (badgeEl) badgeEl.textContent = 'PLAYING';
    });
    audio.addEventListener('pause', () => {
      cardEl.dataset.playing = 'false';
      if (badgeEl) badgeEl.textContent = 'PAUSED';
    });
    audio.addEventListener('ended', () => {
      cardEl.dataset.playing = 'false';
      if (badgeEl) badgeEl.textContent = 'AUDIO';
    });
    playBtn?.addEventListener('click', () => {
      if (audio.paused) void audio.play().catch(() => {});
      else audio.pause();
    });
    seek?.addEventListener('input', () => {
      if (audio.duration > 0) {
        audio.currentTime = (Number(seek.value) / 100) * audio.duration;
      }
    });
    loopBtn?.addEventListener('click', () => {
      audio.loop = !audio.loop;
      loopBtn.setAttribute('aria-pressed', String(audio.loop));
    });
    muteBtn?.addEventListener('click', () => {
      audio.muted = !audio.muted;
      muteBtn.setAttribute('aria-pressed', String(audio.muted));
    });
  });
}

export function previewCurrentPost(): void {
  const d = postDraft();
  if (!d) return;
  const pubDate = String(d.fields.pubDate ?? '');
  const when = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? new Date(`${pubDate}T00:00:00`) : null;
  const idx = state.posts.findIndex((p) => p.id === d.entry.id);
  const entryNo = String(idx >= 0 ? idx + 1 : 1).padStart(2, '0');
  const newer = idx > 0 ? state.posts[idx - 1] : null;
  const older = idx >= 0 && idx < state.posts.length - 1 ? state.posts[idx + 1] : null;

  const siteData = (state.draft.site ?? state.site?.data ?? {}) as Record<string, unknown>;
  const globalRail = (siteData.articleRail ?? {}) as ArticleRailConfig;
  const siteConfig = (siteData.site ?? {}) as Partial<SiteConfig>;

  void openPreview({
    id: d.entry.id,
    entryNo,
    title: String(d.fields.title ?? ''),
    lead: String(d.fields.lead ?? ''),
    description: String(d.fields.description ?? ''),
    dateText: when ? chineseFullDate(when) : pubDate || '未设日期',
    tags: Array.isArray(d.fields.tags) ? (d.fields.tags as string[]) : [],
    entryBadge: String(d.fields.entryBadge ?? ''),
    kineticCaption: String(d.fields.kineticCaption ?? ''),
    bodyMarkdown: d.editor?.getMarkdown() ?? d.body,
    railMode: String(d.fields.railMode ?? 'follow'),
    railSpecs: Array.isArray(d.fields.railSpecs) ? (d.fields.railSpecs as RailKvItem[]) : [],
    railConfig: (d.fields.railTopology ?? {}) as Record<string, unknown>,
    globalRail,
    siteConfig,
    relatedPosts: state.posts.map((p, i) => ({
      slug: p.id,
      title: String(p.parsed.data.title ?? p.id),
      tags: Array.isArray(p.parsed.data.tags) ? p.parsed.data.tags.map(String) : [],
      indexNo: i + 1,
    })),
    totalPostsCount: state.posts.length,
    newerPost: newer ? { slug: newer.id, title: String(newer.parsed.data.title ?? newer.id) } : null,
    olderPost: older ? { slug: older.id, title: String(older.parsed.data.title ?? older.id) } : null,
    fallbackId: state.posts.find((p) => p.id !== d.entry.id)?.id ?? '',
  });
}

export function createNewPost(): void {
  if (!settleBeforeLeaving()) return;

  const date = isoDate(new Date());
  const id = draftId((x) => state.posts.some((p) => p.id === x));
  const entry = newPostEntry(id, date);
  if (!entry) {
    toast('新建失败：模板没能解析', true);
    return;
  }
  state.posts.unshift(entry);
  stageAdd(entry);
  state.selected = id;
  state.draft = {};
  markDirty();

  state.justAdded = id;
  rerender();
  state.justAdded = null;

  toast('已新建文章草稿 —— 可在右侧直接修改路由标识、封面与伴读栏配置');
}

function removePost(entry: PostEntry): void {
  if (isStagedNew(entry)) {
    state.posts = state.posts.filter((p) => p.path !== entry.path);
    stageRemove(entry);
    state.selected = state.posts[0]?.id ?? null;
    state.draft = {};
    rerender();
    toast('已移除新建草稿');
    return;
  }

  stageRemove(entry);
  state.selected = state.posts.find((p) => p.path !== entry.path)?.id ?? null;
  state.draft = {};
  markDirty();
  rerender();
  toast('已暂存删除 —— 点右上角「保存」正式提交，点「重新读取」可撤销');
}

export function postDraftEdited(): boolean {
  const d = state.draft.post;
  if (!d) return false;
  if (d.entry.prevPath && d.entry.prevPath !== d.entry.path) return true;
  if (JSON.stringify(d.fields) !== JSON.stringify(d.baseline)) return true;
  const body = d.editor?.getMarkdown() ?? d.body;
  if (d.editor?.getMode() === 'markdown' && body.trim() !== d.body.trim()) return true;
  return normalizeHtml(renderMarkdown(body)) !== normalizeHtml(renderMarkdown(d.body));
}

export function foldStagedPostDraft(): void {
  const d = state.draft.post;
  if (!d) return;
  if (isStagedNew(d.entry)) {
    const parsed = parsePost(
      buildPostText(d.entry, diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]), d.editor?.getMarkdown() ?? d.body)
    );
    if (!parsed) return;
    d.entry.parsed = parsed;
    d.body = parsed.body;
  }
}

export async function savePostCurrent(gh: Github): Promise<boolean> {
  const d = state.draft.post;
  if (!d) return true;
  const isNew = isStagedNew(d.entry);

  const dateOk = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
  if (!String(d.fields.title ?? '').trim()) {
    toast('标题不能为空 —— 空标题会导致站点构建校验失败', true);
    return false;
  }
  if (!dateOk(d.fields.pubDate)) {
    toast('「发布日期」需为 YYYY-MM-DD 格式（例如 2026-03-13）', true);
    return false;
  }
  if (d.fields.updatedDate && !dateOk(d.fields.updatedDate)) {
    toast('「修订日期」要么留空，要么写成 YYYY-MM-DD 格式', true);
    return false;
  }

  const body = d.editor?.getMarkdown() ?? d.body;
  const bodySame =
    body.trim() === d.body.trim() &&
    normalizeHtml(renderMarkdown(body)) === normalizeHtml(renderMarkdown(d.body));

  const fieldsChanged = JSON.stringify(d.fields) !== JSON.stringify(d.baseline);
  const renamed = !!(d.entry.prevPath && d.entry.prevPath !== d.entry.path);
  const hasRealEdit = isNew || renamed || fieldsChanged || !bodySame;

  if (!hasRealEdit) {
    toast('当前文章没有任何改动');
    return true;
  }

  if (!isNew && !d.dateTouched && postAutoUpdated(d.fields)) {
    d.fields.updatedDate = isoDate(new Date());
  }

  const changed = diffFields(d.baseline, d.fields, [...POST_FIELDS]);
  await savePost(gh, d.entry, changed, bodySame ? d.body : body);
  return true;
}

/**
 * 文章视图 —— HUD 蓝图双象限元数据表单 + 双模态正文编辑器 + 单篇右侧悬浮栏覆写 + 实时伴读预览
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
  uploadPostAsset,
  type PostEntry,
} from '../content';
import { effectiveChanges, parsePost } from '../frontmatter';
import { createEditor } from '../editor';
import { normalizeHtml, renderMarkdown } from '../md';
import { openPreview } from '../preview';
import { chineseFullDate, isoDate, readingTime } from '../../utils/date';
import { $, esc, reportError, setBusy, toast } from '../ui';
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

interface RailSpecRow {
  label: string;
  value: string;
}

interface RailTopologyCfg {
  enabled?: boolean;
  kicker?: string;
  badge?: string;
  node1Title?: string;
  node1Sub?: string;
  node2Title?: string;
  node2Sub?: string;
  node3Title?: string;
  node3Sub?: string;
  line1?: string;
  line2?: string;
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

function postDraft(): Draft['post'] {
  const entry = currentPost();
  if (!entry) return undefined;
  if (!state.draft.post || state.draft.post.entry.id !== entry.id) {
    const d = entry.parsed.data;
    const rawSpecs = Array.isArray(d.railSpecs) ? (d.railSpecs as RailSpecRow[]) : [];
    const rawTopo = (d.railTopology ?? {}) as RailTopologyCfg;
    state.draft.post = {
      entry,
      fields: {
        title: d.title ?? '',
        pubDate: String(d.pubDate ?? ''),
        description: d.description ?? '',
        lead: d.lead ?? '',
        tags: [...(Array.isArray(d.tags) ? (d.tags as string[]) : [])],
        entryBadge: d.entryBadge ?? '',
        cover: d.cover ?? '',
        coverCaption: d.coverCaption ?? '',
        featured: d.featured === true,
        kineticCaption: d.kineticCaption ?? '',
        railMode: d.railMode ?? (entry.id === 'mc-server' ? 'topology' : rawSpecs.length ? 'custom' : 'follow'),
        railSpecs: rawSpecs.map((r) => ({ label: String(r.label ?? ''), value: String(r.value ?? '') })),
        railTopology: { ...rawTopo },
        updatedDate: d.updatedDate ? String(d.updatedDate) : '',
        draft: d.draft === true,
        autoUpdated: typeof d.autoUpdated === 'boolean' ? d.autoUpdated : undefined,
      },
      body: entry.parsed.body,
      dateTouched: false,
      rightTab: 'format',
    };
  }
  return state.draft.post;
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
  const railSpecs = (d.fields.railSpecs as RailSpecRow[]) ?? [];
  const railTopo = (d.fields.railTopology as RailTopologyCfg) ?? {};

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
  const coverUrl = String(d.fields.cover ?? '').trim() || '/artifact/home/images/spot-default-mc.jpg';

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
            <button type="button" class="stage-mini-btn" id="st-btn-preview-post">页面预览</button>
            <button type="button" class="stage-mini-btn st-btn--danger" id="st-del-post">删除文章</button>
          </div>
        </div>
      </div>

      <!-- 第一象限：核心元数据（对应展示页顶栏、首屏双象限左栏、时间轴卡片） -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>01 // CORE TELEMETRY · 标题、路由、时间轴坐标与分类（对应 /posts/ 与文章页首屏）</span>
          <span class="st-sec-tag">REQUIRED</span>
        </div>
        <div class="st-grid-2">
          <div class="st-field">
            <label>文章标题</label>
            <div>
              <input class="st-input" id="st-f-title" value="${esc(d.fields.title)}" placeholder="文章主标题（中英文间自动盘古留白）" />
            </div>
          </div>
          <div class="st-field">
            <label>路由标识</label>
            <div>
              <div style="display:flex;gap:0.4rem;align-items:center;">
                <input class="st-input" id="st-f-slug" value="${esc(d.entry.id)}" placeholder="英文连字符，如 mc-server" />
              </div>
              <div class="st-hint">生成路径：<code>/posts/${esc(d.entry.id)}/</code>（修改即重命名 .md 文件）</div>
            </div>
          </div>
          <div class="st-field">
            <label>发布日期</label>
            <div>
              <input class="st-input" id="st-f-date" value="${esc(d.fields.pubDate)}" placeholder="2026-03-13" />
              <div class="st-hint">格式 YYYY-MM-DD，决定时间轴年/月/日归档位置</div>
            </div>
          </div>
          <div class="st-field">
            <label>坐标徽标</label>
            <div>
              <input class="st-input" id="st-f-badge" value="${esc(d.fields.entryBadge)}" placeholder="如：LATEST / ESSAY / TOOLKIT / 3D MESH" />
              <div class="st-hint">对应归档卡片上的 <code>ENTRY #${entryNo} // BADGE</code></div>
            </div>
          </div>
          <div class="st-field">
            <label>修订日期</label>
            <div>
              <input class="st-input" id="st-f-updated" value="${esc(d.fields.updatedDate)}" placeholder="留空则不显示修订时间" />
            </div>
          </div>
          <div class="st-field">
            <label>自动记修订</label>
            <div>
              <select class="st-select" id="st-f-auto">
                <option value="follow"${autoValue === 'follow' ? ' selected' : ''}>跟随全局（当前：${globalAuto ? '自动记录' : '不记录'}）</option>
                <option value="on"${autoValue === 'on' ? ' selected' : ''}>始终自动记录</option>
                <option value="off"${autoValue === 'off' ? ' selected' : ''}>本篇不自动记录</option>
              </select>
            </div>
          </div>
        </div>

        <div class="st-field" style="margin-top:0.75rem;">
          <label>象限标签</label>
          <div>
            <div class="st-tags" id="st-tags">
              ${tags}
              <input class="st-input" id="st-f-newtag" placeholder="＋ 输入标签回车添加" style="max-width:11rem" />
            </div>
            ${
              allKnownTags.length
                ? `<div class="st-quick-tags">
                    <span>常用标签快选：</span>
                    ${allKnownTags
                      .map((t) => `<button type="button" class="stage-mini-btn" data-add-tag="${esc(t)}">＋ ${esc(t)}</button>`)
                      .join('')}
                  </div>`
                : ''
            }
          </div>
        </div>

        <div class="st-grid-2" style="margin-top:0.75rem;">
          <div class="st-field">
            <label>发布状态</label>
            <div class="st-check">
              <input type="checkbox" id="st-f-draft" ${d.fields.draft ? 'checked' : ''} />
              <span>存为草稿（不出现在公开列表、RSS 与 Sitemap 中）</span>
            </div>
          </div>
          <div class="st-field">
            <label>主页焦点</label>
            <div class="st-check">
              <input type="checkbox" id="st-f-featured" ${d.fields.featured ? 'checked' : ''} />
              <span>设为主页「01 · POSTS」右侧默认高亮焦点文章 (SPOTLIGHT)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 第二象限：导语梗概、16:9 封面与三体画布遥测接口 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>02 // VISUAL &amp; LEAD INTERFACE · 首屏导语、16:9 宽银幕封面与三体画布遥测</span>
          <button type="button" class="stage-mini-btn" id="st-auto-lead-btn">从正文自动提取导语</button>
        </div>

        <div class="st-grid-2">
          <div>
            <div class="st-field">
              <label>首屏导语</label>
              <div>
                <textarea class="st-textarea" id="st-f-lead" rows="3" placeholder="显示在文章详细页标题下方、主页焦点摘要与归档时间轴卡片上（留空则自动抽取正文首段）">${esc(
                  d.fields.lead
                )}</textarea>
              </div>
            </div>
            <div class="st-field" style="margin-top:0.65rem;">
              <label>SEO 摘要</label>
              <div>
                <textarea class="st-textarea" id="st-f-desc" rows="2" placeholder="用于 RSS 源与搜索引擎 meta description">${esc(
                  d.fields.description
                )}</textarea>
              </div>
            </div>
            <div class="st-field" style="margin-top:0.65rem;">
              <label>三体副标题</label>
              <div>
                <input class="st-input" id="st-f-kinetic" value="${esc(d.fields.kineticCaption)}" placeholder="默认：3-BODY GRAVITY // CHAOTIC ORBIT（Mc 篇如 LOCAL : 25565 <-> FRP）" />
                <div class="st-hint">对应文章详细页右上角《三体》引力轨迹画布底栏右侧遥测铭牌</div>
              </div>
            </div>
          </div>

          <div class="st-cover-config-box">
            <div class="st-cover-preview-wrap">
              <img id="st-cover-preview-img" src="${esc(coverUrl)}" alt="封面预览" onerror="this.style.opacity='0.25'" />
              <span class="cover-ratio-pill">16:9</span>
            </div>
            <div class="st-field" style="margin-top:0.65rem;">
              <label>封面图片</label>
              <div style="display:flex;gap:0.5rem;">
                <input class="st-input" id="st-f-cover" value="${esc(d.fields.cover)}" placeholder="图片路径或留空自动取正文首图" />
                <label class="stage-mini-btn" style="cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;">
                  <span>上传</span>
                  <input type="file" id="st-upload-cover" accept="image/*" hidden />
                </label>
              </div>
            </div>
            <div class="st-field" style="margin-top:0.65rem;">
              <label>封面图注</label>
              <div>
                <input class="st-input" id="st-f-covercap" value="${esc(d.fields.coverCaption)}" placeholder="如：FRP / JAVA 21 / PAPERMC" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右栏伴读定制（可折叠的高级选项）-->
      <div class="st-section-box is-collapsible" id="st-rail-section">
        <div class="st-section-head" id="st-rail-head">
          <span>右栏伴读定制</span>
          <span class="st-sec-mono" style="font-family:var(--mono);font-size:0.72rem;letter-spacing:0.06em;color:var(--accent);">高级 · 可折叠</span>
          <button type="button" class="stage-mini-btn" id="st-switch-rail-preview" style="margin-left:auto;">预览 →</button>
          <span class="st-collapse-icon">›</span>
        </div>
        <div class="st-section-body">
          <div style="padding-top:0.5rem;">

        <div class="st-field">
          <label>右栏模式</label>
          <div class="st-seg-row">
            <button type="button" class="stage-mini-btn" data-rail-mode="follow" aria-pressed="${railMode === 'follow'}">跟随全局默认</button>
            <button type="button" class="stage-mini-btn" data-rail-mode="custom" aria-pressed="${railMode === 'custom'}">本文专属参数卡</button>
            <button type="button" class="stage-mini-btn" data-rail-mode="topology" aria-pressed="${railMode === 'topology'}">拓扑图解</button>
          </div>
        </div>

        <div id="st-rail-custom-editor" ${railMode === 'follow' ? 'hidden' : ''} style="margin-top:0.85rem;">
          <div class="st-sub-kicker">速查参数表（显示在文章右侧悬浮栏）</div>
          <div class="st-kv-editor-list" id="st-rail-specs-list">
            ${railSpecs
              .map(
                (row, i) => `
              <div class="st-kv-row">
                <input class="st-input" data-spec-k="${i}" value="${esc(row.label)}" placeholder="参数名" />
                <input class="st-input" data-spec-v="${i}" value="${esc(row.value)}" placeholder="参数值" />
                <button type="button" class="stage-mini-btn st-btn--danger" data-spec-del="${i}">删除</button>
              </div>`
              )
              .join('')}
          </div>
          <div style="margin-top:0.55rem;display:flex;gap:0.5rem;">
            <button type="button" class="stage-mini-btn" id="st-add-spec-row">＋ 新增参数行</button>
            <button type="button" class="stage-mini-btn" id="st-preset-mc-spec">载入服务器模板</button>
          </div>

          <div id="st-rail-topo-editor" ${railMode === 'topology' ? '' : 'hidden'} style="margin-top:0.95rem;padding-top:0.85rem;border-top:1px dashed var(--rule);">
            <div class="st-sub-kicker">拓扑链路图节点文本</div>
            <div class="st-grid-3">
              <div>
                <label class="st-mini-label">左节点</label>
                <input class="st-input" data-topo="node1Title" value="${esc(railTopo.node1Title ?? 'LOCAL HOST')}" placeholder="主标题" style="margin-bottom:6px" />
                <input class="st-input" data-topo="node1Sub" value="${esc(railTopo.node1Sub ?? 'Paper :25565')}" placeholder="副标题" />
              </div>
              <div>
                <label class="st-mini-label">中继节点</label>
                <input class="st-input" data-topo="node2Title" value="${esc(railTopo.node2Title ?? 'FRP RELAY')}" placeholder="主标题" style="margin-bottom:6px" />
                <input class="st-input" data-topo="node2Sub" value="${esc(railTopo.node2Sub ?? 'Public :7000')}" placeholder="副标题" />
              </div>
              <div>
                <label class="st-mini-label">终端节点</label>
                <input class="st-input" data-topo="node3Title" value="${esc(railTopo.node3Title ?? 'PLAYERS')}" placeholder="主标题" style="margin-bottom:6px" />
                <input class="st-input" data-topo="node3Sub" value="${esc(railTopo.node3Sub ?? 'Clients 1..N')}" placeholder="副标题" />
              </div>
            </div>
            <div class="st-grid-2" style="margin-top:0.5rem;">
              <input class="st-input" data-topo="line1" value="${esc(railTopo.line1 ?? 'TUNNEL: 127.0.0.1:25565 -> frps:25565')}" placeholder="状态行 1" />
              <input class="st-input" data-topo="line2" value="${esc(railTopo.line2 ?? 'STATUS: NAT BYPASSED · ZERO PUBLIC IP')}" placeholder="状态行 2" />
            </div>
          </div>
        </div>

          </div>
        </div>
      </div>

      <!-- 正文编辑器 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>正文内容</span>
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
        const img = $<HTMLImageElement>('#st-cover-preview-img');
        if (img) {
          img.style.opacity = '1';
          img.src = String(d.fields.cover || '/artifact/home/images/spot-default-mc.jpg');
        }
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

  // 可折叠 section 绑定
  edit.querySelectorAll<HTMLElement>('.st-section-box.is-collapsible .st-section-head').forEach((head) => {
    const box = head.closest('.st-section-box');
    if (!box) return;
    head.addEventListener('click', (e) => {
      // 点击 section 内的按钮不触发折叠
      if ((e.target as HTMLElement).closest('button, input, select, textarea')) return;
      box.classList.toggle('is-open');
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


  // 上传封面
  $<HTMLInputElement>('#st-upload-cover')?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const localUrl = URL.createObjectURL(file);
      d.fields.cover = localUrl;
      const input = $<HTMLInputElement>('#st-f-cover');
      if (input) input.value = `../../assets/posts/${file.name}`;
      const img = $<HTMLImageElement>('#st-cover-preview-img');
      if (img) img.src = localUrl;
      markDirty();
      toast(`已加载封面预览：${file.name}（16:9 画框已适配）`);
    } catch (err) {
      reportError(err);
    }
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
      }
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-rm]').forEach((b) =>
    b.addEventListener('click', () => {
      d.fields.tags = (d.fields.tags as string[]).filter((t) => t !== b.dataset.rm);
      markDirty();
      renderPostView();
    })
  );

  // 右侧悬浮栏模式切换与编辑
  edit.querySelectorAll<HTMLButtonElement>('[data-rail-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      d.fields.railMode = btn.dataset.railMode ?? 'follow';
      d.rightTab = 'rail';
      markDirty();
      renderPostView();
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-spec-k]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.specK);
      if (railSpecs[idx]) railSpecs[idx]!.label = inp.value;
      markDirty();
      if (d.rightTab === 'rail') renderRightRailPreview(d);
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-spec-v]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.specV);
      if (railSpecs[idx]) railSpecs[idx]!.value = inp.value;
      markDirty();
      if (d.rightTab === 'rail') renderRightRailPreview(d);
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-spec-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      railSpecs.splice(Number(btn.dataset.specDel), 1);
      markDirty();
      renderPostView();
    })
  );

  $('#st-add-spec-row')?.addEventListener('click', () => {
    railSpecs.push({ label: 'NEW PARAM', value: 'Value' });
    markDirty();
    renderPostView();
  });

  $('#st-preset-mc-spec')?.addEventListener('click', () => {
    d.fields.railSpecs = [
      { label: 'JDK RUNTIME', value: 'Temurin 21 LTS' },
      { label: 'SERVER CORE', value: 'Paper 1.21.x' },
      { label: 'HEAP MEMORY', value: '-Xms4G -Xmx4G' },
      { label: 'GC POLICY', value: 'G1GC (Aikars)' },
      { label: 'DEFAULT PORT', value: 'TCP 25565' },
    ];
    markDirty();
    renderPostView();
  });

  edit.querySelectorAll<HTMLInputElement>('[data-topo]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.topo as keyof RailTopologyCfg;
      railTopo[k] = inp.value as never;
      d.fields.railTopology = railTopo;
      markDirty();
      if (d.rightTab === 'rail') renderRightRailPreview(d);
    })
  );

  $('#st-switch-rail-preview')?.addEventListener('click', () => {
    d.rightTab = 'rail';
    renderRightDock(d);
  });

  $('#st-btn-preview-post')?.addEventListener('click', () => previewCurrentPost());
  $('#st-del-post')?.addEventListener('click', () => removePost(d.entry));

  renderRightDock(d);
}

function renderRightDock(d: NonNullable<Draft['post']>): void {
  const panel = $('#st-preview');
  if (!panel) return;
  const activeTab = d.rightTab ?? 'format';

  panel.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-tabs">
        <button type="button" class="st-dock-tab" data-dock-tab="format" aria-selected="${activeTab === 'format'}">格式工具</button>
        <button type="button" class="st-dock-tab" data-dock-tab="rail" aria-selected="${activeTab === 'rail'}">右侧悬浮栏</button>
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
          if (state.demoMode || !state.gh) {
            const name = file.name.replace(/\s+/g, '-');
            if (!state.postAssetFiles.includes(name)) state.postAssetFiles.push(name);
            toast(`已载入配图「${name}」（演示模式）`);
            return name;
          }
          setBusy(true, '压缩并上传文章配图…');
          try {
            const prepared = await prepareImage(file);
            const name = await uploadPostAsset(state.gh, prepared, d.entry.id, state.postAssetFiles);
            state.postAssetFiles.push(name);
            toast(`配图 ${name} 已上传至 src/assets/posts/`);
            return name;
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

function renderRightRailPreview(d: NonNullable<Draft['post']>): void {
  const host = $('#st-rail-preview-host');
  if (!host) return;

  const siteData = (state.draft.site ?? state.site?.data ?? {}) as Record<string, unknown>;
  const railCfg = (siteData.articleRail ?? {}) as Record<string, unknown>;
  const docSpecCfg = (railCfg.docSpec ?? {}) as Record<string, unknown>;
  const globalTopo = (railCfg.topology ?? {}) as Record<string, unknown>;
  const customCards = Array.isArray(railCfg.customCards) ? (railCfg.customCards as Array<Record<string, unknown>>) : [];

  const mdText = d.editor?.getMarkdown() ?? d.body;
  const { chars, minutes } = readingTime(mdText);
  const pubDate = String(d.fields.pubDate ?? '');
  const when = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? new Date(`${pubDate}T00:00:00`) : null;
  const dateText = when ? chineseFullDate(when) : pubDate || '未填日期';
  const tags = (d.fields.tags as string[]) ?? [];
  const tagText = tags.length ? tags.join(' · ') : '未分类';

  const railMode = String(d.fields.railMode ?? 'follow');
  const postSpecs = (d.fields.railSpecs as RailSpecRow[]) ?? [];
  const postTopo = (d.fields.railTopology as RailTopologyCfg) ?? {};

  const showTopo =
    railMode === 'topology' ||
    (railMode === 'follow' && (d.entry.id === 'mc-server' || globalTopo.globalEnabled === true));

  const n1T = postTopo.node1Title || String(globalTopo.node1Title ?? 'LOCAL HOST');
  const n1S = postTopo.node1Sub || String(globalTopo.node1Sub ?? 'Paper :25565');
  const n2T = postTopo.node2Title || String(globalTopo.node2Title ?? 'FRP RELAY');
  const n2S = postTopo.node2Sub || String(globalTopo.node2Sub ?? 'Public :7000');
  const n3T = postTopo.node3Title || String(globalTopo.node3Title ?? 'PLAYERS');
  const n3S = postTopo.node3Sub || String(globalTopo.node3Sub ?? 'Clients 1..N');
  const l1 = postTopo.line1 || String(globalTopo.line1 ?? 'TUNNEL: 127.0.0.1:25565 -> frps:25565');
  const l2 = postTopo.line2 || String(globalTopo.line2 ?? 'STATUS: NAT BYPASSED · ZERO PUBLIC IP');

  let rows: RailSpecRow[] = [];
  let specKicker = String(docSpecCfg.kicker ?? 'DOC SPEC // 文档速查卡');
  if ((railMode === 'custom' || railMode === 'topology') && postSpecs.length > 0) {
    rows = postSpecs;
    specKicker = 'SPEC SHEET // 环境速查卡';
  } else {
    if (docSpecCfg.showPublished !== false) rows.push({ label: 'PUBLISHED', value: dateText });
    if (docSpecCfg.showChars !== false) rows.push({ label: 'CHARS', value: `${chars.toLocaleString('zh-CN')} 字` });
    if (docSpecCfg.showReading !== false) rows.push({ label: 'READING', value: `约 ${minutes} 分钟` });
    if (docSpecCfg.showTags !== false) rows.push({ label: 'TAGS', value: tagText });
    const extraRows = Array.isArray(docSpecCfg.customRows) ? (docSpecCfg.customRows as RailSpecRow[]) : [];
    rows.push(...extraRows);
  }

  host.innerHTML = `
    <div class="st-rail-preview-wrap">
      <div class="st-hint" style="margin-bottom:0.65rem;">
        实时模拟文章详细页右侧悬浮伴读栏（<code>.article-RightRail-q</code>）。全局卡片可在顶部「站点」→「文章右侧悬浮栏」中统一配置。
      </div>

      ${
        showTopo
          ? `<div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
              <div class="rail-card-kicker">
                <span>TOPOLOGY // 穿透链路图解</span>
                <span>TCP : 25565</span>
              </div>
              <svg viewBox="0 0 240 130" style="width:100%; height:auto; display:block;">
                <rect x="8" y="14" width="66" height="40" rx="2" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
                <text x="16" y="31" font-family="monospace" font-size="8.5" fill="#d97757">${esc(n1T)}</text>
                <text x="16" y="44" font-family="monospace" font-size="8" fill="currentColor" opacity="0.7">${esc(n1S)}</text>
                <rect x="87" y="14" width="66" height="40" rx="2" fill="none" stroke="#d97757" stroke-width="1.3"/>
                <text x="96" y="31" font-family="monospace" font-size="8.5" fill="#d97757">${esc(n2T)}</text>
                <text x="96" y="44" font-family="monospace" font-size="8" fill="currentColor" opacity="0.7">${esc(n2S)}</text>
                <rect x="166" y="14" width="66" height="40" rx="2" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
                <text x="175" y="31" font-family="monospace" font-size="8.5" fill="#788c5d">${esc(n3T)}</text>
                <text x="175" y="44" font-family="monospace" font-size="8" fill="currentColor" opacity="0.7">${esc(n3S)}</text>
                <line x1="74" y1="34" x2="87" y2="34" stroke="#d97757" stroke-width="1.4"/>
                <line x1="153" y1="34" x2="166" y2="34" stroke="#d97757" stroke-width="1.4"/>
                <rect x="8" y="72" width="224" height="46" rx="2" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-dasharray="3 3"/>
                <text x="18" y="90" font-family="monospace" font-size="8.5" fill="currentColor" opacity="0.75">${esc(l1)}</text>
                <text x="18" y="106" font-family="monospace" font-size="8.5" fill="#d97757">${esc(l2)}</text>
              </svg>
            </div>`
          : ''
      }

      <div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
        <div class="rail-card-kicker">
          <span>${esc(specKicker)}</span>
          <span>BASELINE</span>
        </div>
        <ul class="rail-kv-list">
          ${rows.map((r) => `<li><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></li>`).join('')}
        </ul>
      </div>

      ${customCards
        .filter((c) => c.enabled !== false)
        .map(
          (c) => `
          <div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
            <div class="rail-card-kicker">
              <span>${esc(c.kicker ?? 'CUSTOM CARD')}</span>
              <span>${esc(c.badge ?? 'INFO')}</span>
            </div>
            <p style="margin:0;font-size:1.125rem;line-height:1.65;color:var(--muted);">${esc(c.content ?? '')}</p>
          </div>`
        )
        .join('')}

      <div class="rail-blueprint-card">
        <div class="rail-card-kicker">
          <span>ARCHIVE // 同系列文章切换</span>
          <span>${state.posts.length} ENTRIES</span>
        </div>
        <ul class="rail-related-list">
          ${state.posts
            .filter((p) => p.id !== d.entry.id)
            .slice(0, 3)
            .map(
              (p, i) => `
              <li>
                <div class="rail-rel-mock">
                  <span class="r-idx">ENTRY #0${i + 1}</span>
                  <span class="r-tit">${esc(p.parsed.data.title ?? p.id)}</span>
                </div>
              </li>`
            )
            .join('')}
        </ul>
      </div>
    </div>`;
}

export function previewCurrentPost(): void {
  const d = postDraft();
  if (!d) return;
  const pubDate = String(d.fields.pubDate ?? '');
  const when = /^\d{4}-\d{2}-\d{2}$/.test(pubDate) ? new Date(`${pubDate}T00:00:00`) : null;
  void openPreview({
    id: d.entry.id,
    title: String(d.fields.title ?? ''),
    dateText: when ? chineseFullDate(when) : '',
    bodyMarkdown: d.editor?.getMarkdown() ?? d.body,
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

function realChanges(d: NonNullable<Draft['post']>): Record<string, unknown> {
  return effectiveChanges(d.entry.parsed, diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]));
}

export function postDraftEdited(): boolean {
  const d = state.draft.post;
  if (!d) return false;
  const changed = realChanges(d);
  const manualDate = d.dateTouched === true && 'updatedDate' in changed;
  delete changed.updatedDate;
  if (manualDate || Object.keys(changed).length) return true;
  const body = d.editor?.getMarkdown() ?? d.body;
  return normalizeHtml(renderMarkdown(body)) !== normalizeHtml(renderMarkdown(d.body));
}

export function foldStagedPostDraft(): void {
  const d = state.draft.post;
  if (!d) return;
  if (state.demoMode || isStagedNew(d.entry)) {
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
  const bodySame = normalizeHtml(renderMarkdown(body)) === normalizeHtml(renderMarkdown(d.body));

  const changedExceptDate = realChanges(d);
  const manualDate = d.dateTouched === true && 'updatedDate' in changedExceptDate;
  delete changedExceptDate.updatedDate;
  const hasRealEdit = isNew || Object.keys(changedExceptDate).length > 0 || !bodySame || manualDate;

  if (!hasRealEdit) {
    toast('当前文章没有任何改动');
    return true;
  }

  if (!isNew && !d.dateTouched && postAutoUpdated(d.fields)) {
    d.fields.updatedDate = isoDate(new Date());
  }

  const changed = diffFields(d.entry.parsed.data, d.fields, [...POST_FIELDS]);
  await savePost(gh, d.entry, changed, bodySame ? d.body : body);
  return true;
}

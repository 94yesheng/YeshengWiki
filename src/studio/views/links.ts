/**
 * 友链视图 —— 1:1 对齐主页 04 · LINKS 与 /links/ 展示页的邻人卡片矩阵字段
 * （支持：名称 name、单字头像 avatar、领域标签 tag、网址 url、站长与更新状态 owner、简介 description、唯一标识 id）
 * 并集成前台「友链申请」审核队列：可查看访客提交的站点信息并一键添加进友链列表中。
 */
import { $, esc, toast } from '../ui';
import { state, markDirty, rerender } from '../state';

interface LinkApplicationItem {
  id: number;
  owner: string;
  name: string;
  url: string;
  description: string;
  avatar: string | null;
  tag: string | null;
  status: 'pending' | 'approved';
  createdAt: string;
}

let applicationsCache: LinkApplicationItem[] = [];
let applicationsLoaded = false;
let applicationsLoading = false;

async function fetchApplications(force = false): Promise<void> {
  if (applicationsLoading) return;
  if (applicationsLoaded && !force) return;
  applicationsLoading = true;
  try {
    const res = await fetch('/api/links/applications', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrf ?? '' },
    });
    if (res.ok) {
      const data = (await res.json()) as { applications?: LinkApplicationItem[] };
      applicationsCache = Array.isArray(data.applications) ? data.applications : [];
      applicationsLoaded = true;
    }
  } catch {
    // ignore network error
  } finally {
    applicationsLoading = false;
    if (state.collection === 'links') {
      renderApplicationsBox();
    }
  }
}

function renderApplicationsBox(): void {
  const host = $('#st-link-applications-host');
  if (!host) return;

  const pendingCount = applicationsCache.filter((a) => a.status === 'pending').length;

  host.innerHTML = `
    <div class="st-section-box st-link-apps-box" style="margin-bottom:1.15rem;">
      <div class="st-section-head">
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <span>00 // FRIEND LINK APPLICATIONS · 访客友链申请收件箱</span>
          <span class="st-sec-tag">${pendingCount > 0 ? `${pendingCount} 待审核` : `共 ${applicationsCache.length} 条`}</span>
        </div>
        <button type="button" class="stage-mini-btn" id="st-refresh-link-apps" ${applicationsLoading ? 'disabled' : ''}>
          ${applicationsLoading ? '读取中…' : '刷新申请列表'}
        </button>
      </div>

      ${
        applicationsCache.length === 0
          ? `<p class="st-hint" style="margin:0.4rem 0 0;">暂无访客提交的友链申请。访客在主页「04 · 友链」或 <code>/links/</code> 子页点击「申请友链」填写后，会自动汇总到这里。</p>`
          : `<div class="st-link-apps-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(20rem,1fr));gap:0.75rem;margin-top:0.65rem;">
              ${applicationsCache
                .map((app) => {
                  const av = (app.avatar ?? '').trim() || app.name.trim().slice(0, 1) || '友';
                  const isPending = app.status === 'pending';
                  return `
                  <article class="rail-blueprint-card st-link-app-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:0.55rem;border-color:${
                    isPending ? 'color-mix(in srgb, var(--accent) 55%, var(--rule))' : 'var(--rule)'
                  };">
                    <div>
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
                        <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
                          <span class="st-peer-avatar-badge">${esc(av)}</span>
                          <div style="min-width:0;">
                            <strong style="font-family:var(--kai);font-size:1.25rem;font-weight:400;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(
                              app.name
                            )}</strong>
                            <span style="font-family:var(--mono);font-size:0.68rem;color:var(--faint);">站长：${esc(
                              app.owner
                            )} · ${esc(app.tag || '独立博客')}</span>
                          </div>
                        </div>
                        <span class="st-peer-tag-pill" style="${
                          isPending ? '' : 'opacity:0.6;'
                        }">${isPending ? '待审核' : '已添加'}</span>
                      </div>

                      <div style="margin-top:0.4rem;font-family:var(--mono);font-size:0.72rem;">
                        <a href="${esc(app.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline;word-break:break-all;">${esc(
                          app.url
                        )} ↗</a>
                      </div>

                      <p style="margin:0.4rem 0 0;font-size:0.88rem;line-height:1.58;color:var(--muted);">${esc(
                        app.description
                      )}</p>
                    </div>

                    <div style="padding-top:0.45rem;border-top:1px dashed var(--rule);display:flex;align-items:center;justify-content:space-between;gap:0.45rem;flex-wrap:wrap;">
                      <span style="font-family:var(--mono);font-size:0.66rem;color:var(--faint);">${esc(
                        app.createdAt
                      )}</span>
                      <div style="display:flex;gap:0.4rem;">
                        <button type="button" class="stage-mini-btn st-btn--primary" data-app-approve="${
                          app.id
                        }" style="background:var(--accent);color:#fff;border-color:var(--accent);">
                          ${isPending ? '✓ 一键添加进友链' : '＋ 重新同步至友链'}
                        </button>
                        <button type="button" class="stage-mini-btn st-btn--danger" data-app-del="${app.id}">删除</button>
                      </div>
                    </div>
                  </article>`;
                })
                .join('')}
            </div>`
      }
    </div>`;

  host.querySelector('#st-refresh-link-apps')?.addEventListener('click', () => {
    void fetchApplications(true);
  });

  host.querySelectorAll<HTMLButtonElement>('[data-app-approve]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.appApprove);
      const app = applicationsCache.find((a) => a.id === id);
      if (!id || !app) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/links/applications/${id}/approve`, {
          method: 'POST',
          headers: { 'X-CSRF-Token': state.csrf ?? '' },
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          links?: Array<{
            id: string;
            name: string;
            url: string;
            description: string;
            avatar?: string | null;
            tag?: string | null;
            owner?: string | null;
          }>;
          applications?: LinkApplicationItem[];
        };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

        if (Array.isArray(data.applications)) {
          applicationsCache = data.applications;
        }
        if (state.links && Array.isArray(data.links)) {
          state.links.links = data.links.map((l) => ({
            id: l.id,
            name: l.name,
            url: l.url,
            description: l.description,
            avatar: l.avatar ?? undefined,
            tag: l.tag ?? undefined,
            owner: l.owner ?? undefined,
          }));
        } else if (state.links) {
          const exists = state.links.links.some(
            (l) => l.url.toLowerCase() === app.url.toLowerCase()
          );
          if (!exists) {
            state.links.links.push({
              id: `peer-${app.id}`,
              name: app.name,
              url: app.url,
              description: app.description,
              avatar: (app.avatar ?? '').trim() || app.name.slice(0, 1) || '友',
              tag: app.tag || '独立博客 · 友链',
              owner: app.owner.startsWith('站长') ? app.owner : `站长：${app.owner} · 持续更新`,
            });
            markDirty();
          }
        }
        rerender();
        toast(`已将「${app.name}」一键添加进友链列表！`);
      } catch (err) {
        btn.disabled = false;
        toast(`操作失败：${err instanceof Error ? err.message : '网络错误'}`, true);
      }
    });
  });

  host.querySelectorAll<HTMLButtonElement>('[data-app-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.appDel);
      if (!id) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/links/applications/${id}`, {
          method: 'DELETE',
          headers: { 'X-CSRF-Token': state.csrf ?? '' },
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          applications?: LinkApplicationItem[];
        };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        applicationsCache = Array.isArray(data.applications)
          ? data.applications
          : applicationsCache.filter((a) => a.id !== id);
        renderApplicationsBox();
        toast('已移除该条友链申请记录');
      } catch (err) {
        btn.disabled = false;
        toast(`删除失败：${err instanceof Error ? err.message : '网络错误'}`, true);
      }
    });
  });
}

export function renderLinksView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview || !state.links) return;
  const links = state.links.links;

  if (!applicationsLoaded && !applicationsLoading) {
    void fetchApplications(true);
  }

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">PEERS // 04</span>
          <span>CONNECTED PEERS DIRECTORY // 邻人独立博客友链矩阵管理</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">${links.length} NODES</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-head-top-row">
          <div>
            <div class="st-kicker">FRIENDS &amp; PEERS // src/content/links.json</div>
            <h2>已收录 ${links.length} 个独立站点节点</h2>
          </div>
          <div class="st-head-btns">
            <button type="button" class="st-btn st-btn--primary" id="st-add-link">＋ 新增友链节点</button>
          </div>
        </div>
      </div>

      <div id="st-link-applications-host"></div>

      <div class="st-links-cards-editor">
        ${links
          .map((l, i) => {
            const avatarChar = (l.avatar ?? '').trim() || (l.name ?? '').trim().slice(0, 1) || '友';
            return `
            <div class="st-section-box st-peer-edit-card" id="st-link-card-${i}">
              <div class="st-section-head">
                <div style="display:flex;align-items:center;gap:0.55rem;">
                  <span class="st-peer-avatar-badge" data-avatar-preview="${i}">${esc(avatarChar)}</span>
                  <span>NODE #${String(i + 1).padStart(2, '0')} // ${esc(l.name || '未命名站点')}</span>
                </div>
                <button type="button" class="stage-mini-btn st-btn--danger" data-del="${i}">删除节点</button>
              </div>

              <div class="st-grid-3">
                <div class="st-field">
                  <label>站点名称</label>
                  <div><input class="st-input" data-k="name" data-i="${i}" value="${esc(l.name)}" placeholder="如：林间拾遗" /></div>
                </div>
                <div class="st-field">
                  <label>单字徽章</label>
                  <div><input class="st-input" data-k="avatar" data-i="${i}" value="${esc(l.avatar ?? avatarChar)}" placeholder="默认取站名首字，如：林" /></div>
                </div>
                <div class="st-field">
                  <label>领域标签</label>
                  <div><input class="st-input" data-k="tag" data-i="${i}" value="${esc(l.tag ?? '')}" placeholder="如：图形学 · 随笔" /></div>
                </div>
                <div class="st-field">
                  <label>站点网址</label>
                  <div><input class="st-input" data-k="url" data-i="${i}" value="${esc(l.url)}" placeholder="https://..." /></div>
                </div>
                <div class="st-field">
                  <label>站长与状态</label>
                  <div><input class="st-input" data-k="owner" data-i="${i}" value="${esc(l.owner ?? '')}" placeholder="如：站长：木林 · 持续更新" /></div>
                </div>
                <div class="st-field">
                  <label>节点 ID</label>
                  <div><input class="st-input" data-k="id" data-i="${i}" value="${esc(l.id)}" placeholder="英文标识，如 linjian" /></div>
                </div>
              </div>

              <div class="st-field" style="margin-top:0.6rem;">
                <label>站点简介</label>
                <div>
                  <textarea class="st-textarea" data-k="description" data-i="${i}" rows="2" placeholder="一句话介绍该博客的内容方向与特色">${esc(
                    l.description
                  )}</textarea>
                </div>
              </div>
            </div>`;
          })
          .join('')}
      </div>
    </div>`;

  renderApplicationsBox();

  edit.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-k]').forEach((input) =>
    input.addEventListener('input', () => {
      const i = Number(input.dataset.i);
      const k = input.dataset.k as 'name' | 'avatar' | 'tag' | 'url' | 'owner' | 'description' | 'id';
      const item = links[i];
      if (item) {
        item[k] = input.value;
        if (k === 'name' || k === 'avatar') {
          const av = edit.querySelector(`[data-avatar-preview="${i}"]`);
          if (av) av.textContent = (item.avatar || item.name || '友').slice(0, 1);
        }
      }
      markDirty();
      renderLinksPreview();
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      links.splice(Number(b.dataset.del), 1);
      markDirty();
      rerender();
      toast('已移除友链节点');
    })
  );

  $('#st-add-link')?.addEventListener('click', () => {
    links.push({
      id: `peer-${Date.now().toString(36).slice(-4)}`,
      name: '新友链站点',
      avatar: '新',
      tag: '独立博客 · 随笔',
      url: 'https://',
      owner: '站长：未知 · 持续更新',
      description: '',
    });
    state.selected = String(links.length - 1);
    markDirty();
    rerender();
    toast('已新增一条友链节点');
  });

  renderLinksPreview();
}

function renderLinksPreview(): void {
  const box = $('#st-preview');
  if (!box) return;
  const links = state.links?.links ?? [];
  box.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-head">
        <span>PEER MATRIX PREVIEW // 友链卡片展示预览</span>
      </div>
      <div class="st-hint" style="margin-bottom:0.65rem;">
        1:1 对应主页第 04 屏（<code>04 · LINKS</code>）与 <code>/links/</code> 子页的邻人卡片样式。关于「我」与「本站互换名片」可在「站点设置」中修改。
      </div>
      <div class="st-peer-preview-list">
        ${links
          .map((l) => {
            const av = (l.avatar ?? '').trim() || (l.name ?? '').trim().slice(0, 1) || '友';
            return `
            <article class="rail-blueprint-card st-peer-mock-card">
              <div class="st-peer-mock-head">
                <span class="st-peer-avatar-badge">${esc(av)}</span>
                <div style="min-width:0;flex:1;">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;">
                    <strong style="font-family:var(--kai);font-size:1.25rem;font-weight:400;">${esc(l.name || '（未命名）')}</strong>
                    ${l.tag ? `<span class="st-peer-tag-pill">${esc(l.tag)}</span>` : ''}
                  </div>
                  <div style="font-family:var(--mono);font-size:0.68rem;color:var(--faint);overflow:hidden;text-overflow:ellipsis;">${esc(l.url)}</div>
                </div>
              </div>
              <p style="margin:0.35rem 0;font-size:0.86rem;line-height:1.58;color:var(--muted);">${esc(l.description || '暂无描述')}</p>
              <div style="padding-top:0.35rem;border-top:1px dashed var(--rule);display:flex;justify-content:space-between;font-family:var(--mono);font-size:0.68rem;color:var(--faint);">
                <span>${esc(l.owner || '独立站点')}</span>
                <span style="color:var(--accent);">访问站点 -&gt;</span>
              </div>
            </article>`;
          })
          .join('')}
      </div>
    </div>`;
}
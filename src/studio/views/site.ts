/**
 * 站点视图 —— src/site.data.json 的 site / home 两块。
 */
import { $, esc } from '../ui';
import { state, markDirty } from '../state';

function siteDraft(): Record<string, unknown> {
  if (!state.draft.site) state.draft.site = JSON.parse(JSON.stringify(state.site?.data ?? {})) as Record<string, unknown>;
  return state.draft.site;
}

type Json = Record<string, unknown>;

export function renderSiteView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview || !state.site) return;
  const data = siteDraft();
  const site = (data.site ?? {}) as Json;
  const home = (data.home ?? {}) as Json;
  const nav = Array.isArray(site.nav) ? (site.nav as Json[]) : [];
  const intro = Array.isArray(home.intro) ? (home.intro as string[]) : [];
  const sections = Array.isArray(home.sections) ? (home.sections as Json[]) : [];
  // 「保存时自动记修订」的全局默认（缺省开）
  const studio = (data.studio ?? {}) as Json;
  const studioAuto = studio.autoUpdated !== false;

  edit.innerHTML = `
    <div class="st-head">
      <div class="st-kicker">站点与主页 · src/site.data.json</div>
      <h2>${esc(site.title ?? '')}</h2>
      <div class="st-stats">${esc(site.url ?? '')}</div>
    </div>
    <div class="st-form">
      <div class="st-field"><label>站点地址</label><div>
        <input class="st-input" data-p="site.url" value="${esc(site.url ?? '')}" />
        <div class="st-hint">换域名时必须改这里（RSS 与站点地图靠它拼链接）</div>
      </div></div>
      <div class="st-field"><label>站名</label><div><input class="st-input" data-p="site.title" value="${esc(site.title ?? '')}" /></div></div>
      <div class="st-field"><label>副标题</label><div><input class="st-input" data-p="site.tagline" value="${esc(site.tagline ?? '')}" /></div></div>
      <div class="st-field"><label>作者</label><div><input class="st-input" data-p="site.author" value="${esc(site.author ?? '')}" /></div></div>
      <div class="st-field"><label>描述</label><div><textarea class="st-textarea" data-p="site.description" rows="2">${esc(site.description ?? '')}</textarea></div></div>

      <div class="st-field"><label>写作</label><div class="st-check">
        <input type="checkbox" id="st-auto-updated" ${studioAuto ? 'checked' : ''} />
        <span>保存文章时自动记「修订于」（盖成今天）。关掉后只有你自己填过才显示修订时间；单篇文章还能单独覆盖这一项</span>
      </div></div>

      <div class="st-field"><label>主导航</label><div>
        ${nav
          .map(
            (n, i) => `<div style="display:flex;gap:var(--space-2);margin-bottom:6px">
              <input class="st-input" data-nav="${i}.label" value="${esc(n.label ?? '')}" style="max-width:9rem" />
              <input class="st-input" data-nav="${i}.href" value="${esc(n.href ?? '')}" />
            </div>`
          )
          .join('')}
        <div class="st-hint">加一个板块：这里加一行，另外在 src/pages/ 建对应页面</div>
      </div></div>

      <div class="st-field"><label>自我介绍</label><div>
        ${intro
          .map((t, i) => `<textarea class="st-textarea" data-intro="${i}" rows="2" style="margin-bottom:6px">${esc(t)}</textarea>`)
          .join('')}
        <div class="st-hint">每个段落一项</div>
      </div></div>

      <div class="st-field"><label>子页入口</label><div>
        ${sections
          .map(
            (s, i) => `<div style="display:flex;gap:var(--space-2);margin-bottom:6px">
              <input class="st-input" data-sec="${i}.title" value="${esc(s.title ?? '')}" style="max-width:6rem" />
              <input class="st-input" data-sec="${i}.href" value="${esc(s.href ?? '')}" style="max-width:8rem" />
              <input class="st-input" data-sec="${i}.desc" value="${esc(s.desc ?? '')}" />
            </div>`
          )
          .join('')}
        <div class="st-hint">顺序即主页上的显示顺序</div>
      </div></div>
    </div>`;

  const setPath = (root: Json, path: string, value: unknown) => {
    const [k, sub] = path.split('.');
    if (!k) return;
    if (!sub) {
      root[k] = value;
      return;
    }
    const target = (root[k] ?? {}) as Json;
    target[sub] = value;
    root[k] = target;
  };

  // 复选框要单独绑：下面那个通用处理器读的是 input.value，而复选框的 value 恒为 'on'
  edit.querySelector<HTMLInputElement>('#st-auto-updated')?.addEventListener('change', (e) => {
    studio.autoUpdated = (e.target as HTMLInputElement).checked;
    data.studio = studio;
    markDirty();
  });

  edit.querySelectorAll<HTMLInputElement>('[data-p]').forEach((input) =>
    input.addEventListener('input', () => {
      setPath(data, input.dataset.p ?? '', input.value);
      markDirty();
      renderSitePreview();
    })
  );
  edit.querySelectorAll<HTMLInputElement>('[data-nav]').forEach((input) =>
    input.addEventListener('input', () => {
      const [i, k] = (input.dataset.nav ?? '').split('.');
      const item = nav[Number(i)];
      if (item && k) item[k] = input.value;
      markDirty();
      renderSitePreview();
    })
  );
  edit.querySelectorAll<HTMLTextAreaElement>('[data-intro]').forEach((input) =>
    input.addEventListener('input', () => {
      intro[Number(input.dataset.intro)] = input.value;
      home.intro = intro;
      markDirty();
      renderSitePreview();
    })
  );
  edit.querySelectorAll<HTMLInputElement>('[data-sec]').forEach((input) =>
    input.addEventListener('input', () => {
      const [i, k] = (input.dataset.sec ?? '').split('.');
      const item = sections[Number(i)];
      if (item && k) item[k] = input.value;
      markDirty();
      renderSitePreview();
    })
  );

  renderSitePreview();
}

function renderSitePreview(): void {
  const box = $('#st-preview');
  if (!box) return;
  const data = state.draft.site ?? {};
  const site = (data.site ?? {}) as Json;
  const home = (data.home ?? {}) as Json;
  const nav = Array.isArray(site.nav) ? (site.nav as Json[]) : [];
  const intro = Array.isArray(home.intro) ? (home.intro as string[]) : [];
  const sections = Array.isArray(home.sections) ? (home.sections as Json[]) : [];
  box.innerHTML = `<p class="st-note">右边是主页结构的样子。</p>
    <div class="st-preview">
      <h1 style="text-align:center;text-indent:0">${esc(site.title ?? '')}</h1>
      <p style="text-align:center;text-indent:0;color:var(--muted);font-size:var(--text-xs);letter-spacing:.2em">${esc(
        site.tagline ?? ''
      )}</p>
      <p style="text-align:center;text-indent:0;color:var(--muted);font-size:var(--text-xs)">${nav
        .map((n) => esc(n.label ?? ''))
        .join(' · ')}</p>
      <hr />
      ${intro.map((t) => `<p>${esc(t)}</p>`).join('')}
      <hr />
      ${sections
        .map(
          (s) => `<div style="text-indent:0;padding:var(--space-3) 0;border-bottom:1px solid var(--rule)">
            <div style="font-size:var(--text-md)">${esc(s.title ?? '')}</div>
            <div style="color:var(--muted);font-size:var(--text-xs)">${esc(s.desc ?? '')}</div>
          </div>`
        )
        .join('')}
    </div>`;
}
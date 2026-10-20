/**
 * 站点设置与全局定制视图（src/site.data.json）
 *
 * 分为两个子板块（由左侧列表切换）：
 *   1. `site`    —— 01 · 全局站点标识、导航栏、页脚与世界线辉光管探测仪
 *   2. `account` —— 02 · 管理员账号与密码（写 users 表，不经过站点 JSON）
 *
 * 主页流形引擎、文章右侧悬浮栏与关于我/架构志三个结构化面板由「页面」板块对应分组渲染。
 */
import { $, esc, toast } from '../ui';
import { state, markDirty, rerender } from '../state';
import { renderWidgetCardHtml, type RailWidgetCard, type RailWidgetType } from '../../utils/article-rail';

type Json = Record<string, unknown>;

export function siteDraft(): Json {
  if (!state.draft.site) {
    state.draft.site = JSON.parse(JSON.stringify(state.site?.data ?? {})) as Json;
  }
  return state.draft.site;
}

/** 站点草稿相对已加载数据有没有真实改动（「页面」板块的结构化面板也会写这份草稿）。 */
export function siteDraftDirty(): boolean {
  if (!state.draft.site) return false;
  try {
    return JSON.stringify(state.draft.site) !== JSON.stringify(state.site?.data ?? {});
  } catch {
    return true;
  }
}

export function renderSiteView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview || !state.site) return;

  const subView = state.selected || 'site';
  if (subView === 'account') {
    renderAccountSettings(edit, preview);
    return;
  }

  const data = siteDraft();
  renderGlobalIdentitySettings(edit, data);
  renderSitePreview('site', data);
}

/* --------------------------------------------------------------------------
   子视图 1：01 · 全局站点标识、主导航与页脚世界线探测仪
   -------------------------------------------------------------------------- */
function renderGlobalIdentitySettings(host: HTMLElement, data: Json): void {
  const site = (data.site ?? {}) as Json;
  const studio = (data.studio ?? {}) as Json;
  const nav = Array.isArray(site.nav) ? (site.nav as Json[]) : [];
  const dm = (site.divergenceMeter ?? { enabled: true, worldline: '1.048596' }) as Json;
  const studioAuto = studio.autoUpdated !== false;
  const cipherOn = studio.exifCipherEffect !== false;

  host.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">CONFIG // 01</span>
          <span>GLOBAL SITE IDENTITY &amp; NAVIGATION // 全局站点标识、主导航与世界线探测仪</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">src/site.data.json</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-kicker">SITE IDENTITY // 站名、签名、域名、顶栏导航与页脚彩蛋</div>
        <h2>${esc(site.title ?? '夜笙的小世界')} · 全局基础配置</h2>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>01 // BRAND &amp; SEO METADATA · 站点核心标识</span>
          <span class="st-sec-tag">GLOBAL</span>
        </div>
        <div class="st-grid-2">
          <div class="st-field">
            <label>站点名称</label>
            <div><input class="st-input" data-site="title" value="${esc(site.title ?? '')}" placeholder="夜笙的小世界" /></div>
          </div>
          <div class="st-field">
            <label>站点副标</label>
            <div><input class="st-input" data-site="tagline" value="${esc(site.tagline ?? '')}" placeholder="一个普通人的自述" /></div>
          </div>
          <div class="st-field">
            <label>站长署名</label>
            <div><input class="st-input" data-site="author" value="${esc(site.author ?? '')}" placeholder="夜笙" /></div>
          </div>
          <div class="st-field">
            <label>顶栏规格标</label>
            <div><input class="st-input" data-site="brandCoord" value="${esc(site.brandCoord ?? '96REM // ULTRAWIDE')}" placeholder="96REM // ULTRAWIDE" /></div>
          </div>
          <div class="st-field">
            <label>站点域名</label>
            <div>
              <input class="st-input" data-site="url" value="${esc(site.url ?? '')}" placeholder="https://www.yesheng.wiki" />
              <div class="st-hint">用于生成 Canonical、RSS 全文源与 Sitemap 绝对地址</div>
            </div>
          </div>
          <div class="st-field">
            <label>页脚版权</label>
            <div><input class="st-input" data-site="footerCopyright" value="${esc(site.footerCopyright ?? '© 二〇二六 夜笙 · YESHENG.WIKI')}" /></div>
          </div>
        </div>
        <div class="st-field" style="margin-top:0.65rem;">
          <label>全局描述</label>
          <div><textarea class="st-textarea" data-site="description" rows="2">${esc(site.description ?? '')}</textarea></div>
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>02 // TOPBAR NAVIGATION · 顶栏主导航菜单（00..04 编号自动对齐）</span>
          <button type="button" class="stage-mini-btn" id="st-add-nav">＋ 新增导航项</button>
        </div>
        <div class="st-kv-editor-list">
          ${nav
            .map(
              (n, i) => `
            <div class="st-kv-row">
              <span class="st-nav-idx-pill">${String(i).padStart(2, '0')}</span>
              <input class="st-input" data-nav="${i}.label" value="${esc(n.label ?? '')}" placeholder="导航名称（如：文章）" />
              <input class="st-input" data-nav="${i}.href" value="${esc(n.href ?? '')}" placeholder="路由路径（如：/posts/）" />
              <button type="button" class="stage-mini-btn st-btn--danger" data-del-nav="${i}">删除</button>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>03 // STUDIO &amp; DIVERGENCE METER · 后台自动化策略与页脚辉光管彩蛋</span>
          <span class="st-sec-tag">BEHAVIOR</span>
        </div>
        <div class="st-grid-2">
          <div class="st-field">
            <label>修订日期</label>
            <div class="st-check">
              <input type="checkbox" id="st-auto-updated" ${studioAuto ? 'checked' : ''} />
              <span>保存文章时自动将 <code>updatedDate</code> 更新为当天日期（单篇可独立覆盖）</span>
            </div>
          </div>
          <div class="st-field">
            <label>照片乱码</label>
            <div class="st-check">
              <input type="checkbox" id="st-cipher-effect" ${cipherOn ? 'checked' : ''} />
              <span>当照片 EXIF 参数未读取且未手动填写时，在用户侧启用「模糊化乱码」艺术处理</span>
            </div>
          </div>
          <div class="st-field">
            <label>辉光管开关</label>
            <div class="st-check">
              <input type="checkbox" id="st-dm-enabled" ${dm.enabled !== false ? 'checked' : ''} />
              <span>夜间黑洞模式下在页脚点亮《命运石之门》世界线变动率辉光管探测仪</span>
            </div>
          </div>
          <div class="st-field">
            <label>基准世界线</label>
            <div><input class="st-input" id="st-dm-wl" value="${esc(dm.worldline ?? '1.048596')}" placeholder="1.048596" /></div>
          </div>
        </div>
      </div>
    </div>`;

  host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-site]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.site ?? '';
      if (k) site[k] = inp.value;
      data.site = site;
      markDirty();
      renderSitePreview('site', data);
    })
  );

  host.querySelectorAll<HTMLInputElement>('[data-nav]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.nav ?? '').split('.');
      const item = nav[Number(iStr)];
      if (item && k) item[k] = inp.value;
      markDirty();
      renderSitePreview('site', data);
    })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-del-nav]').forEach((btn) =>
    btn.addEventListener('click', () => {
      nav.splice(Number(btn.dataset.delNav), 1);
      markDirty();
      rerender();
    })
  );

  $('#st-add-nav')?.addEventListener('click', () => {
    nav.push({ label: '新板块', href: '/new/' });
    markDirty();
    rerender();
  });

  $<HTMLInputElement>('#st-auto-updated')?.addEventListener('change', (e) => {
    studio.autoUpdated = (e.target as HTMLInputElement).checked;
    data.studio = studio;
    markDirty();
  });

  $<HTMLInputElement>('#st-cipher-effect')?.addEventListener('change', (e) => {
    studio.exifCipherEffect = (e.target as HTMLInputElement).checked;
    data.studio = studio;
    markDirty();
  });

  $<HTMLInputElement>('#st-dm-enabled')?.addEventListener('change', (e) => {
    dm.enabled = (e.target as HTMLInputElement).checked;
    site.divergenceMeter = dm;
    markDirty();
  });

  $<HTMLInputElement>('#st-dm-wl')?.addEventListener('input', (e) => {
    dm.worldline = (e.target as HTMLInputElement).value;
    site.divergenceMeter = dm;
    markDirty();
    renderSitePreview('site', data);
  });
}

/* --------------------------------------------------------------------------
   「页面」板块 · 主页分组的结构化小节（四象限导览卡片 + 流形画布参数）
   -------------------------------------------------------------------------- */
export function renderHomeEnginePanel(host: HTMLElement, data: Json): void {
  const home = (data.home ?? {}) as Json;
  const manifold = (home.manifold ?? {
    defaultTheme: 'light',
    particleCount: 560,
    speed: 1.0,
    snapScroll: true,
  }) as Json;
  const sections = Array.isArray(home.sections) ? (home.sections as Json[]) : [];

  host.innerHTML = `
    <div class="st-sub-kicker">QUADRANT INDEX CARDS // 首屏底部四象限导览卡片（01/POSTS — 04/LINKS）</div>
    <div class="st-kv-editor-list">
      ${sections
        .map(
          (s, i) => `
        <div class="st-kv-row st-kv-row--4">
          <input class="st-input" data-sec="${i}.title" value="${esc(s.title ?? '')}" placeholder="标题（如：文章）" />
          <input class="st-input" data-sec="${i}.meta" value="${esc(s.meta ?? '')}" placeholder="角标（留空走上方角标配置）" />
          <input class="st-input" data-sec="${i}.href" value="${esc(s.href ?? '')}" placeholder="路由（如：/posts/）" />
          <input class="st-input" data-sec="${i}.desc" value="${esc(s.desc ?? '')}" placeholder="导览说明文字" />
        </div>`
        )
        .join('')}
    </div>

    <div class="st-sub-kicker" style="margin-top:1.1rem;">MANIFOLD ENGINE // 昼夜粒子场默认参数</div>
    <div class="st-grid-2">
      <div class="st-field">
        <label>默认主题</label>
        <div>
          <select class="st-select" data-mf="defaultTheme">
            <option value="light"${manifold.defaultTheme !== 'dark' ? ' selected' : ''}>DAY // 白天 · 立体无限流形 (∞)</option>
            <option value="dark"${manifold.defaultTheme === 'dark' ? ' selected' : ''}>NIGHT // 夜间 · 卡冈图雅黑洞</option>
          </select>
        </div>
      </div>
      <div class="st-field">
        <label>粒子数量 N</label>
        <div>
          <input type="range" min="300" max="780" step="20" class="lab-slider" data-mf="particleCount" value="${Number(manifold.particleCount ?? 560)}" />
          <div class="st-hint">默认空间粒子数：<strong id="st-mf-pcount-val">${Number(manifold.particleCount ?? 560)}</strong> 粒子</div>
        </div>
      </div>
      <div class="st-field">
        <label>演化速率 ω</label>
        <div>
          <input type="range" min="0.3" max="2.2" step="0.1" class="lab-slider" data-mf="speed" value="${Number(manifold.speed ?? 1.0)}" />
          <div class="st-hint">默认角速度倍率：<strong id="st-mf-speed-val">${Number(manifold.speed ?? 1.0).toFixed(1)}x</strong></div>
        </div>
      </div>
    </div>`;

  host.querySelectorAll<HTMLInputElement>('[data-sec]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.sec ?? '').split('.');
      const item = sections[Number(iStr)];
      if (item && k) item[k] = inp.value;
      home.sections = sections;
      data.home = home;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-mf]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.mf ?? '';
      if (!k) return;
      if (k === 'particleCount' || k === 'speed') {
        manifold[k] = Number(inp.value);
        const pEl = $('#st-mf-pcount-val');
        if (pEl && k === 'particleCount') pEl.textContent = inp.value;
        const sEl = $('#st-mf-speed-val');
        if (sEl && k === 'speed') sEl.textContent = `${Number(inp.value).toFixed(1)}x`;
      } else {
        manifold[k] = inp.value;
      }
      home.manifold = manifold;
      data.home = home;
      markDirty();
    })
  );
}

/* --------------------------------------------------------------------------
   「页面」板块 · 友链分组的结构化小节（关于「我」个人档案卡 + 站点说明志）
   -------------------------------------------------------------------------- */
export function renderAuthorDossierPanel(host: HTMLElement, data: Json): void {
  const dossier = (data.authorDossier ?? {}) as Json;
  const chips = Array.isArray(dossier.chips) ? (dossier.chips as string[]) : [];
  const colophon = Array.isArray(dossier.colophon) ? (dossier.colophon as Json[]) : [];

  host.innerHTML = `
    <div class="st-sub-kicker">AUTHOR DOSSIER CARD // 关于「我」个人档案卡（同时在主页第 05 屏与 /links/ 展示）</div>
    <div class="st-grid-3">
      <div class="st-field">
        <label>单字徽章</label>
        <div><input class="st-input" data-dos="monogram" value="${esc(dossier.monogram ?? '夜')}" /></div>
      </div>
      <div class="st-field">
        <label>档案标题</label>
        <div><input class="st-input" data-dos="title" value="${esc(dossier.title ?? '关于「我」 · 夜笙')}" /></div>
      </div>
      <div class="st-field">
        <label>身份坐标</label>
        <div><input class="st-input" data-dos="subCoord" value="${esc(dossier.subCoord ?? 'AUTHOR // YESHENG · 独立记录者')}" /></div>
      </div>
    </div>
    <div class="st-field" style="margin-top:0.75rem;">
      <label>个人自述</label>
      <div><textarea class="st-textarea" data-dos="bio" rows="3">${esc(dossier.bio ?? '')}</textarea></div>
    </div>
    <div class="st-field" style="margin-top:0.75rem;">
      <label>个人标签行</label>
      <div>
        ${chips
          .map(
            (c, i) => `
          <div style="display:flex;gap:0.45rem;margin-bottom:0.45rem;">
            <input class="st-input" data-dos-chip="${i}" value="${esc(c)}" placeholder="如：坐标 · 重庆 / 远方" />
            <button type="button" class="stage-mini-btn st-btn--danger" data-dos-chip-del="${i}">删除</button>
          </div>`
          )
          .join('')}
        <button type="button" class="stage-mini-btn" id="st-add-dos-chip">＋ 新增个人标签</button>
      </div>
    </div>

    <div class="st-pages-subhead" style="margin-top:1.2rem;">
      <div class="st-sub-kicker">SITE COLOPHON // /links/ 页面底部「站点说明志」卡片</div>
      <button type="button" class="stage-mini-btn" id="st-add-colophon-card">＋ 新增说明志卡片</button>
    </div>
    <div class="st-grid-2">
      ${colophon
        .map(
          (c, i) => `
        <div class="st-colophon-edit-box">
          <div style="display:flex;gap:0.4rem;align-items:center;margin-bottom:0.4rem;">
            <input class="st-input" data-col="${i}.kicker" value="${esc(c.kicker ?? '')}" placeholder="01 // PHILOSOPHY" style="font-family:var(--mono);" />
            <button type="button" class="stage-mini-btn st-btn--danger" data-col-del="${i}">删除</button>
          </div>
          <input class="st-input" data-col="${i}.title" value="${esc(c.title ?? '')}" placeholder="卡片标题" style="margin-bottom:0.4rem;" />
          <textarea class="st-textarea" data-col="${i}.desc" rows="3" placeholder="说明正文">${esc(c.desc ?? '')}</textarea>
        </div>`
        )
        .join('')}
    </div>`;

  host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-dos]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.dos ?? '';
      if (k) dossier[k] = inp.value;
      data.authorDossier = dossier;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLInputElement>('[data-dos-chip]').forEach((inp) =>
    inp.addEventListener('input', () => {
      chips[Number(inp.dataset.dosChip)] = inp.value;
      dossier.chips = chips;
      data.authorDossier = dossier;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-dos-chip-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      chips.splice(Number(btn.dataset.dosChipDel), 1);
      dossier.chips = chips;
      data.authorDossier = dossier;
      markDirty();
      rerender();
    })
  );

  $('#st-add-dos-chip', host)?.addEventListener('click', () => {
    chips.push('新标签 · 内容');
    dossier.chips = chips;
    data.authorDossier = dossier;
    markDirty();
    rerender();
  });

  host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-col]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.col ?? '').split('.');
      const item = colophon[Number(iStr)];
      if (item && k) item[k] = inp.value;
      dossier.colophon = colophon;
      data.authorDossier = dossier;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-col-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      colophon.splice(Number(btn.dataset.colDel), 1);
      dossier.colophon = colophon;
      data.authorDossier = dossier;
      markDirty();
      rerender();
    })
  );

  $('#st-add-colophon-card', host)?.addEventListener('click', () => {
    colophon.push({
      kicker: `0${colophon.length + 1} // SECTION`,
      title: '新站点说明卡片',
      desc: '在此填写站点说明内容。',
    });
    dossier.colophon = colophon;
    data.authorDossier = dossier;
    markDirty();
    rerender();
  });
}

/* --------------------------------------------------------------------------
   「页面」板块 · 文章分组的结构化小节（全局文章悬浮窗 & 三体画布铭牌配置）
   已彻底移除特定文章专用的写死拓扑图模板，升级为高通用多类型卡片管理。
   -------------------------------------------------------------------------- */
export function renderArticleRailPanel(host: HTMLElement, data: Json): void {
  const rail = (data.articleRail ?? {}) as Json;
  const threeBody = (rail.threeBody ?? {
    eraBadge: '3D MUTUAL GRAVITY // 三体立体轨道',
    fluxReadout: '3 VOLUMETRIC SPHERES · CLICK TO PERTURB',
    defaultCaption: '3-BODY GRAVITY // CHAOTIC ORBIT',
  }) as Json;

  const docSpec = (rail.docSpec ?? {
    enabled: true,
    kicker: 'DOC SPEC // 文档速查卡',
    badge: 'BASELINE',
    showPublished: true,
    showChars: true,
    showReading: true,
    showTags: true,
    customRows: [],
  }) as Json;

  const customRows = Array.isArray(docSpec.customRows)
    ? (docSpec.customRows as Array<{ label: string; value: string }>)
    : [];

  const related = (rail.related ?? {
    enabled: true,
    kicker: 'ARCHIVE // 同系列文章切换',
    badge: '5 ENTRIES',
    maxCount: 4,
    strategy: 'latest',
  }) as Json;

  const customCards = Array.isArray(rail.customCards) ? (rail.customCards as RailWidgetCard[]) : [];

  host.innerHTML = `
    <div class="st-pages-subhead">
      <div class="st-sub-kicker">THREE-BODY CANVAS // 文章详细页右上角《三体》引力画布默认铭牌</div>
    </div>
    <div class="st-grid-3">
      <div class="st-field">
        <label>左上角纪元徽标</label>
        <div><input class="st-input" data-threebody="eraBadge" value="${esc(threeBody.eraBadge ?? '3D MUTUAL GRAVITY // 三体立体轨道')}" /></div>
      </div>
      <div class="st-field">
        <label>右上角交互提示</label>
        <div><input class="st-input" data-threebody="fluxReadout" value="${esc(threeBody.fluxReadout ?? '3 VOLUMETRIC SPHERES · CLICK TO PERTURB')}" /></div>
      </div>
      <div class="st-field">
        <label>底栏默认副标题</label>
        <div><input class="st-input" data-threebody="defaultCaption" value="${esc(threeBody.defaultCaption ?? '3-BODY GRAVITY // CHAOTIC ORBIT')}" /></div>
      </div>
    </div>

    <div class="st-pages-subhead" style="margin-top:1.15rem;">
      <div class="st-sub-kicker">DOC SPEC CARD // 全局默认「文档速查卡」配置（显示发布日、字数、时长与通用键值）</div>
      <label class="st-check" style="font-weight:400;">
        <input type="checkbox" id="st-rail-doc-on" ${docSpec.enabled !== false ? 'checked' : ''} />
        <span>默认启用此卡片</span>
      </label>
    </div>
    <div class="st-grid-2">
      <div class="st-field">
        <label>卡片顶栏标</label>
        <div><input class="st-input" data-docspec="kicker" value="${esc(docSpec.kicker ?? 'DOC SPEC // 文档速查卡')}" /></div>
      </div>
      <div class="st-field">
        <label>右侧副徽标</label>
        <div><input class="st-input" data-docspec="badge" value="${esc(docSpec.badge ?? 'BASELINE')}" /></div>
      </div>
    </div>

    <div class="st-check-row" style="margin-top:0.65rem;">
      <label class="st-check"><input type="checkbox" data-docspec-bool="showPublished" ${docSpec.showPublished !== false ? 'checked' : ''} /><span>显示 PUBLISHED（发布日期）</span></label>
      <label class="st-check"><input type="checkbox" data-docspec-bool="showChars" ${docSpec.showChars !== false ? 'checked' : ''} /><span>显示 CHARS（字数统计）</span></label>
      <label class="st-check"><input type="checkbox" data-docspec-bool="showReading" ${docSpec.showReading !== false ? 'checked' : ''} /><span>显示 READING（阅读时长）</span></label>
      <label class="st-check"><input type="checkbox" data-docspec-bool="showTags" ${docSpec.showTags !== false ? 'checked' : ''} /><span>显示 TAGS（分类标签）</span></label>
    </div>

    <div class="st-sub-kicker" style="margin-top:0.85rem;">GLOBAL EXTRA KV ROWS // 全局附加速查键值行（如作者、许可协议、版权说明）</div>
    <div class="st-kv-editor-list">
      ${customRows
        .map(
          (r, i) => `
        <div class="st-kv-row">
          <input class="st-input" data-docrow-k="${i}" value="${esc(r.label)}" placeholder="键名（如 LICENSE）" />
          <input class="st-input" data-docrow-v="${i}" value="${esc(r.value)}" placeholder="键值（如 CC BY-NC-SA 4.0）" />
          <button type="button" class="stage-mini-btn st-btn--danger" data-docrow-del="${i}">删除</button>
        </div>`
        )
        .join('')}
    </div>
    <button type="button" class="stage-mini-btn" id="st-add-docrow" style="margin-top:0.45rem;">＋ 添加全局速查键值行</button>

    <div class="st-pages-subhead" style="margin-top:1.15rem;">
      <div class="st-sub-kicker">RELATED ARCHIVE CARD // 全局「同系列文章快速切换」模块</div>
      <label class="st-check"><input type="checkbox" id="st-rel-on" ${related.enabled !== false ? 'checked' : ''} /><span>显示同系列文章列表</span></label>
    </div>
    <div class="st-grid-3">
      <div class="st-field">
        <label>卡片顶栏标</label>
        <div><input class="st-input" data-railrel="kicker" value="${esc(related.kicker ?? 'ARCHIVE // 同系列文章切换')}" /></div>
      </div>
      <div class="st-field">
        <label>右侧副徽标</label>
        <div><input class="st-input" data-railrel="badge" value="${esc(related.badge ?? '5 ENTRIES')}" /></div>
      </div>
      <div class="st-field">
        <label>展示篇数</label>
        <div><input type="number" min="1" max="8" class="st-input" data-railrel="maxCount" value="${Number(related.maxCount ?? 4)}" /></div>
      </div>
    </div>

    <div class="st-pages-subhead" style="margin-top:1.15rem;">
      <div class="st-sub-kicker">GLOBAL FLOATING CARDS // 全局自定义信息悬浮卡片（所有文章默认共享，单篇可独立覆盖）</div>
      <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
        <button type="button" class="stage-mini-btn" data-add-global-card="note">＋ 伴读便签卡</button>
        <button type="button" class="stage-mini-btn" data-add-global-card="kv">＋ 键值参数卡</button>
      </div>
    </div>
    ${
      customCards.length
        ? customCards
            .map(
              (c, i) => `
          <div class="st-prog-mod-editor" style="margin-bottom:0.75rem;">
            <div class="st-section-head" style="margin-bottom:0.5rem;">
              <label class="st-check">
                <input type="checkbox" data-cc-on="${i}" ${c.enabled !== false ? 'checked' : ''} />
                <span>全局卡片 #${i + 1}：${esc(c.kicker || '未命名伴读卡')}</span>
              </label>
              <button type="button" class="stage-mini-btn st-btn--danger" data-cc-del="${i}">删除卡片</button>
            </div>
            <div class="st-grid-2">
              <div class="st-field">
                <label>卡片顶栏标</label>
                <div><input class="st-input" data-cc="${i}.kicker" value="${esc(c.kicker ?? '')}" placeholder="READER NOTE // 伴读提示" /></div>
              </div>
              <div class="st-field">
                <label>右侧角标</label>
                <div><input class="st-input" data-cc="${i}.badge" value="${esc(c.badge ?? '')}" placeholder="TELEMETRY" /></div>
              </div>
            </div>
            <div class="st-field" style="margin-top:0.55rem;">
              <label>卡片内容</label>
              <div><textarea class="st-textarea" data-cc="${i}.content" rows="2" placeholder="输入悬浮栏伴读说明、版权提示或公告文字">${esc(
                c.content ?? ''
              )}</textarea></div>
            </div>
          </div>`
            )
            .join('')
        : '<p class="st-empty">尚未添加全局自定义悬浮卡片，可点击上方按钮新增。</p>'
    }`;

  const attachRail = (): void => {
    docSpec.customRows = customRows;
    rail.threeBody = threeBody;
    rail.docSpec = docSpec;
    rail.related = related;
    rail.customCards = customCards;
    data.articleRail = rail;
  };
  host.addEventListener('input', attachRail, { capture: true, once: true });
  host.addEventListener('change', attachRail, { capture: true, once: true });

  host.querySelectorAll<HTMLInputElement>('[data-threebody]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.threebody ?? '';
      if (k) threeBody[k] = inp.value;
      markDirty();
    })
  );

  $<HTMLInputElement>('#st-rail-doc-on', host)?.addEventListener('change', (e) => {
    docSpec.enabled = (e.target as HTMLInputElement).checked;
    markDirty();
  });

  host.querySelectorAll<HTMLInputElement>('[data-docspec]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.docspec ?? '';
      if (k) docSpec[k] = inp.value;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLInputElement>('[data-docspec-bool]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const k = inp.dataset.docspecBool ?? '';
      if (k) docSpec[k] = inp.checked;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLInputElement>('[data-docrow-k]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.docrowK);
      if (customRows[idx]) customRows[idx]!.label = inp.value;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLInputElement>('[data-docrow-v]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.docrowV);
      if (customRows[idx]) customRows[idx]!.value = inp.value;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-docrow-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      attachRail();
      customRows.splice(Number(btn.dataset.docrowDel), 1);
      markDirty();
      rerender();
    })
  );

  $('#st-add-docrow', host)?.addEventListener('click', () => {
    attachRail();
    customRows.push({ label: 'STATUS', value: 'VERIFIED' });
    markDirty();
    rerender();
  });

  $<HTMLInputElement>('#st-rel-on', host)?.addEventListener('change', (e) => {
    related.enabled = (e.target as HTMLInputElement).checked;
    markDirty();
  });
  host.querySelectorAll<HTMLInputElement>('[data-railrel]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.railrel ?? '';
      if (k) related[k] = k === 'maxCount' ? Number(inp.value) : inp.value;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-add-global-card]').forEach((btn) =>
    btn.addEventListener('click', () => {
      attachRail();
      const type = (btn.dataset.addGlobalCard ?? 'note') as RailWidgetType;
      customCards.push({
        id: `rail-card-${Date.now().toString(36).slice(-4)}`,
        enabled: true,
        kicker: type === 'kv' ? 'GLOBAL SPEC // 全局参数' : 'READER NOTE // 伴读提示',
        badge: type === 'kv' ? 'SPEC' : 'NOTE',
        type,
        content: '在此输入显示在文章右侧悬浮栏中的自定义伴读信息。',
        items: type === 'kv' ? [{ label: '項目', value: '说明' }] : [],
      });
      markDirty();
      rerender();
      toast('已新增一张全局右侧悬浮卡片');
    })
  );

  host.querySelectorAll<HTMLInputElement>('[data-cc-on]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.ccOn);
      if (customCards[idx]) customCards[idx]!.enabled = inp.checked;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-cc]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.cc ?? '').split('.');
      const item = customCards[Number(iStr)] as unknown as Record<string, unknown> | undefined;
      if (item && k) item[k] = inp.value;
      markDirty();
    })
  );

  host.querySelectorAll<HTMLButtonElement>('[data-cc-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      attachRail();
      customCards.splice(Number(btn.dataset.ccDel), 1);
      markDirty();
      rerender();
      toast('已删除全局自定义悬浮卡片');
    })
  );
}

/* --------------------------------------------------------------------------
   账户安全与右栏站点预览
   -------------------------------------------------------------------------- */
function renderAccountSettings(host: HTMLElement, preview: HTMLElement): void {
  const current = state.user || 'admin';

  host.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">SECURITY // 02</span>
          <span>ADMIN ACCOUNT &amp; PASSWORD // 管理员账号与登录密码</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">users · SQLite</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-kicker">CREDENTIALS // 只写服务器数据库，不经过站点 JSON 或 GitHub</div>
        <h2>修改后台账号与密码</h2>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>01 // CURRENT CREDENTIALS · 验证当前身份</span>
          <span class="st-sec-tag">REQUIRED</span>
        </div>
        <div class="st-grid-2">
          <div class="st-field">
            <label>当前账号</label>
            <div><input class="st-input" value="${esc(current)}" disabled /></div>
          </div>
          <div class="st-field">
            <label>当前密码（必填）</label>
            <div><input class="st-input" id="st-acct-current" type="password" autocomplete="current-password" placeholder="输入当前登录密码..." /></div>
          </div>
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>02 // NEW CREDENTIALS · 新账号 / 新密码</span>
          <span class="st-sec-tag">OPTIONAL</span>
        </div>
        <div class="st-grid-2">
          <div class="st-field">
            <label>新账号</label>
            <div><input class="st-input" id="st-acct-username" value="${esc(current)}" autocomplete="username" spellcheck="false" /></div>
          </div>
          <div class="st-field">
            <label>新密码（留空表示不改）</label>
            <div><input class="st-input" id="st-acct-new" type="password" autocomplete="new-password" placeholder="至少 8 位..." /></div>
          </div>
          <div class="st-field">
            <label>确认新密码</label>
            <div><input class="st-input" id="st-acct-confirm" type="password" autocomplete="new-password" placeholder="再输入一次..." /></div>
          </div>
        </div>
        <div class="st-hint" style="margin-top:0.7rem;">
          账号 3–32 位中英文、数字或 <code>._-</code>；密码至少 8 位。改密后其他设备/浏览器的登录会失效，当前会话保留。
        </div>
      </div>

      <div class="st-head-btns" style="margin-top:0.2rem;">
        <button type="button" class="st-btn st-btn--primary" id="st-acct-save">更新账户</button>
      </div>
      <p class="st-hint" id="st-acct-msg" role="status" aria-live="polite"></p>
    </div>`;

  preview.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-head"><span>SECURITY // 账户与安全</span></div>
      <div class="st-hint" style="margin-bottom:0.75rem;">
        这里修改的是服务器 <code>users</code> 表里的管理员凭据，不写 <code>site.data.json</code>，
        也不会产生 Git commit。
      </div>
      <div class="st-section-box">
        <div class="st-section-head">
          <span>SESSION // 当前会话</span>
          <span class="st-sec-tag">HTTPONLY</span>
        </div>
        <div class="st-field">
          <label>登录账号</label>
          <div><strong>${esc(current)}</strong></div>
        </div>
        <div class="st-field">
          <label>密码算法</label>
          <div><strong>scrypt (N=16384)</strong></div>
        </div>
        <div class="st-field">
          <label>会话</label>
          <div><strong>HttpOnly Cookie · 7 天</strong></div>
        </div>
      </div>
      <div class="st-hint">
        改密会删除其他设备上的旧会话；当前浏览器继续有效，不需要重新登录。
      </div>
    </div>`;

  const save = async () => {
    const msg = $('#st-acct-msg');
    const btn = $<HTMLButtonElement>('#st-acct-save');
    const setMsg = (text: string, error = false) => {
      if (!msg) return;
      msg.textContent = text;
      msg.style.color = error ? 'var(--accent)' : 'var(--pine)';
    };

    if (!state.csrf) {
      setMsg('会话已失效，请重新登录后再试', true);
      return;
    }

    const currentPassword = $<HTMLInputElement>('#st-acct-current')?.value ?? '';
    const username = ($<HTMLInputElement>('#st-acct-username')?.value ?? '').trim();
    const newPassword = $<HTMLInputElement>('#st-acct-new')?.value ?? '';
    const confirm = $<HTMLInputElement>('#st-acct-confirm')?.value ?? '';

    if (!currentPassword) {
      setMsg('请输入当前密码', true);
      return;
    }
    if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) {
      setMsg('账号需为 3–32 位中英文、数字或 ._-', true);
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setMsg('新密码至少 8 位', true);
      return;
    }
    if (newPassword !== confirm) {
      setMsg('两次输入的新密码不一致', true);
      return;
    }
    if (username === state.user && !newPassword) {
      setMsg('账号和密码都没有变化', true);
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = '更新中…';
    }
    setMsg('');

    try {
      const res = await fetch('/api/auth/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': state.csrf,
        },
        body: JSON.stringify({ currentPassword, username, newPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { username: string };
        passwordChanged?: boolean;
      };
      if (!res.ok) {
        setMsg(data.error ?? '更新失败，请稍后重试', true);
        return;
      }
      state.user = data.user?.username ?? username;
      toast(data.passwordChanged ? '账号与密码已更新 · 其他设备登录已失效' : '账号已更新');
      rerender();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : '网络错误，更新失败', true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '更新账户';
      }
    }
  };

  $('#st-acct-save')?.addEventListener('click', () => void save());
  for (const sel of ['#st-acct-current', '#st-acct-new', '#st-acct-confirm', '#st-acct-username']) {
    $<HTMLInputElement>(sel)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        void save();
      }
    });
  }
}

function renderSitePreview(subView: string, data: Json): void {
  const box = $('#st-preview');
  if (!box) return;

  if (subView === 'rail') {
    const rail = (data.articleRail ?? {}) as Json;
    const docSpec = (rail.docSpec ?? {}) as Json;
    const related = (rail.related ?? {}) as Json;
    const customCards = Array.isArray(rail.customCards) ? (rail.customCards as RailWidgetCard[]) : [];
    const customRows = Array.isArray(docSpec.customRows)
      ? (docSpec.customRows as Array<{ label: string; value: string }>)
      : [];

    box.innerHTML = `
      <div class="st-col-inner">
        <div class="st-dock-head">
          <span>FLOATING RAIL PREVIEW // 文章右侧悬浮栏实时预览</span>
        </div>
        <div class="st-rail-preview-wrap">
          ${
            docSpec.enabled !== false
              ? `<div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
                  <div class="rail-card-kicker">
                    <span>${esc(docSpec.kicker ?? 'DOC SPEC // 文档速查卡')}</span>
                    <span>${esc(docSpec.badge ?? 'BASELINE')}</span>
                  </div>
                  <ul class="rail-kv-list">
                    ${docSpec.showPublished !== false ? `<li><span>PUBLISHED</span><strong>二〇二六年三月十三日</strong></li>` : ''}
                    ${docSpec.showChars !== false ? `<li><span>CHARS</span><strong>2,400 字</strong></li>` : ''}
                    ${docSpec.showReading !== false ? `<li><span>READING</span><strong>约 6 分钟</strong></li>` : ''}
                    ${docSpec.showTags !== false ? `<li><span>TAGS</span><strong>技术 · 随笔</strong></li>` : ''}
                    ${customRows.map((r) => `<li><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></li>`).join('')}
                  </ul>
                </div>`
              : ''
          }
          ${customCards.map((c) => renderWidgetCardHtml(c, true)).join('')}
          ${
            related.enabled !== false
              ? `<div class="rail-blueprint-card">
                  <div class="rail-card-kicker">
                    <span>${esc(related.kicker ?? 'ARCHIVE // 同系列文章切换')}</span>
                    <span>${esc(related.badge ?? '5 ENTRIES')}</span>
                  </div>
                  <ul class="rail-related-list">
                    ${state.posts
                      .slice(0, Number(related.maxCount ?? 4))
                      .map(
                        (p, idx) => `
                        <li>
                          <div class="rail-rel-mock">
                            <span class="r-idx">ENTRY #0${idx + 1}</span>
                            <span class="r-tit">${esc(p.parsed.data.title ?? p.id)}</span>
                          </div>
                        </li>`
                      )
                      .join('')}
                  </ul>
                </div>`
              : ''
          }
        </div>
      </div>`;
    return;
  }

  const site = (data.site ?? {}) as Json;
  const home = (data.home ?? {}) as Json;
  const dossier = (data.authorDossier ?? {}) as Json;
  const nav = Array.isArray(site.nav) ? (site.nav as Json[]) : [];
  const intro = Array.isArray(home.intro) ? (home.intro as string[]) : [];
  const sections = Array.isArray(home.sections) ? (home.sections as Json[]) : [];
  const chips = Array.isArray(dossier.chips) ? (dossier.chips as string[]) : [];

  box.innerHTML = `
    <div class="st-col-inner">
      <div class="st-dock-head">
        <span>SITE BLUEPRINT PREVIEW // 站点与主页象限预览</span>
      </div>
      <div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
        <div class="rail-card-kicker">
          <span>${esc(home.originBadge ?? 'ORIGIN (0, 0, L3)')}</span>
          <span>${esc(site.brandCoord ?? '96REM // ULTRAWIDE')}</span>
        </div>
        <h3 style="margin:0.2rem 0;font-family:var(--kai);font-size:1.5rem;font-weight:400;">${esc(site.title ?? '')}</h3>
        <div style="font-size:0.86rem;color:var(--muted);margin-bottom:0.45rem;">${esc(site.tagline ?? '')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.35rem;padding-bottom:0.5rem;border-bottom:1px solid var(--rule);">
          ${nav
            .map(
              (n, i) =>
                `<span class="st-peer-tag-pill">${String(i).padStart(2, '0')} ${esc(n.label ?? '')}</span>`
            )
            .join('')}
        </div>
        <div style="margin-top:0.5rem;font-size:0.86rem;line-height:1.65;color:var(--ink);">
          ${intro.map((t) => `<p style="margin:0 0 0.4rem;text-indent:2em;">${esc(t)}</p>`).join('')}
        </div>
      </div>

      <div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
        <div class="rail-card-kicker">
          <span>QUADRANT INDEX // 四象限入口</span>
          <span>${sections.length} CELLS</span>
        </div>
        <ul class="rail-kv-list">
          ${sections
            .map(
              (s, i) =>
                `<li><span>0${i + 1} · ${esc(s.title ?? '')} (${esc(s.meta ?? '')})</span><strong>${esc(s.href ?? '')}</strong></li>`
            )
            .join('')}
        </ul>
      </div>

      <div class="rail-blueprint-card">
        <div class="rail-card-kicker">
          <span>${esc(dossier.subCoord ?? 'AUTHOR // YESHENG')}</span>
          <span>ABOUT ME</span>
        </div>
        <strong style="font-family:var(--kai);font-size:1.2rem;font-weight:400;">${esc(dossier.title ?? '')}</strong>
        <p style="margin:0.3rem 0;font-size:0.82rem;line-height:1.58;color:var(--muted);">${esc(dossier.bio ?? '')}</p>
        <div style="display:flex;flex-wrap:wrap;gap:0.3rem;">
          ${chips.map((c) => `<span class="st-peer-tag-pill">${esc(c)}</span>`).join('')}
        </div>
      </div>
    </div>`;
}
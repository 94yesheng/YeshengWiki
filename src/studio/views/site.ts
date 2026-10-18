/**
 * 站点设置与全局定制视图（src/site.data.json）
 *
 * 分为四大子板块（由左侧列表切换）：
 *   1. `site`    —— 01 · 全局站点标识、导航栏、页脚与世界线辉光管探测仪
 *   2. `home`    —— 02 · 主页五屏文案、流形方程、粒子场参数与四象限入口
 *   3. `dossier` —— 03 · 关于「我」个人档案、友链互换名片与站点说明志 (Site Colophon)
 *   4. `rail`    —— 04 · 文章详细页右侧悬浮栏（.article-RightRail-q）全局定制与伴读卡片管理
 *   5. `account` —— 05 · 管理员账号与密码（写 users 表，不经过站点 JSON）
 */
import { $, esc, toast } from '../ui';
import { state, markDirty, rerender } from '../state';

type Json = Record<string, unknown>;

export function siteDraft(): Json {
  if (!state.draft.site) {
    state.draft.site = JSON.parse(JSON.stringify(state.site?.data ?? {})) as Json;
  }
  return state.draft.site;
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

  if (subView === 'rail') {
    renderArticleRailSettings(edit, data);
  } else if (subView === 'home') {
    renderHomeEngineSettings(edit, data);
  } else if (subView === 'dossier') {
    renderAuthorDossierSettings(edit, data);
  } else {
    renderGlobalIdentitySettings(edit, data);
  }

  renderSitePreview(subView, data);
}

/* --------------------------------------------------------------------------
   子视图 1：01 · 全局站点标识、主导航与页脚世界线探测仪
   -------------------------------------------------------------------------- */
function renderGlobalIdentitySettings(edit: HTMLElement, data: Json): void {
  const site = (data.site ?? {}) as Json;
  const studio = (data.studio ?? {}) as Json;
  const nav = Array.isArray(site.nav) ? (site.nav as Json[]) : [];
  const dm = (site.divergenceMeter ?? { enabled: true, worldline: '1.048596' }) as Json;
  const studioAuto = studio.autoUpdated !== false;
  const cipherOn = studio.exifCipherEffect !== false;

  edit.innerHTML = `
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

  edit.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-site]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.site ?? '';
      if (k) site[k] = inp.value;
      data.site = site;
      markDirty();
      renderSitePreview('site', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-nav]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.nav ?? '').split('.');
      const item = nav[Number(iStr)];
      if (item && k) item[k] = inp.value;
      markDirty();
      renderSitePreview('site', data);
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-del-nav]').forEach((btn) =>
    btn.addEventListener('click', () => {
      nav.splice(Number(btn.dataset.delNav), 1);
      markDirty();
      renderSiteView();
    })
  );

  $('#st-add-nav')?.addEventListener('click', () => {
    nav.push({ label: '新板块', href: '/new/' });
    markDirty();
    renderSiteView();
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
   子视图 2：02 · 主页五屏文案、流形方程与粒子场参数
   -------------------------------------------------------------------------- */
function renderHomeEngineSettings(edit: HTMLElement, data: Json): void {
  const home = (data.home ?? {}) as Json;
  const manifold = (home.manifold ?? {
    defaultTheme: 'light',
    particleCount: 560,
    speed: 1.0,
    snapScroll: true,
    loaderText: 'INFINITY MANIFOLD // 正在展开立体无限流形',
  }) as Json;
  const intro = Array.isArray(home.intro) ? (home.intro as string[]) : [];
  const sections = Array.isArray(home.sections) ? (home.sections as Json[]) : [];

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">CONFIG // 02</span>
          <span>HOME 5-SCREENS &amp; MANIFOLD ENGINE // 主页首屏、流形粒子场与四象限导览</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">SEC 00 — SEC 04</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-kicker">HOME BLUEPRINT // 对应主页首屏 (hero.html) 与昼夜粒子引擎参数</div>
        <h2>主页首屏文案与立体流形控制台参数</h2>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>01 // HERO TELEMETRY &amp; EQUATION · 首屏顶栏、坐标原点与伯努利双纽线方程</span>
          <span class="st-sec-tag">SEC 00 · HERO</span>
        </div>
        <div class="st-grid-2">
          <div class="st-field">
            <label>原点坐标标</label>
            <div><input class="st-input" data-home="originBadge" value="${esc(home.originBadge ?? 'ORIGIN (0, 0, L3)')}" /></div>
          </div>
          <div class="st-field">
            <label>顶栏左铭牌</label>
            <div><input class="st-input" data-home="topbarTag" value="${esc(home.topbarTag ?? 'DAYLIGHT INFINITY // 纯净暖色流形与无尾迹纯粒子场')}" /></div>
          </div>
        </div>
        <div class="st-field" style="margin-top:0.6rem;">
          <label>顶栏中描述</label>
          <div><input class="st-input" data-home="coordText" value="${esc(home.coordText ?? 'SPATIAL LEMNISCATE · 自然聚落星团交织的纯粒子立体无限环（零线段干扰）')}" /></div>
        </div>
        <div class="st-field" style="margin-top:0.6rem;">
          <label>流形方程式</label>
          <div><input class="st-input" data-home="equation" value="${esc(home.equation ?? 'L3 : x = a·cos(t)/(1+sin²t), y = b·sin(t)cos(t)/(1+sin²t), z = c·sin(t)')}" /></div>
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>02 // HERO INTRO PARAGRAPHS · 首屏自我介绍段落（每段自动首行缩进两字符）</span>
          <button type="button" class="stage-mini-btn" id="st-add-intro">＋ 新增段落</button>
        </div>
        ${intro
          .map(
            (t, i) => `
          <div style="display:flex;gap:0.45rem;margin-bottom:0.5rem;align-items:flex-start;">
            <textarea class="st-textarea" data-intro="${i}" rows="2">${esc(t)}</textarea>
            <button type="button" class="stage-mini-btn st-btn--danger" data-del-intro="${i}">删除</button>
          </div>`
          )
          .join('')}
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>03 // QUADRANT INDEX CARDS · 首屏底部四象限导览卡片（01/POSTS — 04/LINKS）</span>
          <span class="st-sec-tag">4 QUADRANTS</span>
        </div>
        <div class="st-kv-editor-list">
          ${sections
            .map(
              (s, i) => `
            <div class="st-kv-row st-kv-row--4">
              <input class="st-input" data-sec="${i}.title" value="${esc(s.title ?? '')}" placeholder="标题（如：文章）" />
              <input class="st-input" data-sec="${i}.meta" value="${esc(s.meta ?? '')}" placeholder="角标（如：5 篇 / 最新组）" />
              <input class="st-input" data-sec="${i}.href" value="${esc(s.href ?? '')}" placeholder="路由（如：/posts/）" />
              <input class="st-input" data-sec="${i}.desc" value="${esc(s.desc ?? '')}" placeholder="导览说明文字" />
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>04 // MANIFOLD &amp; LOADER ENGINE · 昼夜粒子场默认参数与开屏动画</span>
          <span class="st-sec-tag">CANVAS 3D</span>
        </div>
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
            <label>开屏文案</label>
            <div><input class="st-input" data-mf="loaderText" value="${esc(manifold.loaderText ?? 'INFINITY MANIFOLD // 正在展开立体无限流形')}" /></div>
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
        </div>
      </div>
    </div>`;

  edit.querySelectorAll<HTMLInputElement>('[data-home]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.home ?? '';
      if (k) home[k] = inp.value;
      data.home = home;
      markDirty();
      renderSitePreview('home', data);
    })
  );

  edit.querySelectorAll<HTMLTextAreaElement>('[data-intro]').forEach((inp) =>
    inp.addEventListener('input', () => {
      intro[Number(inp.dataset.intro)] = inp.value;
      home.intro = intro;
      data.home = home;
      markDirty();
      renderSitePreview('home', data);
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-del-intro]').forEach((btn) =>
    btn.addEventListener('click', () => {
      intro.splice(Number(btn.dataset.delIntro), 1);
      home.intro = intro;
      markDirty();
      renderSiteView();
    })
  );

  $('#st-add-intro')?.addEventListener('click', () => {
    intro.push('新的一段自我介绍文字。');
    home.intro = intro;
    markDirty();
    renderSiteView();
  });

  edit.querySelectorAll<HTMLInputElement>('[data-sec]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.sec ?? '').split('.');
      const item = sections[Number(iStr)];
      if (item && k) item[k] = inp.value;
      markDirty();
      renderSitePreview('home', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-mf]').forEach((inp) =>
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
      renderSitePreview('home', data);
    })
  );
}

/* --------------------------------------------------------------------------
   子视图 3：03 · 关于「我」个人档案、友链互换名片与站点说明志
   -------------------------------------------------------------------------- */
function renderAuthorDossierSettings(edit: HTMLElement, data: Json): void {
  const dossier = (data.authorDossier ?? {}) as Json;
  const chips = Array.isArray(dossier.chips) ? (dossier.chips as string[]) : [];
  const colophon = Array.isArray(dossier.colophon) ? (dossier.colophon as Json[]) : [];

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">CONFIG // 03</span>
          <span>AUTHOR DOSSIER &amp; SITE COLOPHON // 关于「我」、友链互换名片与建站说明志</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">SEC 04 &amp; /links/</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-kicker">AUTHOR &amp; COLOPHON // 对应主页第 04 屏左栏与 /links/ 下半部分站点说明志</div>
        <h2>关于「我」自述档案与站点架构志</h2>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>01 // AUTHOR DOSSIER CARD · 关于「我」个人档案卡</span>
          <span class="st-sec-tag">ABOUT ME</span>
        </div>
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
        <div class="st-field" style="margin-top:0.6rem;">
          <label>个人自述</label>
          <div><textarea class="st-textarea" data-dos="bio" rows="3">${esc(dossier.bio ?? '')}</textarea></div>
        </div>
        <div class="st-field" style="margin-top:0.6rem;">
          <label>个人标签行</label>
          <div>
            ${chips
              .map(
                (c, i) => `<input class="st-input" data-dos-chip="${i}" value="${esc(c)}" style="margin-bottom:0.4rem;" placeholder="如：坐标 · 重庆 / 远方" />`
              )
              .join('')}
          </div>
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>02 // SITE EXCHANGE CARD · 友链互换名片说明</span>
          <span class="st-sec-tag">PROTOCOL</span>
        </div>
        <div class="st-field">
          <label>名片标题</label>
          <div><input class="st-input" data-dos="siteCardTitle" value="${esc(dossier.siteCardTitle ?? '关于「站点」 · 友链互换名片')}" /></div>
        </div>
        <div class="st-field" style="margin-top:0.6rem;">
          <label>互换导言</label>
          <div><textarea class="st-textarea" data-dos="siteCardDesc" rows="2">${esc(dossier.siteCardDesc ?? '')}</textarea></div>
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-section-head">
          <span>03 // SITE COLOPHON · /links/ 页面底部四象限「站点说明志」卡片</span>
          <span class="st-sec-tag">4 CARDS</span>
        </div>
        <div class="st-grid-2">
          ${colophon
            .map(
              (c, i) => `
            <div class="st-colophon-edit-box">
              <input class="st-input" data-col="${i}.kicker" value="${esc(c.kicker ?? '')}" placeholder="01 // PHILOSOPHY" style="margin-bottom:4px;font-family:var(--mono);font-size:0.75rem;" />
              <input class="st-input" data-col="${i}.title" value="${esc(c.title ?? '')}" placeholder="卡片标题" style="margin-bottom:4px;" />
              <textarea class="st-textarea" data-col="${i}.desc" rows="3" placeholder="说明正文">${esc(c.desc ?? '')}</textarea>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </div>`;

  edit.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-dos]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.dos ?? '';
      if (k) dossier[k] = inp.value;
      data.authorDossier = dossier;
      markDirty();
      renderSitePreview('dossier', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-dos-chip]').forEach((inp) =>
    inp.addEventListener('input', () => {
      chips[Number(inp.dataset.dosChip)] = inp.value;
      dossier.chips = chips;
      data.authorDossier = dossier;
      markDirty();
      renderSitePreview('dossier', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-col]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.col ?? '').split('.');
      const item = colophon[Number(iStr)];
      if (item && k) item[k] = inp.value;
      dossier.colophon = colophon;
      data.authorDossier = dossier;
      markDirty();
      renderSitePreview('dossier', data);
    })
  );
}

/* --------------------------------------------------------------------------
   子视图 4：04 · 文章详细页右侧悬浮栏（.article-RightRail-q）全局定制与伴读模块管理
   -------------------------------------------------------------------------- */
function renderArticleRailSettings(edit: HTMLElement, data: Json): void {
  if (!data.articleRail) data.articleRail = {};
  const rail = data.articleRail as Json;
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
  rail.docSpec = docSpec;

  const customRows = Array.isArray(docSpec.customRows)
    ? (docSpec.customRows as Array<{ label: string; value: string }>)
    : [];
  docSpec.customRows = customRows;

  const topo = (rail.topology ?? {
    enabledForMc: true,
    globalEnabled: false,
    kicker: 'TOPOLOGY // 穿透链路图解',
    badge: 'TCP : 25565',
    node1Title: 'LOCAL HOST',
    node1Sub: 'Paper :25565',
    node2Title: 'FRP RELAY',
    node2Sub: 'Public :7000',
    node3Title: 'PLAYERS',
    node3Sub: 'Clients 1..N',
    line1: 'TUNNEL: 127.0.0.1:25565 -> frps:25565',
    line2: 'STATUS: NAT BYPASSED · ZERO PUBLIC IP',
  }) as Json;
  rail.topology = topo;

  const related = (rail.related ?? {
    enabled: true,
    kicker: 'ARCHIVE // 同系列文章切换',
    badge: '5 ENTRIES',
    maxCount: 4,
    strategy: 'latest',
  }) as Json;
  rail.related = related;

  const customCards = Array.isArray(rail.customCards) ? (rail.customCards as Json[]) : [];
  rail.customCards = customCards;

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">RIGHT RAIL // 04</span>
          <span>ARTICLE FLOATING SIDEBAR CUSTOMIZATION // 文章详细页右侧悬浮伴读栏内容配置</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">.article-RightRail-q</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-head-top-row">
          <div>
            <div class="st-kicker">STICKY COMPANION RAIL // 控制所有文章页右侧悬浮栏的模块开关、文案与自定义伴读卡</div>
            <h2>文章详细页右侧悬浮栏（伴读栏）模块化定制</h2>
          </div>
          <div class="st-head-btns">
            <button type="button" class="st-btn st-btn--primary" id="st-add-rail-card">＋ 新增自定义右侧悬浮卡片</button>
          </div>
        </div>
      </div>

      <!-- 模块一：DOC SPEC 文档速查卡 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>01 // DOC SPEC CARD · 默认「文档速查卡」配置（显示发布日、字数、时长与自定义键值）</span>
          <label class="st-check" style="font-weight:400;">
            <input type="checkbox" id="st-rail-doc-on" ${docSpec.enabled !== false ? 'checked' : ''} />
            <span>启用此卡片</span>
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

        <div class="st-sub-kicker" style="margin-top:0.75rem;">GLOBAL EXTRA KV ROWS // 全局附加速查键值行（如作者、许可协议、版本号）</div>
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
      </div>

      <!-- 模块二：TOPOLOGY 拓扑链路图解卡片 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>02 // TOPOLOGY DIAGRAM CARD · 「拓扑链路图解」矢量卡默认模板</span>
          <div style="display:flex;gap:0.75rem;">
            <label class="st-check"><input type="checkbox" id="st-topo-mc" ${topo.enabledForMc !== false ? 'checked' : ''} /><span>Mc 服务器篇默认开启</span></label>
            <label class="st-check"><input type="checkbox" id="st-topo-all" ${topo.globalEnabled === true ? 'checked' : ''} /><span>全站文章默认开启</span></label>
          </div>
        </div>
        <div class="st-grid-2">
          <div class="st-field">
            <label>卡片顶栏标</label>
            <div><input class="st-input" data-railtopo="kicker" value="${esc(topo.kicker ?? 'TOPOLOGY // 穿透链路图解')}" /></div>
          </div>
          <div class="st-field">
            <label>端口/协议标</label>
            <div><input class="st-input" data-railtopo="badge" value="${esc(topo.badge ?? 'TCP : 25565')}" /></div>
          </div>
        </div>
        <div class="st-grid-3" style="margin-top:0.6rem;">
          <div>
            <label class="st-mini-label">节点 1（左）</label>
            <input class="st-input" data-railtopo="node1Title" value="${esc(topo.node1Title ?? 'LOCAL HOST')}" style="margin-bottom:4px" />
            <input class="st-input" data-railtopo="node1Sub" value="${esc(topo.node1Sub ?? 'Paper :25565')}" />
          </div>
          <div>
            <label class="st-mini-label">节点 2（中）</label>
            <input class="st-input" data-railtopo="node2Title" value="${esc(topo.node2Title ?? 'FRP RELAY')}" style="margin-bottom:4px" />
            <input class="st-input" data-railtopo="node2Sub" value="${esc(topo.node2Sub ?? 'Public :7000')}" />
          </div>
          <div>
            <label class="st-mini-label">节点 3（右）</label>
            <input class="st-input" data-railtopo="node3Title" value="${esc(topo.node3Title ?? 'PLAYERS')}" style="margin-bottom:4px" />
            <input class="st-input" data-railtopo="node3Sub" value="${esc(topo.node3Sub ?? 'Clients 1..N')}" />
          </div>
        </div>
        <div class="st-grid-2" style="margin-top:0.5rem;">
          <input class="st-input" data-railtopo="line1" value="${esc(topo.line1 ?? '')}" placeholder="底部状态行 1" />
          <input class="st-input" data-railtopo="line2" value="${esc(topo.line2 ?? '')}" placeholder="底部状态行 2" />
        </div>
      </div>

      <!-- 模块三：同系列文章切换卡 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>03 // RELATED ARCHIVE CARD · 「同系列文章快速切换」模块</span>
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
      </div>

      <!-- 模块四：自定义新增悬浮栏卡片列表 -->
      <div class="st-section-box">
        <div class="st-section-head">
          <span>04 // CUSTOM FLOATING CARDS · 自定义右侧悬浮栏卡片（公告/伴读贴士/扩展链接）</span>
          <span class="st-sec-tag">${customCards.length} CARDS</span>
        </div>
        ${
          customCards.length
            ? customCards
                .map(
                  (c, i) => `
              <div class="st-prog-mod-editor" style="margin-bottom:0.65rem;">
                <div class="st-section-head" style="margin-bottom:0.45rem;">
                  <label class="st-check">
                    <input type="checkbox" data-cc-on="${i}" ${c.enabled !== false ? 'checked' : ''} />
                    <span>卡片 #${i + 1}：${esc(c.kicker || '未命名伴读卡')}</span>
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
                <div class="st-field" style="margin-top:0.5rem;">
                  <label>卡片内容</label>
                  <div><textarea class="st-textarea" data-cc="${i}.content" rows="2" placeholder="输入悬浮栏伴读说明、版权提示或公告文字">${esc(
                    c.content ?? ''
                  )}</textarea></div>
                </div>
              </div>`
                )
                .join('')
            : '<p class="st-empty">尚未添加自定义悬浮卡片，可点击右上角「＋ 新增自定义右侧悬浮卡片」。</p>'
        }
      </div>
    </div>`;

  // 绑定 DOC SPEC
  $<HTMLInputElement>('#st-rail-doc-on')?.addEventListener('change', (e) => {
    docSpec.enabled = (e.target as HTMLInputElement).checked;
    markDirty();
    renderSitePreview('rail', data);
  });

  edit.querySelectorAll<HTMLInputElement>('[data-docspec]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.docspec ?? '';
      if (k) docSpec[k] = inp.value;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-docspec-bool]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const k = inp.dataset.docspecBool ?? '';
      if (k) docSpec[k] = inp.checked;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-docrow-k]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.docrowK);
      if (customRows[idx]) customRows[idx]!.label = inp.value;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement>('[data-docrow-v]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.docrowV);
      if (customRows[idx]) customRows[idx]!.value = inp.value;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-docrow-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      customRows.splice(Number(btn.dataset.docrowDel), 1);
      markDirty();
      renderSiteView();
    })
  );

  $('#st-add-docrow')?.addEventListener('click', () => {
    customRows.push({ label: 'STATUS', value: 'VERIFIED' });
    markDirty();
    renderSiteView();
  });

  // 绑定 TOPOLOGY
  $<HTMLInputElement>('#st-topo-mc')?.addEventListener('change', (e) => {
    topo.enabledForMc = (e.target as HTMLInputElement).checked;
    markDirty();
    renderSitePreview('rail', data);
  });
  $<HTMLInputElement>('#st-topo-all')?.addEventListener('change', (e) => {
    topo.globalEnabled = (e.target as HTMLInputElement).checked;
    markDirty();
    renderSitePreview('rail', data);
  });
  edit.querySelectorAll<HTMLInputElement>('[data-railtopo]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.railtopo ?? '';
      if (k) topo[k] = inp.value;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  // 绑定 RELATED
  $<HTMLInputElement>('#st-rel-on')?.addEventListener('change', (e) => {
    related.enabled = (e.target as HTMLInputElement).checked;
    markDirty();
    renderSitePreview('rail', data);
  });
  edit.querySelectorAll<HTMLInputElement>('[data-railrel]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const k = inp.dataset.railrel ?? '';
      if (k) related[k] = k === 'maxCount' ? Number(inp.value) : inp.value;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  // 绑定自定义卡片
  $('#st-add-rail-card')?.addEventListener('click', () => {
    customCards.push({
      id: `rail-card-${Date.now().toString(36).slice(-4)}`,
      enabled: true,
      kicker: 'CUSTOM WIDGET // 伴读便签',
      badge: 'NOTE',
      type: 'text',
      content: '在此输入显示在文章右侧悬浮栏中的自定义伴读信息。',
    });
    markDirty();
    renderSiteView();
    toast('已新增一张右侧悬浮栏伴读卡片');
  });

  edit.querySelectorAll<HTMLInputElement>('[data-cc-on]').forEach((inp) =>
    inp.addEventListener('change', () => {
      const idx = Number(inp.dataset.ccOn);
      if (customCards[idx]) customCards[idx]!.enabled = inp.checked;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  edit.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-cc]').forEach((inp) =>
    inp.addEventListener('input', () => {
      const [iStr, k] = (inp.dataset.cc ?? '').split('.');
      const item = customCards[Number(iStr)];
      if (item && k) item[k] = inp.value;
      markDirty();
      renderSitePreview('rail', data);
    })
  );

  edit.querySelectorAll<HTMLButtonElement>('[data-cc-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      customCards.splice(Number(btn.dataset.ccDel), 1);
      markDirty();
      renderSiteView();
      toast('已删除自定义悬浮栏卡片');
    })
  );
}

/* --------------------------------------------------------------------------
   右栏实时预览（根据当前选中的设置子板块动态呈现 1:1 蓝图预览）
   -------------------------------------------------------------------------- */
function renderAccountSettings(edit: HTMLElement, preview: HTMLElement): void {
  const demo = state.demoMode;
  const current = state.user || 'admin';

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">SECURITY // 05</span>
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

      ${
        demo
          ? '<div class="st-hint" style="margin-bottom:0.8rem;">当前是 UI 演示模式，账户修改不会写数据库。请退出演示并用管理员账号登录后再试。</div>'
          : ''
      }

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
        <button type="button" class="st-btn st-btn--primary" id="st-acct-save" ${demo ? 'disabled' : ''}>更新账户</button>
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

    if (demo) {
      setMsg('演示模式不能修改账户', true);
      return;
    }
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
    const topo = (rail.topology ?? {}) as Json;
    const related = (rail.related ?? {}) as Json;
    const customCards = Array.isArray(rail.customCards) ? (rail.customCards as Json[]) : [];
    const customRows = Array.isArray(docSpec.customRows)
      ? (docSpec.customRows as Array<{ label: string; value: string }>)
      : [];

    box.innerHTML = `
      <div class="st-col-inner">
        <div class="st-dock-head">
          <span>FLOATING RAIL PREVIEW // 文章右侧悬浮栏实时预览</span>
        </div>
        <div class="st-hint" style="margin-bottom:0.65rem;">
          下方实时渲染文章详细页右侧的粘性悬浮栏（<code>.article-RightRail-q &gt; .article-sidebar-sticky</code>）。
        </div>

        <div class="st-rail-preview-wrap">
          ${
            topo.enabledForMc !== false || topo.globalEnabled === true
              ? `<div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
                  <div class="rail-card-kicker">
                    <span>${esc(topo.kicker ?? 'TOPOLOGY // 穿透链路图解')}</span>
                    <span>${esc(topo.badge ?? 'TCP : 25565')}</span>
                  </div>
                  <svg viewBox="0 0 240 130" style="width:100%; height:auto; display:block;">
                    <rect x="8" y="14" width="66" height="40" rx="2" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
                    <text x="16" y="31" font-family="monospace" font-size="8.5" fill="#d97757">${esc(topo.node1Title ?? 'LOCAL HOST')}</text>
                    <text x="16" y="44" font-family="monospace" font-size="8" fill="currentColor" opacity="0.7">${esc(topo.node1Sub ?? 'Paper :25565')}</text>
                    <rect x="87" y="14" width="66" height="40" rx="2" fill="none" stroke="#d97757" stroke-width="1.3"/>
                    <text x="96" y="31" font-family="monospace" font-size="8.5" fill="#d97757">${esc(topo.node2Title ?? 'FRP RELAY')}</text>
                    <text x="96" y="44" font-family="monospace" font-size="8" fill="currentColor" opacity="0.7">${esc(topo.node2Sub ?? 'Public :7000')}</text>
                    <rect x="166" y="14" width="66" height="40" rx="2" fill="none" stroke="currentColor" stroke-opacity="0.35"/>
                    <text x="175" y="31" font-family="monospace" font-size="8.5" fill="#788c5d">${esc(topo.node3Title ?? 'PLAYERS')}</text>
                    <text x="175" y="44" font-family="monospace" font-size="8" fill="currentColor" opacity="0.7">${esc(topo.node3Sub ?? 'Clients 1..N')}</text>
                    <line x1="74" y1="34" x2="87" y2="34" stroke="#d97757" stroke-width="1.4"/>
                    <line x1="153" y1="34" x2="166" y2="34" stroke="#d97757" stroke-width="1.4"/>
                    <rect x="8" y="72" width="224" height="46" rx="2" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-dasharray="3 3"/>
                    <text x="18" y="90" font-family="monospace" font-size="8.5" fill="currentColor" opacity="0.75">${esc(topo.line1 ?? '')}</text>
                    <text x="18" y="106" font-family="monospace" font-size="8.5" fill="#d97757">${esc(topo.line2 ?? '')}</text>
                  </svg>
                </div>`
              : ''
          }

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
                    ${docSpec.showTags !== false ? `<li><span>TAGS</span><strong>技术 · 服务器</strong></li>` : ''}
                    ${customRows.map((r) => `<li><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></li>`).join('')}
                  </ul>
                </div>`
              : ''
          }

          ${customCards
            .filter((c) => c.enabled !== false)
            .map(
              (c) => `
              <div class="rail-blueprint-card" style="margin-bottom:0.65rem;">
                <div class="rail-card-kicker">
                  <span>${esc(c.kicker ?? 'CUSTOM')}</span>
                  <span>${esc(c.badge ?? 'NOTE')}</span>
                </div>
                <p style="margin:0;font-size:0.84rem;line-height:1.6;color:var(--muted);">${esc(c.content ?? '')}</p>
              </div>`
            )
            .join('')}

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
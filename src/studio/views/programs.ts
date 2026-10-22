/**
 * 03 · 程序工坊视图
 *
 * 编辑 src/site.data.json → programs：
 *   programs.console  主力引擎控制台
 *   programs.modules  机架上的实验模块
 *
 * 2026-10-18 依据 demo/studio_hud.html 的程序工坊原型重建，
 * 并按项目包里的 programs 数据结构适配。
 */
import { $, $$, esc } from '../ui';
import { markDirty, rerender, state } from '../state';

type Json = Record<string, unknown>;

interface ProgramModule {
  code: string;
  stack: string;
  title: string;
  desc: string;
  status: string;
  progress: number;
  metric: string;
  href: string;
}

interface ProgramConsole {
  kicker: string;
  title: string;
  desc: string;
  buildVersion: string;
  terminalLines: Array<{ cmd: string; out: string }>;
}

interface ProgramsData {
  console: ProgramConsole;
  modules: ProgramModule[];
}

function siteDraft(): Json {
  if (!state.draft.site) {
    state.draft.site = JSON.parse(JSON.stringify(state.site?.data ?? {})) as Json;
  }
  return state.draft.site;
}

function defaultPrograms(): ProgramsData {
  return {
    console: {
      kicker: 'CORE ENGINE // ACTIVE MODULE',
      title: 'Dual-Field & 3D Three-Body Engine · 昼夜流形与立体三体引力场',
      desc: '主页与文章页共用的零依赖数学物理渲染引擎。',
      buildVersion: 'BUILD: v6.0-3D-MANIFOLD',
      terminalLines: [
        { cmd: 'home.day_night', out: '3D Lemniscate Ribbons + Kerr Black Hole' },
        { cmd: 'article.three_body', out: 'Pure 3-Sphere 3D Mutual Gravity Trajectories' },
      ],
    },
    modules: [
      {
        code: 'MOD // 01',
        stack: 'PYTHON · GIS',
        title: 'MapToPoster · 城市经纬路网海报生成器',
        desc: '输入任意城市名称或经纬度边界框，自动拉取 OpenStreetMap 道路与水系矢量拓扑。',
        status: 'RELEASED · v1.4',
        progress: 92,
        metric: 'OSM VECTOR PIPELINE',
        href: '/posts/maptoposter/',
      },
    ],
  };
}

function emptyPrograms(): ProgramsData {
  return {
    console: {
      kicker: '',
      title: '',
      desc: '',
      buildVersion: '',
      terminalLines: [],
    },
    modules: [],
  };
}

function programsData(): ProgramsData {
  const draft = siteDraft();
  if (!draft.programs || typeof draft.programs !== 'object') {
    draft.programs = emptyPrograms();
  }
  const raw = draft.programs as Json;
  if (!raw.console || typeof raw.console !== 'object') {
    raw.console = emptyPrograms().console;
  }
  if (!Array.isArray(raw.modules)) {
    raw.modules = [];
  }
  const consoleRaw = raw.console as Json;
  const lines = Array.isArray(consoleRaw.terminalLines) ? consoleRaw.terminalLines : [];
  return {
    console: {
      kicker: String(consoleRaw.kicker ?? ''),
      title: String(consoleRaw.title ?? ''),
      desc: String(consoleRaw.desc ?? ''),
      buildVersion: String(consoleRaw.buildVersion ?? ''),
      terminalLines: lines.map((l) => {
        const o = (l ?? {}) as Json;
        return { cmd: String(o.cmd ?? ''), out: String(o.out ?? '') };
      }),
    },
    modules: (raw.modules as Json[]).map((m) => ({
      code: String(m.code ?? ''),
      stack: String(m.stack ?? ''),
      title: String(m.title ?? ''),
      desc: String(m.desc ?? ''),
      status: String(m.status ?? ''),
      progress: Number(m.progress) || 0,
      metric: String(m.metric ?? ''),
      href: String(m.href ?? ''),
    })),
  };
}

function previewHtml(p: ProgramsData): string {
  return `
    <div class="st-col-inner">
      <div class="st-dock-head"><span>/PROGRAMS/ RACK PREVIEW // 程序工坊机架实时预览</span></div>
      <div class="rail-blueprint-card">
        <div class="rail-card-kicker">
          <span>${esc(p.console.kicker)}</span>
          <span class="telemetry-accent">${esc(p.console.buildVersion)}</span>
        </div>
        <div class="st-prog-preview-title">${esc(p.console.title)}</div>
        <div class="st-prog-preview-desc">${esc(p.console.desc)}</div>
        <div class="st-terminal-mock">
          ${p.console.terminalLines
            .map(
              (l) =>
                `<div><span class="st-terminal-prompt">$</span> ${esc(l.cmd)}<br><span class="st-terminal-out">${esc(l.out)}</span></div>`
            )
            .join('')}
        </div>
      </div>
      <div style="display:grid;gap:0.65rem;margin-top:0.8rem;">
        ${p.modules
          .map(
            (m) => `
          <div class="rail-blueprint-card">
            <div class="rail-card-kicker">
              <span>${esc(m.code)} // ${esc(m.stack)}</span>
              <span class="telemetry-accent">${esc(m.status)}</span>
            </div>
            <div class="st-prog-preview-title">${esc(m.title)}</div>
            <div class="st-prog-preview-desc">${esc(m.desc)}</div>
            <div class="st-prog-preview-foot">
              <span>${esc(m.metric)}</span>
              <span class="telemetry-accent">${Math.max(0, Math.min(100, m.progress))}%</span>
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>`;
}

function wirePreview(): void {
  const box = $('#st-preview');
  if (box) box.innerHTML = previewHtml(programsData());
}

export function renderProgramsView(): void {
  const edit = $('#st-edit');
  const preview = $('#st-preview');
  if (!edit || !preview || !state.site) return;
  const p = programsData();

  edit.innerHTML = `
    <div class="st-q-card">
      <div class="q-topbar">
        <div class="q-topbar-cell">
          <span class="q-sec-badge">WORKBENCH // 03</span>
          <span>PROGRAMS &amp; ARTIFACTS RACK // 程序工坊机架模块管理（1:1 对应 /programs/ 页面）</span>
        </div>
        <div class="q-topbar-cell q-topbar-cell--right">
          <span class="telemetry-accent">${p.modules.length} MODULES</span>
        </div>
      </div>

      <div class="st-head">
        <div class="st-head-top-row">
          <div>
            <div class="st-kicker">MODULE RACK // src/site.data.json → programs</div>
            <h2>程序工坊与交互实验模块</h2>
          </div>
          <div class="st-head-btns">
            <button type="button" class="st-btn" id="st-prog-template">填入示例模板</button>
            <button type="button" class="st-btn st-btn--primary" id="st-prog-add">＋ 新增实验模块</button>
          </div>
        </div>
      </div>

      <div class="st-section-box">
        <div class="st-sub-kicker"><span>01 // CORE CONSOLE · 主力引擎控制台</span></div>
        <div class="st-grid-2">
          <div class="st-field"><label>控制台 Kicker</label><div><input class="st-input" data-console="kicker" value="${esc(p.console.kicker)}" /></div></div>
          <div class="st-field"><label>构建版本</label><div><input class="st-input" data-console="buildVersion" value="${esc(p.console.buildVersion)}" /></div></div>
        </div>
        <div class="st-field" style="margin-top:0.5rem;"><label>控制台标题</label><div><input class="st-input" data-console="title" value="${esc(p.console.title)}" /></div></div>
        <div class="st-field" style="margin-top:0.5rem;"><label>控制台说明</label><div><textarea class="st-textarea" rows="2" data-console="desc">${esc(p.console.desc)}</textarea></div></div>

        <div class="st-sub-kicker" style="margin-top:0.9rem;"><span>02 // TERMINAL LINES · 终端遥测行</span></div>
        <div class="st-links-editor-list">
          ${p.console.terminalLines
            .map(
              (l, i) => `
            <div class="st-link-card">
              <div class="st-link-card-head">
                <span class="st-exif-code">LINE #0${i + 1}</span>
                <button type="button" class="stage-mini-btn st-btn--danger" data-line-del="${i}">移除</button>
              </div>
              <div class="st-grid-2">
                <div class="st-field"><label>命令</label><div><input class="st-input" data-line="${i}.cmd" value="${esc(l.cmd)}" /></div></div>
                <div class="st-field"><label>输出</label><div><input class="st-input" data-line="${i}.out" value="${esc(l.out)}" /></div></div>
              </div>
            </div>`
            )
            .join('')}
        </div>
        <button type="button" class="st-btn" id="st-line-add" style="margin-top:0.5rem;">＋ 新增终端行</button>

        <div class="st-sub-kicker" style="margin-top:1.1rem;"><span>03 // MODULE RACK · 实验模块机架</span></div>
        <div class="st-links-editor-list">
          ${p.modules
            .map(
              (m, i) => `
            <div class="st-link-card">
              <div class="st-link-card-head">
                <span class="st-exif-code">SLOT #0${i + 1} · ${esc(m.code)}</span>
                <button type="button" class="stage-mini-btn st-btn--danger" data-prog-del="${i}">移除</button>
              </div>
              <div class="st-grid-3">
                <div class="st-field"><label>模块代号</label><div><input class="st-input" data-pk="code" data-i="${i}" value="${esc(m.code)}" /></div></div>
                <div class="st-field"><label>技术栈</label><div><input class="st-input" data-pk="stack" data-i="${i}" value="${esc(m.stack)}" /></div></div>
                <div class="st-field"><label>运行状态</label><div><input class="st-input" data-pk="status" data-i="${i}" value="${esc(m.status)}" /></div></div>
              </div>
              <div class="st-field" style="margin-top:0.5rem;"><label>模块标题</label><div><input class="st-input" data-pk="title" data-i="${i}" value="${esc(m.title)}" /></div></div>
              <div class="st-field" style="margin-top:0.5rem;"><label>模块说明</label><div><textarea class="st-textarea" rows="2" data-pk="desc" data-i="${i}">${esc(m.desc)}</textarea></div></div>
              <div class="st-grid-3" style="margin-top:0.5rem;">
                <div class="st-field"><label>进度 %</label><div><input class="st-input" type="number" min="0" max="100" data-pk="progress" data-i="${i}" value="${m.progress}" /></div></div>
                <div class="st-field"><label>指标</label><div><input class="st-input" data-pk="metric" data-i="${i}" value="${esc(m.metric)}" /></div></div>
                <div class="st-field"><label>链接</label><div><input class="st-input" data-pk="href" data-i="${i}" value="${esc(m.href)}" /></div></div>
              </div>
            </div>`
            )
            .join('')}
        </div>
      </div>
    </div>`;

  wirePreview();

  const draft = programsData();
  const commit = () => {
    siteDraft().programs = draft;
    markDirty();
  };

  $$<HTMLInputElement | HTMLTextAreaElement>('[data-console]', edit).forEach((inp) =>
    inp.addEventListener('input', () => {
      const key = inp.dataset.console as keyof ProgramConsole;
      if (key === 'terminalLines') return;
      (draft.console as unknown as Record<string, unknown>)[key] = inp.value;
      commit();
      wirePreview();
    })
  );
  $$<HTMLInputElement>('[data-line]', edit).forEach((inp) =>
    inp.addEventListener('input', () => {
      const [idxRaw, key] = (inp.dataset.line ?? '').split('.');
      const idx = Number(idxRaw);
      const line = draft.console.terminalLines[idx];
      if (!line || (key !== 'cmd' && key !== 'out')) return;
      line[key] = inp.value;
      commit();
      wirePreview();
    })
  );
  $$<HTMLInputElement | HTMLTextAreaElement>('[data-pk]', edit).forEach((inp) =>
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.i);
      const key = inp.dataset.pk as keyof ProgramModule;
      const mod = draft.modules[idx];
      if (!mod) return;
      if (key === 'progress') mod.progress = Math.max(0, Math.min(100, Number(inp.value) || 0));
      else (mod as unknown as Record<string, unknown>)[key] = inp.value;
      commit();
      wirePreview();
    })
  );

  $('#st-prog-template')?.addEventListener('click', () => {
    const tpl = defaultPrograms();
    draft.console = tpl.console;
    draft.modules = tpl.modules;
    commit();
    rerender();
  });

  $('#st-prog-add')?.addEventListener('click', () => {
    const n = draft.modules.length + 1;
    draft.modules.push({
      code: `MOD // 0${n}`,
      stack: 'TYPESCRIPT · CANVAS 2D',
      title: `新建交互实验模块 #0${n}`,
      desc: '在此填写该实验模块的核心物理模型或工具说明。',
      status: 'READY · 60FPS',
      progress: 60,
      metric: 'STATIC // 0 SERVER',
      href: '/programs/',
    });
    commit();
    rerender();
  });
  $('#st-line-add')?.addEventListener('click', () => {
    draft.console.terminalLines.push({ cmd: 'new.command', out: 'new output' });
    commit();
    rerender();
  });
  $$<HTMLButtonElement>('[data-line-del]', edit).forEach((btn) =>
    btn.addEventListener('click', () => {
      draft.console.terminalLines.splice(Number(btn.dataset.lineDel), 1);
      commit();
      rerender();
    })
  );
  $$<HTMLButtonElement>('[data-prog-del]', edit).forEach((btn) =>
    btn.addEventListener('click', () => {
      draft.modules.splice(Number(btn.dataset.progDel), 1);
      commit();
      rerender();
    })
  );
}

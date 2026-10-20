/**
 * 登录页 —— HUD 象限蓝图工作台登录门户（带双模态流形/黑洞粒子场动态背景）
 *
 * 1. 顶部与前台导航栏（.site-nav-bar）保持一致，提供返回站点主页与昼夜模式切换按钮；
 * 2. 背景搭载交互式 HTML5 Canvas 动效：
 *    · 白天模式（DAY // INFINITY MANIFOLD）：伯努利双纽线（∞）三维粒子环流 + 极坐标刻度环 + 鼠标视差微倾；
 *    · 夜间模式（NIGHT // GARGANTUA SINGULARITY）：卡冈图雅黑洞引力透镜光环 + 倾斜吸积盘粒子漩涡；
 * 3. 登录卡片采用四角准星（.q-corner）、象限遥测顶栏（.q-topbar）与克制细线分割表单。
 */
import { ApiGithub } from '../api';
import { reloadAll, state } from '../state';
import { $, esc } from '../ui';
import { isDark, toggleTheme } from '../../utils/theme';

let stopBgAnim: (() => void) | null = null;

function mountLoginCanvas(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  let rafId = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;

  interface Particle {
    t: number;
    speed: number;
    radialOffset: number;
    zOffset: number;
    size: number;
    alpha: number;
    warm: boolean;
  }

  const PARTICLE_COUNT = 220;
  const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    t: (i / PARTICLE_COUNT) * Math.PI * 2,
    speed: 0.0035 + (i % 9) * 0.00045,
    radialOffset: ((i * 37) % 100) / 100 - 0.5,
    zOffset: ((i * 53) % 100) / 100 - 0.5,
    size: 1.15 + (i % 4) * 0.55,
    alpha: 0.25 + ((i * 19) % 70) / 100,
    warm: i % 3 !== 0,
  }));

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(320, rect.width || window.innerWidth);
    height = Math.max(320, rect.height || window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const onMouseMove = (e: MouseEvent) => {
    targetX = (e.clientX / Math.max(1, width) - 0.5) * 2;
    targetY = (e.clientY / Math.max(1, height) - 0.5) * 2;
  };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onMouseMove);

  let tick = 0;

  const render = () => {
    if (!canvas.isConnected) {
      cleanup();
      return;
    }
    tick += 1;
    pointerX += (targetX - pointerX) * 0.05;
    pointerY += (targetY - pointerY) * 0.05;

    ctx.clearRect(0, 0, width, height);
    const dark = isDark();
    const cx = width * 0.5 + pointerX * 18;
    const cy = height * 0.5 + pointerY * 14;
    const scale = Math.min(width, height) * 0.34;

    // 1. 绘制极坐标背景辅助环与十字准星线
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = dark ? 'rgba(217, 119, 87, 0.11)' : 'rgba(20, 20, 19, 0.065)';
    ctx.lineWidth = 1;

    for (const rFactor of [0.55, 0.92, 1.28]) {
      ctx.beginPath();
      ctx.setLineDash([3, 6]);
      ctx.arc(0, 0, scale * rFactor, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(-width * 0.44, 0);
    ctx.lineTo(width * 0.44, 0);
    ctx.moveTo(0, -height * 0.42);
    ctx.lineTo(0, height * 0.42);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!dark) {
      // 白天模式：三维伯努利双纽线（∞ 无限流形）轨迹与粒子场
      const a = scale * 1.08;
      const tiltX = 0.28 + pointerY * 0.14;
      const tiltY = pointerX * 0.22 + Math.sin(tick * 0.006) * 0.12;

      // 双纽线主参考骨架
      ctx.beginPath();
      for (let i = 0; i <= 180; i++) {
        const theta = (i / 180) * Math.PI * 2;
        const denom = 1 + Math.sin(theta) * Math.sin(theta);
        const x0 = (a * Math.cos(theta)) / denom;
        const y0 = (a * Math.sin(theta) * Math.cos(theta)) / denom;
        const z0 = Math.sin(theta * 2) * (a * 0.16);

        const rx = x0 * Math.cos(tiltY) + z0 * Math.sin(tiltY);
        const rz = -x0 * Math.sin(tiltY) + z0 * Math.cos(tiltY);
        const ry = y0 * Math.cos(tiltX) - rz * Math.sin(tiltX);

        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(217, 119, 87, 0.22)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // 双焦点准星
      const focusDist = a * 0.68;
      for (const sign of [-1, 1]) {
        const fx = sign * focusDist * Math.cos(tiltY);
        const fy = -sign * focusDist * Math.sin(tiltY) * Math.sin(tiltX);
        ctx.beginPath();
        ctx.arc(fx, fy, 4.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(217, 119, 87, 0.45)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(fx, fy, 11, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(217, 119, 87, 0.22)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 沿双纽线流动的粒子群
      for (const p of particles) {
        p.t = (p.t + p.speed) % (Math.PI * 2);
        const denom = 1 + Math.sin(p.t) * Math.sin(p.t);
        const spread = 1 + p.radialOffset * 0.24;
        const x0 = ((a * Math.cos(p.t)) / denom) * spread;
        const y0 = ((a * Math.sin(p.t) * Math.cos(p.t)) / denom) * spread + p.radialOffset * 18;
        const z0 = Math.sin(p.t * 2) * (a * 0.2) + p.zOffset * 28;

        const rx = x0 * Math.cos(tiltY) + z0 * Math.sin(tiltY);
        const rz = -x0 * Math.sin(tiltY) + z0 * Math.cos(tiltY);
        const ry = y0 * Math.cos(tiltX) - rz * Math.sin(tiltX);
        const depth = (rz / a + 1) * 0.5;

        ctx.beginPath();
        ctx.arc(rx, ry, p.size * (0.75 + depth * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = p.warm
          ? `rgba(217, 119, 87, ${(p.alpha * (0.55 + depth * 0.5)).toFixed(3)})`
          : `rgba(20, 20, 19, ${(p.alpha * 0.45).toFixed(3)})`;
        ctx.fill();
      }
    } else {
      // 夜间模式：卡冈图雅黑洞（Gargantua）引力透镜光环与倾斜吸积盘
      const bhRadius = scale * 0.36;
      const diskRx = scale * 1.18;
      const diskRy = scale * 0.26;
      const diskAngle = -0.19 + pointerX * 0.08;

      // 引力透镜外辉光
      const glow = ctx.createRadialGradient(0, 0, bhRadius * 0.85, 0, 0, scale * 1.25);
      glow.addColorStop(0, 'rgba(217, 119, 87, 0.32)');
      glow.addColorStop(0.35, 'rgba(245, 185, 113, 0.12)');
      glow.addColorStop(1, 'rgba(18, 18, 17, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, scale * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // 上下引力透镜光子环弧线
      ctx.save();
      ctx.rotate(diskAngle);
      ctx.beginPath();
      ctx.arc(0, 0, bhRadius * 1.22, Math.PI * 1.08, Math.PI * 1.92);
      ctx.strokeStyle = 'rgba(245, 185, 113, 0.38)';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, bhRadius * 1.18, Math.PI * 0.12, Math.PI * 0.88);
      ctx.strokeStyle = 'rgba(217, 119, 87, 0.26)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      // 吸积盘椭圆轨道线
      for (const f of [0.72, 0.92, 1.12]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, diskRx * f, diskRy * f, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(217, 119, 87, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 吸积盘旋转粒子群
      for (const p of particles) {
        p.t = (p.t + p.speed * 1.35) % (Math.PI * 2);
        const rFactor = 0.52 + (p.radialOffset + 0.5) * 0.68;
        const px = Math.cos(p.t) * diskRx * rFactor;
        const py = Math.sin(p.t) * diskRy * rFactor + p.zOffset * 6;
        // 多普勒增亮：左侧朝向观测者更亮
        const doppler = 0.65 + 0.35 * -Math.cos(p.t);

        ctx.beginPath();
        ctx.arc(px, py, p.size * (0.8 + doppler * 0.4), 0, Math.PI * 2);
        ctx.fillStyle = p.warm
          ? `rgba(245, 185, 113, ${Math.min(0.9, p.alpha * doppler * 1.15).toFixed(3)})`
          : `rgba(217, 119, 87, ${Math.min(0.85, p.alpha * doppler).toFixed(3)})`;
        ctx.fill();
      }

      // 中央事件视界黑洞本体
      ctx.beginPath();
      ctx.arc(0, 0, bhRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0d0d0c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 185, 113, 0.52)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    rafId = window.requestAnimationFrame(render);
  };

  rafId = window.requestAnimationFrame(render);

  const cleanup = () => {
    window.cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMouseMove);
  };

  return cleanup;
}

export function renderUnlock(note?: string): void {
  if (stopBgAnim) {
    stopBgAnim();
    stopBgAnim = null;
  }

  const bar = $('#st-bar');
  const dark = isDark();
  if (bar) {
    bar.classList.add('site-nav-bar');
    bar.innerHTML = `
      <div class="st-bar-left nav-left-cluster">
        <a href="/" class="nav-brand" title="返回站点前台主页">
          <span class="nav-brand-mark" aria-hidden="true">
            <svg class="planar-icon planar-icon--infinity" viewBox="0 0 36 18">
              <path d="M10.5 2.2C6.7 2.2 3.7 5.2 3.7 9C3.7 12.8 6.7 15.8 10.5 15.8C15.2 15.8 20.8 2.2 25.5 2.2C29.3 2.2 32.3 5.2 32.3 9C32.3 12.8 29.3 15.8 25.5 15.8C20.8 15.8 15.2 2.2 10.5 2.2Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              <circle cx="10.5" cy="9" r="1.35" fill="currentColor"/>
              <circle cx="25.5" cy="9" r="1.35" fill="currentColor"/>
            </svg>
            <svg class="planar-icon planar-icon--blackhole" viewBox="0 0 36 18">
              <path d="M8.5 8.2C11.2 2.4 24.8 2.4 27.5 8.2" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
              <path d="M10.5 10.2C13.2 14.8 22.8 14.8 25.5 10.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.75" stroke-linecap="round"/>
              <circle cx="18" cy="9" r="4.2" fill="currentColor"/>
              <ellipse cx="18" cy="9.2" rx="14.5" ry="3.1" transform="rotate(-11 18 9.2)" fill="none" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </span>
          <span class="nav-brand-text">夜笙</span>
          <span class="nav-brand-coord">STUDIO // ACCESS</span>
        </a>
      </div>
      <div class="st-bar-right nav-right-cluster">
        <div class="nav-telemetry-pill st-meta-badge">
          <span class="nav-dot"></span>
          <span id="st-login-mode-pill">${dark ? 'GARGANTUA // 黑洞引力场' : 'MANIFOLD // 无限流形场'}</span>
        </div>
        <button type="button" class="st-btn nav-scale-btn" id="st-login-theme-btn" title="切换白天（无限流形）/ 夜间（卡冈图雅黑洞）">
          ${dark ? 'DAY // 昼' : 'NIGHT // 夜'}
        </button>
        <a href="/" class="st-btn nav-scale-btn" style="text-decoration:none;">← 返回前台</a>
      </div>`;
  }

  const main = $('#st-main');
  if (!main) return;
  main.innerHTML = `
    <div class="st-login">
      <canvas class="st-login-canvas" id="st-login-canvas" aria-hidden="true"></canvas>

      <div class="st-login-hud-caption" aria-hidden="true">
        <span>ORIGIN (0, 0, L3) // STUDIO TELEMETRY GATEWAY</span>
        <span>MOVE POINTER TO PERTURB FIELD · (x² + y²)² = 2a²(x² − y²)</span>
      </div>

      <form class="st-card st-q-card st-login-card" id="st-unlock-form" autocomplete="on">
        <span class="q-corner q-corner--tl" aria-hidden="true"></span>
        <span class="q-corner q-corner--tr" aria-hidden="true"></span>
        <span class="q-corner q-corner--bl" aria-hidden="true"></span>
        <span class="q-corner q-corner--br" aria-hidden="true"></span>

        <div class="q-topbar">
          <div class="q-topbar-cell">
            <span class="q-sec-badge">AUTH // 00</span>
            <span>STUDIO ACCESS CONSOLE</span>
          </div>
          <div class="q-topbar-cell q-topbar-cell--right">
            <span class="telemetry-accent">SQLITE · LOCAL</span>
          </div>
        </div>

        <div class="st-card-body st-login-card-body">
          <div class="st-brand">
            <div class="st-brand-motif" aria-hidden="true">
              <svg class="planar-icon planar-icon--infinity" viewBox="0 0 36 18">
                <path d="M10.5 2.2C6.7 2.2 3.7 5.2 3.7 9C3.7 12.8 6.7 15.8 10.5 15.8C15.2 15.8 20.8 2.2 25.5 2.2C29.3 2.2 32.3 5.2 32.3 9C32.3 12.8 29.3 15.8 25.5 15.8C20.8 15.8 15.2 2.2 10.5 2.2Z" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
                <circle cx="10.5" cy="9" r="1.4" fill="currentColor"/>
                <circle cx="25.5" cy="9" r="1.4" fill="currentColor"/>
              </svg>
              <svg class="planar-icon planar-icon--blackhole" viewBox="0 0 36 18">
                <path d="M8.5 8.2C11.2 2.4 24.8 2.4 27.5 8.2" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
                <path d="M10.5 10.2C13.2 14.8 22.8 14.8 25.5 10.2" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.75" stroke-linecap="round"/>
                <circle cx="18" cy="9" r="4.2" fill="currentColor"/>
                <ellipse cx="18" cy="9.2" rx="14.5" ry="3.1" transform="rotate(-11 18 9.2)" fill="none" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </div>
            <div class="st-brand-name">夜笙的小世界</div>
            <div class="st-brand-tag">QUADRANT BLUEPRINT // 后台工作台</div>
          </div>

          <p class="st-login-note">验证管理员身份以访问内容归档、光学影集与全站动态文案配置。</p>

          <div class="st-login-fields-box">
            <div class="st-login-field-row">
              <label class="st-login-field-label" for="st-user">
                <span class="st-login-idx">01</span>
                <span>登录账号</span>
              </label>
              <input
                class="st-input st-login-input"
                id="st-user"
                name="username"
                type="text"
                autocomplete="username"
                placeholder="请输入管理员用户名"
                required
              />
            </div>

            <div class="st-login-field-row">
              <label class="st-login-field-label" for="st-pass">
                <span class="st-login-idx">02</span>
                <span>通行密码</span>
              </label>
              <input
                class="st-input st-login-input"
                id="st-pass"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder="请输入登录密码"
                required
              />
            </div>
          </div>

          <button type="submit" class="st-btn st-btn--primary st-btn--block st-login-submit" id="st-unlock-btn">
            <span>解锁并进入工作台</span>
            <span class="st-login-submit-arrow" aria-hidden="true">→</span>
          </button>

          <div id="st-err" class="st-error" ${note ? '' : 'hidden'}>${esc(note ?? '')}</div>
        </div>

        <div class="q-footbar">
          <span>SESSION // HTTP-ONLY COOKIE</span>
          <span>THEME: <span class="telemetry-accent" id="st-login-foot-theme">${dark ? 'DARK // BLACK HOLE' : 'LIGHT // INFINITY'}</span></span>
        </div>
      </form>
    </div>`;

  const canvas = $<HTMLCanvasElement>('#st-login-canvas');
  if (canvas) {
    stopBgAnim = mountLoginCanvas(canvas);
  }

  $('#st-login-theme-btn')?.addEventListener('click', () => {
    toggleTheme();
    const nowDark = isDark();
    const btn = $('#st-login-theme-btn');
    if (btn) btn.textContent = nowDark ? 'DAY // 昼' : 'NIGHT // 夜';
    const pill = $('#st-login-mode-pill');
    if (pill) pill.textContent = nowDark ? 'GARGANTUA // 黑洞引力场' : 'MANIFOLD // 无限流形场';
    const footTheme = $('#st-login-foot-theme');
    if (footTheme) footTheme.textContent = nowDark ? 'DARK // BLACK HOLE' : 'LIGHT // INFINITY';
  });

  const form = $<HTMLFormElement>('#st-unlock-form')!;
  const userInput = $<HTMLInputElement>('#st-user')!;
  const passInput = $<HTMLInputElement>('#st-pass')!;
  const btn = $<HTMLButtonElement>('#st-unlock-btn')!;
  const err = $('#st-err')!;

  userInput.focus();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) return;

    btn.disabled = true;
    btn.innerHTML = '<span>正在核验身份…</span>';
    err.hidden = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        user?: { username: string };
        csrf?: string;
        error?: string;
      };
      if (!res.ok || !data.csrf) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (stopBgAnim) {
        stopBgAnim();
        stopBgAnim = null;
      }
      state.user = data.user?.username ?? username;
      state.csrf = data.csrf;
      state.gh = new ApiGithub(data.csrf);
      await reloadAll();
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = '<span>解锁并进入工作台</span><span class="st-login-submit-arrow" aria-hidden="true">→</span>';
      err.textContent = `登录失败：${(e as Error).message || String(e)}`;
      err.hidden = false;
      passInput.select();
    }
  });
}

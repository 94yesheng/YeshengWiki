/**
 * 白天 / 夜间 —— 全站一处，访客页和后台共用。
 *
 * playThemeTransition(nextTheme, onPeakCoverage) —— 结合「无限环（∞）」与「黑洞奇点」主题的昼夜切换过渡动画，
 * 并通过 data-theme-switching 同步全站所有元素的颜色切换速率，彻底消除前后台切换时的颜色速度割裂感。
 */

export const THEME_COLOR = { light: '#faf9f5', dark: '#141413' } as const;

/** 首屏前定调 —— 必须内联、必须同步跑完 */
export const THEME_BOOT = `(function () {
  var dark = false;
  try {
    var saved = localStorage.getItem('theme');
    dark = saved
      ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) {}
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}');
})();`;

export const isDark = (): boolean => document.documentElement.dataset.theme === 'dark';

export function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark() ? THEME_COLOR.dark : THEME_COLOR.light);
}

let transRaf = 0;
let switchingCleanupTimer = 0;

function beginUnifiedColorSwitch(nextTheme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.themeSwitching = 'true';
  root.dataset.theme = nextTheme;
  try {
    localStorage.setItem('theme', nextTheme);
  } catch {}
  syncThemeColor();
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));

  window.clearTimeout(switchingCleanupTimer);
  switchingCleanupTimer = window.setTimeout(() => {
    delete root.dataset.themeSwitching;
  }, 280);
}

/**
 * 结合无限（∞）与黑洞（Singularity）主题的昼夜切换过渡动画
 * 白天 → 黑夜：双焦点无限环向中心旋转坍缩为黑洞事件视界与倾斜吸积环
 * 黑夜 → 白天：黑洞奇点闪耀并向外展开为伯努利双纽线无限环
 */
export function playThemeTransition(
  targetTheme: 'light' | 'dark',
  onPeakCoverage?: () => void
): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    onPeakCoverage?.();
    return;
  }

  const stage = document.getElementById('theme-transition-stage');
  const veil = document.getElementById('theme-transition-veil') as HTMLElement | null;
  const canvas = document.getElementById('theme-transition-canvas') as HTMLCanvasElement | null;
  const badge = document.getElementById('theme-transition-badge');
  if (!stage || !canvas) {
    onPeakCoverage?.();
    return;
  }

  cancelAnimationFrame(transRaf);
  const toDark = targetTheme === 'dark';
  stage.dataset.active = 'true';
  if (badge) {
    badge.textContent = toDark
      ? 'SINGULARITY COLLAPSE // 无限流形 ∞ 坍缩至黑洞奇点'
      : 'MANIFOLD UNFOLD // 黑洞奇点展开至无限流形 ∞';
  }

  const startTs = performance.now();
  const duration = 740;
  let themeSwapped = false;

  const step = (now: number) => {
    const p = Math.min(1, (now - startTs) / duration);
    const ease = 1 - Math.pow(1 - p, 3);

    let veilAlpha = 0;
    if (p < 0.38) {
      veilAlpha = Math.sin((p / 0.38) * (Math.PI / 2)) * 0.92;
    } else {
      veilAlpha = Math.cos(((p - 0.38) / 0.62) * (Math.PI / 2)) * 0.92;
    }
    veilAlpha = Math.max(0, Math.min(0.95, veilAlpha));
    if (veil) {
      veil.style.opacity = veilAlpha.toFixed(3);
    }

    if (p >= 0.36 && !themeSwapped) {
      themeSwapped = true;
      onPeakCoverage?.();
    }

    const fadeAlpha = Math.sin(p * Math.PI);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const W = w / dpr;
      const H = h / dpr;
      const cx = W * 0.5;
      const cy = H * 0.5;
      const minDim = Math.min(W, H);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const maxWaveR = Math.hypot(W, H) * 0.65;
      const waveR = Math.max(8, ease * maxWaveR);
      const waveGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, waveR);
      if (toDark) {
        waveGrad.addColorStop(0, `rgba(18, 18, 17, ${(veilAlpha * 0.9).toFixed(3)})`);
        waveGrad.addColorStop(0.7, `rgba(217, 119, 87, ${(veilAlpha * 0.2).toFixed(3)})`);
        waveGrad.addColorStop(1, `rgba(18, 18, 17, ${(veilAlpha * 0.85).toFixed(3)})`);
      } else {
        waveGrad.addColorStop(0, `rgba(250, 249, 245, ${(veilAlpha * 0.9).toFixed(3)})`);
        waveGrad.addColorStop(0.7, `rgba(242, 179, 126, ${(veilAlpha * 0.22).toFixed(3)})`);
        waveGrad.addColorStop(1, `rgba(250, 249, 245, ${(veilAlpha * 0.85).toFixed(3)})`);
      }
      ctx.fillStyle = waveGrad;
      ctx.fillRect(0, 0, W, H);

      const morph = toDark ? ease : 1 - ease;
      const infScale = 1 - morph * 0.72;
      const a = minDim * 0.16 * infScale;
      const b = a * 0.85;
      const bhR = minDim * 0.054 * (0.25 + 0.75 * morph);

      if (morph < 0.92) {
        const infAlpha = (1 - morph) * fadeAlpha * 0.92;
        ctx.beginPath();
        for (let s = 0; s <= 96; s++) {
          const t = (s / 96) * Math.PI * 2;
          const st = Math.sin(t), ct = Math.cos(t);
          const den = 1 + st * st;
          const ix = (a * ct) / den;
          const iy = (b * st * ct) / den;
          const rot = morph * 1.1;
          const rx = ix * Math.cos(rot) - iy * Math.sin(rot);
          const ry = ix * Math.sin(rot) + iy * Math.cos(rot);
          if (s === 0) ctx.moveTo(cx + rx, cy + ry);
          else ctx.lineTo(cx + rx, cy + ry);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(217, 119, 87, ${infAlpha.toFixed(3)})`;
        ctx.lineWidth = 2.0;
        ctx.stroke();
      }

      if (morph > 0.08) {
        const bhAlpha = morph * fadeAlpha * 0.96;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.19);
        ctx.beginPath();
        ctx.ellipse(0, 0, bhR * 2.55, bhR * 0.54, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(242, 179, 126, ${bhAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.85;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, bhR * 1.28, Math.PI * 1.08, Math.PI * 1.92);
        ctx.strokeStyle = `rgba(217, 119, 87, ${(bhAlpha * 0.86).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, bhR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(20, 20, 19, ${bhAlpha.toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 228, 190, ${bhAlpha.toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      for (let k = 0; k < 36; k++) {
        const ang = (k / 36) * Math.PI * 2 + p * 2.2;
        const stK = Math.sin(ang), ctK = Math.cos(ang);
        const denK = 1 + stK * stK;
        const infPx = (a * 1.15 * ctK) / denK;
        const infPy = (b * 1.15 * stK * ctK) / denK;
        const diskR = bhR * (1.25 + (k % 5) * 0.34);
        /* 整数倍频率 (ang * 2.0)，确保 0 ↔ 2π 周期闭合无右侧断层 */
        const bhPx = diskR * Math.cos(ang * 2.0);
        const bhPy = diskR * Math.sin(ang * 2.0) * 0.28;

        const px = cx + infPx * (1 - morph) + bhPx * morph;
        const py = cy + infPy * (1 - morph) + bhPy * morph;
        ctx.beginPath();
        ctx.arc(px, py, 1.5 + (k % 3) * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(217, 119, 87, ${(fadeAlpha * 0.88).toFixed(3)})`;
        ctx.fill();
      }

      ctx.restore();
    }

    if (p < 1) {
      transRaf = requestAnimationFrame(step);
    } else {
      stage.dataset.active = 'false';
      if (veil) veil.style.opacity = '0';
      if (!themeSwapped) {
        onPeakCoverage?.();
      }
    }
  };

  transRaf = requestAnimationFrame(step);
}

/** 切换主题并记住；返回切换后的主题 */
export function toggleTheme(): 'light' | 'dark' {
  const next = isDark() ? 'light' : 'dark';
  /* 立即同步开启统一颜色过渡锁并切换主题变量，保证前后台所有元素以完全相同的速率同步过渡 */
  beginUnifiedColorSwitch(next);
  playThemeTransition(next);
  return next;
}

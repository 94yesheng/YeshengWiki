/**
 * 全屏粒子无限流形加载动画（从 BaseLayout 内联脚本抽出）。
 *
 * 使用方式（在 Astro 的客户端 <script> 里）：
 *   import { initInfinityLoader } from '../utils/loader';
 *   initInfinityLoader({ durationMs: 1050 });
 */

export interface InfinityLoaderOptions {
  durationMs?: number;
}

let loaderEl: HTMLElement | null = null;
let loaderCanvas: HTMLCanvasElement | null = null;
let loaderFill: HTMLElement | null = null;
let loaderStatus: HTMLElement | null = null;
let loaderPct: HTMLElement | null = null;
let loaderAnimId = 0;
let loaderStartTs = 0;
let loaderActive = false;

export function runInfinityLoader(durationMs = 1050): void {
  const el = loaderEl;
  const canvas = loaderCanvas;
  const fill = loaderFill;
  const status = loaderStatus;
  const pct = loaderPct;
  if (!el) return;

  cancelAnimationFrame(loaderAnimId);
  el.dataset.loaded = 'false';
  loaderActive = true;
  loaderStartTs = performance.now();
  const dur = durationMs || 1050;

  // 预生成 80 颗初始粒子：从中心奇点向外旋转绽放后收束至无限流形
  const particles: Array<{
    burstAngle: number;
    burstDist: number;
    burstSpeed: number;
    loopU: number;
    loopSpeed: number;
    size: number;
    color: string;
    spread: number;
  }> = [];
  for (let k = 0; k < 80; k++) {
    particles.push({
      burstAngle: Math.random() * Math.PI * 2,
      burstDist: 30 + Math.random() * 260,
      burstSpeed: 0.8 + Math.random() * 1.4,
      loopU: Math.random() * Math.PI * 2,
      loopSpeed: 0.8 + Math.random() * 0.6,
      size: 1.2 + Math.random() * 2.2,
      color: k % 3 === 0 ? '217, 119, 87' : k % 3 === 1 ? '232, 146, 110' : '245, 185, 135',
      spread: (Math.random() - 0.5) * 16,
    });
  }

  const stepLoader = (now: number): void => {
    if (!loaderActive) return;
    const elapsed = now - loaderStartTs;
    const p = Math.min(1, elapsed / dur);
    const easeP = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    const pctVal = Math.round(p * 100);
    if (fill) fill.style.width = `${pctVal}%`;
    if (pct) pct.textContent = `${pctVal}%`;
    if (status) {
      if (p < 0.3) {
        status.textContent = `QUANTUM GENESIS // 量子奇点初始化 (${pctVal}%)`;
      } else if (p < 0.75) {
        status.textContent = `INFINITY MANIFOLD // 正在聚合立体纯粒子流形 (${pctVal}%)`;
      } else if (p < 0.95) {
        status.textContent = `TOPOLOGY HARMONIC // 流形谐振对齐 (${pctVal}%)`;
      } else {
        status.textContent = 'MANIFOLD READY // 流形就绪 · 欢迎探索';
      }
    }

    if (canvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const lctx = canvas.getContext('2d');
      if (!lctx) return;
      const W = w / dpr;
      const H = h / dpr;
      const cx = W * 0.5;
      const cy = H * 0.44;
      const minDim = Math.min(W, H);

      lctx.save();
      lctx.scale(dpr, dpr);
      lctx.clearRect(0, 0, W, H);

      // 1. 中心柔和光晕
      const glowR = minDim * (0.12 + 0.38 * easeP);
      const glowGrad = lctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glowGrad.addColorStop(0, `rgba(217, 119, 87, ${(0.32 * (1 - easeP * 0.4)).toFixed(3)})`);
      glowGrad.addColorStop(0.5, `rgba(232, 146, 110, ${(0.12 * (1 - easeP * 0.4)).toFixed(3)})`);
      glowGrad.addColorStop(1, 'rgba(217, 119, 87, 0)');
      lctx.fillStyle = glowGrad;
      lctx.fillRect(0, 0, W, H);

      // 2. 无限流形参数尺寸
      const a = Math.min(W * 0.36, minDim * 0.48);
      const b = a * 0.86;

      // 3. 当 p > 0.25 时，立体无限环轮廓主体线条平滑显现
      if (p > 0.25) {
        const lineAlpha = Math.min(1, (p - 0.25) / 0.45);
        lctx.save();
        lctx.beginPath();
        for (let s = 0; s <= 100; s++) {
          const tVal = (s / 100) * Math.PI * 2;
          const sinT = Math.sin(tVal);
          const cosT = Math.cos(tVal);
          const den = 1 + sinT * sinT;
          const px = cx + (a * cosT) / den;
          const py = cy + (b * sinT * cosT) / den;
          if (s === 0) lctx.moveTo(px, py);
          else lctx.lineTo(px, py);
        }
        lctx.closePath();
        lctx.strokeStyle = `rgba(217, 119, 87, ${(0.38 * lineAlpha).toFixed(3)})`;
        lctx.lineWidth = 1.4;
        lctx.stroke();

        // 左右双叶焦点光点
        const fx = a * 0.62;
        [-fx, fx].forEach((fxVal) => {
          lctx.beginPath();
          lctx.arc(cx + fxVal, cy, 3.5, 0, Math.PI * 2);
          lctx.fillStyle = `rgba(217, 119, 87, ${(0.65 * lineAlpha).toFixed(3)})`;
          lctx.fill();
        });
        lctx.restore();
      }

      // 4. 80 颗粒子绽放与收束过渡
      const convergeWeight = Math.max(0, Math.min(1, (p - 0.2) / 0.55));
      for (const lp of particles) {
        // 绽放形态下的坐标
        const burstR = lp.burstDist * easeP * lp.burstSpeed;
        const bx = cx + Math.cos(lp.burstAngle + elapsed * 0.001) * burstR;
        const by = cy + Math.sin(lp.burstAngle + elapsed * 0.001) * burstR * 0.75;

        // 无限流形形态下的坐标
        lp.loopU = (lp.loopU + lp.loopSpeed * 0.025) % (Math.PI * 2);
        const sinLu = Math.sin(lp.loopU);
        const cosLu = Math.cos(lp.loopU);
        const denL = 1 + sinLu * sinLu;
        const ix = cx + (a * cosLu) / denL + Math.cos(lp.loopU * 2) * lp.spread;
        const iy = cy + (b * sinLu * cosLu) / denL + Math.sin(lp.loopU * 2) * lp.spread;

        // 平滑线性插值
        const curX = bx * (1 - convergeWeight) + ix * convergeWeight;
        const curY = by * (1 - convergeWeight) + iy * convergeWeight;
        const pAlpha = Math.min(0.95, 0.4 + 0.55 * Math.sin(p * Math.PI));

        if (lp.size > 2.0) {
          lctx.beginPath();
          lctx.arc(curX, curY, lp.size * 2.2, 0, Math.PI * 2);
          lctx.fillStyle = `rgba(${lp.color}, ${(pAlpha * 0.18).toFixed(3)})`;
          lctx.fill();
        }

        lctx.beginPath();
        lctx.arc(curX, curY, lp.size, 0, Math.PI * 2);
        lctx.fillStyle = `rgba(${lp.color}, ${pAlpha.toFixed(3)})`;
        lctx.fill();
      }

      // 5. 在 p > 0.82 时，中心向外扩散一道流形就绪完成光环
      if (p > 0.82) {
        const pulseP = (p - 0.82) / 0.18;
        const pulseR = minDim * 0.08 + pulseP * minDim * 0.45;
        lctx.save();
        lctx.beginPath();
        lctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
        lctx.strokeStyle = `rgba(232, 146, 110, ${(0.5 * (1 - pulseP)).toFixed(3)})`;
        lctx.lineWidth = 1.6;
        lctx.stroke();
        lctx.restore();
      }

      lctx.restore();
    }

    if (p < 1) {
      loaderAnimId = requestAnimationFrame(stepLoader);
    } else {
      loaderActive = false;
      el.dataset.loaded = 'true';
    }
  };

  loaderAnimId = requestAnimationFrame(stepLoader);
}

export function initInfinityLoader(options: InfinityLoaderOptions = {}): void {
  loaderEl = document.getElementById('infinity-loader');
  loaderCanvas = document.getElementById('loader-infinity-canvas') as HTMLCanvasElement | null;
  loaderFill = document.getElementById('loader-bar-fill');
  loaderStatus = document.getElementById('loader-status-text');
  loaderPct = document.getElementById('loader-pct-readout');

  runInfinityLoader(options.durationMs ?? 1050);

  document.getElementById('btn-replay-loader')?.addEventListener('click', () => {
    runInfinityLoader(1100);
  });

  (window as unknown as { __YeshengLoader?: unknown }).__YeshengLoader = {
    init: initInfinityLoader,
    run: runInfinityLoader,
  };
}

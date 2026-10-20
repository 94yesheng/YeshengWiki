/**
 * 登录页 —— HUD 象限蓝图工作台登录门户（带「星辰与星体」轻微交互动态背景）
 *
 * 1. 顶部与前台导航栏（.site-nav-bar）保持一致，提供返回站点主页与昼夜模式切换按钮；
 * 2. 背景搭载以「星辰与星体」为灵感的 HTML5 Canvas 交互星图：
 *    · 彻底移除原有的中央无限符号环，避免与中央登录卡片重叠遮挡；
 *    · 严格避开中央登录输入框区域（自动计算 #st-unlock-form 边界避让区），将核心星体与星群分布在登录框四周视野；
 *    · 左侧天区：带经纬网格、倾斜双层星环与环绕伴星的立体环行星体（Ringed Celestial Sphere）；
 *    · 右侧天区：缓速运转的星盘刻度环与双星伴月轨道系统（Binary Celestial System）；
 *    · 四周天区：多层景深闪烁星辰、偶发流星与鼠标经过时的柔和视差、微力场推开及局部星座连线。
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

  // 归一化指针坐标 [-1, 1] 与像素坐标
  let pointerNx = 0;
  let pointerNy = 0;
  let targetNx = 0;
  let targetNy = 0;
  let pointerPx = -9999;
  let pointerPy = -9999;
  let pointerActive = false;

  interface Star {
    /** 初始锚点归一化坐标 [0, 1]（已避开中央登录框） */
    u: number;
    v: number;
    /** 当前像素偏移（用于鼠标轻微交互弹力） */
    dx: number;
    dy: number;
    vx: number;
    vy: number;
    /** 景深层级 [0.25, 1.0] */
    depth: number;
    /** 星点半径 */
    radius: number;
    /** 闪烁相位与速率 */
    twinklePhase: number;
    twinkleSpeed: number;
    /** 缓慢漂移角速率 */
    driftAngle: number;
    driftSpeed: number;
    /** 是否为带十字星芒的亮星 */
    isBrightStar: boolean;
    /** 色彩倾向：0=暖赤陶, 1=流金琥珀, 2=星辰银白/墨灰 */
    tint: number;
  }

  interface ShootingStar {
    x: number;
    y: number;
    vx: number;
    vy: number;
    len: number;
    life: number;
    maxLife: number;
    active: boolean;
  }

  // 确定性伪随机，保证星图分布自然且不杂乱
  let seed = 20261020;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // 生成分布在四周天区（避开中央 [0.31..0.69] × [0.16..0.84] 登录框区域）的星辰
  const STAR_COUNT = 148;
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    let u = nextRand();
    let v = nextRand();
    // 若随机落入中央登录卡片区域，则将其推向左右两侧或上下边缘星区
    if (u > 0.30 && u < 0.70 && v > 0.14 && v < 0.86) {
      if (i % 2 === 0) {
        u = nextRand() < 0.5 ? 0.03 + nextRand() * 0.25 : 0.72 + nextRand() * 0.25;
      } else {
        v = nextRand() < 0.5 ? 0.03 + nextRand() * 0.11 : 0.86 + nextRand() * 0.11;
      }
    }
    const depth = 0.28 + Math.pow(nextRand(), 1.2) * 0.72;
    stars.push({
      u,
      v,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      depth,
      radius: 0.8 + depth * 1.45 + (i % 11 === 0 ? 0.65 : 0),
      twinklePhase: nextRand() * Math.PI * 2,
      twinkleSpeed: 0.015 + nextRand() * 0.028,
      driftAngle: nextRand() * Math.PI * 2,
      driftSpeed: 0.08 + nextRand() * 0.18,
      isBrightStar: i % 11 === 0,
      tint: i % 5 === 0 ? 0 : i % 3 === 0 ? 1 : 2,
    });
  }

  const meteor: ShootingStar = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    len: 75,
    life: 0,
    maxLife: 70,
    active: false,
  };

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
    const rect = canvas.getBoundingClientRect();
    pointerPx = e.clientX - rect.left;
    pointerPy = e.clientY - rect.top;
    targetNx = (pointerPx / Math.max(1, width) - 0.5) * 2;
    targetNy = (pointerPy / Math.max(1, height) - 0.5) * 2;
    pointerActive = true;
  };

  const onMouseLeave = () => {
    pointerActive = false;
  };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseleave', onMouseLeave);

  let tick = 0;

  // 绘制带体积光照、经纬线与倾斜双星环的「环行星体」（位于左侧天区）
  const drawRingedCelestialBody = (
    cx: number,
    cy: number,
    R: number,
    time: number,
    dark: boolean
  ) => {
    ctx.save();
    ctx.translate(cx, cy);

    const ringTilt = -0.32 + pointerNy * 0.04;
    const ringRx = R * 2.35;
    const ringRy = R * 0.54;

    // 1. 星体柔和外大气辉光
    const halo = ctx.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 2.5);
    if (dark) {
      halo.addColorStop(0, 'rgba(217, 119, 87, 0.22)');
      halo.addColorStop(0.45, 'rgba(242, 179, 126, 0.07)');
      halo.addColorStop(1, 'rgba(18, 18, 17, 0)');
    } else {
      halo.addColorStop(0, 'rgba(217, 119, 87, 0.15)');
      halo.addColorStop(0.5, 'rgba(232, 146, 110, 0.05)');
      halo.addColorStop(1, 'rgba(250, 249, 245, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 2. 星环后半弧（位于星体后方，被星体遮挡：angle ∈ [π, 2π]）
    ctx.save();
    ctx.rotate(ringTilt);
    const ringRadii = [
      { rx: ringRx * 0.78, ry: ringRy * 0.78, w: 1.1, alpha: dark ? 0.34 : 0.26, dash: [] as number[] },
      { rx: ringRx * 1.0, ry: ringRy * 1.0, w: 1.6, alpha: dark ? 0.52 : 0.38, dash: [] as number[] },
      { rx: ringRx * 1.18, ry: ringRy * 1.18, w: 0.85, alpha: dark ? 0.26 : 0.20, dash: [4, 4] },
    ];
    for (const rg of ringRadii) {
      ctx.beginPath();
      ctx.setLineDash(rg.dash);
      ctx.ellipse(0, 0, rg.rx, rg.ry, 0, Math.PI, Math.PI * 2);
      ctx.strokeStyle = dark
        ? `rgba(242, 179, 126, ${rg.alpha})`
        : `rgba(217, 119, 87, ${rg.alpha})`;
      ctx.lineWidth = rg.w;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // 3. 环绕伴星（若处于后半轨道则先绘制在星体后方）
    const moonAngle1 = time * 0.55;
    const moonAngle2 = -time * 0.38 + 2.1;
    const drawMoon = (ang: number, orbitScale: number, mSize: number, isBackHalf: boolean) => {
      const sinA = Math.sin(ang);
      if ((sinA < 0) !== isBackHalf) return;
      const lx = Math.cos(ang) * ringRx * orbitScale;
      const ly = sinA * ringRy * orbitScale;
      const mx = lx * Math.cos(ringTilt) - ly * Math.sin(ringTilt);
      const my = lx * Math.sin(ringTilt) + ly * Math.cos(ringTilt);
      ctx.beginPath();
      ctx.arc(mx, my, mSize * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(217, 119, 87, 0.20)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(mx, my, mSize, 0, Math.PI * 2);
      ctx.fillStyle = dark ? '#faf9f5' : '#d97757';
      ctx.fill();
    };
    drawMoon(moonAngle1, 1.0, 2.5, true);
    drawMoon(moonAngle2, 1.18, 1.9, true);

    // 4. 星体球面本体与三维经纬网格
    const bodyGrad = ctx.createRadialGradient(-R * 0.32, -R * 0.32, R * 0.08, 0, 0, R);
    if (dark) {
      bodyGrad.addColorStop(0, '#3a2820');
      bodyGrad.addColorStop(0.55, '#1d1917');
      bodyGrad.addColorStop(1, '#111110');
    } else {
      bodyGrad.addColorStop(0, '#fffdf9');
      bodyGrad.addColorStop(0.62, '#f5ece2');
      bodyGrad.addColorStop(1, '#e8d5c4');
    }
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.55)' : 'rgba(217, 119, 87, 0.48)';
    ctx.lineWidth = 1.35;
    ctx.stroke();

    // 球面裁剪内的旋转经线与纬线
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R - 0.5, 0, Math.PI * 2);
    ctx.clip();
    ctx.rotate(-0.18);
    ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.16)' : 'rgba(217, 119, 87, 0.16)';
    ctx.lineWidth = 0.85;
    // 纬线
    for (const lat of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.ellipse(0, lat * R, R * Math.sqrt(1 - lat * lat), R * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 随时间自转的经线
    for (let m = 0; m < 3; m++) {
      const mPhase = ((time * 0.18 + (m * Math.PI) / 3) % Math.PI);
      const mRx = Math.abs(Math.cos(mPhase)) * R;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(1.5, mRx), R, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 5. 星环前半弧（横跨星体正前方：angle ∈ [0, π]）
    ctx.save();
    ctx.rotate(ringTilt);
    for (const rg of ringRadii) {
      ctx.beginPath();
      ctx.setLineDash(rg.dash);
      ctx.ellipse(0, 0, rg.rx, rg.ry, 0, 0, Math.PI);
      ctx.strokeStyle = dark
        ? `rgba(245, 192, 138, ${Math.min(0.85, rg.alpha * 1.3)})`
        : `rgba(217, 119, 87, ${Math.min(0.75, rg.alpha * 1.25)})`;
      ctx.lineWidth = rg.w * 1.1;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // 前半轨道伴星
    drawMoon(moonAngle1, 1.0, 2.5, false);
    drawMoon(moonAngle2, 1.18, 1.9, false);

    ctx.restore();
  };

  // 绘制右侧天区的「双星伴月与星盘轨道系统」（Binary Star & Astrolabe System）
  const drawBinaryAstrolabeSystem = (
    cx: number,
    cy: number,
    R: number,
    time: number,
    dark: boolean
  ) => {
    ctx.save();
    ctx.translate(cx, cy);

    // 1. 外围星盘刻度环（缓慢逆时针旋转）
    ctx.save();
    ctx.rotate(-time * 0.08 + pointerNx * 0.05);
    ctx.beginPath();
    ctx.setLineDash([3, 7]);
    ctx.arc(0, 0, R * 1.85, 0, Math.PI * 2);
    ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.22)' : 'rgba(217, 119, 87, 0.20)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // 星盘方位短刻度
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rIn = R * (k % 3 === 0 ? 1.72 : 1.78);
      const rOut = R * 1.90;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
      ctx.lineTo(Math.cos(a) * rOut, Math.sin(a) * rOut);
      ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.30)' : 'rgba(217, 119, 87, 0.26)';
      ctx.lineWidth = k % 3 === 0 ? 1.2 : 0.75;
      ctx.stroke();
    }
    ctx.restore();

    // 2. 双星椭圆轨道线
    ctx.save();
    ctx.rotate(0.26);
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.38, R * 0.76, 0, 0, Math.PI * 2);
    ctx.strokeStyle = dark ? 'rgba(217, 119, 87, 0.24)' : 'rgba(217, 119, 87, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. 主恒星（带温暖日冕与十字星芒）
    const binaryAngle = time * 0.42;
    const p1x = Math.cos(binaryAngle) * R * 0.36;
    const p1y = Math.sin(binaryAngle) * R * 0.20;
    const p2x = -Math.cos(binaryAngle) * R * 1.38;
    const p2y = -Math.sin(binaryAngle) * R * 0.76;

    const starGlow = ctx.createRadialGradient(p1x, p1y, 2, p1x, p1y, R * 0.95);
    starGlow.addColorStop(0, 'rgba(245, 192, 138, 0.55)');
    starGlow.addColorStop(0.35, 'rgba(217, 119, 87, 0.20)');
    starGlow.addColorStop(1, 'rgba(217, 119, 87, 0)');
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(p1x, p1y, R * 0.95, 0, Math.PI * 2);
    ctx.fill();

    // 主星十字星芒
    const spikeLen = R * 0.52;
    ctx.strokeStyle = dark ? 'rgba(255, 232, 198, 0.65)' : 'rgba(217, 119, 87, 0.55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(p1x - spikeLen, p1y);
    ctx.lineTo(p1x + spikeLen, p1y);
    ctx.moveTo(p1x, p1y - spikeLen);
    ctx.lineTo(p1x, p1y + spikeLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p1x, p1y, R * 0.24, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#fff3df' : '#d97757';
    ctx.fill();

    // 4. 伴星（带新月明暗相位的次级星体）
    const compR = R * 0.22;
    ctx.beginPath();
    ctx.arc(p2x, p2y, compR * 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(217, 119, 87, 0.16)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p2x, p2y, compR, 0, Math.PI * 2);
    ctx.fillStyle = dark ? '#e8926e' : '#ca7052';
    ctx.fill();
    ctx.restore();

    ctx.restore();
  };

  const render = () => {
    if (!canvas.isConnected) {
      cleanup();
      return;
    }
    tick += 1;
    const time = tick * 0.016;
    pointerNx += (targetNx - pointerNx) * 0.06;
    pointerNy += (targetNy - pointerNy) * 0.06;

    ctx.clearRect(0, 0, width, height);
    const dark = isDark();

    // 实时测量中央登录卡片的包围盒，确保星体与星辰绝不被登录框遮挡
    const cardEl = document.getElementById('st-unlock-form');
    const canvasRect = canvas.getBoundingClientRect();
    let cardCx = width * 0.5;
    let cardCy = height * 0.5;
    let cardHalfW = Math.min(248, width * 0.28);
    let cardHalfH = Math.min(235, height * 0.36);
    if (cardEl && canvasRect.width > 0) {
      const cr = cardEl.getBoundingClientRect();
      cardCx = cr.left - canvasRect.left + cr.width * 0.5;
      cardCy = cr.top - canvasRect.top + cr.height * 0.5;
      cardHalfW = cr.width * 0.5 + 26;
      cardHalfH = cr.height * 0.5 + 22;
    }

    // 1. 绘制左右两侧天区的立体星体系统（仅在视口宽度足够展示两侧天区时绘制，严格处于登录卡片左右外侧）
    const leftSpace = Math.max(0, cardCx - cardHalfW);
    const rightSpace = Math.max(0, width - (cardCx + cardHalfW));
    const bodyBaseR = Math.max(22, Math.min(46, Math.min(leftSpace, rightSpace) * 0.21));

    if (leftSpace > 110) {
      const leftCx = leftSpace * 0.52 + pointerNx * -14;
      const leftCy = height * 0.43 + pointerNy * -10;
      drawRingedCelestialBody(leftCx, leftCy, bodyBaseR, time, dark);
    }

    if (rightSpace > 110) {
      const rightCx = cardCx + cardHalfW + rightSpace * 0.48 + pointerNx * -12;
      const rightCy = height * 0.54 + pointerNy * -9;
      drawBinaryAstrolabeSystem(rightCx, rightCy, bodyBaseR * 0.92, time, dark);
    }

    // 2. 更新并绘制四周星辰群 + 鼠标靠近时的微引力弹力与局部星座连线
    const renderedStars: Array<{ x: number; y: number; alpha: number; depth: number }> = [];

    for (let i = 0; i < stars.length; i++) {
      const st = stars[i]!;
      st.driftAngle += 0.002;
      const baseX =
        st.u * width +
        Math.cos(st.driftAngle + i) * st.driftSpeed * 12 +
        pointerNx * -22 * st.depth;
      const baseY =
        st.v * height +
        Math.sin(st.driftAngle * 0.8 + i) * st.driftSpeed * 10 +
        pointerNy * -16 * st.depth;

      // 鼠标经过星点时的轻微引力扰动与平滑回弹
      let pushX = 0;
      let pushY = 0;
      let cursorBoost = 0;
      if (pointerActive) {
        const dmx = baseX + st.dx - pointerPx;
        const dmy = baseY + st.dy - pointerPy;
        const distSq = dmx * dmx + dmy * dmy;
        const interactR = 145;
        if (distSq < interactR * interactR && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const falloff = (1 - dist / interactR) * st.depth;
          pushX = (dmx / dist) * falloff * 18 - (dmy / dist) * falloff * 8;
          pushY = (dmy / dist) * falloff * 18 + (dmx / dist) * falloff * 8;
          cursorBoost = falloff;
        }
      }

      st.vx += ((pushX - st.dx) * 0.12 - st.vx * 0.22);
      st.vy += ((pushY - st.dy) * 0.12 - st.vy * 0.22);
      st.dx += st.vx;
      st.dy += st.vy;

      let sx = baseX + st.dx;
      let sy = baseY + st.dy;

      // 若星点靠近中央登录卡片区域，平滑将其向外推开，绝不钻入登录框下方
      const relX = (sx - cardCx) / Math.max(1, cardHalfW);
      const relY = (sy - cardCy) / Math.max(1, cardHalfH);
      const boxDist = Math.max(Math.abs(relX), Math.abs(relY));
      if (boxDist < 1.06) {
        const angleOut = Math.atan2(sy - cardCy, sx - cardCx);
        const targetDist = 1.08;
        sx = cardCx + Math.cos(angleOut) * cardHalfW * targetDist;
        sy = cardCy + Math.sin(angleOut) * cardHalfH * targetDist;
      }

      const twinkle = 0.62 + 0.38 * Math.sin(tick * st.twinkleSpeed + st.twinklePhase);
      const alpha = Math.min(0.96, (0.28 + 0.52 * st.depth) * twinkle + cursorBoost * 0.35);
      const r = st.radius * (0.88 + 0.24 * twinkle + cursorBoost * 0.35);

      let rgb = '217, 119, 87';
      if (st.tint === 1) {
        rgb = dark ? '245, 192, 138' : '222, 136, 96';
      } else if (st.tint === 2) {
        rgb = dark ? '238, 234, 224' : '115, 110, 102';
      }

      // 亮星柔和星晕与十字星芒
      if (st.isBrightStar || cursorBoost > 0.32) {
        ctx.beginPath();
        ctx.arc(sx, sy, r * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb}, ${(alpha * 0.16).toFixed(3)})`;
        ctx.fill();

        const flare = r * (2.6 + cursorBoost * 2.2);
        ctx.beginPath();
        ctx.moveTo(sx - flare, sy);
        ctx.lineTo(sx + flare, sy);
        ctx.moveTo(sx, sy - flare);
        ctx.lineTo(sx, sy + flare);
        ctx.strokeStyle = `rgba(${rgb}, ${(alpha * 0.42).toFixed(3)})`;
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
      ctx.fill();

      renderedStars.push({ x: sx, y: sy, alpha, depth: st.depth });
    }

    // 3. 绘制局部星座连线（邻近星点微弱连线 + 鼠标周围星座高亮连线）
    ctx.save();
    for (let i = 0; i < renderedStars.length; i++) {
      const a = renderedStars[i]!;
      if (a.depth < 0.52) continue;

      let nearCursor = false;
      if (pointerActive) {
        const dCursor = Math.hypot(a.x - pointerPx, a.y - pointerPy);
        if (dCursor < 135) {
          nearCursor = true;
          const cAlpha = (1 - dCursor / 135) * (dark ? 0.22 : 0.16);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointerPx, pointerPy);
          ctx.strokeStyle = `rgba(217, 119, 87, ${cAlpha.toFixed(3)})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }

      for (let j = i + 1; j < renderedStars.length; j++) {
        const b = renderedStars[j]!;
        if (b.depth < 0.52) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const maxDist = nearCursor ? 115 : 76;
        if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
        const dist = Math.hypot(dx, dy);
        if (dist < maxDist) {
          // 避免连线横穿中央登录框
          const midX = (a.x + b.x) * 0.5;
          const midY = (a.y + b.y) * 0.5;
          if (Math.abs(midX - cardCx) < cardHalfW && Math.abs(midY - cardCy) < cardHalfH) {
            continue;
          }
          const lineAlpha =
            (1 - dist / maxDist) * (nearCursor ? (dark ? 0.28 : 0.22) : dark ? 0.11 : 0.085);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = dark
            ? `rgba(242, 179, 126, ${lineAlpha.toFixed(3)})`
            : `rgba(217, 119, 87, ${lineAlpha.toFixed(3)})`;
          ctx.lineWidth = nearCursor ? 0.85 : 0.6;
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // 4. 偶发外围天区流星（仅在上方两侧星区掠过）
    if (!meteor.active && tick % 240 === 90) {
      const onLeft = (tick / 240) % 2 === 0;
      meteor.x = onLeft ? width * 0.08 : width * 0.76;
      meteor.y = height * 0.12;
      meteor.vx = onLeft ? 3.8 : -3.8;
      meteor.vy = 1.65;
      meteor.life = 0;
      meteor.maxLife = 56;
      meteor.active = true;
    }
    if (meteor.active) {
      meteor.life += 1;
      meteor.x += meteor.vx;
      meteor.y += meteor.vy;
      const p = meteor.life / meteor.maxLife;
      const mAlpha = Math.sin(p * Math.PI) * (dark ? 0.65 : 0.48);
      const tailX = meteor.x - meteor.vx * 12;
      const tailY = meteor.y - meteor.vy * 12;
      const mGrad = ctx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
      mGrad.addColorStop(0, `rgba(245, 192, 138, ${mAlpha.toFixed(3)})`);
      mGrad.addColorStop(1, 'rgba(217, 119, 87, 0)');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(tailX, tailY);
      ctx.strokeStyle = mGrad;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      if (meteor.life >= meteor.maxLife) {
        meteor.active = false;
      }
    }

    rafId = window.requestAnimationFrame(render);
  };

  rafId = window.requestAnimationFrame(render);

  const cleanup = () => {
    window.cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseleave', onMouseLeave);
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
          <span id="st-login-mode-pill">${dark ? 'CELESTIAL // 夜空星体场' : 'CELESTIAL // 晨星天球场'}</span>
        </div>
        <button type="button" class="st-btn nav-scale-btn" id="st-login-theme-btn" title="切换昼夜模式">
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
        <span>CELESTIAL ASTROLABE // 星辰与星体交互天球背景</span>
        <span>MOVE POINTER TO ILLUMINATE CONSTELLATIONS · PERIPHERAL ORBITAL FIELD</span>
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
          <span>THEME: <span class="telemetry-accent" id="st-login-foot-theme">${dark ? 'DARK // CELESTIAL' : 'LIGHT // CELESTIAL'}</span></span>
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
    if (pill) pill.textContent = nowDark ? 'CELESTIAL // 夜空星体场' : 'CELESTIAL // 晨星天球场';
    const footTheme = $('#st-login-foot-theme');
    if (footTheme) footTheme.textContent = nowDark ? 'DARK // CELESTIAL' : 'LIGHT // CELESTIAL';
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

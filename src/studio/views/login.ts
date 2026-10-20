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

  let pointerNx = 0;
  let pointerNy = 0;
  let targetNx = 0;
  let targetNy = 0;
  let pointerPx = -9999;
  let pointerPy = -9999;
  let pointerActive = false;

  interface StarNode {
    u: number;
    v: number;
    dx: number;
    dy: number;
    vx: number;
    vy: number;
    depth: number;
    mag: number; // 星等：决定光斑核心与衍射芒大小
    twinklePhase: number;
    twinkleSpeed: number;
    spectral: number; // 0: 琥珀金, 1: 暖赤陶, 2: 象牙星白, 3: 苍青冷星
    catalogTag?: string;
  }

  interface VortexParticle {
    rNorm: number;
    theta: number;
    omega: number;
    arm: number;
    zJitter: number;
    size: number;
    tint: number;
  }

  interface ShootingComet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    active: boolean;
  }

  let seed = 20261028;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const CATALOG_LABELS = [
    'α UMi // POLARIS',
    'β Ori // RIGEL',
    'α Lyr // VEGA',
    'α Boo // ARCTURUS',
    'α Cyg // DENEB',
    'γ Cas // NAVI',
    'ε UMa // ALIOTH',
    'δ Cep // CEPHEUS',
    'η Car // HOMUNCULUS',
    'PSR B1919+21',
  ];

  // 1. 生成 280 颗遵循真实天体星等幂律分布的深空恒星（自动避开中央登录框）
  const STAR_COUNT = 280;
  const stars: StarNode[] = [];
  let catalogIdx = 0;

  for (let i = 0; i < STAR_COUNT; i++) {
    let u = nextRand();
    let v = nextRand();
    // 严格避开中央登录卡片主体区域 [0.31..0.69] × [0.15..0.85]
    if (u > 0.31 && u < 0.69 && v > 0.15 && v < 0.85) {
      if (i % 2 === 0) {
        u = nextRand() < 0.5 ? 0.02 + nextRand() * 0.27 : 0.71 + nextRand() * 0.27;
      } else {
        v = nextRand() < 0.5 ? 0.03 + nextRand() * 0.11 : 0.86 + nextRand() * 0.11;
      }
    }
    const depth = 0.22 + Math.pow(nextRand(), 1.35) * 0.78;
    const isNavStar = i % 26 === 0 && (u < 0.28 || u > 0.72);
    const mag = isNavStar ? 1.85 + nextRand() * 0.55 : 0.45 + Math.pow(depth, 1.5) * 1.15;
    stars.push({
      u,
      v,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      depth,
      mag,
      twinklePhase: nextRand() * Math.PI * 2,
      twinkleSpeed: 0.012 + nextRand() * 0.024,
      spectral: i % 7 === 0 ? 0 : i % 5 === 0 ? 1 : i % 4 === 0 ? 3 : 2,
      catalogTag: isNavStar ? CATALOG_LABELS[catalogIdx++ % CATALOG_LABELS.length] : undefined,
    });
  }

  // 2. 生成右侧天区「相对论双星引力星璇」的 220 颗开普勒流线星尘粒子
  const VORTEX_COUNT = 220;
  const vortexParticles: VortexParticle[] = [];
  for (let i = 0; i < VORTEX_COUNT; i++) {
    const rNorm = Math.pow(nextRand(), 0.88);
    const arm = i % 2;
    vortexParticles.push({
      rNorm,
      theta: nextRand() * Math.PI * 2,
      omega: 0.38 / Math.pow(0.18 + rNorm, 1.15),
      arm,
      zJitter: (nextRand() - 0.5) * 2.0,
      size: 0.65 + (1 - rNorm * 0.55) * 1.35,
      tint: i % 3,
    });
  }

  const comet: ShootingComet = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 68,
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

  // 三维透视投影辅助函数
  const project3D = (
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
    cx: number,
    cy: number,
    fov: number
  ) => {
    const cosX = Math.cos(rx), sinX = Math.sin(rx);
    const cosY = Math.cos(ry), sinY = Math.sin(ry);
    const cosZ = Math.cos(rz), sinZ = Math.sin(rz);

    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    const x2 = x * cosY + z1 * sinY;
    const z2 = -x * sinY + z1 * cosY;
    const x3 = x2 * cosZ - y1 * sinZ;
    const y3 = x2 * sinZ + y1 * cosZ;

    const scale = fov / Math.max(120, fov + z2);
    return {
      sx: cx + x3 * scale,
      sy: cy + y3 * scale,
      z: z2,
      scale,
    };
  };

  // =========================================================================
  // 左侧天区主体（绝不遮挡中央登录框）：
  // 「三维岁差天球浑仪与三倾角共振星系 (3D Keplerian Armillary Observatory)」
  // =========================================================================
  const drawKeplerianArmillarySystem = (
    cx: number,
    cy: number,
    R: number,
    time: number,
    dark: boolean
  ) => {
    ctx.save();

    const fov = 520;
    const rx = 0.52 + Math.sin(time * 0.18) * 0.08 + pointerNy * 0.10;
    const ry = time * 0.14 + pointerNx * 0.12;
    const rz = -0.24 + Math.cos(time * 0.12) * 0.05;

    // 1. 深空引力场星云底光
    const nebula = ctx.createRadialGradient(cx, cy, R * 0.08, cx, cy, R * 1.95);
    if (dark) {
      nebula.addColorStop(0, 'rgba(217, 119, 87, 0.20)');
      nebula.addColorStop(0.38, 'rgba(198, 132, 86, 0.07)');
      nebula.addColorStop(0.75, 'rgba(92, 118, 142, 0.025)');
      nebula.addColorStop(1, 'rgba(18, 18, 17, 0)');
    } else {
      nebula.addColorStop(0, 'rgba(217, 119, 87, 0.13)');
      nebula.addColorStop(0.45, 'rgba(202, 112, 82, 0.045)');
      nebula.addColorStop(1, 'rgba(245, 244, 237, 0)');
    }
    ctx.fillStyle = nebula;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.95, 0, Math.PI * 2);
    ctx.fill();

    // 2. 外圈精密赤道星盘分度环（72 刻度 + 赤经标记）
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-time * 0.04);
    const outerBezelR = R * 1.46;
    ctx.beginPath();
    ctx.arc(0, 0, outerBezelR, 0, Math.PI * 2);
    ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.16)' : 'rgba(217, 119, 87, 0.16)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    for (let deg = 0; deg < 72; deg++) {
      const ang = (deg / 72) * Math.PI * 2;
      const isMajor = deg % 6 === 0;
      const r0 = outerBezelR * (isMajor ? 0.945 : 0.972);
      const r1 = outerBezelR * (isMajor ? 1.025 : 1.0);
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
      ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
      ctx.strokeStyle = dark
        ? `rgba(242, 179, 126, ${isMajor ? 0.36 : 0.15})`
        : `rgba(217, 119, 87, ${isMajor ? 0.32 : 0.14})`;
      ctx.lineWidth = isMajor ? 1.0 : 0.6;
      ctx.stroke();
    }
    ctx.restore();

    // 3. 三维天球经纬浑仪骨架（按三维 Z 深度自动区分前半球与后半球明暗）
    const armillaryR = R * 0.92;
    const steps = 64;
    // 3a. 纬线圈
    for (const latDeg of [-52, -23.4, 0, 23.4, 52]) {
      const lat = (latDeg * Math.PI) / 180;
      const ringR = armillaryR * Math.cos(lat);
      const yLat = armillaryR * Math.sin(lat);
      const isEquator = latDeg === 0;
      for (let s = 0; s < steps; s++) {
        const a0 = (s / steps) * Math.PI * 2;
        const a1 = ((s + 1) / steps) * Math.PI * 2;
        const p0 = project3D(ringR * Math.cos(a0), yLat, ringR * Math.sin(a0), rx, ry, rz, cx, cy, fov);
        const p1 = project3D(ringR * Math.cos(a1), yLat, ringR * Math.sin(a1), rx, ry, rz, cx, cy, fov);
        const isFront = (p0.z + p1.z) * 0.5 < 0;
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        const alpha = isEquator
          ? (isFront ? 0.46 : 0.14)
          : (isFront ? 0.22 : 0.07);
        ctx.strokeStyle = dark
          ? `rgba(242, 179, 126, ${alpha})`
          : `rgba(217, 119, 87, ${alpha})`;
        ctx.lineWidth = isEquator ? (isFront ? 1.25 : 0.75) : 0.65;
        ctx.stroke();
      }
    }

    // 3b. 经线大圆与天球极轴（N // POLARIS — S // OCTANS）
    for (let m = 0; m < 4; m++) {
      const lon = (m / 4) * Math.PI;
      const cosL = Math.cos(lon), sinL = Math.sin(lon);
      for (let s = 0; s < steps; s++) {
        const a0 = (s / steps) * Math.PI * 2;
        const a1 = ((s + 1) / steps) * Math.PI * 2;
        const p0 = project3D(armillaryR * Math.cos(a0) * cosL, armillaryR * Math.sin(a0), armillaryR * Math.cos(a0) * sinL, rx, ry, rz, cx, cy, fov);
        const p1 = project3D(armillaryR * Math.cos(a1) * cosL, armillaryR * Math.sin(a1), armillaryR * Math.cos(a1) * sinL, rx, ry, rz, cx, cy, fov);
        const isFront = (p0.z + p1.z) * 0.5 < 0;
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        const alpha = isFront ? 0.24 : 0.07;
        ctx.strokeStyle = dark ? `rgba(235, 168, 118, ${alpha})` : `rgba(202, 112, 82, ${alpha})`;
        ctx.lineWidth = isFront ? 0.85 : 0.55;
        ctx.stroke();
      }
    }

    // 极轴贯穿线
    const northPole = project3D(0, -armillaryR * 1.38, 0, rx, ry, rz, cx, cy, fov);
    const southPole = project3D(0, armillaryR * 1.38, 0, rx, ry, rz, cx, cy, fov);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(northPole.sx, northPole.sy);
    ctx.lineTo(southPole.sx, southPole.sy);
    ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.34)' : 'rgba(217, 119, 87, 0.28)';
    ctx.lineWidth = 0.85;
    ctx.stroke();
    ctx.restore();

    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = dark ? 'rgba(242, 179, 126, 0.55)' : 'rgba(217, 119, 87, 0.55)';
    ctx.fillText('N // CELESTIAL POLE', northPole.sx + 6, northPole.sy + 3);

    // 4. 三条三维倾角开普勒椭圆星轨 + 拖尾行星动态演化
    const orbits = [
      { a: R * 1.35, b: R * 1.05, incX: 0.38, incZ: 0.22, speed: 0.48, phase: 0.4, bodyR: 3.1 },
      { a: R * 1.18, b: R * 0.86, incX: -0.62, incZ: -0.35, speed: -0.64, phase: 2.3, bodyR: 2.5 },
      { a: R * 1.52, b: R * 1.12, incX: 0.88, incZ: -0.48, speed: 0.32, phase: 4.1, bodyR: 2.2 },
    ];

    const evalOrbitPoint = (orb: typeof orbits[0], u: number) => {
      const lx = orb.a * Math.cos(u);
      const lz = orb.b * Math.sin(u);
      // 绕轨道倾角旋转
      const cX = Math.cos(orb.incX), sX = Math.sin(orb.incX);
      const cZ = Math.cos(orb.incZ), sZ = Math.sin(orb.incZ);
      const y1 = -lz * sX;
      const z1 = lz * cX;
      const x2 = lx * cZ - y1 * sZ;
      const y2 = lx * sZ + y1 * cZ;
      return project3D(x2, y2, z1, rx, ry, rz, cx, cy, fov);
    };

    for (const orb of orbits) {
      // 绘制完整椭圆参考细轨
      const segs = 72;
      for (let s = 0; s < segs; s++) {
        const u0 = (s / segs) * Math.PI * 2;
        const u1 = ((s + 1) / segs) * Math.PI * 2;
        const p0 = evalOrbitPoint(orb, u0);
        const p1 = evalOrbitPoint(orb, u1);
        const isFront = (p0.z + p1.z) * 0.5 < 0;
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.strokeStyle = dark
          ? `rgba(217, 119, 87, ${isFront ? 0.32 : 0.11})`
          : `rgba(217, 119, 87, ${isFront ? 0.26 : 0.09})`;
        ctx.lineWidth = isFront ? 1.0 : 0.65;
        ctx.stroke();
      }

      // 绘制天体运动发光彗尾弧（42 段渐隐）
      const headU = time * orb.speed + orb.phase;
      const dir = orb.speed >= 0 ? 1 : -1;
      for (let t = 0; t < 36; t++) {
        const uA = headU - dir * (t * 0.026);
        const uB = headU - dir * ((t + 1) * 0.026);
        const pA = evalOrbitPoint(orb, uA);
        const pB = evalOrbitPoint(orb, uB);
        const tailAlpha = Math.pow(1 - t / 36, 1.7) * (dark ? 0.78 : 0.65);
        ctx.beginPath();
        ctx.moveTo(pA.sx, pA.sy);
        ctx.lineTo(pB.sx, pB.sy);
        ctx.strokeStyle = dark
          ? `rgba(255, 214, 165, ${tailAlpha.toFixed(3)})`
          : `rgba(217, 119, 87, ${tailAlpha.toFixed(3)})`;
        ctx.lineWidth = (1 - t / 42) * 2.1;
        ctx.stroke();
      }

      // 行星本体与向心引力矢径线
      const headP = evalOrbitPoint(orb, headU);
      ctx.beginPath();
      ctx.setLineDash([2, 3]);
      ctx.moveTo(cx, cy);
      ctx.lineTo(headP.sx, headP.sy);
      ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.18)' : 'rgba(217, 119, 87, 0.15)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.setLineDash([]);

      const glow = ctx.createRadialGradient(headP.sx, headP.sy, 0.5, headP.sx, headP.sy, orb.bodyR * 4.2);
      glow.addColorStop(0, dark ? 'rgba(255, 238, 208, 0.85)' : 'rgba(217, 119, 87, 0.75)');
      glow.addColorStop(0.4, 'rgba(217, 119, 87, 0.25)');
      glow.addColorStop(1, 'rgba(217, 119, 87, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(headP.sx, headP.sy, orb.bodyR * 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(headP.sx, headP.sy, orb.bodyR * headP.scale, 0, Math.PI * 2);
      ctx.fillStyle = dark ? '#fff7eb' : '#d97757';
      ctx.fill();
    }

    // 5. 中心主恒星核心与望远镜十字衍射星芒
    const coreGlow = ctx.createRadialGradient(cx, cy, 1, cx, cy, R * 0.48);
    coreGlow.addColorStop(0, dark ? 'rgba(255, 244, 222, 0.95)' : 'rgba(217, 119, 87, 0.88)');
    coreGlow.addColorStop(0.32, 'rgba(217, 119, 87, 0.34)');
    coreGlow.addColorStop(1, 'rgba(217, 119, 87, 0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.48, 0, Math.PI * 2);
    ctx.fill();

    const needle = R * 0.36;
    ctx.strokeStyle = dark ? 'rgba(255, 236, 205, 0.58)' : 'rgba(217, 119, 87, 0.48)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - needle, cy);
    ctx.lineTo(cx + needle, cy);
    ctx.moveTo(cx, cy - needle);
    ctx.lineTo(cx, cy + needle);
    ctx.stroke();

    ctx.restore();
  };

  // =========================================================================
  // 右侧天区主体（绝不遮挡中央登录框）：
  // 「相对论双星引力星璇与拉格朗日等势流形 (Relativistic Binary Accretion Vortex)」
  // =========================================================================
  const drawRelativisticBinaryVortex = (
    cx: number,
    cy: number,
    R: number,
    time: number,
    dark: boolean
  ) => {
    ctx.save();
    ctx.translate(cx, cy);

    const tilt = 0.52 + pointerNy * 0.05; // 轨道平面倾角缩放
    const roll = -0.28 + pointerNx * 0.04;
    const cosR = Math.cos(roll), sinR = Math.sin(roll);

    const toVortexScreen = (lx: number, ly: number) => ({
      x: lx * cosR - ly * tilt * sinR,
      y: lx * sinR + ly * tilt * cosR,
    });

    // 1. 深空星璇软光晕
    const halo = ctx.createRadialGradient(0, 0, R * 0.1, 0, 0, R * 2.0);
    if (dark) {
      halo.addColorStop(0, 'rgba(232, 146, 110, 0.22)');
      halo.addColorStop(0.45, 'rgba(217, 119, 87, 0.075)');
      halo.addColorStop(1, 'rgba(18, 18, 17, 0)');
    } else {
      halo.addColorStop(0, 'rgba(217, 119, 87, 0.14)');
      halo.addColorStop(0.5, 'rgba(217, 119, 87, 0.04)');
      halo.addColorStop(1, 'rgba(245, 244, 237, 0)');
    }
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, R * 2.0, 0, Math.PI * 2);
    ctx.fill();

    // 2. 洛希瓣（Roche Lobe）双星引力等势流形线 + 进动玫瑰星轨
    for (const scaleLobe of [0.82, 1.18, 1.52]) {
      ctx.beginPath();
      const lobeSteps = 96;
      for (let s = 0; s <= lobeSteps; s++) {
        const u = (s / lobeSteps) * Math.PI * 2;
        const denom = 1 + Math.sin(u) * Math.sin(u);
        const lx = (R * scaleLobe * Math.cos(u)) / denom;
        const ly = (R * scaleLobe * 0.85 * Math.sin(u) * Math.cos(u)) / denom;
        const sp = toVortexScreen(lx, ly);
        if (s === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.strokeStyle = dark
        ? `rgba(242, 179, 126, ${scaleLobe === 1.18 ? 0.28 : 0.14})`
        : `rgba(217, 119, 87, ${scaleLobe === 1.18 ? 0.24 : 0.12})`;
      ctx.lineWidth = scaleLobe === 1.18 ? 1.05 : 0.7;
      if (scaleLobe !== 1.18) ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. 螺旋星流粒子云（220 颗沿对数旋臂与开普勒剪切角速度旋转的星尘微粒）
    const maxVortexR = R * 1.65;
    for (let i = 0; i < vortexParticles.length; i++) {
      const vp = vortexParticles[i]!;
      vp.theta += vp.omega * 0.012;
      const r = R * 0.18 + vp.rNorm * (maxVortexR - R * 0.18);
      const spiralPhase = vp.theta + vp.arm * Math.PI - vp.rNorm * 2.4;
      const lx = r * Math.cos(spiralPhase);
      const ly = r * Math.sin(spiralPhase) + vp.zJitter * 6;
      const sp = toVortexScreen(lx, ly);

      // 多普勒增亮效应
      const doppler = 0.65 + 0.35 * Math.cos(spiralPhase);
      const alpha = (1 - vp.rNorm * 0.52) * doppler * (dark ? 0.82 : 0.68);
      const rgb =
        vp.tint === 0
          ? '248, 198, 142'
          : vp.tint === 1
            ? '217, 119, 87'
            : dark
              ? '250, 249, 245'
              : '120, 95, 78';

      // 微短切向运动轨迹线，增强星璇流体感
      const tangentX = -Math.sin(spiralPhase) * 4.5 * (1 - vp.rNorm * 0.4);
      const tangentY = Math.cos(spiralPhase) * 4.5 * (1 - vp.rNorm * 0.4);
      const tsp = toVortexScreen(lx + tangentX, ly + tangentY);
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(tsp.x, tsp.y);
      ctx.strokeStyle = `rgba(${rgb}, ${(alpha * 0.48).toFixed(3)})`;
      ctx.lineWidth = vp.size * 0.75;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sp.x, sp.y, vp.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`;
      ctx.fill();
    }

    // 4. 互相绕转的双致密天体核心（Primary & Companion）
    const binPhi = time * 0.58;
    const sep = R * 0.38;
    const starA = toVortexScreen(Math.cos(binPhi) * sep * 0.65, Math.sin(binPhi) * sep * 0.65);
    const starB = toVortexScreen(-Math.cos(binPhi) * sep * 1.15, -Math.sin(binPhi) * sep * 1.15);

    for (const [idx, st] of [starA, starB].entries()) {
      const sRad = idx === 0 ? 3.6 : 2.5;
      const g = ctx.createRadialGradient(st.x, st.y, 0.5, st.x, st.y, sRad * 6.5);
      g.addColorStop(0, dark ? 'rgba(255, 242, 218, 0.92)' : 'rgba(217, 119, 87, 0.85)');
      g.addColorStop(0.35, 'rgba(217, 119, 87, 0.28)');
      g.addColorStop(1, 'rgba(217, 119, 87, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(st.x, st.y, sRad * 6.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(st.x, st.y, sRad, 0, Math.PI * 2);
      ctx.fillStyle = dark ? '#fffaf0' : '#d97757';
      ctx.fill();
    }

    // 拉格朗日驻点标注
    const l2Pos = toVortexScreen(R * 1.32, 0);
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = dark ? 'rgba(242, 179, 126, 0.52)' : 'rgba(217, 119, 87, 0.52)';
    ctx.fillText('L2 // ROCHE MANIFOLD', l2Pos.x - 36, l2Pos.y + 18);

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

    // 实时测量中央登录卡片的包围盒，确保主体天体系统始终分布在左右开阔视场，绝不被遮挡
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
      cardHalfW = cr.width * 0.5 + 28;
      cardHalfH = cr.height * 0.5 + 24;
    }

    // 0. 绘制全幅天球赤经/赤纬大曲率参考弧线（营造深空星图纵深感）
    ctx.save();
    ctx.strokeStyle = dark ? 'rgba(242, 179, 126, 0.055)' : 'rgba(217, 119, 87, 0.055)';
    ctx.lineWidth = 0.75;
    for (const rMul of [0.42, 0.68, 0.94]) {
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 1.45, Math.hypot(width, height) * rMul, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
    ctx.restore();

    // 1. 绘制左右两侧天区的核心天体运动系统（严格定位于登录卡片左右两侧外围）
    const leftSpace = Math.max(0, cardCx - cardHalfW);
    const rightSpace = Math.max(0, width - (cardCx + cardHalfW));
    const systemR = Math.max(42, Math.min(92, Math.min(leftSpace, rightSpace) * 0.34));

    if (leftSpace > 110) {
      const leftCx = leftSpace * 0.50 + pointerNx * -10;
      const leftCy = height * 0.46 + pointerNy * -8;
      drawKeplerianArmillarySystem(leftCx, leftCy, systemR, time, dark);
    }
    if (rightSpace > 110) {
      const rightCx = width - rightSpace * 0.50 + pointerNx * -12;
      const rightCy = height * 0.52 + pointerNy * -10;
      drawRelativisticBinaryVortex(rightCx, rightCy, systemR, time, dark);
    }

    // 2. 更新并绘制 280 颗多星等深空星辰（含鼠标引力微透镜交互与亮星望远镜衍射星芒）
    const renderedStars: Array<{ x: number; y: number; depth: number; alpha: number }> = [];

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i]!;
      s.twinklePhase += s.twinkleSpeed;

      const driftX = Math.cos(time * 0.14 + i) * 3.0 * s.depth;
      const driftY = Math.sin(time * 0.12 + i * 0.7) * 3.0 * s.depth;
      const paraX = pointerNx * -16 * s.depth;
      const paraY = pointerNy * -12 * s.depth;

      const baseX = s.u * width + driftX + paraX;
      const baseY = s.v * height + driftY + paraY;

      if (pointerActive) {
        const curX = baseX + s.dx;
        const curY = baseY + s.dy;
        const dist = Math.hypot(curX - pointerPx, curY - pointerPy);
        const interactRadius = 128;
        if (dist < interactRadius && dist > 0.1) {
          const force = Math.pow(1 - dist / interactRadius, 2) * 0.9;
          s.vx += ((curX - pointerPx) / dist) * force;
          s.vy += ((curY - pointerPy) / dist) * force;
        }
      }

      s.vx += -s.dx * 0.045;
      s.vy += -s.dy * 0.045;
      s.vx *= 0.88;
      s.vy *= 0.88;
      s.dx += s.vx;
      s.dy += s.vy;

      const x = baseX + s.dx;
      const y = baseY + s.dy;

      // 若落入中央登录卡片矩形内部则跳过，保证表单绝对纯净
      if (Math.abs(x - cardCx) < cardHalfW && Math.abs(y - cardCy) < cardHalfH) {
        continue;
      }

      const twinkle = 0.62 + 0.38 * Math.sin(s.twinklePhase);
      const alpha = Math.min(0.96, (0.24 + 0.64 * s.depth) * twinkle);

      let colorRGB: string;
      if (s.spectral === 0) {
        colorRGB = dark ? '248, 202, 146' : '202, 112, 82';
      } else if (s.spectral === 1) {
        colorRGB = '217, 119, 87';
      } else if (s.spectral === 3) {
        colorRGB = dark ? '195, 215, 235' : '110, 128, 145';
      } else {
        colorRGB = dark ? '250, 249, 245' : '68, 66, 62';
      }

      if (s.mag > 1.25) {
        const glowR = s.mag * 3.8;
        const g = ctx.createRadialGradient(x, y, 0.2, x, y, glowR);
        g.addColorStop(0, `rgba(${colorRGB}, ${(alpha * 0.42).toFixed(3)})`);
        g.addColorStop(1, `rgba(${colorRGB}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, s.mag, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colorRGB}, ${alpha.toFixed(3)})`;
      ctx.fill();

      // 一等亮星：绘制光学望远镜十字衍射芒 + 星表编号
      if (s.catalogTag) {
        const spike = s.mag * 5.2 * (0.85 + 0.15 * twinkle);
        ctx.strokeStyle = `rgba(${colorRGB}, ${(alpha * 0.58).toFixed(3)})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(x - spike, y);
        ctx.lineTo(x + spike, y);
        ctx.moveTo(x, y - spike);
        ctx.lineTo(x, y + spike);
        ctx.stroke();

        ctx.font = '500 8.5px "JetBrains Mono", monospace';
        ctx.fillStyle = dark ? 'rgba(242, 179, 126, 0.38)' : 'rgba(217, 119, 87, 0.40)';
        ctx.fillText(s.catalogTag, x + 7, y + 3);
      }

      if (s.depth > 0.55) {
        renderedStars.push({ x, y, depth: s.depth, alpha });
      }
    }

    // 3. 鼠标靠近时的局部星图测地连线（Constellation Geodesic Lines）
    if (pointerActive) {
      ctx.save();
      for (let i = 0; i < renderedStars.length; i++) {
        const a = renderedStars[i]!;
        const dPointer = Math.hypot(a.x - pointerPx, a.y - pointerPy);
        if (dPointer > 175) continue;

        for (let j = i + 1; j < renderedStars.length; j++) {
          const b = renderedStars[j]!;
          const dPair = Math.hypot(a.x - b.x, a.y - b.y);
          if (dPair < 105) {
            const lineAlpha =
              (1 - dPair / 105) * (1 - dPointer / 175) * (dark ? 0.34 : 0.26);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(217, 119, 87, ${lineAlpha.toFixed(3)})`;
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    // 4. 偶发深空彗星掠影（仅在左右外侧星区触发）
    if (!comet.active && tick % 340 === 140) {
      const onLeft = nextRand() < 0.5;
      comet.x = onLeft ? width * (0.04 + nextRand() * 0.16) : width * (0.76 + nextRand() * 0.18);
      comet.y = height * (0.08 + nextRand() * 0.22);
      comet.vx = onLeft ? 3.4 : -3.4;
      comet.vy = 2.0;
      comet.life = 0;
      comet.maxLife = 60;
      comet.active = true;
    }
    if (comet.active) {
      comet.life += 1;
      comet.x += comet.vx;
      comet.y += comet.vy;
      const p = comet.life / comet.maxLife;
      const mAlpha = Math.sin(p * Math.PI) * (dark ? 0.68 : 0.50);
      const tailX = comet.x - comet.vx * 14;
      const tailY = comet.y - comet.vy * 14;
      const mGrad = ctx.createLinearGradient(comet.x, comet.y, tailX, tailY);
      mGrad.addColorStop(0, `rgba(248, 202, 146, ${mAlpha.toFixed(3)})`);
      mGrad.addColorStop(1, 'rgba(217, 119, 87, 0)');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(comet.x, comet.y);
      ctx.lineTo(tailX, tailY);
      ctx.strokeStyle = mGrad;
      ctx.lineWidth = 1.45;
      ctx.stroke();
      ctx.restore();
      if (comet.life >= comet.maxLife) {
        comet.active = false;
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
            <svg class="planar-icon planar-icon--infinity" viewBox="0 0 36 18" aria-hidden="true">
              <path d="M13.6 4.6A6.22 6.22 0 1 0 13.6 13.4L22.4 4.6A6.22 6.22 0 1 1 22.4 13.4" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M13.6 4.6L15.7 6.7M20.3 11.3L22.4 13.4" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="butt"/>
              <path d="M15.1 7.6L16.9 5.8M19.1 12.2L20.9 10.4" fill="none" stroke="currentColor" stroke-width="0.95" stroke-opacity="0.58" stroke-linecap="round"/>
            </svg>
            <svg class="planar-icon planar-icon--blackhole" viewBox="0 0 36 18" aria-hidden="true">
              <path d="M7.8 8.0C10.8 1.6 25.2 1.6 28.2 8.0" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
              <path d="M9.8 10.4C12.8 15.6 23.2 15.6 26.2 10.4" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.78" stroke-linecap="round"/>
              <path d="M3.2 9A14.8 4.4 0 0 1 32.8 9" transform="rotate(-11 18 9)" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.42"/>
              <circle cx="18" cy="9" r="4.5" fill="currentColor"/>
              <path d="M3.2 9A14.8 4.4 0 0 0 32.8 9" transform="rotate(-11 18 9)" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
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
              <svg class="planar-icon planar-icon--infinity" viewBox="0 0 36 18" aria-hidden="true">
              <path d="M13.6 4.6A6.22 6.22 0 1 0 13.6 13.4L22.4 4.6A6.22 6.22 0 1 1 22.4 13.4" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M13.6 4.6L15.7 6.7M20.3 11.3L22.4 13.4" fill="none" stroke="currentColor" stroke-width="2.15" stroke-linecap="butt"/>
              <path d="M15.1 7.6L16.9 5.8M19.1 12.2L20.9 10.4" fill="none" stroke="currentColor" stroke-width="0.95" stroke-opacity="0.58" stroke-linecap="round"/>
            </svg>
              <svg class="planar-icon planar-icon--blackhole" viewBox="0 0 36 18" aria-hidden="true">
              <path d="M7.8 8.0C10.8 1.6 25.2 1.6 28.2 8.0" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
              <path d="M9.8 10.4C12.8 15.6 23.2 15.6 26.2 10.4" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.78" stroke-linecap="round"/>
              <path d="M3.2 9A14.8 4.4 0 0 1 32.8 9" transform="rotate(-11 18 9)" fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.42"/>
              <circle cx="18" cy="9" r="4.5" fill="currentColor"/>
              <path d="M3.2 9A14.8 4.4 0 0 0 32.8 9" transform="rotate(-11 18 9)" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>
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

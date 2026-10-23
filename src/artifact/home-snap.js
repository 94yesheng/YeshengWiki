/**
 * 主页的滚动吸附 —— 快要滑到某一屏时，把它吸到顶栏下面（整屏居中）。
 *
 * 手感照搬旧主页那段脚本（用户明确要恢复它）：
 *   · 300ms —— 比浏览器默认那一下快一档
 *   · easeOutCubic —— 非线性：起步快、接近目标时收住
 *   · 阈值 0.2 屏 —— 离某一屏不到五分之一屏才吸过去；离得远就自由滚，不硬拽
 *   · 用户在动画期间一动滚轮 / 触摸 / 键盘，立刻让位
 *
 * 【移动端适配】
 * 窄屏（<= 900px）与触屏设备下，各分屏高度自适应内容（height: auto），可能超过一屏；
 * 若继续触发整屏吸附，会在向下滑动阅读分屏下半部分时被强行拉回分屏顶部，因此移动端自动停用吸附。
 */
(function () {
  // 只在主页跑（布局在 body 上写了 data-page）
  if (document.body.dataset.page !== 'home') return;

  const screens = Array.from(document.querySelectorAll('.screen'));
  if (screens.length < 2) return;

  // 最后一屏（友链）与页脚直接相接：滚过它的顶端后不再吸回，
  // 否则停留位置只要落在阈值内，就会被自动吸回友链屏，页脚很难到达。
  const lastScreen = screens[screens.length - 1];

  // 尊重系统的「减少动态效果」
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const isMobileOrTouch = () =>
    window.innerWidth <= 900 ||
    matchMedia('(max-width: 56.25rem), (pointer: coarse)').matches;

  const nav = document.querySelector('.site-nav-bar');
  const getNavH = () => (nav ? nav.offsetHeight : 0);

  const DURATION = 300;
  const THRESHOLD = 0.2;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  let raf = 0;
  let animating = false;

  /** 某一屏对齐之后，页面应该停在的滚动位置 */
  const targetOf = (el) => el.getBoundingClientRect().top + window.scrollY - getNavH();

  const animateTo = (target) => {
    const start = window.scrollY;
    const delta = target - start;
    if (Math.abs(delta) < 2) return;

    cancelAnimationFrame(raf);
    animating = true;
    const t0 = performance.now();

    const step = (now) => {
      const p = Math.min(1, (now - t0) / DURATION);
      // 必须用 instant：CSS 上开着 scroll-behavior: smooth，
      // 不加这个参数的话每一帧的 scrollTo 都会各自触发一次平滑滚动，互相打架。
      window.scrollTo({ top: start + delta * easeOutCubic(p), behavior: 'instant' });
      if (p < 1) raf = requestAnimationFrame(step);
      else animating = false;
    };
    raf = requestAnimationFrame(step);
  };

  /** 滚停之后看一眼：离哪一屏最近？够近就吸过去 */
  const settle = () => {
    if (animating || isMobileOrTouch()) return;
    const y = window.scrollY;
    const range = window.innerHeight - getNavH();

    let target = null;
    let dist = Infinity;
    for (const s of screens) {
      const t = targetOf(s);
      // 已经滚过友链屏顶端，就允许继续往页脚走，不再吸回
      if (s === lastScreen && y > t + 2) continue;
      const d = Math.abs(y - t);
      if (d < dist) {
        dist = d;
        target = t;
      }
    }

    if (target !== null && dist > 2 && dist < range * THRESHOLD) animateTo(target);
  };

  // 用户一动就撒手，别和手指抢
  const abort = () => {
    cancelAnimationFrame(raf);
    animating = false;
  };
  for (const ev of ['wheel', 'touchstart', 'keydown']) {
    window.addEventListener(ev, abort, { passive: true });
  }

  if ('onscrollend' in window) {
    window.addEventListener('scrollend', settle);
  } else {
    // 老浏览器没有 scrollend，退化成「滚停 120ms 之后再看」
    let timer = 0;
    window.addEventListener(
      'scroll',
      () => {
        clearTimeout(timer);
        timer = window.setTimeout(settle, 120);
      },
      { passive: true }
    );
  }
})();

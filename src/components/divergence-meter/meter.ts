/**
 * 世界线变动率探测仪的**客户端行为** —— 与站点、框架、主题全都无关，可以整个搬走。
 *
 * 它只认一组 DOM 约定（都是组件自己渲染出来的），所以换成别的宿主页也一样跑：
 *
 *   [data-dm]                     根节点，可有多个
 *   .dm-tube                      一根管
 *   .dm-ghost  g[data-n]          虚影层里的一位（里面有 `path` 两段：本体 + 十字）
 *   .dm-lit-digit                 点亮层（里面有同样两段 `path`）
 *   .is-spinning / .is-settled    这两个类由本模块加，样式那边认它们做闪烁/呼吸
 *
 * 字形数据**不从 JS 里来** —— 直接从自己那根管的虚影层上抄（按 `data-n` 取，不靠
 * DOM 顺序）。虚影层本来就有 0–9 十位，所以改字形只改 `glyphs.ts`，这里不用动。
 */

type Digit = { parts: string[]; transform: string | null };

type Tube = {
  /** 点亮层那位 —— 也是"这根管现在显示的是几"的唯一出处 */
  lit: SVGGElement;
  /** 点亮层里那两段 path（本体 + 十字），换数字就是换它们的 d */
  parts: SVGPathElement[];
  /** 虚影层里 0–9 各自的形状，按数字索引 */
  byN: Map<number, Digit>;
  /** 挂 is-spinning / is-settled 的那个元素 */
  host: Element;
};

/** 乱跳多久 / 多久换一次数字（跟屏幕刷新率走会糊成一片） */
const SPIN_MS = 1400;
const TICK_MS = 45;
/** 露出多少才算"滚到页脚了" */
const VISIBLE_RATIO = 0.9;

const rnd = () => Math.floor(Math.random() * 10);

function collect(meter: HTMLElement): Tube[] {
  const tubes: Tube[] = [];

  for (const tube of meter.querySelectorAll<HTMLElement>('.dm-tube')) {
    // 只认"数字位"：小数点那根管点亮的是个圆，没有 d 可换
    const lit = tube.querySelector<SVGGElement>('.dm-lit-digit');
    const ghost = tube.querySelector<SVGSVGElement>('.dm-ghost');
    if (!lit || !ghost) continue;

    const byN = new Map<number, Digit>();
    for (const g of ghost.querySelectorAll<SVGGElement>('g[data-n]')) {
      const n = Number(g.dataset.n);
      if (!Number.isInteger(n)) continue;
      byN.set(n, {
        parts: [...g.querySelectorAll<SVGPathElement>('path')].map((p) => p.getAttribute('d') ?? ''),
        transform: g.getAttribute('transform'),
      });
    }
    if (byN.size === 0) continue;

    tubes.push({ lit, parts: [...lit.querySelectorAll<SVGPathElement>('path')], byN, host: tube });
  }

  return tubes;
}

function makeShow(tube: Tube) {
  return (n: number): void => {
    const src = tube.byN.get(n);
    if (!src) return;

    tube.parts.forEach((p, i) => p.setAttribute('d', src.parts[i] ?? ''));
    // transform 必须一起抄：6 是 9 转 180° 来的，漏了它 6 会倒着站
    if (src.transform === null) tube.lit.removeAttribute('transform');
    else tube.lit.setAttribute('transform', src.transform);

    tube.lit.dataset.value = String(n); // 让页面自己说得出"现在显示的是几"
  };
}

/**
 * 初始化页面上所有探测仪。
 * 可以在任意时机重复调用 —— 已经接上的不会重复接（根节点上留了标记）。
 */
export function initDivergenceMeters(scope: ParentNode = document): void {
  for (const meter of scope.querySelectorAll<HTMLElement>('[data-dm]')) {
    if (meter.dataset.dmReady === '1') continue;
    meter.dataset.dmReady = '1';

    const tubes = collect(meter);
    if (tubes.length === 0) continue;

    const show = tubes.map(makeShow);

    const settle = (target: number[]) => {
      tubes.forEach((tube, i) => {
        show[i](target[i]);
        tube.host.classList.remove('is-spinning');
        tube.host.classList.add('is-settled');
      });
    };

    // 整数位固定 1（世界线变动率都是 1.xxxxxx），小数点后几位**每次刷新重新随机**
    const target = tubes.map((_, i) => (i === 0 ? 1 : rnd()));

    // 时间到 → 七位**同时**定格，不是一位一位来
    const play = () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        settle(target);
        return;
      }

      for (const t of tubes) t.host.classList.add('is-spinning');

      const spinner = window.setInterval(() => {
        for (let i = 0; i < tubes.length; i++) show[i](rnd());
      }, TICK_MS);

      window.setTimeout(() => {
        window.clearInterval(spinner);
        settle(target);
      }, SPIN_MS);
    };

    // 用 IntersectionObserver 而不是"监听滚动算位置"：后者要在每次滚动里读
    // getBoundingClientRect，是典型的布局抖动来源；前者由浏览器在合成线程上判断。
    //
    // 注意：**白天模式整个是 display:none**，那时它永远不会相交、也就永远不会触发 ——
    // 这正是想要的；等切到夜间模式、元素有了布局，观察器会自己报一次，然后才播。
    if (!('IntersectionObserver' in window)) {
      play();
      continue;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        play();
      },
      { threshold: VISIBLE_RATIO }
    );
    io.observe(meter);
  }
}

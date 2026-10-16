/**
 * 白天 / 夜间 —— 全站一处，访客页和后台共用。
 *
 * 【为什么有一半是"字符串"】
 * 夜间模式必须在**首次绘制之前**定调：Astro 打包出来的 `<script>` 是 type="module"、
 * 天然 defer，等它跑完浅色已经画上去了，用 localStorage 切深色就会闪一下白（FOUC）。
 * 所以那一段只能是内联脚本（`<script is:inline>`），而内联脚本不参与打包、不能 import。
 *
 * 于是分成两半：
 *   · `THEME_BOOT` —— 那段字符串，页面用 `<script is:inline set:html={THEME_BOOT}>` 吐出去；
 *   · `toggleTheme` / `syncThemeColor` —— 运行时的切换，正常 import 用。
 * 一处定义、两处（BaseLayout 与 studio.astro）使用，不会漂移。
 *
 * 代价：禁用 JS 的访客永远是浅色（不做 `prefers-color-scheme` 兜底媒体查询 ——
 * 那等于把整套深色再抄一遍，不划算）。
 */

/** 两套主题下给手机浏览器地址栏用的颜色，与 tokens.css 的 --paper 一致 */
export const THEME_COLOR = { light: '#faf9f5', dark: '#141413' } as const;

/** 首屏前定调 —— 必须内联、必须同步跑完 */
export const THEME_BOOT = `(function () {
  var dark = false;
  try {
    var saved = localStorage.getItem('theme');
    dark = saved
      ? saved === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) {
    /* 隐私模式读 localStorage 会抛异常 —— 那样就退回浅色 */
  }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '${THEME_COLOR.dark}' : '${THEME_COLOR.light}');
})();`;

/** 当前是不是夜间 */
export const isDark = (): boolean => document.documentElement.dataset.theme === 'dark';

/** 按当前主题同步手机地址栏的颜色 */
export function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark() ? THEME_COLOR.dark : THEME_COLOR.light);
}

/** 切换主题并记住；返回切换后的主题 */
export function toggleTheme(): 'light' | 'dark' {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* 隐私模式下 localStorage 会抛异常 —— 那样就只是记不住，功能不受影响 */
  }
  syncThemeColor();
  return next;
}

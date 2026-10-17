/**
 * 把 code_artifact.html 原封不动地拆成 Astro 可用的四份产物。
 *
 * 【为什么用脚本而不是手抄】
 * 源文件 2,022,798 字节 / 4962 行，其中 91% 是内联 base64 图片。手抄 2318 行 CSS +
 * 1528 行 JS 一定会走样。这里按行号机械切分，只做一组**显式、带断言**的最小替换。
 * 用户以后给一版新的 code_artifact.html，重跑 `npm run import:artifact` 即可。
 *
 * 【产物】
 *   src/artifact/artifact.css         第 10–2326 行，原样
 *   src/artifact/artifact.js          第 3435–4960 行 + 补丁
 *   src/artifact/home.html            主页（导航 + 五屏 + 页脚/悬浮球/实验台/toast）
 *   src/artifact/article.html         文章页（导航 + 文章视图 + 页脚/悬浮球/实验台/toast）
 *   src/artifact/rail-topology.html   文章右栏第 1 张卡（FRP 拓扑，Mc 专属）
 *   src/artifact/rail-spec.html       文章右栏第 2 张卡（JDK 速查，Mc 专属）
 *
 * 【为什么不挂 prebuild】code_artifact.html 目前未跟踪；CI 里没有它会让构建直接失败。
 * 生成物进仓库，构建只消费生成物。
 *
 * 用法：node scripts/import-artifact.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'code_artifact.html');
const OUT = path.join(ROOT, 'src', 'artifact');

const fail = (msg) => {
  throw new Error('[import-artifact] ' + msg);
};
const assert = (cond, msg) => {
  if (!cond) fail(msg);
};

const raw = fs.readFileSync(SRC, 'utf8');
const lines = raw.split(/\r?\n/);
const L = (n) => lines[n - 1];
const cut = (a, b) => lines.slice(a - 1, b).join('\n');

/* --------------------------------------------------------------------------
   1. 边界断言 —— artifact 改版后切错会立刻停手，不会静默产出坏文件
   -------------------------------------------------------------------------- */
assert(L(9).includes('<style>'), '第 9 行不是 <style>');
assert(L(2327).includes('</style>'), '第 2327 行不是 </style>');
assert(L(2331).includes('<header class="site-nav-bar">'), '第 2331 行不是顶栏');
assert(L(2365).includes('view-switch-bar'), '第 2365 行不是视图切换器');
assert(L(2382).includes('</div>'), '第 2382 行不是视图切换器的收尾');
assert(L(2394).includes('</header>'), '第 2394 行不是顶栏收尾');
assert(L(3022).includes('</main>'), '第 3022 行不是 </main>');
assert(L(3025).includes('article-detail-view'), '第 3025 行不是文章视图');
assert(L(3324).includes('</section>'), '第 3324 行不是文章视图收尾');
assert(L(3433).includes('toast-msg'), '第 3433 行不是 toast');
assert(L(3435).includes('(function () {'), '第 3435 行不是 IIFE 开头');
assert(L(4960).includes('})();'), '第 4960 行不是 IIFE 结尾');
assert(L(3358).includes('fab-item'), '第 3358 行不是 FAB 的 view 项');
assert(L(3368).includes('</div>'), '第 3368 行不是 FAB view 项收尾');

/* --------------------------------------------------------------------------
   2. 切片
   -------------------------------------------------------------------------- */
const css = cut(10, 2326);
const jsRaw = cut(3435, 4960);

// 去掉视图切换器（2364–2382）与 FAB 的 view 项（3358–3368）
const NAV_A = cut(2331, 2363);
const NAV_B = cut(2383, 2394);
const MAIN_HOME = cut(2383, 3022); // 含导航收尾、刻度尺、五屏
const ARTICLE_BODY = cut(3025, 3324);
const TAIL_A = cut(3326, 3357);
const TAIL_B = cut(3369, 3433);

const homeRaw = [cut(2331, 2363), cut(2383, 3022), TAIL_A, TAIL_B].join('\n');

// 文章页：导航（无切换器/刻度尺）+ 文章视图 + 尾部
// 3199? 用明确的锚点行拼接，TOC / 正文 / 右栏 / pager 用占位符替换
const articleRaw = [
  NAV_A,
  NAV_B,
  cut(3025, 3099), // 到 TOC 的标题为止
  '@@TOC@@',
  cut(3106, 3129), // TOC 收尾 + 侧栏其余 + 正文容器开标签
  '@@PROSE@@',
  cut(3224, 3228), // 正文收尾 + 右栏 aside/sticky 开标签
  '@@RAIL_TOPOLOGY@@',
  cut(3255, 3255), // 空行
  '@@RAIL_SPEC@@',
  cut(3269, 3274), // 空行 + 第 3 张卡开标签 + kicker
  '@@RAIL_RELATED@@',
  cut(3301, 3305), // 第 3 张卡/侧栏/网格收尾
  '@@PAGER@@',
  cut(3316, 3324), // q-footbar + 收尾
  TAIL_A,
  TAIL_B,
].join('\n');

// 右栏前两张卡原样留一份 —— Mc 文章要用它们
const railTopology = cut(3229, 3254);
const railSpec = cut(3256, 3268);

/* --------------------------------------------------------------------------
   3. 替换工具：断言命中 + split/join（避免 $& 被 String.replace 当替换模式）
   -------------------------------------------------------------------------- */
const rep = (s, from, to, label) => {
  if (!s.includes(from)) fail(`补丁未命中：${label}`);
  return s.split(from).join(to);
};
const repRe = (s, re, fn, label) => {
  if (!re.test(s)) fail(`补丁未命中：${label}`);
  re.lastIndex = 0;
  return s.replace(re, fn);
};

/* --------------------------------------------------------------------------
   4. 主页补丁
   -------------------------------------------------------------------------- */
let home = homeRaw;

// 4.1 页脚：真实路由
home = rep(
  home,
  '<a href="#article-view" data-open-article="mc">进入文章详细页</a>',
  '<a href="/posts/mc-server/">进入文章详细页</a>',
  '页脚文章链接'
);
home = rep(
  home,
  '<a href="#screen-hero" data-preview-toast="RSS 订阅地址：https://www.yesheng.wiki/rss.xml">RSS</a>',
  '<a href="/rss.xml">RSS</a>',
  '页脚 RSS'
);

// 4.2 三个板块标题 → 真实子页（否则独立子页从主页进不去）
home = rep(
  home,
  '<a href="#screen-photos" data-preview-toast="正式站点击进入 /photos/ 全部照片墙归档页">',
  '<a href="/photos/">',
  '照片板块标题'
);
home = rep(
  home,
  '<a href="#screen-programs" data-preview-toast="正式站点击进入 /programs/ 独立程序页">',
  '<a href="/programs/">',
  '程序板块标题'
);
home = rep(
  home,
  '<a href="#screen-links" data-preview-toast="正式站点击进入 /links/ 独立友链页">',
  '<a href="/links/">',
  '友链板块标题'
);

// 4.3 照片墙：补 data-lightbox（原文件漏了，灯箱选择器 a[data-lightbox] 命中不到）
{
  const before = home;
  home = home.split('<a class="photo-link" href="data:image/jpeg;base64,').join(
    '<a class="photo-link" data-lightbox href="data:image/jpeg;base64,'
  );
  assert(home !== before, '照片墙 data-lightbox 未命中');
}

// 4.4 队列里的年份：artifact 写的是 2025，frontmatter 是 2026
home = home.split('2025.03.09').join('2026.03.09');
home = home.split('2025.02.24').join('2026.02.24');

// 4.5 文章板块标题 → 归档页
home = repRe(
  home,
  /<a href="#article-view" data-open-article="mc">(\s*)<span>文章<\/span>/,
  (m, ws) => `<a href="/posts/">${ws}<span>文章</span>`,
  '文章板块标题'
);

// 4.6 焦点位置：标题 / 封面 / 阅读按钮 → 真实路由
home = rep(
  home,
  '<a href="#article-view" id="spot-title-link" data-open-article="mc">',
  '<a href="/posts/mc-server/" id="spot-title-link">',
  'spot 标题链接'
);
home = rep(
  home,
  '<a class="posts-spot-cover" href="#article-view" data-open-article="mc" aria-label="点击打开文章详细页">',
  '<a class="posts-spot-cover" id="spot-cover-link" href="/posts/mc-server/" aria-label="点击打开文章详细页">',
  'spot 封面链接'
);
home = repRe(
  home,
  /<button type="button" class="q-read-btn" data-open-article="mc" id="spot-read-btn">([\s\S]*?)<\/button>/,
  (m, inner) => `<a class="q-read-btn" id="spot-read-btn" href="/posts/mc-server/">${inner}</a>`,
  'spot 阅读按钮'
);

// 4.7 队列四项的 href → 真实路由（保留 data-post-* 供预览）
const QUEUE = {
  jibao: '/posts/ji-bao/',
  maptoposter: '/posts/maptoposter/',
  blender: '/posts/blender/',
  deepseek: '/posts/deepseek-wechat/',
};
for (const [id, p] of Object.entries(QUEUE)) {
  const re = new RegExp('href="#screen-posts"(\\s+data-post-id="' + id + '")');
  home = repRe(home, re, (m, tail) => `href="${p}"${tail}`, `队列 ${id}`);
}

// 4.8 封面说明条是 Mc 专属技术栈，预览别的文章时会显示错
home = rep(
  home,
  '<span>FRP / JAVA 21 / PAPERMC</span>',
  '<span>ARCHIVE COVER // 静态配图</span>',
  '封面说明条'
);

/* --------------------------------------------------------------------------
   4.9 顶部导航 → 各栏的详情页
   --------------------------------------------------------------------------
   用户要求：导航栏点「文章 / 照片 / 程序 / 友链」应该进对应子页，
   而不是在主页里跳到第 N 屏。主页五屏之间的移动靠滚动 + 吸附（见 home-snap.js），
   首页内部的象限导览（.hero-q-index）和右侧刻度尺仍然保留锚点 —— 它们是页内导航。
   -------------------------------------------------------------------------- */
const NAV_MAP = {
  'screen-hero': '/',
  'screen-posts': '/posts/',
  'screen-photos': '/photos/',
  'screen-programs': '/programs/',
  'screen-links': '/links/',
};
const mapNav = (s) => {
  let out = s;
  for (const [sec, path] of Object.entries(NAV_MAP)) {
    // 主页是 #screen-x；文章页在 5.2 里已经被改成 /#screen-x
    out = out.split(`href="#${sec}" class="site-nav-link"`).join(`href="${path}" class="site-nav-link"`);
    out = out.split(`href="/#${sec}" class="site-nav-link"`).join(`href="${path}" class="site-nav-link"`);
  }
  out = out.split('href="#screen-hero" class="nav-brand"').join('href="/" class="nav-brand"');
  out = out.split('href="/#screen-hero" class="nav-brand"').join('href="/" class="nav-brand"');
  // **必须同时删掉 data-nav-section**：artifact 的脚本会给它绑 click 并 preventDefault，
  // 只改 href 的话点导航仍然会滚到主页内的位置 —— 正是用户要去掉的行为。
  out = out.replace(/\s+data-nav-section="screen-[a-z]+"/g, '');
  return out;
};
home = mapNav(home);

/* --------------------------------------------------------------------------
   5. 文章页补丁
   -------------------------------------------------------------------------- */
let article = articleRaw;

// 5.0 页脚（与主页共用同一段尾部，补丁也要再来一遍）
article = rep(
  article,
  '<a href="#article-view" data-open-article="mc">进入文章详细页</a>',
  '<a href="/posts/mc-server/">进入文章详细页</a>',
  '文章页页脚链接'
);
article = rep(
  article,
  '<a href="#screen-hero" data-preview-toast="RSS 订阅地址：https://www.yesheng.wiki/rss.xml">RSS</a>',
  '<a href="/rss.xml">RSS</a>',
  '文章页页脚 RSS'
);

// 5.1 去掉 hidden
article = rep(
  article,
  '<section class="article-detail-view" id="article-view" hidden>',
  '<section class="article-detail-view" id="article-view">',
  '文章视图 hidden'
);

// 5.2 导航：锚点回到主页 + 删掉 data-nav-section（否则点击会 setViewMode('home') 隐藏文章）
{
  const before = article;
  article = article.split('href="#screen-').join('href="/#screen-');
  assert(article !== before, '文章页导航锚点未命中');
  article = repRe(
    article,
    /\s+data-nav-section="screen-[a-z]+"/g,
    () => '',
    '文章页 data-nav-section'
  );
  article = repRe(article, /\s+aria-current="page"/g, () => '', '文章页 aria-current');
}

// 5.2b 导航 → 各栏详情页（与主页同一套映射）；文章页把「文章」标成当前页
article = mapNav(article);
article = rep(
  article,
  'href="/posts/" class="site-nav-link"',
  'href="/posts/" class="site-nav-link" aria-current="page"',
  '文章页导航高亮'
);

// 5.3 返回按钮：a 标签且**不带 id**（带 id 的话 JS 仍会先 setViewMode('home')）
article = repRe(
  article,
  /<button type="button" class="article-back-btn" id="article-back-home">([\s\S]*?)<\/button>/,
  (m, inner) => `<a class="article-back-btn" href="/">${inner}</a>`,
  '返回按钮'
);

// 5.4 顶栏
article = repRe(
  article,
  /(<div class="q-topbar-cell q-topbar-cell--center" id="detail-topbar-title">)[\s\S]*?(<\/div>)/,
  (m, a, b) => `${a}\n            @@TOPBAR_TITLE@@\n          ${b}`,
  '顶栏标题'
);
article = rep(article, '>DOC // 01<', '>DOC // @@ENTRY_NO@@<', '顶栏 DOC 编号');

// 5.5 标题 / lead / kicker
article = rep(
  article,
  '<h1 class="article-main-title" id="detail-main-title">如何快速零成本搭建一个 Mc 小型服务器</h1>',
  '<h1 class="article-main-title" id="detail-main-title">@@TITLE@@</h1>',
  '文章标题'
);
article = repRe(
  article,
  /(<p class="article-lead-summary" id="detail-lead-summary">)[\s\S]*?(<\/p>)/,
  (m, a, b) => `${a}\n                @@LEAD@@\n              ${b}`,
  '文章 lead'
);
article = rep(
  article,
  'ARCHIVE COORDINATE // ENTRY #01',
  '@@KICKER@@',
  'hero kicker'
);

// 5.6 telemetry 四项
article = rep(
  article,
  '<strong id="detail-meta-date">二〇二五年三月十三日</strong>',
  '<strong id="detail-meta-date">@@DATE@@</strong>',
  'telemetry 日期'
);
article = rep(
  article,
  '<strong id="detail-meta-tags">技术 · 服务器</strong>',
  '<strong id="detail-meta-tags">@@TAGS@@</strong>',
  'telemetry 标签'
);
article = rep(
  article,
  '<span>WORD COUNT // 字数统计</span>\n                <strong>约 2,400 字</strong>',
  '<span>WORD COUNT // 字数统计</span>\n                <strong id="detail-meta-words">@@WORDS@@</strong>',
  'telemetry 字数'
);
article = rep(
  article,
  '<span>TOPOLOGY // 状态</span>\n                <strong>持续维护</strong>',
  '<span>READING // 阅读时长</span>\n                <strong id="detail-meta-reading">@@READING@@</strong>',
  'telemetry 阅读时长'
);

// 5.7 进度初值 & 画布说明
article = rep(article, 'id="detail-top-progress">28%<', 'id="detail-top-progress">0%<', '顶栏进度');
article = rep(
  article,
  'id="sidebar-progress-text">28%<',
  'id="sidebar-progress-text">0%<',
  '侧栏进度'
);
article = rep(
  article,
  '<span>LOCAL : 25565 &lt;-&gt; FRP</span>',
  '<span>@@KINETIC_CAPTION@@</span>',
  '文章画布说明'
);

/* --------------------------------------------------------------------------
   6. JS 补丁
   -------------------------------------------------------------------------- */
let js = jsRaw;

// 6.1 视图状态由页面决定
js = rep(
  js,
  "    view: 'home',",
  "    view: document.body.dataset.page === 'article' ? 'article' : 'home',",
  'state.view'
);

// 6.2 原文件未定义的函数
js = rep(js, 'setTimeout(resizeArticleCanvas, 30);', 'setTimeout(resizeCanvas, 30);', 'resize 函数名');

// 6.3 ARTICLE_DB：修正 slug + 加 path
const DB = {
  mc: ['/posts/mc-server-zero-cost/', '/posts/mc-server/'],
  jibao: ['/posts/march-9-chicken-pot/', '/posts/ji-bao/'],
  maptoposter: ['/posts/map-to-poster/', '/posts/maptoposter/'],
  blender: ['/posts/seven-days-blender/', '/posts/blender/'],
  deepseek: ['/posts/deepseek-wechat-bot/', '/posts/deepseek-wechat/'],
};
for (const [id, [oldSlug, newPath]] of Object.entries(DB)) {
  const from = `      slug: '${oldSlug}',`;
  const to = `      slug: '${newPath}',\n      path: '${newPath}',`;
  js = rep(js, from, to, `ARTICLE_DB ${id}`);
}

// 6.4 RESET 后的默认封面：'__COVER_MC__' 不是 URL
js = rep(
  js,
  "    cover: '__COVER_MC__',",
  "    cover: (function () { var el = document.getElementById('spot-cover-img'); return el ? (el.getAttribute('src') || '') : ''; })(),",
  'defaultSpot.cover'
);

// 6.5 预览时把 data-open-article 写回去会让委托重新拦截 —— 改成写真实 href
js = rep(
  js,
  `    if (spotTitle) {
      spotTitle.textContent = data.title;
      spotTitle.dataset.openArticle = currentSpotId;
    }
    if (spotReadBtn) spotReadBtn.dataset.openArticle = currentSpotId;`,
  `    var spotPath =
      (ARTICLE_DB[currentSpotId] && ARTICLE_DB[currentSpotId].path) || '/posts/';
    var spotCoverLink = document.getElementById('spot-cover-link');
    if (spotTitle) {
      spotTitle.textContent = data.title;
      spotTitle.href = spotPath;
    }
    if (spotReadBtn) spotReadBtn.href = spotPath;
    if (spotCoverLink) spotCoverLink.href = spotPath;`,
  'applyPostSpotlight'
);

// 6.6 复制链接：原实现只弹 toast，根本没写剪贴板
js = rep(
  js,
  "      showToast('已复制文章永久链接：https://www.yesheng.wiki/posts/mc-server-zero-cost/');",
  `      var url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).catch(function () {});
      }
      showToast('已复制文章永久链接：' + url);`,
  '复制链接'
);

// 6.7 主题：不要覆盖 <head> 里 THEME_BOOT 的结果
js = rep(
  js,
  `  // 初始化主题（默认白天无限环模式）
  var initTheme = 'light';
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') initTheme = saved;
  } catch (e) {}
  applyTheme(initTheme);`,
  `  // 主题已由 <head> 里的 THEME_BOOT 定调（localStorage + prefers-color-scheme）。
  // 这里只把结果同步到画布状态与图标，绝不再重新决定主题。
  applyTheme(isDark() ? 'dark' : 'light');`,
  '主题初始化'
);

// 6.8 首帧前补尺寸与进度（否则画布可能是 300×150、进度停在静态值）
js = rep(
  js,
  '  requestAnimationFrame(renderFrame);',
  '  resizeCanvas();\n  onScrollUpdate();\n  requestAnimationFrame(renderFrame);',
  'RAF 初始化'
);

// 6.9 顶部严格 0%
js = rep(
  js,
  'Math.max(8, Math.round',
  'Math.max(0, Math.round',
  '进度下限'
);

/* --------------------------------------------------------------------------
   7. 最终断言
   -------------------------------------------------------------------------- */
const both = home + '\n' + article;
for (const bad of ['data-open-article', 'data-switch-article', 'data-switch-view']) {
  assert(!both.includes(bad), `产物里还残留 ${bad}`);
}
assert(!js.includes('resizeArticleCanvas'), 'JS 里还残留 resizeArticleCanvas');
assert(!js.includes('__COVER_MC__'), 'JS 里还残留 __COVER_MC__');
assert(!article.includes('mc-server-zero-cost'), '文章模板里还残留旧 slug');
assert(article.split('@@PROSE@@').length === 2, '@@PROSE@@ 必须恰好 1 个');
assert(article.includes('id="article-toc-list"') === false, 'TOC 应已被占位符替换');
assert(home.includes('id="toast-msg"'), 'home 缺 toast');
assert(article.includes('id="toast-msg"'), 'article 缺 toast');

// 顶部导航必须指向详情页，不能还留着页内锚点
const navBlock = (s) => (s.match(/<nav class="site-nav"[\s\S]*?<\/nav>/) || [''])[0];
assert(!navBlock(home).includes('#screen-'), '主页导航仍有页内锚点');
assert(!navBlock(article).includes('#screen-'), '文章页导航仍有页内锚点');
assert(navBlock(home).includes('href="/posts/"'), '主页导航缺 /posts/');
for (const token of ['@@TOC@@', '@@RAIL_TOPOLOGY@@', '@@RAIL_SPEC@@', '@@RAIL_RELATED@@', '@@PAGER@@']) {
  assert(article.includes(token), `文章模板缺占位符 ${token}`);
}

/* --------------------------------------------------------------------------
   8. 写出
   -------------------------------------------------------------------------- */
fs.mkdirSync(OUT, { recursive: true });
const write = (name, text) => {
  fs.writeFileSync(path.join(OUT, name), text);
  const kb = (Buffer.byteLength(text, 'utf8') / 1024).toFixed(1);
  console.log(`  ${name.padEnd(22)} ${kb.padStart(9)} KB`);
};

console.log('[import-artifact] 写出到 src/artifact/');
write('artifact.css', css);
write('artifact.js', js);
write('home.html', home);
write('article.html', article);
write('rail-topology.html', railTopology);
write('rail-spec.html', railSpec);

console.log('[import-artifact] 完成。');

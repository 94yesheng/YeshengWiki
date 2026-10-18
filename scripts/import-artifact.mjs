/**
 * 把 code_artifact.html 拆成 Astro 可用的产物。
 *
 * 采用显式锚点标记切分（不再受 CSS/HTML 行数增减影响），并对路由与占位符做严格断言。
 *
 * 【产物】
 *   src/artifact/artifact.css         <style> 内全部样式
 *   src/artifact/artifact.js          <script> 内全部行为 + Astro 路由补丁
 *   src/artifact/home/*.html          主页已按屏拆分（loader/header/hero/posts/photos/programs/links/tail）
 *   src/artifact/article.html         文章页（加载层 + 切换动画层 + 导航 + 文章视图 + 页脚/悬浮球/实验台/toast）
 *   src/artifact/rail-topology.html   文章右栏第 1 张卡（FRP 拓扑，Mc 专属）
 *   src/artifact/rail-spec.html       文章右栏第 2 张卡（JDK 速查，Mc 专属）
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

const raw = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

function extractBetween(str, startMarker, endMarker, label) {
  const i = str.indexOf(startMarker);
  assert(i !== -1, `未找到起始标记 (${label}): ${startMarker}`);
  const from = i + startMarker.length;
  const j = str.indexOf(endMarker, from);
  assert(j !== -1, `未找到结束标记 (${label}): ${endMarker}`);
  return str.slice(from, j).trim();
}

function removeBlock(str, startMarker, endMarker, label) {
  const i = str.indexOf(startMarker);
  assert(i !== -1, `未找到移除块起始 (${label}): ${startMarker}`);
  const j = str.indexOf(endMarker, i);
  assert(j !== -1, `未找到移除块结束 (${label}): ${endMarker}`);
  return str.slice(0, i) + str.slice(j + endMarker.length);
}

function replaceBlockWithToken(str, startMarker, endMarker, token, label) {
  const i = str.indexOf(startMarker);
  assert(i !== -1, `未找到替换块起始 (${label}): ${startMarker}`);
  const j = str.indexOf(endMarker, i);
  assert(j !== -1, `未找到替换块结束 (${label}): ${endMarker}`);
  return str.slice(0, i) + token + str.slice(j + endMarker.length);
}

/* --------------------------------------------------------------------------
   1. 提取 CSS 与 JS
   -------------------------------------------------------------------------- */
const css = extractBetween(raw, '<style>', '</style>', 'CSS');
const jsRaw = extractBetween(raw, '<script>', '</script>', 'JS');
assert(jsRaw.startsWith('(function () {'), 'JS 不是以 IIFE 开头');
assert(jsRaw.endsWith('})();'), 'JS 不是以 IIFE 结尾');

/* --------------------------------------------------------------------------
   2. 提取 Body 各区块
   -------------------------------------------------------------------------- */
const bodyInner = extractBetween(raw, '<body class="home" data-scale="ultrawide">', '<script>', 'Body');

const headerIdx = bodyInner.indexOf('  <header class="site-nav-bar">');
const rulerIdx = bodyInner.indexOf('  <!-- 右侧 5 屏独立分屏坐标刻度尺 -->');
const articleCommentIdx = bodyInner.indexOf('  <!-- 视图二：文章详细页');
const footerCommentIdx = bodyInner.indexOf('  <!-- 页脚 +');

assert(headerIdx !== -1 && rulerIdx !== -1 && articleCommentIdx !== -1 && footerCommentIdx !== -1, 'Body 核心区块标记缺失');

const loaderAndTrans = bodyInner.slice(0, headerIdx).trimEnd();
let navBlockRaw = bodyInner.slice(headerIdx, rulerIdx).trimEnd();
navBlockRaw = removeBlock(navBlockRaw, '<!-- [VIEW_SWITCH_START] -->', '<!-- [VIEW_SWITCH_END] -->', '视图切换器');

const homeMainRaw = bodyInner.slice(rulerIdx, articleCommentIdx).trimEnd();
let articleSectionRaw = bodyInner.slice(articleCommentIdx, footerCommentIdx).trimEnd();
let tailRaw = bodyInner.slice(footerCommentIdx).trimEnd();
tailRaw = removeBlock(tailRaw, '<!-- [FAB_VIEW_START] -->', '<!-- [FAB_VIEW_END] -->', 'FAB 视图切换按钮');

const railTopology = extractBetween(
  articleSectionRaw,
  '<!-- [RAIL_TOPOLOGY_START] -->',
  '<!-- [RAIL_TOPOLOGY_END] -->',
  'rail-topology'
);
const railSpec = extractBetween(
  articleSectionRaw,
  '<!-- [RAIL_SPEC_START] -->',
  '<!-- [RAIL_SPEC_END] -->',
  'rail-spec'
);

articleSectionRaw = replaceBlockWithToken(articleSectionRaw, '<!-- [TOC_START] -->', '<!-- [TOC_END] -->', '@@TOC@@', 'TOC');
articleSectionRaw = replaceBlockWithToken(articleSectionRaw, '<!-- [PROSE_START] -->', '<!-- [PROSE_END] -->', '@@PROSE@@', 'PROSE');
articleSectionRaw = replaceBlockWithToken(articleSectionRaw, '<!-- [RAIL_TOPOLOGY_START] -->', '<!-- [RAIL_TOPOLOGY_END] -->', '@@RAIL_TOPOLOGY@@', 'RAIL_TOPOLOGY');
articleSectionRaw = replaceBlockWithToken(articleSectionRaw, '<!-- [RAIL_SPEC_START] -->', '<!-- [RAIL_SPEC_END] -->', '@@RAIL_SPEC@@', 'RAIL_SPEC');
articleSectionRaw = replaceBlockWithToken(articleSectionRaw, '<!-- [RAIL_RELATED_START] -->', '<!-- [RAIL_RELATED_END] -->', '@@RAIL_RELATED@@', 'RAIL_RELATED');
articleSectionRaw = replaceBlockWithToken(articleSectionRaw, '<!-- [PAGER_START] -->', '<!-- [PAGER_END] -->', '@@PAGER@@', 'PAGER');

const homeRaw = [loaderAndTrans, navBlockRaw, homeMainRaw, tailRaw].join('\n');
const articleRaw = [loaderAndTrans, navBlockRaw, articleSectionRaw, tailRaw].join('\n');

/* --------------------------------------------------------------------------
   3. 替换工具
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

// 4.1 页脚与第五屏真实路由
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
home = rep(
  home,
  '<a class="stage-mini-btn" href="#screen-links" data-preview-toast="正式站打开 /rss.xml 全文订阅源" style="flex:1; text-align:center;">订阅 RSS 源 -&gt;</a>',
  '<a class="stage-mini-btn" href="/rss.xml" style="flex:1; text-align:center;">订阅 RSS 源 -&gt;</a>',
  '第五屏名片 RSS 按钮'
);
home = rep(
  home,
  '<a class="peer-link-action" href="#screen-links" data-preview-toast="正式站点击进入 /links/ 友链与站点说明子页">查看完整站点说明 -&gt;</a>',
  '<a class="peer-link-action" href="/links/">查看完整站点说明 -&gt;</a>',
  '第五屏站点说明链接'
);
home = rep(
  home,
  '<a class="peer-link-action" href="#screen-posts" data-open-article="mc">浏览文章归档 -&gt;</a>',
  '<a class="peer-link-action" href="/posts/">浏览文章归档 -&gt;</a>',
  '第五屏浏览文章链接'
);
home = rep(
  home,
  '<a class="peer-link-action" href="#screen-links" data-preview-toast="RSS 订阅地址：https://www.yesheng.wiki/rss.xml">RSS 全文订阅 -&gt;</a>',
  '<a href="/rss.xml" class="peer-link-action">RSS 全文订阅 -&gt;</a>',
  '第五屏卡片 RSS 链接'
);

// 4.2 三个板块标题 → 真实子页
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
  '<a href="#screen-links" data-preview-toast="正式站点击进入 /links/ 独立友链与站点说明页">',
  '<a href="/links/">',
  '友链板块标题'
);

// 4.3 文章板块标题 → 归档页
home = repRe(
  home,
  /<a href="#article-view" data-open-article="mc">(\s*)<span>文章<\/span>/,
  (m, ws) => `<a href="/posts/">${ws}<span>文章</span>`,
  '文章板块标题'
);

// 4.4 焦点位置：标题 / 封面 / 阅读按钮 → 真实路由
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

// 4.5 队列四项的 href → 真实路由
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

home = rep(
  home,
  '<span>FRP / JAVA 21 / PAPERMC</span>',
  '<span>ARCHIVE COVER // 16:9 静态配图</span>',
  '封面说明条'
);

// 4.6 顶部导航 → 各栏的详情页
const NAV_MAP = {
  'screen-hero': '/',
  'screen-posts': '/posts/',
  'screen-photos': '/photos/',
  'screen-programs': '/programs/',
  'screen-links': '/links/',
};
const mapNav = (s) => {
  let out = s;
  for (const [sec, p] of Object.entries(NAV_MAP)) {
    out = out.split(`href="#${sec}" class="site-nav-link"`).join(`href="${p}" class="site-nav-link"`);
    out = out.split(`href="/#${sec}" class="site-nav-link"`).join(`href="${p}" class="site-nav-link"`);
  }
  out = out.split('href="#screen-hero" class="nav-brand"').join('href="/" class="nav-brand"');
  out = out.split('href="/#screen-hero" class="nav-brand"').join('href="/" class="nav-brand"');
  out = out.replace(/\s+data-nav-section="screen-[a-z]+"/g, '');
  return out;
};
home = mapNav(home);

/* --------------------------------------------------------------------------
   5. 文章页补丁
   -------------------------------------------------------------------------- */
let article = articleRaw;

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
article = rep(
  article,
  '<a href="#screen-hero" id="footer-dark-hint">',
  '<a href="/#screen-hero" id="footer-dark-hint">',
  '文章页页脚夜间提示锚点'
);

article = rep(
  article,
  '<section class="article-detail-view" id="article-view" hidden>',
  '<section class="article-detail-view" id="article-view">',
  '文章视图 hidden'
);

article = article.replace(/\s+aria-current="page"/g, '');
article = mapNav(article);
article = rep(
  article,
  'href="/posts/" class="site-nav-link"',
  'href="/posts/" class="site-nav-link" aria-current="page"',
  '文章页导航高亮'
);

article = repRe(
  article,
  /<button type="button" class="article-back-btn" id="article-back-home">([\s\S]*?)<\/button>/,
  (m, inner) => `<a class="article-back-btn" href="/">${inner}</a>`,
  '返回按钮'
);

article = repRe(
  article,
  /(<div class="q-topbar-cell q-topbar-cell--center" id="detail-topbar-title">)[\s\S]*?(<\/div>)/,
  (m, a, b) => `${a}\n            @@TOPBAR_TITLE@@\n          ${b}`,
  '顶栏标题'
);
article = rep(article, '>DOC // 01<', '>DOC // @@ENTRY_NO@@<', '顶栏 DOC 编号');

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

article = rep(article, 'id="detail-top-progress">28%<', 'id="detail-top-progress">0%<', '顶栏进度');
article = rep(article, 'id="sidebar-progress-text">28%<', 'id="sidebar-progress-text">0%<', '侧栏进度');
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

js = rep(
  js,
  "    view: 'home',",
  "    view: document.body.dataset.page === 'article' ? 'article' : 'home',",
  'state.view'
);

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

js = rep(
  js,
  `  // 初始化主题（默认白天无限环模式）
  var initTheme = 'light';
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') initTheme = saved;
  } catch (e) {}
  applyTheme(initTheme, false);`,
  `  // 主题已由 <head> 里的 THEME_BOOT 定调（localStorage + prefers-color-scheme）。
  applyTheme(isDark() ? 'dark' : 'light', false);`,
  '主题初始化'
);

js = rep(
  js,
  '  requestAnimationFrame(renderFrame);',
  '  resizeCanvas();\n  onScrollUpdate();\n  requestAnimationFrame(renderFrame);',
  'RAF 初始化'
);

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
// home.html 已拆分为 src/artifact/home/*.html，这里不再输出单体文件。
// 保留 line 会重新生成 1.7MB 的 home.html，网页端 agent 读取仓库时又会撑爆上下文。
// write('home.html', home);
console.log('[import-artifact] home 已拆分，跳过单体 home.html 输出');
write('article.html', article);
write('rail-topology.html', railTopology);
write('rail-spec.html', railSpec);

console.log('[import-artifact] 完成。');

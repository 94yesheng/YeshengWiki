/**
 * 把最新一版 code_artifact 拆成 Astro 可用的产物。
 *
 * 源文件：demo/code_artifact (1).html（4.5MB 单页，含主页五屏 / 文章归档子页 /
 * 文章详细页 / 照片子页四个视图，以及 11 张内联 base64 图片）。
 *
 * 这里做三件事：
 *   1. 按显式标记切出 CSS / JS / 各视图 HTML；
 *   2. 把内联 base64 换回 public/artifact/home/images/ 下已有的文件（按 SHA-1 匹配）；
 *   3. 把 artifact 的「页内视图切换」改造成本站的多页路由，并给文章模板打上
 *      @@TOKEN@@ 占位符。
 *
 * 【产物】
 *   src/artifact/artifact.css          <style> 内全部样式
 *   src/artifact/artifact.js           <script> 内全部行为 + 本站补丁
 *   src/artifact/home/*.html           主页拆分为 loader/header/hero/posts/photos/
 *                                      programs/links/tail，供 HomeArtifact 拼接
 *   src/artifact/posts.html            /posts/ 整页（loader + header + 时间轴 + tail）
 *   src/artifact/photos.html           /photos/ 整页（loader + header + 检视台 + tail）
 *   src/artifact/article.html          /posts/<slug>/ 模板（含占位符）
 *   src/artifact/rail-topology.html    文章右栏第 1 张卡（FRP 拓扑，Mc 专属）
 *   src/artifact/rail-spec.html        文章右栏第 2 张卡（JDK 速查，Mc 专属）
 *
 * 用法：node scripts/import-artifact.mjs
 *
 * 注意：源文件在 demo/ 下且被 .gitignore 忽略，CI 里没有它，所以不要挂到
 * prebuild；`npm run build` 不依赖本脚本。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'demo', 'code_artifact (1).html');
const OUT = path.join(ROOT, 'src', 'artifact');
const HOME_OUT = path.join(OUT, 'home');
const IMAGE_DIR = path.join(ROOT, 'public', 'artifact', 'home', 'images');
const ROLLBACK_DIR = path.join(ROOT, 'scripts', 'artifact-patches', 'animation-rollback');

/**
 * 动画回滚补丁（用户 2026-10-18 明确要求保留上一版的手感）：
 *   - 开屏 loader：本地 80 粒子绽放 → 无限流形收束（1050ms）
 *   - 昼夜切换：本地全屏 veil + ∞ ↔ 黑洞形变
 *   - 主页无限环：本地 5 条骨架流线 + 纯粒子（不是新版的 7  ribbons）
 * 这些块从 .backup/merge-2026-10-18 抽取后固化在 scripts/artifact-patches/。
 */
const rollback = (name) =>
  fs
    .readFileSync(path.join(ROLLBACK_DIR, name), 'utf8')
    .replace(/^\n+/, '')
    .trimEnd();

const fail = (msg) => {
  throw new Error('[import-artifact] ' + msg);
};
const assert = (cond, msg) => {
  if (!cond) fail(msg);
};

let raw = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

/* --------------------------------------------------------------------------
   0. 内联图片 → 已提取的 public 文件
   -------------------------------------------------------------------------- */
const imageHashes = new Map();
for (const file of fs.readdirSync(IMAGE_DIR)) {
  if (!/\.(jpe?g|png|webp|gif)$/i.test(file)) continue;
  const buf = fs.readFileSync(path.join(IMAGE_DIR, file));
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  imageHashes.set(hash, '/artifact/home/images/' + file);
}

let embeddedImages = 0;
function restoreImages(text) {
  return text.replace(
    /data:image\/[a-z+]+;base64,([A-Za-z0-9+/=\s]+)/g,
    (match, b64) => {
      const buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
      const hash = crypto.createHash('sha1').update(buf).digest('hex');
      const asset = imageHashes.get(hash);
      assert(asset, `发现未提取的内联图片（sha1 ${hash.slice(0, 12)}…）`);
      embeddedImages += 1;
      return asset;
    }
  );
}
raw = restoreImages(raw);

/* --------------------------------------------------------------------------
   1. 基础工具
   -------------------------------------------------------------------------- */
function sliceBetween(str, startMarker, endMarker, label) {
  const i = str.indexOf(startMarker);
  assert(i !== -1, `未找到起始标记 (${label}): ${startMarker}`);
  const from = i + startMarker.length;
  const j = str.indexOf(endMarker, from);
  assert(j !== -1, `未找到结束标记 (${label}): ${endMarker}`);
  return str.slice(from, j);
}

function sliceInclusive(str, startMarker, endMarker, label) {
  const i = str.indexOf(startMarker);
  assert(i !== -1, `未找到起始标记 (${label}): ${startMarker}`);
  const j = str.indexOf(endMarker, i);
  assert(j !== -1, `未找到结束标记 (${label}): ${endMarker}`);
  return str.slice(i, j + endMarker.length);
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

function replaceSegment(str, startMarker, endMarker, replacement, label) {
  const i = str.indexOf(startMarker);
  assert(i !== -1, `未找到片段起点 (${label}): ${startMarker.slice(0, 60)}…`);
  const j = str.indexOf(endMarker, i + startMarker.length);
  assert(j !== -1, `未找到片段终点 (${label}): ${endMarker.slice(0, 60)}…`);
  return str.slice(0, i) + replacement.trimEnd() + '\n\n' + str.slice(j);
}

const rep = (s, from, to, label) => {
  if (!s.includes(from)) fail(`补丁未命中：${label}`);
  return s.split(from).join(to);
};

function cleanAttrs(attrs, names) {
  let out = attrs;
  for (const name of names) {
    out = out.replace(new RegExp(`\\s*${name}(?:="[^"]*")?`, 'g'), '');
  }
  return out;
}

/* --------------------------------------------------------------------------
   2. 提取 CSS / JS / Body
   -------------------------------------------------------------------------- */
let css = sliceBetween(raw, '<style>', '</style>', 'CSS').trim();
const jsRaw = sliceBetween(raw, '<script>', '</script>', 'JS').trim();
assert(jsRaw.startsWith('(function () {'), 'JS 不是以 IIFE 开头');
assert(jsRaw.endsWith('})();'), 'JS 不是以 IIFE 结尾');

/* 动画回滚：把新版 loader / 昼夜切换 CSS 换回上一版本地实现 */
css = replaceSegment(
  css,
  '    /* ========================================================================\n       需求 7：简洁页面加载动画',
  '    /* ========================================================================\n       需求 8：昼夜切换过渡动画',
  rollback('loader.css.txt'),
  'loader CSS 回滚'
);
css = replaceSegment(
  css,
  '    /* ========================================================================\n       需求 8：昼夜切换过渡动画',
  '    /* 顶层导航栏 */',
  rollback('theme-transition.css.txt'),
  '昼夜切换 CSS 回滚'
);
css = replaceSegment(
  css,
  '    /* 需求 6：推倒重做的无边框全屏三维无限流形加载动画',
  '    /* 需求 4：主页照片栏',
  '',
  '移除新版 loader 覆盖'
);

const bodyInner = sliceBetween(
  raw,
  '<body class="home" data-scale="ultrawide">',
  '<script>',
  'Body'
);

const headerStart = bodyInner.indexOf('<header class="site-nav-bar">');
const homeMainStart = bodyInner.indexOf('<main id="home-view">');
const postsStart = bodyInner.indexOf('<section class="posts-subpage-view" id="posts-view" hidden>');
const articleStart = bodyInner.indexOf('<section class="article-detail-view" id="article-view" hidden>');
const photosStart = bodyInner.indexOf('<section class="photos-detail-view" id="photos-view" hidden>');
const footerStart = bodyInner.indexOf('<footer class="site-foot">');
assert(
  headerStart !== -1 &&
    homeMainStart !== -1 &&
    postsStart !== -1 &&
    articleStart !== -1 &&
    photosStart !== -1 &&
    footerStart !== -1,
  'Body 核心区块标记缺失'
);
assert(
  headerStart < homeMainStart &&
    homeMainStart < postsStart &&
    postsStart < articleStart &&
    articleStart < photosStart &&
    photosStart < footerStart,
  'Body 区块顺序异常'
);

const loaderAndTransSource = bodyInner.slice(0, headerStart).trimEnd();
assert(loaderAndTransSource.includes('loader-floating-hud'), '新源加载层标记异常');
// 开屏动画回滚：使用上一版 loader + veil 的 DOM
const loaderAndTrans = rollback('loader.html.txt');
const headerAndRulerRaw = bodyInner.slice(headerStart, homeMainStart).trimEnd();
const headerClose = headerAndRulerRaw.indexOf('</header>');
assert(headerClose !== -1, '页头缺少 </header>');
const headerRaw = headerAndRulerRaw.slice(0, headerClose + '</header>'.length);
const rulerRaw = headerAndRulerRaw.slice(headerClose + '</header>'.length).trim();
assert(rulerRaw.includes('id="screen-ruler"'), '页头后缺少右侧刻度尺');
const homeMainRaw = sliceInclusive(bodyInner, '<main id="home-view">', '</main>', 'home-view');

const postsRaw = bodyInner.slice(postsStart, articleStart).trimEnd();
const articleRawSource = bodyInner.slice(articleStart, photosStart).trimEnd();
const photosRaw = bodyInner.slice(photosStart, footerStart).trimEnd();

const tailRaw = bodyInner.slice(footerStart).trimEnd();

/* --------------------------------------------------------------------------
   3. 路由补丁：把页内视图锚点改成真实 URL
   -------------------------------------------------------------------------- */
const ARTICLE_PATH = {
  mc: '/posts/mc-server/',
  jibao: '/posts/ji-bao/',
  maptoposter: '/posts/maptoposter/',
  blender: '/posts/blender/',
  deepseek: '/posts/deepseek-wechat/',
};

const NAV_PATH = {
  home: '/',
  posts: '/posts/',
  photos: '/photos/',
  programs: '/programs/',
  links: '/links/',
};

function articlePath(key) {
  const p = ARTICLE_PATH[key];
  assert(p, `未知文章 key: ${key}`);
  return p;
}

/**
 * 把所有 <a> 的 artifact 视图锚点换成真实路由。
 * - data-open-article → /posts/<slug>/
 * - data-open-photos="N" → /photos/#frame-N
 * - data-nav-view → 对应一级路由（保留 data-nav-view 供顶栏高亮）
 * - data-preview-toast → /programs/、/links/ 或 /rss.xml
 * - data-post-id → 对应文章
 * - 残留的 #posts-view / #photos-view / #article-view
 */
function convertAnchors(s) {
  return s.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (match, attrs, inner) => {
    let href = null;
    const remove = [];

    const art = /data-open-article="([^"]+)"/.exec(attrs);
    const ph = /data-open-photos="([^"]+)"/.exec(attrs);
    const nav = /data-nav-view="([^"]+)"/.exec(attrs);
    const toast = /data-preview-toast="([^"]*)"/.exec(attrs);
    const post = /data-post-id="([^"]+)"/.exec(attrs);
    const existingHref = /href="([^"]*)"/.exec(attrs);

    if (art) {
      href = articlePath(art[1]);
      remove.push('data-open-article');
    } else if (ph) {
      href = `/photos/#frame-${ph[1]}`;
      remove.push('data-open-photos');
    } else if (post) {
      href = articlePath(post[1]);
    } else if (toast) {
      if (/RSS/i.test(toast[1])) href = '/rss.xml';
      else if (/\/programs\//.test(toast[1])) href = '/programs/';
      else href = '/links/';
      remove.push('data-preview-toast');
    } else if (nav) {
      href = NAV_PATH[nav[1]];
      assert(href, `未知导航 key: ${nav[1]}`);
    } else if (existingHref) {
      const h = existingHref[1];
      if (h === '#posts-view') href = '/posts/';
      else if (h === '#photos-view') href = '/photos/';
      else if (h === '#article-view') href = ARTICLE_PATH.mc;
      else if (h === '#home-view') href = '/';
    }

    if (!href) return match;

    const cleaned = cleanAttrs(attrs, ['href', ...remove]);
    return `<a${cleaned} href="${href}">${inner}</a>`;
  });
}

const BACK_PATH = {
  'posts-back-home': '/',
  'photos-back-home': '/',
  'article-back-posts': '/posts/',
  'article-back-home': '/',
};

/**
 * 把 artifact 里用 JS 切视图的 <button> 换成真正的链接（保留 class / style）。
 * 不换掉的话，在没有对应视图的页面上点一下就会把当前页隐藏成空白。
 */
function convertButtons(s) {
  return s.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (match, attrs, inner) => {
    const art = /data-open-article="([^"]+)"/.exec(attrs);
    const ph = /data-open-photos="([^"]+)"/.exec(attrs);
    const back = /id="([^"]+)"/.exec(attrs);

    let href = null;
    const remove = ['type'];
    if (art) {
      href = articlePath(art[1]);
      remove.push('data-open-article');
    } else if (ph) {
      href = `/photos/#frame-${ph[1]}`;
      remove.push('data-open-photos');
    } else if (back && BACK_PATH[back[1]]) {
      href = BACK_PATH[back[1]];
      remove.push('id');
    }

    if (!href) return match;

    const cleaned = cleanAttrs(attrs, remove);
    return `<a${cleaned} href="${href}">${inner}</a>`;
  });
}

function applyRoutePatches(s) {
  return convertButtons(convertAnchors(s));
}

/* --------------------------------------------------------------------------
   4. 主页各屏
   -------------------------------------------------------------------------- */
const HOME_SECTIONS = {
  hero: 'screen-hero',
  posts: 'screen-posts',
  photos: 'screen-photos',
  programs: 'screen-programs',
  links: 'screen-links',
};

function extractHomeSection(id) {
  const start = homeMainRaw.indexOf(`id="${id}"`);
  assert(start !== -1, `主页缺少 #${id}`);
  const open = homeMainRaw.lastIndexOf('<section', start);
  const next = homeMainRaw.indexOf('<section class="screen', start);
  const endLimit = next === -1 ? homeMainRaw.lastIndexOf('</main>') : next;
  const chunk = homeMainRaw.slice(open, endLimit);
  const close = chunk.lastIndexOf('</section>');
  assert(close !== -1, `主页 #${id} 缺少 </section>`);
  return chunk.slice(0, close + '</section>'.length).trim();
}

let loader = loaderAndTrans;
assert(loader.includes('id="loader-infinity-canvas"'), '加载层缺少 canvas');
loader = `<noscript><style>.infinity-loader{display:none!important}</style></noscript>\n` + loader;

let header = removeBlock(
  headerRaw,
  '<!-- [VIEW_SWITCH_START] -->',
  '<!-- [VIEW_SWITCH_END] -->',
  '视图切换器'
);
header = applyRoutePatches(header);

let tail = removeBlock(
  tailRaw,
  '<!-- [FAB_VIEW_START] -->',
  '<!-- [FAB_VIEW_END] -->',
  'FAB 视图切换按钮'
);
tail = applyRoutePatches(tail);

const homeSections = {};
for (const [key, id] of Object.entries(HOME_SECTIONS)) {
  homeSections[key] = applyRoutePatches(extractHomeSection(id));
}

// 首页 focus 卡片的封面要能被 applyPostSpotlight() 改写 href
assert(
  homeSections.posts.includes('<a class="posts-spot-cover"'),
  '补丁未命中：spot 封面链接'
);
homeSections.posts = homeSections.posts.replace(
  '<a class="posts-spot-cover"',
  '<a class="posts-spot-cover" id="spot-cover-link"'
);

// 无限环模型回滚后，首屏的静态遥测文案也要跟着回退
homeSections.hero = rep(
  homeSections.hero,
  'DAYLIGHT INFINITY // 主体流形丝带线与无粘连纯净粒子场',
  'DAYLIGHT INFINITY // 纯净暖色流形与无尾迹纯粒子场',
  'hero 顶栏文案'
);
homeSections.hero = rep(
  homeSections.hero,
  'SPATIAL LEMNISCATE · 多股三维流形丝带与纯净星团交织的立体无限环',
  'SPATIAL LEMNISCATE · 自然聚落星团交织的纯粒子立体无限环（零线段干扰）',
  'hero 坐标文案'
);
homeSections.hero = rep(
  homeSections.hero,
  'MANIFOLD RIBBONS + PARTICLES · ω = 1.0x',
  'PURE PARTICLE MANIFOLD · ω = 1.0x',
  'hero FIELD 遥测'
);
homeSections.hero = rep(
  homeSections.hero,
  '7 RIBBONS + N = 560 PARTICLES',
  'N = 560 · PURE PARTICLES ONLY',
  'hero ELEMENTS 遥测'
);

// 子页页脚：回到主页首屏要用绝对路径
const tailSubpage = applyRoutePatches(
  tailRaw
    .replace(
      'href="#screen-hero" id="footer-dark-hint"',
      'href="/#screen-hero" id="footer-dark-hint"'
    )
    .replace(/<!-- \[FAB_VIEW_START\] -->[\s\S]*?<!-- \[FAB_VIEW_END\] -->/, '')
);

/* --------------------------------------------------------------------------
   5. 文章模板
   -------------------------------------------------------------------------- */
let articleSource = applyRoutePatches(articleRawSource);
assert(articleSource.startsWith('<section class="article-detail-view"'), '文章视图起点异常');

const railTopology = sliceBetween(
  articleSource,
  '<!-- [RAIL_TOPOLOGY_START] -->',
  '<!-- [RAIL_TOPOLOGY_END] -->',
  'rail-topology'
).trim();
const railSpec = sliceBetween(
  articleSource,
  '<!-- [RAIL_SPEC_START] -->',
  '<!-- [RAIL_SPEC_END] -->',
  'rail-spec'
).trim();

articleSource = articleSource.replace(
  '<section class="article-detail-view" id="article-view" hidden>',
  '<section class="article-detail-view" id="article-view">'
);

articleSource = replaceBlockWithToken(
  articleSource,
  '<!-- [TOC_START] -->',
  '<!-- [TOC_END] -->',
  '@@TOC@@',
  'TOC'
);
articleSource = replaceBlockWithToken(
  articleSource,
  '<!-- [PROSE_START] -->',
  '<!-- [PROSE_END] -->',
  '@@PROSE@@',
  'PROSE'
);
articleSource = replaceBlockWithToken(
  articleSource,
  '<!-- [RAIL_TOPOLOGY_START] -->',
  '<!-- [RAIL_TOPOLOGY_END] -->',
  '@@RAIL_TOPOLOGY@@',
  'RAIL_TOPOLOGY'
);
articleSource = replaceBlockWithToken(
  articleSource,
  '<!-- [RAIL_SPEC_START] -->',
  '<!-- [RAIL_SPEC_END] -->',
  '@@RAIL_SPEC@@',
  'RAIL_SPEC'
);
articleSource = replaceBlockWithToken(
  articleSource,
  '<!-- [RAIL_RELATED_START] -->',
  '<!-- [RAIL_RELATED_END] -->',
  '@@RAIL_RELATED@@',
  'RAIL_RELATED'
);
articleSource = replaceBlockWithToken(
  articleSource,
  '<!-- [PAGER_START] -->',
  '<!-- [PAGER_END] -->',
  '@@PAGER@@',
  'PAGER'
);

articleSource = articleSource.replace(
  /(<div class="q-topbar-cell q-topbar-cell--center" id="detail-topbar-title">)[\s\S]*?(<\/div>)/,
  (m, a, b) => `${a}\n            @@TOPBAR_TITLE@@\n          ${b}`
);
articleSource = rep(articleSource, '>DOC // 01<', '>DOC // @@ENTRY_NO@@<', '顶栏 DOC 编号');
articleSource = articleSource.replace(
  /<h1 class="article-main-title" id="detail-main-title">[\s\S]*?<\/h1>/,
  '<h1 class="article-main-title" id="detail-main-title">@@TITLE@@</h1>'
);
articleSource = articleSource.replace(
  /(<p class="article-lead-summary" id="detail-lead-summary">)[\s\S]*?(<\/p>)/,
  (m, a, b) => `${a}\n                @@LEAD@@\n              ${b}`
);
articleSource = articleSource.replace(
  /(<span class="spot-kicker" id="detail-kicker-badge"[^>]*>)[\s\S]*?(<\/span>)/,
  (m, a, b) => `${a}@@KICKER@@${b}`
);
articleSource = articleSource.replace(
  /<strong id="detail-meta-date">[\s\S]*?<\/strong>/,
  '<strong id="detail-meta-date">@@DATE@@</strong>'
);
articleSource = articleSource.replace(
  /<strong id="detail-meta-tags">[\s\S]*?<\/strong>/,
  '<strong id="detail-meta-tags">@@TAGS@@</strong>'
);
articleSource = articleSource.replace(
  /<strong id="detail-meta-words">[\s\S]*?<\/strong>/,
  '<strong id="detail-meta-words">@@WORDS@@</strong>'
);
articleSource = articleSource.replace(
  /<strong id="detail-meta-reading">[\s\S]*?<\/strong>/,
  '<strong id="detail-meta-reading">@@READING@@</strong>'
);
articleSource = rep(
  articleSource,
  'id="detail-top-progress">28%<',
  'id="detail-top-progress">0%<',
  '顶栏进度'
);
articleSource = rep(
  articleSource,
  'id="sidebar-progress-text">28%<',
  'id="sidebar-progress-text">0%<',
  '侧栏进度'
);
articleSource = rep(
  articleSource,
  '<span>LOCAL : 25565 &lt;-&gt; FRP</span>',
  '<span>@@KINETIC_CAPTION@@</span>',
  '文章画布说明'
);

articleSource = articleSource.replace(/\s+aria-current="page"/g, '');

/* --------------------------------------------------------------------------
   6. 归档页 / 照片页
   -------------------------------------------------------------------------- */
let postsSection = postsRaw.replace(
  '<section class="posts-subpage-view" id="posts-view" hidden>',
  '<section class="posts-subpage-view" id="posts-view">'
);
postsSection = applyRoutePatches(postsSection);
postsSection = postsSection.replace(/\s+aria-current="page"/g, '');

let photosSection = photosRaw.replace(
  '<section class="photos-detail-view" id="photos-view" hidden>',
  '<section class="photos-detail-view" id="photos-view">'
);
photosSection = applyRoutePatches(photosSection);
photosSection = photosSection.replace(/\s+aria-current="page"/g, '');

const highlightNav = (s, view) => {
  const without = s.replace(/\s+aria-current="page"/g, '');
  const marker = `<a class="site-nav-link" data-nav-view="${view}"`;
  assert(without.includes(marker), `导航缺少 data-nav-view="${view}"`);
  return without.replace(marker, marker + ' aria-current="page"');
};

const headerPosts = highlightNav(header, 'posts');
const headerPhotos = highlightNav(header, 'photos');

/* --------------------------------------------------------------------------
   7. JS 补丁
   -------------------------------------------------------------------------- */
let js = jsRaw;

/* 动画回滚：loader / 昼夜切换 / 白天无限环模型 */
js = replaceSegment(
  js,
  '  /* ========================================================================\n     需求 6B：推倒重做的无边框全屏三维灵动无限加载动画',
  '  /* ========================================================================\n     需求 6A：在原有无限 ↔ 黑洞形变动画基础上',
  rollback('loader.js.txt'),
  'loader JS 回滚'
);
js = replaceSegment(
  js,
  '  /* ========================================================================\n     需求 6A：在原有无限 ↔ 黑洞形变动画基础上',
  '  function commitThemeDOM(nextTheme) {',
  rollback('theme-transition.js.txt'),
  '昼夜切换 JS 回滚'
);
js = replaceSegment(
  js,
  '  /* ----------------------------------------------------------------------\n     需求 2 & 3（白天模型）：立体无限环',
  '  /* ----------------------------------------------------------------------\n     需求 2（夜间模型）：卡冈图雅黑洞流形线与纯粒子模型',
  rollback('infinity-model.js.txt'),
  '无限环模型回滚'
);

// 7.0 无限环回滚后，主题文案与实时遥测同步回退
js = rep(js, "      pillText: 'DAY // 立体无限流形',", "      pillText: 'DAY // 纯粒子无限环',", 'MODE pillText');
js = rep(
  js,
  "      topbarTag: 'DAYLIGHT INFINITY // 主体流形丝带线与无粘连纯净粒子场',",
  "      topbarTag: 'DAYLIGHT INFINITY // 纯净暖色流形与无尾迹纯粒子场',",
  'MODE topbarTag'
);
js = rep(
  js,
  "      coordText: 'SPATIAL LEMNISCATE · 多股三维流形丝带与纯净星团交织的立体无限环',",
  "      coordText: 'SPATIAL LEMNISCATE · 自然聚落星团交织的纯粒子立体无限环（零线段干扰）',",
  'MODE coordText'
);
js = rep(
  js,
  "      themeChip: 'DAY // 立体无限流形',",
  "      themeChip: 'DAY // 纯粒子无限环',",
  'MODE themeChip'
);
js = rep(
  js,
  "'∞ MANIFOLD RIBBONS · t='",
  "'∞ PURE PARTICLE MANIFOLD · t='",
  'telemetry phase'
);
js = rep(
  js,
  "telemetryPcount.textContent = '7 RIBBONS + N = ' + state.particleCount + ' PARTICLES';",
  "telemetryPcount.textContent = 'N = ' + state.particleCount + ' · PURE PARTICLES ONLY';",
  'telemetry pcount'
);

// 7.1 复制链接：使用当前页面地址，而不是 artifact 里写死的示例 slug
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

// 7.2 首页焦点文章：恢复真实 href（本站是多页路由，不切视图）
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

// 7.3 视图切换：单页面上缺少目标视图时直接跳转，别把当前页隐藏成空白
js = rep(
  js,
  '  function setViewMode(nextView, param) {',
  `  function setViewMode(nextView, param) {
    if (nextView === 'home' && !homeView) {
      window.location.href = '/';
      return;
    }
    if (nextView === 'posts' && !postsView) {
      window.location.href = '/posts/';
      return;
    }
    if (nextView === 'article' && !articleView) {
      var articleDest =
        (ARTICLE_DB[param] && ARTICLE_DB[param].path) || '/posts/';
      window.location.href = articleDest;
      return;
    }
    if (nextView === 'photos' && !photosView) {
      window.location.href = '/photos/#frame-' + (param === undefined ? 0 : param);
      return;
    }`,
  'setViewMode 兜底'
);

// 7.4 初始化：主题由 THEME_BOOT 定调；照片页支持 #frame-N 深链
js = rep(
  js,
  `  // 初始化主题（默认白天无限环模式）
  var initTheme = 'light';
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') initTheme = saved;
  } catch (e) {}
  applyTheme(initTheme, false);
  selectPhotoInInspector(0);
  setTimeout(fitHomePhotoWallBounds, 60);

  requestAnimationFrame(renderFrame);`,
  `  // 主题已由 <head> 里的 THEME_BOOT 定调（localStorage + prefers-color-scheme）。
  applyTheme(isDark() ? 'dark' : 'light', false);
  var hashFrame = /^#frame-(\\d+)/.exec(window.location.hash);
  selectPhotoInInspector(hashFrame ? parseInt(hashFrame[1], 10) : 0);
  window.addEventListener('hashchange', function () {
    var m = /^#frame-(\\d+)/.exec(window.location.hash);
    if (m && photosView) {
      selectPhotoInInspector(parseInt(m[1], 10));
      var showcase = document.getElementById('photos-showcase-screen');
      if (showcase) showcase.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  setTimeout(fitHomePhotoWallBounds, 60);
  syncTopNavHighlight(state.view);

  resizeCanvas();
  onScrollUpdate();
  requestAnimationFrame(renderFrame);`,
  '初始化'
);

// 7.5 文章阅读进度允许从 0% 开始
js = rep(js, 'Math.max(8, Math.round', 'Math.max(0, Math.round', '进度下限');

/* --------------------------------------------------------------------------
   8. 最终断言
   -------------------------------------------------------------------------- */
const allHtml = [
  loader,
  header,
  ...Object.values(homeSections),
  tail,
  tailSubpage,
  postsSection,
  photosSection,
  articleSource,
].join('\n');

for (const bad of [
  'data-open-article',
  'data-open-photos',
  'data-preview-toast',
  'data-switch-view',
  'data-switch-article',
  'href="#posts-view"',
  'href="#photos-view"',
  'href="#article-view"',
]) {
  assert(!allHtml.includes(bad), `产物里还残留 ${bad}`);
}
assert(!js.includes('__COVER_MC__'), 'JS 里还残留 __COVER_MC__');
assert(!js.includes('resizeArticleCanvas'), 'JS 里还残留 resizeArticleCanvas');
assert(articleSource.split('@@PROSE@@').length === 2, '@@PROSE@@ 必须恰好 1 个');
for (const token of [
  '@@TOC@@',
  '@@RAIL_TOPOLOGY@@',
  '@@RAIL_SPEC@@',
  '@@RAIL_RELATED@@',
  '@@PAGER@@',
  '@@TITLE@@',
  '@@LEAD@@',
]) {
  assert(articleSource.includes(token), `文章模板缺占位符 ${token}`);
}
assert(!header.includes('href="#screen-'), '导航仍有页内锚点');
assert(header.includes('href="/posts/"'), '导航缺 /posts/');
assert(postsSection.includes('id="posts-chronicle-tl"'), '归档页缺时间轴');
assert(photosSection.includes('id="photos-inspector-grid"'), '照片页缺检视台');
assert(loader.includes('id="loader-pct-readout"'), '回滚后的加载器缺百分比节点');
assert(loader.includes('id="theme-transition-veil"'), '回滚后的切换层缺 veil');
assert(!loader.includes('loader-floating-hud'), '加载器仍是新版 markup');
assert(!css.includes('.loader-floating-hud'), 'CSS 里还残留新版 loader');
assert(!js.includes('loader-floating-hud'), 'JS 里还残留新版 loader');
assert(js.includes('function evalInfinityPoint3D'), '无限环模型未回滚');
assert(!js.includes('var numRibbons = 7'), '无限环仍是新版 ribbon 数');
assert(js.includes('var numRibbons = 5'), '无限环模型不是 5 条骨架流线');
assert(js.includes('transVeil'), '昼夜切换未回滚到 veil 版本');

/* --------------------------------------------------------------------------
   9. 写出
   -------------------------------------------------------------------------- */
fs.mkdirSync(HOME_OUT, { recursive: true });

const write = (file, text) => {
  fs.writeFileSync(file, text);
  const kb = (Buffer.byteLength(text, 'utf8') / 1024).toFixed(1);
  console.log(`  ${path.relative(ROOT, file).padEnd(34)} ${kb.padStart(9)} KB`);
};

console.log('[import-artifact] 写出：');
write(path.join(OUT, 'artifact.css'), css + '\n');
write(path.join(OUT, 'artifact.js'), js + '\n');

write(path.join(HOME_OUT, 'loader.html'), loader + '\n');
write(path.join(HOME_OUT, 'header.html'), [header, rulerRaw].join('\n') + '\n');
for (const key of Object.keys(HOME_SECTIONS)) {
  write(path.join(HOME_OUT, key + '.html'), homeSections[key] + '\n');
}
write(path.join(HOME_OUT, 'tail.html'), tail + '\n');

write(
  path.join(OUT, 'posts.html'),
  [loader, headerPosts, postsSection, tailSubpage].join('\n\n') + '\n'
);
write(
  path.join(OUT, 'photos.html'),
  [loader, headerPhotos, photosSection, tailSubpage].join('\n\n') + '\n'
);
write(
  path.join(OUT, 'article.html'),
  [loader, headerPosts, articleSource, tailSubpage].join('\n\n') + '\n'
);
write(path.join(OUT, 'rail-topology.html'), railTopology + '\n');
write(path.join(OUT, 'rail-spec.html'), railSpec + '\n');

console.log(
  `[import-artifact] 完成：${embeddedImages} 处内联图片已换回 public 文件，` +
    `${(Buffer.byteLength(css, 'utf8') / 1024).toFixed(0)} KB CSS / ` +
    `${(Buffer.byteLength(js, 'utf8') / 1024).toFixed(0)} KB JS。`
);

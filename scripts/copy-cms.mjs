/**
 * 把 Sveltia CMS 的浏览器包从 node_modules 复制到 public/admin/，并把里面的
 * 第三方字体地址改写成自己域名下的本地文件。
 *
 * 为什么不在 config.yml 里走 CDN：一是这个站刻意不依赖任何第三方（连字体都用系统
 * 自带的，就是为了不让第三方看到访客 IP），二是 jsdelivr / unpkg 在本机网络下并不可靠
 * （实测：三个字体文件里两个要重试才成功、一个直接失败），后台打不开的时候你没法排查。
 *
 * 为什么要改写字体地址：Sveltia 的界面自带三处 @font-face，默认从 cdn.jsdelivr.net
 * 加载。其中 material-symbols-outlined 是**图标字体** —— 加载失败的话按钮上的图标会
 * 退化成文字（"save" 之类），界面很难看。所以把这三个字体文件放进 public/admin/fonts/
 * （已在仓库里，见同目录 README），把这个包里的地址指过去。
 *
 * 为什么不把复制结果一起入库：那个包约 2.5MB（压缩后的 JS），每次升级 Sveltia 都会
 * 往 git 历史里再塞一份，永久膨胀。所以它由本脚本在 npm run dev / build 之前生成，
 * 并在 .gitignore 里排除 —— 仓库里只留"从哪个版本生成"这个事实（package.json 锁版本）。
 * 字体文件是例外，它们随版本很少变，直接入库。
 *
 * 必须连 chunks/ 一起复制：主包用 `document.currentScript.src` 相对定位分片，会按需
 * 加载 chunks/git.js（Git 后端）、chunks/react-dom.js 等。只复制主文件的话，后台能打开、
 * 但一用 Git 功能就挂。
 *
 * 用法：由 package.json 的 predev / prebuild 自动调用，通常不需要手动跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', '@sveltia', 'cms', 'dist');
const dest = path.join(root, 'public', 'admin');

if (!fs.existsSync(src)) {
  console.error(`[copy-cms] 找不到 ${src} —— 先运行 npm install（@sveltia/cms 是 devDependency）`);
  process.exit(1);
}

/** 上游字体地址 → 本地路径。本地文件在 public/admin/fonts/，随仓库入库 */
const FONT_REWRITES = {
  'https://cdn.jsdelivr.net/fontsource/fonts/source-sans-3:vf@5.3.1/latin-wght-normal.woff2':
    '/admin/fonts/source-sans-3-var.woff2',
  'https://cdn.jsdelivr.net/fontsource/fonts/material-symbols-outlined:vf@5.3.9/latin-wght-normal.woff2':
    '/admin/fonts/material-symbols-outlined-var.woff2',
  'https://cdn.jsdelivr.net/fontsource/fonts/noto-mono@5.3.0/latin-400-normal.woff2':
    '/admin/fonts/noto-mono-400.woff2',
};

/**
 * 跳过两类文件：
 *   .map —— source map，每个 10MB 左右，浏览器调试用不上
 *   .mjs —— ESM 版本，页面用的是 IIFE 的 .js，多带一份等于白占 2.5MB
 */
const skip = (name) => name.endsWith('.map') || name.endsWith('.mjs');

fs.mkdirSync(dest, { recursive: true });

let copied = 0;
let bytes = 0;
let rewritten = 0;

function rewriteFonts(file) {
  if (!file.endsWith('.js')) return;
  const text = fs.readFileSync(file, 'utf8');
  let out = text;
  for (const [from, to] of Object.entries(FONT_REWRITES)) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      rewritten += 1;
    }
  }
  if (out !== text) fs.writeFileSync(file, out);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
      copied += 1;
      rewriteFonts(toPath);
      bytes += fs.statSync(toPath).size;
    }
  }
}

copyDir(src, dest);

const version = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules', '@sveltia', 'cms', 'package.json'), 'utf8')
).version;

console.log(
  `[copy-cms] Sveltia CMS v${version} → public/admin/ （${copied} 个文件，${(bytes / 1024 / 1024).toFixed(1)} MB，改写字体地址 ${rewritten} 处）`
);

if (rewritten !== Object.keys(FONT_REWRITES).length) {
  console.warn(
    `[copy-cms] 警告：预期改写 ${Object.keys(FONT_REWRITES).length} 处字体地址，实际 ${rewritten} 处。` +
      '可能是 Sveltia 升级后改了字体 URL —— 请检查 public/admin/fonts/ 是否需要更新，' +
      '否则后台会去连 cdn.jsdelivr.net。'
  );
}

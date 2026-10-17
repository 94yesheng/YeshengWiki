# 夜笙的小世界

> 站点：<https://www.yesheng.wiki>
> 仓库：`94yesheng/YeshengWiki`（私有）
> 本地路径：`D:\blog`
> 文档更新：2026-10-18

---

## 0. 一句话说清这个项目

这是一个 **Astro 构建的纯静态博客**：内容写在本地 Markdown / JSON 里，跑一条命令（`npm run build`）生成一堆 HTML，再通过 FTP 传到香港虚拟主机。

**服务器上没有任何程序在运行** —— 没有 PHP、没有数据库、没有后端。它只负责把已经生成好的死文件发给访客，跟发一张图片没有区别。

写作有两条路：本地改文件，或者用浏览器打开 `/studio/`（纯前端后台，直接读写 GitHub 仓库）。两条路最终都变成一次 commit，再由 GitHub Actions 构建并上传。

---

## 1. 技术栈

| 项 | 值 | 说明 |
|---|---|---|
| 站点生成器 | Astro `^7.3.8` | 在**构建时**把源码编译成 HTML |
| Node.js | `>=22.12.0` | **只在本地构建时用**，服务器上不需要 |
| 语言 | TypeScript + CSS + Markdown | 没有 PHP / Java / Python 参与运行 |
| 图片处理 | Astro 内置图片管线（Sharp） | 构建时自动生成多档尺寸 + WebP |
| 样式 | 手写 CSS，无框架 | 没有 Tailwind、没有预处理器 |
| 客户端 JS | 访客页少量 | 文章列表标签筛选、照片灯箱、悬浮球、页脚彩蛋；主页/文章页另有 artifact 自带的一套交互与 canvas 动效 |
| 数据库 | **无** | 内容就是磁盘上的文件 |
| 部署 | GitHub Actions → FTP | 只传 `dist/` |

---

## 2. 快速开始

```bash
npm install          # 首次
npm run dev          # → http://localhost:4321（改文件热更新）
npm run build        # → dist/（要上传的就是它）
npm run preview      # 用构建产物起本地服务器
npm run check        # 类型检查（CI 里也会跑）
npm run vault        # 生成/更换后台解锁密文（见 7.3）
npm run import:artifact   # 从设计源重新生成 src/artifact/*（见 5.3）
```

开发服务器建议用后台模式（`CLAUDE.md` / `AGENTS.md` 里也是这条）：

```bash
astro dev --background
astro dev status | logs | stop
```

> 注意：`npx astro build` 会把 `node_modules/.vite` 写坏，之后 dev 取不到预打包依赖（504）。跑完构建再起 dev 前，先 `rm -rf node_modules/.vite`。

---

## 3. 目录结构

```
D:\blog\
├── astro.config.mjs          # 站点地址、输出格式、sitemap
├── package.json              # 依赖与命令
├── tsconfig.json             # TypeScript 严格模式
├── .gitignore                # 排除 dist/.astro/.work/mockups/node_modules/code_artifact.html
├── .gitattributes            # 仓库内一律 LF
├── CLAUDE.md / AGENTS.md     # AI 助手的项目约定（同一份文件）
├── README.md                 # 本文档
│
├── .github/workflows/deploy.yml   # push main → 类型检查 → 构建 → FTP
├── scripts/
│   ├── copy-cms.mjs          # 把 Sveltia 从 node_modules 复制到 public/admin（predev/prebuild）
│   ├── vault.mjs             # 命令行生成后台密文
│   ├── vault-ui.mjs/.html    # 带图形界面的密文生成器（npm run vault）
│   └── import-artifact.mjs   # 从 code_artifact.html 生成主页/文章页模板
│
├── src/
│   ├── pages/                # ★文件名 = 网址★
│   ├── layouts/
│   │   ├── BaseLayout.astro       # 纸墨体系的壳（子页用）
│   │   └── ArtifactLayout.astro   # HUD 体系的独立壳（主页/文章页用）
│   ├── components/           # 13 个单文件组件 + divergence-meter/
│   ├── artifact/             # 由 import-artifact.mjs 生成的 CSS/JS/HTML（入库）
│   ├── styles/               # tokens / base / prose / gallery / fab / studio / artifact-prose
│   ├── studio/               # 自建后台的逻辑（打包进 /studio/）
│   ├── utils/                # 取文章、日期、中文排版、主题、照片、时间线
│   ├── content/              # 文章 .md / 照片墙 .json / 友链 .json
│   ├── assets/               # 文章配图、照片原图（构建时处理）
│   ├── site.data.json        # 站名、导航、主页文案
│   ├── site.config.ts        # 上面那份数据的读取层
│   └── content.config.ts     # 内容集合的字段规则
│
├── public/                   # 原样复制到站点根
│   ├── favicon.ico/.svg
│   ├── .htaccess
│   ├── admin/                # Sveltia 备份后台（程序本体由 copy-cms 生成，字体/配置入库）
│   └── studio/vault.json     # 后台解锁密文（公开也无所谓）
│
├── dist/                     # 构建产物（上传这个目录里的内容）
├── node_modules/ .astro/     # 自动生成，别动
├── .work/                    # 迁移与验证工具（不进仓库）
├── mockups/                  # 设计阶段的样板（不进仓库）
└── code_artifact.html        # 外部导入的设计源（2 MB，不进仓库）
```

---

## 4. 页面与路由

| 网址 | 文件 | 布局/视觉 | 说明 |
|---|---|---|---|
| `/` | `src/pages/index.astro` | **ArtifactLayout（HUD）** | 五屏：hero / 文章 / 照片 / 程序 / 友链；滚动吸附 |
| `/posts/` | `src/pages/posts/index.astro` | BaseLayout（纸墨） | 年 → 月 → 条目的时间线 + 标签筛选 |
| `/posts/<slug>/` | `src/pages/posts/[...slug].astro` | **ArtifactLayout（HUD）** | 顶栏 + 双象限 hero + 三栏工作区 + 上下篇 |
| `/photos/` | `src/pages/photos.astro` | BaseLayout（纸墨） | 时间线分组 + 照片墙 + 点击放大 |
| `/links/` | `src/pages/links.astro` | BaseLayout（纸墨） | 友链卡片 |
| `/programs/` | `src/pages/programs.astro` | BaseLayout（纸墨） | 占位页 |
| `/studio/` | `src/pages/studio.astro` | 独立页面 | 自建后台（三栏 JS 应用） |
| `/admin/` | `public/admin/index.html` | 独立页面 | Sveltia 备份后台 |
| `/rss.xml` | `src/pages/rss.xml.js` | — | RSS |
| `/sitemap-*.xml` | 构建生成 | — | 自动排除 `/studio` `/admin` |

> **当前视觉是两套并存的**：主页和文章页是外部导入的 HUD / 蓝图画布风格；照片、友链、程序、文章列表仍是原来的纸墨风格。这是 2026-10-18 导入 artifact 时明确选择的覆盖范围。

---

## 5. UI 风格说明

### 5.1 两套视觉，边界清楚

| | 纸墨体系 | HUD / 蓝图画布体系 |
|---|---|---|
| 用在哪 | `/photos/` `/links/` `/programs/` `/posts/`（列表）`/studio/` | `/` 和 `/posts/<slug>/` |
| 比喻 | 中文书籍：纸 + 墨 + 一枚印 | 航天器的蓝图纸 + 遥测面板 |
| 底色 | 暖奶油纸 `#faf9f5` | 同一个纸色，但铺满网格、准星、编号 |
| 强调色 | Claude 橙 `#d97757`，克制地只给"时间/当前态" | 同一个橙，承担界面识别与 canvas 动效 |
| 字体 | 楷体标题 + 宋体正文 + 黑体数字 | 同左，但更多等宽字（坐标、编号） |
| 壳 | `BaseLayout` | `ArtifactLayout`（独立，不共享任何全局样式） |

两套**互不污染**：artifact 的 CSS/JS 只在 `ArtifactLayout` 里内联，其它页面一个字节都加载不到。反过来，`tokens.css` / `base.css` 也不进 artifact 页面。

---

### 5.2 纸墨体系（子页与后台）

#### 颜色

全站唯一的取值来源是 `src/styles/tokens.css`。**改配色只改这个文件。**

| 变量 | 浅色 | 夜间 | 用途 |
|---|---|---|---|
| `--paper` | `#faf9f5` | `#141413` | 纸底 |
| `--ink` | `#141413` | `#faf9f5` | 墨色文字 |
| `--muted` | `#6b6862` | `#a5a29a` | 次级文字 |
| `--faint` | `#b0aea5` | `#6e6961` | 最淡一档（分隔符、标签） |
| `--rule` | `#e8e6dc` | `#302e2a` | **边框色，不是文字色** |
| `--accent` | `#d97757` | 同值 | 全站唯一的彩色（Claude 橙） |
| `--canvas` / `--pine` | `#f0eee6` / `#788c5d` | `#1a1917` / `#93a878` | 照片区的画布与松绿 |

三档文字色是四级台阶：`--ink` / `--muted` / `--faint`，另外 `--rule` 只做边框。**别把 `--rule` 当文字色** —— 浅色下已经极淡，夜间会直接看不见。

#### 字体：零 webfont

- **不下载任何字体**，只用系统自带的楷体 / 宋体 / 黑体。零 CDN、不让第三方看到访客 IP。
- 三个族：`--kai`（楷体，标题、日期、站名）、`--song`（宋体，正文）、`--sans`（黑体，界面小标签、照片元信息）。
- **阿拉伯数字一律走黑体**：给 `--kai` / `--song` 各做了一个复合字体（`KaiDigits` / `SongDigits`），同一族名下两条 `@font-face`，靠 `unicode-range` 分工 —— `0–9` 取雅黑/苹方，其余取楷体/宋体。`src: local(...)`，不下载。
- **楷体下限 20px（硬规则）**：Windows 的楷体没做小字号 hinting，小了发虚。`--text-xs`(18) 和 `--text-sm`(19) 禁止配楷体；实际用到楷体的地方取值 20 / 23 / 24（23–24 才真正干净）。
- **刻意没有 `-webkit-font-smoothing: antialiased`**：它在 macOS 上更细腻，但在 Windows 上会关掉 ClearType，中文小字立刻发毛。

#### 排版

- 正文 **宋体 20px / 行高 1.95**，首行缩进两字符、段间不留空隙（中文书籍的排法）。
- 行宽用 `--measure: 44rem`（约 35 个汉字/行）；页面容器用 `--shell: 64rem`。**两个宽度分开**，成段中文不跟着容器变宽。
- 中英文之间插空隙（盘古之白，`cjkSpacing()`），但**刻意不处理数字** —— "3月9号"不能变成"3 月 9 号"。
- 日期一律走 `src/utils/date.ts`：`二〇二六年三月十三日` / `三月十三日` / `2026.03.13`，别手写。
- 分隔符默认 `＊ ＊ ＊`；另有一档樱花线（淡粉的 SVG 蒙版，跨平台不会画歪）。

#### 布局与动效

- 粘顶导航（`--nav-h`）、`.screen` 整屏区块、时间线的年 → 月 → 条目、照片墙按宽高比排成居中的行。
- 动效克制：`--ease: cubic-bezier(.22,.61,.36,1)`，三档 200/320/700ms；悬停多是颜色 + 极小位移。
- 夜间模式：`<html data-theme="dark">`，首屏前由 `THEME_BOOT` 写好，跟随系统 + 可手动覆盖，键名 `localStorage['theme']`。
- **不要给 `html` 加 `overflow`**：照片灯箱靠 `body.lightbox-open { overflow: hidden }` 传播到 viewport 锁滚动。

---

### 5.3 HUD / 蓝图画布体系（主页 + 文章页）

来源是外部设计文件 `code_artifact.html`（2 MB，单页、自包含、17 张内联 base64 图片）。它被 `scripts/import-artifact.mjs` 机械切分后放进 `src/artifact/`：

```
artifact.css       2317 行，原样
artifact.js        1539 行，原样 + 9 条最小补丁
home.html          主页五屏（1.8 MB，图片内联）
article.html       文章页骨架（@@TOKEN@@ 占位）
rail-*.html        Mc 文章专属的右栏卡
home-snap.js       主页滚动吸附（站点自己的行为，不进生成器）
```

**改版流程**：把新的 `code_artifact.html` 放回根目录 → `npm run import:artifact` → 检查生成物 → 构建。
源文件本身被 `.gitignore` 排除，仓库里只存生成物；构建不依赖它。

#### 视觉语言

- **96rem 超宽画布**（`--home-shell`），细线网格、四角准星、编号（`SEC 00` / `DOC // 01`）。
- **遥测感**：坐标、字数、阅读进度、`96REM ULTRAWIDE` 这类状态行。
- **字体**：楷体用于标题，等宽字（`--mono`）用于编号、坐标、按钮说明；数字仍然走黑体。
- **颜色**：与纸墨体系同一组变量（`--paper` / `--ink` / `--rule` / `--accent`），但使用密度高得多。
- **两种主题**：
  - 白天 `DAY // 立体无限环`：伯努利双纽线丝带 + 粒子场
  - 夜间 `NIGHT // 卡冈图雅黑洞`：视界、吸积盘、引力透镜弧与开普勒流线
- 主题按钮写在右上角，状态记在同一个 `localStorage['theme']`。

#### 主页交互

- 五屏：hero / 文章 / 照片 / 程序 / 友链；右侧刻度尺与顶栏高亮随滚动更新。
- 文章屏左侧是"近期序列"，点击切换右侧焦点预览；「阅读全文」进入对应文章路由。
- 照片墙点击打开灯箱（Esc / 左右方向键）。
- 右下角悬浮球：主题切换、回到顶部（artifact 自己的 FAB，不是纸墨体系的 FloatingMenu）。
- **滚动吸附**：快到位（阈值 0.2 屏）时用 300ms / easeOutCubic 吸到顶栏下方；用户一动滚轮/触摸/键盘立刻让位。实现在 `src/artifact/home-snap.js`，只在主页内联；`prefers-reduced-motion` 下不做。

#### 文章页结构

- 顶栏：`DOC // 编号`、`/posts/<slug>/ · 标题`、阅读进度。
- 双象限 hero：左标题 + lead + 四项遥测（发布日 / 分类 / 字数 / 阅读时长），右动态无限环 canvas。
- 三栏工作区：左章节导览 + 阅读进度 + 快捷操作；中正文；右伴读栏（Mc 文章显示 FRP 拓扑与 JDK 速查，其它文章显示通用「DOC SPEC」卡 + 相关文章）。
- 底部：上一篇 / 下一篇 + `q-footbar`。
- 正文由 Astro `<Content />` 渲染，样式由 `src/styles/artifact-prose.css` 补齐（列表、引用、代码块、表格、图片等）。
- **目录**：从 Markdown 标题生成；现有 5 篇正文没有 `#`/`##` 标题（小标题都是 `**加粗**`），所以显示「本文未设置小节标题」空态。

#### 动效与性能

- 三张 canvas：主页无限环、主页卡冈图雅、文章页无限环。DPR 封顶 2，只受 window resize 驱动。
- 动效是按用户要求「原封不动」保留的，因此**原设计没有 `prefers-reduced-motion` 分支**；主页吸附单独做了降级。
- 主页 2 MB（17 张 base64 图片），gzip 后约 1.5 MB；文章页 144–152 KB。建议服务器开 brotli/gzip。

---

### 5.4 两套体系怎么共存

- 主页/文章页用 `ArtifactLayout`：自己写 `<html><head><body>`，CSS/JS 用 `?raw` + `is:inline` 原样内联，**不 import `tokens.css` / `base.css`**。
- 其它页面用 `BaseLayout`：`tokens.css` + `base.css` + `SiteHeader` / `SiteFooter` / `FloatingMenu`。
- 两边不共享组件、不共享样式、不共享 FAB。已验证 artifact 的 CSS 不会出现在其它页面的 HTML 里。
- **新增页面时先选体系**：内容型子页用 `BaseLayout`；如果要做成 HUD 风格，就复用 `ArtifactLayout` 并在 `src/artifact/` 里加模板。

---

## 6. 内容模型

### 6.1 文章 `src/content/posts/*.md`

```yaml
---
title: 标题                  # 必填
pubDate: 2026-03-13          # 必填
updatedDate: 2026-10-16      # 可选
description: 摘要            # 可选，只给 RSS / meta 用
tags: [技术, 服务器]          # 可选
draft: false                 # 草稿=true 不进列表/RSS/sitemap
autoUpdated: true            # 可选，覆盖全局的"自动记修订日"
---
```

- 文件名就是网址：`mc-server.md` → `/posts/mc-server/`。
- 正文用 Markdown；图片放 `src/assets/posts/`，正文写相对路径 `![](../../assets/posts/xxx.png)`，构建时自动出多尺寸 WebP。

### 6.2 照片墙 `src/content/photos/*.json`

一面墙一个文件（不是按文件名解析）：

```json
{
  "title": "重庆之行",
  "date": "2024-07-17",
  "place": "重庆 · 洪崖洞",
  "note": "记录文字，可留空",
  "photos": [
    { "file": "2024-07-17-洪崖洞.jpg", "caption": "单张说明，可留空" }
  ]
}
```

- 图片放 `src/assets/photos/`，只写文件名，不写路径。
- `date` 留空 → 排到时间轴最后（"未标注时间"）。
- 文件名决定墙的 id，建议英文小写 + 连字符。详见 `src/content/photos/README.md`。

### 6.3 友链 `src/content/links.json`

```json
{ "links": [ { "id": "...", "name": "...", "url": "https://...", "description": "..." } ] }
```

### 6.4 图片放哪

| 位置 | 行为 |
|---|---|
| `src/assets/` | 经过 Astro 处理（多尺寸、WebP、哈希文件名） |
| `public/` | 原样复制到根目录 |

内容图片一律放 `src/assets/`。

---

## 7. 后台 `/studio/`

### 7.1 两个后台

| | `/studio/`（自建，日常用） | `/admin/`（Sveltia，备份） |
|---|---|---|
| 保存方式 | **只写你动过的字段**；新建/删除先暂存，点「保存」才提交 | 整个 frontmatter 重新序列化，容易混入无关改动 |
| 界面 | 沿用站点的纸墨视觉，三栏 + 时间轴列表 | 通用 CMS 界面 |
| 适合 | 日常编辑 | 自建后台出问题时顶上 |

两个后台用同一个细粒度令牌（只授权本仓库、Contents 读写）。

### 7.2 地址

| 环境 | 自建后台 | Sveltia |
|---|---|---|
| 本地 | `http://localhost:4321/studio/` | `http://localhost:4321/admin/index.html`（必须带 index.html） |
| 线上 | `https://www.yesheng.wiki/studio/` | `https://www.yesheng.wiki/admin/` |

两个都带 `noindex`，也被排除在 sitemap 之外。

### 7.3 登录：密文公开、口令在本机

后台**没有登录系统**，也没有账号数据库。「账号 + 密码」只是把一个长口令拆成两半：

```
口令 = 账号 ␀ 密码   → PBKDF2 60 万次 → AES-GCM 解密 public/studio/vault.json → 得到 GitHub 令牌
```

- 密文放在站上，任何人都能下载；**没有口令解不开**。
- 生成密文的工具只在 `scripts/` 下，公网上没有。
- 解锁后的令牌只存在内存里；「锁定」= 从内存丢掉。
- 忘记口令只能重新生成一份密文（不会丢数据）。

生成 / 更换：

```bash
npm run vault    # 图形界面，填令牌 + 账号 + 密码，自检后写盘
# 或 node scripts/vault.mjs（命令行）
```

生成后提交 `public/studio/vault.json` 并推送。换令牌后记得去 GitHub 撤销旧令牌。

> `保险箱记录.md`（如果本地留了一份明文）**必须在仓库之外**，别提交、别云同步、别截图。

### 7.4 界面

- **顶栏**：站名 +「后台」小标 ｜ 文章 / 照片墙 / 友链 / 站点 ｜ 仓库信息 + 重新读取 + 保存 + 锁定。
- **左栏**：文章列表是时间轴（年 → 月 → 条目），支持折叠与标签筛选；状态跨重画保留。
- **中栏**：所见即所得编辑器。工具栏在右栏，分预设 / 字形 / 对齐 / 列表 / 添加 / 分隔线。
- **右栏**：「格式」面板，整块用黑体（界面字体）。
- **悬浮球**：预览（真实文章页外壳 + 当前草稿）、夜间模式、回到顶部。
- 左右两栏边缘中间有把手，可以收起。

### 7.5 保存模型

- **只改你动过的**：`frontmatter.ts` 保留原始行，没动过的字段连引号都原样吐回。
- **新增/删除先暂存**：列表上挂「未保存」小标，点顶栏「保存」才真正提交；点「重新读取」可以撤销。
- **修订日期**：保存时确实改了东西才把 `updatedDate` 盖成今天；只打开不动就保存，文件零改动。全局开关在「站点」板块，单篇可覆盖。
- **新建文章默认 `draft: true`**，写完后取消勾选再保存才发布。
- 文件名在点「＋」时定下（`draft-YYYYMMDD`），后台没有改网址功能；要改就自己改文件名（旧链接会失效）。

### 7.6 故障排查

| 现象 | 处理 |
|---|---|
| `/studio/` 停在「正在载入后台…」或空白 | Vite 预打包缓存坏了：`astro dev stop` → `rm -rf node_modules/.vite` → 起 dev，等十来秒再刷。判断：Network 里 `deps/*.js?v=…` 返回 504（不带 `?v=` 的 200 是假绿） |
| `/admin/` 404 或空白 | 线上确认 `dist/admin/` 已部署；本地地址必须带 `/admin/index.html` |
| 后台图标变成文字 | `public/admin/fonts/` 缺失或被 CDN 改写失败 |
| 登录后没内容 / 权限错误 | 令牌必须是该仓库的 `Contents: Read and write` |
| 保存后线上没变 | 看 Actions：红色=构建失败；绿色但没变=没提交到 main |
| 构建日志出现「没有日期前缀」警告 | 照片文件名不合规（旧规则的遗留提示） |

### 7.7 安全边界

- 令牌只存在浏览器内存；FTP 密码只在 GitHub Secrets。
- `public/admin/config.yml` 会公开部署，里面**绝不能**写令牌/密码。
- FTP 是明文协议，务必单独建账号、把根目录限制在网站目录、用强密码。
- 后台地址不在 sitemap 里；刻意没有写 `robots.txt`（那等于给扫描器指路）。

---

## 8. 构建与部署

```
改内容 → commit → GitHub Actions（类型检查 → 构建）→ FTP 上传 dist/ → 线上更新
```

- 工作流：`.github/workflows/deploy.yml`，push `main` 触发，也可在 Actions 页面手动跑。
- **类型检查失败会阻止上线**：后台写坏字段时宁可不上线，也不要把坏数据发出去。
- 需要四个仓库 Secret：`FTP_SERVER` / `FTP_USERNAME` / `FTP_PASSWORD` / `FTP_SERVER_DIR`。

> ⚠️ **当前状态（2026-10-18）**：这四个 Secret **尚未配置**，最近一次 Actions 的「上传到虚拟主机」步骤是 `skipped`。代码与构建都已通过，但线上不会自动更新。配置好后在 Actions 页面重跑一次即可；或者手动把 `dist/` 上传。

手动部署：

```bash
npm run build
# 只把 dist/ 里的内容传到网站根目录，不要传源码
```

---

## 9. 常见操作手册

| 我要做什么 | 怎么做 |
|---|---|
| 本地看效果 | `npm run dev` → `http://localhost:4321` |
| 写新文章 | `src/content/posts/xxx.md`，frontmatter 见 6.1；或用 `/studio/` 点「＋」 |
| 加一面照片墙 | 图片放 `src/assets/photos/`；`src/content/photos/` 新建 json（见 6.2） |
| 加友链 | 编辑 `src/content/links.json` |
| 改站名 / 导航 / 自我介绍 | `src/site.data.json`（`site.config.ts` 只负责读取） |
| 改纸墨配色 / 字号 | `src/styles/tokens.css`；改字号注意楷体 ≥20px |
| 改 HUD 视觉 | 改设计源 → `npm run import:artifact`；小改可直接改 `src/artifact/*`（但重跑会覆盖） |
| 改主页吸附手感 | `src/artifact/home-snap.js` 里的 `THRESHOLD` / `DURATION` |
| 换域名 | `astro.config.mjs` 的 `site` + `site.data.json` 的 `url` |
| 让一篇文章不公开 | frontmatter `draft: true` |
| 检查类型 | `npm run check` |

---

## 10. 验证脚手架（`.work/`，不进仓库）

| 脚本 | 用途 |
|---|---|
| `mock-github.mjs` | 假 GitHub API + 静态托管（4322），后台端到端验收都靠它 |
| `page-shot.mjs` | 逐屏截图（主页是一栏一屏，整页拉长会失真）；第 5 参传 `dark` 出夜间版 |
| `artifact-check.mjs` | 主页/文章页验收：控制台报错、canvas 尺寸、标题/日期/字数、链接 |
| `artifact-interact.mjs` | 交互验收：主题、队列预览、RESET、照片灯箱 |
| `artifact-nav-snap.mjs` | 导航点击 + 滚动吸附 |
| `kai-audit.mjs` / `kai-studio.mjs` | 全站 / 后台「楷体 ≥20px」审计 |
| `digitcheck.mjs` / `font-audit.mjs` | 数字实际用的平台字体（CDP `CSS.getPlatformFontsForNode`） |
| `dm-*.html` | 页脚彩蛋的独立原型 |

两个坑写在脚本注释里：

- **虚拟时间跑不动 PBKDF2**：它快进定时器，但解锁的 60 万次哈希是真实计算。测试密文用 1000 次迭代，见 `make-test-vault.mjs`。
- **`astro build` 会写坏 `node_modules/.vite`**：跑完构建再起 dev 前先清缓存。

---

## 11. 待办与注意事项

**还没做**

1. **FTP Secrets**：配四个值，让 Actions 真正上传（当前 skipped）。
2. **HTTPS**：cPanel 签证书后，把 `public/.htaccess` 里强制 HTTPS 的三行注释去掉（先确认证书已生效）。
3. **裸域 DNS**：`yesheng.wiki` 还没有记录，目前只有 `www`。
4. **程序页**：还是占位页。
5. **统计 / 评论**：未做；涉及"往服务器写数据"，与纯静态架构冲突，需另选方案。
6. **旧主页组件**：`SectionEntry` / `SectionPosts` / `SectionPhotos` / `SectionHead` 在导入 artifact 后已不再被引用（`PhotoWall` 仍被照片页使用）。可以留着备查，也可以清理。

**注意事项**

- **只改 `src/`**；`dist/`、`.astro/` 是生成物。
- **只传 `dist/`**，别把源码传上服务器。
- `code_artifact.html` 是本地设计源，已被 `.gitignore` 排除；生成器需要它，构建不需要。
- **主页是冻结快照**：队列、照片墙、程序/友链都是 artifact 写死的内容，新增文章不会自动出现。
- **主页约 2 MB**：17 张 base64 内联图，建议开 brotli/gzip。
- `mockups/assets/` 里有几张损坏的图片，别用图片工具打开。

---

## 附录：Astro、WordPress、Vue 差在哪

理解的关键是问一句：**HTML 在什么时候生成？**

| 时刻 | 谁在做 | 代表 |
|---|---|---|
| 构建时 | 提前生成好，服务器只发 | **Astro**、Hugo、手写 HTML |
| 请求时 | 服务器现场拼 | WordPress、PHP |
| 浏览时 | 浏览器跑 JS 拼 | Vue、React |

- **和手写 HTML**：产物一样，Astro 只是把页头页脚、列表、图片处理这些重复劳动自动化。
- **和 Vue**：Vue 的逻辑在访客浏览器里跑；Astro 的逻辑在构建时跑一次，访客拿到的是写满内容的 HTML。Astro 需要交互时也可以只挂一个"岛屿"组件，不必全站 JS。
- **和 WordPress**：WordPress 是"一直在运行的程序 + 数据库"，每次访问都现查现拼；Astro 是"印刷机"，提前印好堆着发。服务器上没有可执行文件，也就没有可攻击的面。

最终产物就是 `dist/` 里的一堆 HTML / CSS / 图片 —— 用记事本打开 `dist/index.html` 能看到全部内容。

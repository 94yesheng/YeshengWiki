# 夜笙的小世界

> 仓库：`94yesheng/YeshengWiki`（公开仓库；**内容数据不在仓库里**）
> 本地路径：`D:\blog`
> 线上：<https://www.yesheng.wiki/>（动态版，已启用 HTTPS）。
> 文档更新：2026-10-22

> **当前状态**
>
> - 站点已从「静态 Astro + GitHub CMS」重构为 **Astro SSR + SQLite + 自建后台**，生产跑在
>   自有服务器上（systemd + Nginx 反代）。
> - **域名已切换**：`www.yesheng.wiki` 与 `yesheng.wiki` 都指向本机，HTTP 自动 301 到
>   HTTPS（Let's Encrypt 证书，certbot 自动续期）。
> - 生产库里目前是 **18 篇文章（5 公开 / 13 草稿）**、1 条友链、1 面照片墙（6 张照片）、
>   64 条媒体记录、7 个设置块。
> - 2026-10-21 起以「星场后台 / 纸墨页脚方案三 / 无封面静态印章」这一版为正式版；
>   内容与设置一律以服务器数据库为准，代码部署不会覆盖数据。
> - 2026-10-21：旧 WordPress 链接（`?p=ID`、中文百分号 slug、`?page_id=ID`）改由应用层 301 到新地址；
>   根目录误提交的 PNG 与 9 个不再引用的旧内容组件已清理。
> - 2026-10-22：内建访问统计（`visitor_logs`，Schema v3），后台导航「06 统计」。
> - 设计与实现细节见 [docs/dynamic-refactor.md](docs/dynamic-refactor.md)。

---

## 0. 一句话说清这个项目

这是一个 **Astro SSR 博客**：文章、照片、友链和站点设置存在服务器 SQLite 里，页面在**请求时**读库渲染 HTML。
后台 `/studio/` 保存后直接写库，**不需要重新构建、不需要 commit**。

代码用 Git 管理，**内容数据不进 Git**：数据放在服务器上的数据目录里（`blog.db` + `uploads/`），
每天自动备份。图片上传到 `uploads/`，生产由 Nginx 直接发图。

写作路径：浏览器打开 `/studio/` 登录 → 改 → 保存 → 公开页立即生效。

---

## 1. 技术栈

| 项 | 值 | 说明 |
|---|---|---|
| 站点框架 | Astro `^7.3.8` + `@astrojs/node` `^11.1.8` | **SSR**：`output: 'server'`，standalone adapter |
| 运行时 | Node.js `>=22.12.0` | systemd 跑 `dist-dynamic/server/entry.mjs` |
| 语言 | TypeScript + CSS + Markdown | 运行时不涉及 PHP / Python |
| 数据库 | **SQLite**（`better-sqlite3` `^13`，WAL） | 单文件；生产使用单文件 SQLite |
| 渲染 | `markdown-it` + `turndown` + `js-yaml` | 正文渲染 / 后台富文本互转 / frontmatter 解析 |
| 上传 | 本地 `uploads/` + 浏览器端 Sharp 压缩 + 音频标签解析 | 图片压缩转 WebP；音频读 ID3v2/v1、FLAC、M4A 标签 |
| 样式 | 手写 CSS，无框架 | 没有 Tailwind、没有预处理器 |
| 部署 | systemd + Nginx 反代 | 部署脚本在 `${APP_DIR}.staging` 构建，成功后原子切换 `dist-dynamic` / `node_modules` 并重启；构建失败不影响线上 |
| CI | GitHub Actions（仅校验） | `npm run check` + `npm run build:dynamic`，**不做部署** |

---

## 2. 快速开始（本地）

```bash
npm install

# 本地数据（.env 里给路径；也可用默认 ./data）
cp .env.example .env
npm run dev            # BLOG_DYNAMIC=1 astro dev → http://localhost:4321
npm run build          # BLOG_DYNAMIC=1 astro build → dist-dynamic/
npm run check          # 类型检查（CI 也跑这个）

# 首次准备数据：把 src/content 与 src/assets 迁进 SQLite
node scripts/migrate-to-db.mjs --db data/blog.db --uploads data/uploads --fresh
```

- `npm run dev` / `npm run build` **默认就是动态版**（脚本里已经带上 `BLOG_DYNAMIC=1`）。
  `astro.config.mjs` 仍支持静态构建（不带 `BLOG_DYNAMIC=1` 时输出 `dist/`），但**静态构建不再保证通过**，属于遗留路径。
- 本地首次启动时，若库里还没有用户，会用 `.env` 里的 `BLOG_ADMIN_USER` / `BLOG_ADMIN_PASSWORD` 播种管理员。
- 后台本地地址 `http://localhost:4321/studio/`。

> 坑：`astro build` 会把 `node_modules/.vite` 写坏，之后 dev 取不到预打包依赖（504）。
> 跑完构建再起 dev 前，先 `rm -rf node_modules/.vite`，或 `astro dev stop` 后重启。

---

## 3. 目录结构

```
D:\blog\
├── astro.config.mjs             # site / 输出目录 / SSR adapter（BLOG_DYNAMIC 开关）
├── package.json / package-lock.json # 依赖与命令
├── tsconfig.json                # 继承 astro/tsconfigs/strict（排除生成物、public、.work、demo）
├── .env.example                 # 动态版运行参数示例
├── CLAUDE.md / AGENTS.md        # AI 助手的项目约定（同一份内容）
├── README.md                    # 本文档
├── .github/workflows/deploy.yml # CI：push main 时跑 npm run check + build:dynamic（只校验，不部署）
├── db/
│   └── schema.sql               # ★SQLite schema 的唯一来源★（被 ?raw 打进 bundle）
├── docs/
│   ├── dynamic-refactor.md      # 动态化重构设计与进度
│   ├── cutover.md               # 切线上清单（DNS / HTTPS / 回滚 / 备份）
│   ├── 1panel.md                # 1Panel 运维面板的访问与边界
│   ├── nginx-dynamic.conf       # 线上 Nginx 反代配置示例（路径按实际部署目录替换）
│   └── studio-typography.md     # 后台 UI 字号与字体清单（改后台排版前先看）
├── scripts/
│   ├── deploy-server.ps1        # 部署：上传源码 → staging 构建 → 原子切换 dist/node_modules → 重启
│   ├── migrate-to-db.mjs        # src/content + src/assets → SQLite + uploads
│   ├── import-wordpress.mjs     # WordPress 导出 → SQLite（slug 表与 301 映射共用一份）
│   ├── migrate-pages-settings.mjs # 旧设置 → site_settings.pages（幂等，可重复跑）
│   ├── backfill-post-lead.mjs   # 从 WordPress 摘要回填 lead / description（一次性）
│   ├── import-artifact.mjs      # 【慎用】从设计源重新生成 artifact 页面模板
│   └── artifact-patches/        # 生成器补丁片段（只有 animation-rollback 等入 Git）
├── src/
│   ├── middleware.ts            # 旧链接 301 + /uploads 兜底 + /api 路由 + 安全响应头
│   ├── pages/                   # ★文件名 = 网址★（全部 SSR 读库）
│   │   ├── index.astro          # 主页（五屏）
│   │   ├── posts/               # 文章列表 + [...slug] 详情
│   │   ├── photos.astro / links.astro / programs.astro
│   │   ├── studio.astro / studio-v2.astro # 两个后台入口（noindex）
│   │   ├── studio/stats.ts      # /studio/stats 统计页（登录保护，返回独立 HUD）
│   │   └── rss.xml.js / sitemap.xml.ts / sitemap-index.xml.ts
│   ├── server/
│   │   ├── schema.ts            # 读 db/schema.sql
│   │   ├── db.ts                # 连接、WAL、迁移、单例
│   │   ├── auth.ts              # scrypt、会话、CSRF、登录限流
│   │   ├── bootstrap.ts         # 启动时建库/迁移/播种管理员
│   │   ├── site.ts              # getSiteConfig() / applyArtifactSite()：站点设置 → 页面
│   │   ├── pages/index.ts       # 子页文案字段定义与默认值（后台「页面」板块）
│   │   ├── legacy-redirects.ts + .json # 旧 WordPress 链接 → 新地址 301（唯一映射表）
│   │   ├── uploads.ts           # 本地 /uploads 兜底（生产由 Nginx 直发）
│   │   ├── markdown.ts / post-markdown.ts
│   │   ├── api/{router,fs,http}.ts
│   │   └── repositories/{posts,photos,links,media,settings,analytics}.ts
│   ├── layouts/                 # BaseLayout（纸墨壳）/ ArtifactLayout（HUD 独立壳）
│   ├── components/              # HomeArtifact、SiteHeader/Footer、FloatingMenu、LinkCard + divergence-meter/
│   ├── artifact/                # 生成器产出的 CSS/JS/模板 + home/ partial（已插服务端占位符）
│   ├── styles/                  # tokens / base / fab / studio(-v2) / artifact-prose
│   ├── studio/                  # 自建后台：app/state/content/editor/exif/… + views/ + v2/ + stats.html
│   ├── utils/                   # date / audio-meta / cover-svg / article-rail / timeline / typography / theme / loader / friend-links
│   ├── content/                 # 【迁移来源】旧 .md / .json，只给 migrate-to-db.mjs
│   ├── assets/                  # 【迁移来源】旧文章图 / 照片原图，只给 migrate-to-db.mjs
│   ├── types.d.ts               # `*.sql?raw` 等模块类型声明
│   ├── site.data.json           # 【迁移来源】旧站点设置
│   └── site.config.ts           # 上面那份的读取层（现在只做 SSR 兜底）
├── public/                      # 原样复制到站点根：favicon、HUD 首页兜底图、studio 占位图、artifact 外链 CSS/JS
├── dist-dynamic/                # 动态构建产物（上线跑的这份；不进 Git）
├── dist/                        # 静态构建产物（遗留；不进 Git）
├── .work/                       # 本地验证脚手架与截图（不进 Git）
├── data/                        # 本地 SQLite + uploads（不进 Git）
└── demo/ mockups/ .backup/      # 本地设计源 / 样板 / 回滚备份（gitignore，不进仓库）
```

> 说明：`public/` 会被原样复制到站点根——`artifact/home/images` 是仓库自带的 HUD 首页兜底图，
> `artifact/artifact.{css,js}` 是从 `src/artifact/` 同步的外链资源（`/artifact/` 下由 middleware
> 动态回源，生产 Nginx 直接发静态文件）；`studio/photo-placeholder.svg` 是后台占位图；
> 文章图与照片图都在 `uploads/`，生产由 Nginx 直发。
> `public/.htaccess` 是静态时代的遗留（Apache 配置，Nginx 不读它），留着只作参考。

---

## 4. 页面与路由

| 网址 | 文件 | 视觉 | 数据来源 |
|---|---|---|---|
| `/` | `src/pages/index.astro` | ArtifactLayout（HUD） | `posts` + `photo_walls` + `links` + `site_settings`（`home` / `programs` / `authorDossier`） |
| `/posts/` | `src/pages/posts/index.astro` | ArtifactLayout（HUD） | `posts` 时间轴 / 标签 / 统计 |
| `/posts/<slug>/` | `src/pages/posts/[...slug].astro` | ArtifactLayout（HUD） | `posts` 单篇（markdown-it 渲染） |
| `/photos/` | `src/pages/photos.astro` | ArtifactLayout（HUD） | `photo_walls` + `photos`（含 EXIF） |
| `/links/` | `src/pages/links.astro` | BaseLayout（纸墨） | `links` 表（1 条：云鹿庐） |
| `/programs/` | `src/pages/programs.astro` | BaseLayout（纸墨） | `site_settings.programs`（无数据＝空态，不回落静态配置） |
| `/studio/` | `src/pages/studio.astro` | 独立 HUD 应用 | `/api/fs` + `/api/auth` |
| `/studio/stats` | `src/pages/studio/stats.ts` | 独立 HUD（统计 + 3D 地球） | `visitor_logs`（`/api/analytics`），需登录 |
| `/studio-v2/` | `src/pages/studio-v2.astro` | 独立（实验） | 同上，桌面端实验版，`noindex` |
| `/rss.xml` | `src/pages/rss.xml.js` | — | `posts`（不含草稿） |
| `/sitemap.xml` `/sitemap-index.xml` | `src/pages/sitemap*.ts` | — | 动态生成，排除 `/studio*` |
| `/uploads/*` | Nginx alias（本地走 middleware） | — | 上传目录（web root 之外） |
| `/artifact/artifact.{css,js}` | middleware 回源 / Nginx 静态 | — | HUD 外链资源，带 `?v=<hash>` 指纹长缓存 |
| `/admin/*` | — | — | **已退役**：Nginx 301 → `/studio/`，文件也已删除 |
| 旧 WordPress 链接 | `src/server/legacy-redirects.ts` | — | `?p=ID` / 中文百分号 slug / `?page_id=ID` → 301 到新地址（middleware 在路由前处理） |

- 全站页面都是 **SSR**：请求时读 SQLite，保存后刷新即可见。
- 公开 SSR 页面的 GET 请求会由 middleware 写入 `visitor_logs`（排除 `/studio`、`/api`、
  `/uploads`、`/artifact`、静态资源与 RSS/sitemap）；同一 IP + 日期 + 设备合并为一条并累加 PV。
- `/studio/`、`/studio-v2/` 都带 `noindex`，且被 sitemap 排除。
- HUD 页面（`/`、`/posts/`、`/posts/<slug>/`、`/photos/`）由服务端注入数据并保留静态兜底，
  列表筛选、灯箱、滚动吸附仍由 `src/artifact/artifact.js` 负责。
- 主页「程序」「友链」两屏同样改为服务端注入（`site_settings.programs`、`links`、
  `site_settings.authorDossier`），数据为空时显示空态；`artifact.js` 不再内置旧文章正文与旧照片数据。
- 旧链接 301 在 `src/middleware.ts` 里、路由之前处理；映射表是 `src/server/legacy-redirects.json`，
  只做精确匹配（`?p=ID` / 完整旧 slug / `?page_id=ID`），未知 ID 不跳转，保留原来的 404 / 首页行为。

---

## 5. 数据模型与内容

Schema 唯一来源是 [db/schema.sql](db/schema.sql)（`src/server/schema.ts` 用 `?raw` 引入；
迁移脚本用 `node:fs` 直接读）。

| 表 | 说明 |
|---|---|
| `users` | 管理员账号（`scrypt` 哈希） |
| `sessions` | 会话（只存 token 的 SHA-256） |
| `posts` | 文章；`body_markdown` 存原文，其余字段对应 frontmatter |
| `photo_walls` | 照片墙（一面墙一行） |
| `photos` | 单张照片 + EXIF / 直方图 |
| `links` | 友链 |
| `link_applications` | 友链互换申请（公开提交 → 后台审核 / 批准 / 删除） |
| `visitor_logs` | 访客访问日志（日期 / IP / 国家 / 设备 / 路径 / PV；供 `/studio/stats` 聚合） |
| `site_settings` | 七个设置块：`site` / `home` / `authorDossier` / `articleRail` / `programs` / `studio` / `pages`（子页文案） |
| `media` | 上传文件元数据（图片 + 音频，供媒体库与文章选图/选曲） |
| `schema_migrations` | 迁移版本 |

约定：

- 日期一律 `YYYY-MM-DD` 文本，SQLite 可直接排序。
- 数组 / 对象字段用 `*_json` TEXT 存 JSON（tags、`railSpecs`、`railTopology`、EXIF 直方图等）。
- `posts.version` 做**乐观锁**：保存时带上读到的版本，服务端不匹配就 `409`。
- `posts.draft = 1` 不出现在公开列表 / RSS / sitemap。
- `photo_walls.date` 允许空串（未标注时间）。
- Schema 版本由 `src/server/schema.ts` 的 `SCHEMA_VERSION` 控制（当前 `4`）；启动时自动套用
  `db/schema.sql` 并补齐旧库缺列，`link_applications` 是 v2 新增表，`visitor_logs` 是 v3 新增表，v4 清理演示样本并补齐复合索引。
- `src/content/` 与 `src/assets/` 是**迁移来源**，运行时不再读取；改内容请走 `/studio/`。

---

## 6. 后台 `/studio/`

| | 说明 |
|---|---|
| 登录 | 账号 + 密码（`BLOG_ADMIN_USER` / `BLOG_ADMIN_PASSWORD` 首次播种），**不用 PAT、不用 vault** |
| 会话 | 随机 32 字节 token → `blog_session` Cookie（HttpOnly，生产加 Secure）；库只存 SHA-256 |
| 写保护 | 所有写请求要带 `X-CSRF-Token`（`GET /api/auth/me` 下发） |
| 传输层 | 后台把原来的 `Github` 调用换成 `/api/fs` 虚拟文件接口（`ApiGithub extends Github`），视图层几乎没改 |
| 上传 | `/api/fs` 二进制模式写 `uploads/`，浏览器端 Sharp 压缩 + EXIF 解析 |
| 媒体库 | 「媒体库」按文章归档展示 `uploads/posts/<slug>/` 下的图片与音频（`GET /api/media`），可复制链接 / 试听 / 新窗口打开 / 删除；上传音频会自动读取标签填标题与作者 |
| 友链申请 | 友链页公开提交到 `link_applications`（限流 + 蜜罐 + 50 条待审上限）；后台「友链」板块查看并批准 / 删除 |
| 页面 | 「页面」板块集中调整 主页 / 文章 / 相册 / 项目 / 友链 的标题、导语、空态与统计文案，共 **74 个字段**（写 `site_settings.pages`，`GET|PUT /api/pages`），保存即时生效 |
| 统计 | 后台导航「06 统计」在工作区直接打开统计 HUD：真实访客 UV/PV、日/周/月/年整合、IP/设备明细与 3D 粒子地球；支持实时刷新、CSV 导出与清空（需 CSRF） |
| 改账号/密码 | 「设置 → 05 账户与安全」，需当前密码 + CSRF；改完其它设备会话失效 |

**保存模型**：只写你动过的字段；新建/删除先暂存，点顶栏「保存」才提交；确实改了才更新 `updatedDate`；
新建文章默认 `draft: true`，取消勾选才算发布。

**两个后台**：现在只有 `/studio/`（经典 HUD 工作台）与实验版 `/studio-v2/`（桌面端，
正文优先/右侧检查器，共用同一套数据与保存逻辑）。旧的 Sveltia `/admin/` 已退役。

**故障排查**

| 现象 | 处理 |
|---|---|
| `/studio/` 停在「正在载入后台…」 | Vite 预打包缓存坏了：清 `node_modules/.vite` 重启 dev；Network 里 `deps/*.js?v=…` 会 504 |
| 登录后没内容 | 看 `/api/auth/me` 是否 200；未登录/会话过期就是 401 |
| 保存报 409 | 乐观锁：别人（或另一个标签页）先改了同一篇，点「重新读取」再改 |
| 保存后线上没变 | 先确认保存成功（`/api/fs` 的 PUT 200），再强刷 `Ctrl+F5`；域名访问是旧站，别用它验证 |

**安全边界**：令牌/密码不进仓库；生产环境变量放在服务器上的受保护文件里；
数据库在 web root 之外；上传限制 MIME/尺寸并重编码、文件名服务端生成。

---

## 7. API

由 `src/middleware.ts` → `src/server/api/router.ts` 处理（不用 `src/pages/api`，这样静态构建不会因缺 adapter 失败）。
写操作要求 `blog_session` Cookie + `X-CSRF-Token`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查（DB + 版本） |
| POST | `/api/auth/login` | 账号密码登录，建会话 |
| POST | `/api/auth/logout` | 销毁会话（需 CSRF） |
| GET | `/api/auth/me` | 当前用户 + CSRF |
| POST/PUT | `/api/auth/account` | 改管理员账号/密码 |
| GET/POST/PUT/DELETE | `/api/posts[/id]` | 文章列表 / 新建 / 保存 / 删除 |
| GET | `/api/walls` | 照片墙列表（需登录） |
| GET/PUT | `/api/links` | 友链读取（公开）/ 整体保存（CSRF） |
| POST | `/api/links/apply` | 公开提交友链申请（限流 + 蜜罐 + 50 条待审上限） |
| GET | `/api/links/applications` | 友链申请列表（需登录） |
| POST | `/api/links/applications/[id]/approve` | 批准申请并写入 `links`（需登录） |
| DELETE | `/api/links/applications/[id]` | 删除申请（需登录） |
| GET | `/api/analytics` | 访客统计聚合（需登录；日/周/月/年、国家、设备、明细） |
| GET | `/api/analytics/raw` | 全部访客记录（需登录，统计页本地聚合用） |
| GET | `/api/analytics/summary` | 极速获取今日 UV/PV 摘要与当前客户端真实 IP（需登录） |
| DELETE | `/api/analytics/clear` | 清空全部访客记录（需 CSRF） |
| GET/PUT | `/api/settings/[key]` | 站点设置分块读写（需登录） |
| * | `/api/fs/*` | 后台虚拟文件接口（文章、照片墙、设置、上传都走它） |

---

## 8. 视觉体系

两套视觉并存，**互不污染**：

| | 纸墨体系 | HUD / 蓝图画布体系 |
|---|---|---|
| 用在哪 | `/links/` `/programs/` | `/`、`/posts/`、`/posts/<slug>/`、`/photos/`、`/studio/`（后台为独立 HUD 实现） |
| 壳 | `BaseLayout` | `ArtifactLayout`（自己写 `<html>`；模板用 `?raw` 注入，CSS/JS 走 `/artifact/artifact.{css,js}?v=<hash>` 外链） |
| 比喻 | 中文书籍：纸 + 墨 + 一枚印 | 航天器蓝图 + 遥测面板 |

### 8.1 纸墨体系

- **唯一取值来源** `src/styles/tokens.css`：`--paper` `#faf9f5` / `--ink` `#141413` / `--muted` /
  `--faint` / `--rule`（**只做边框，别当文字色**）/ `--accent` `#d97757`（全站唯一彩色）。
- **零 webfont**：只用系统楷体 / 宋体 / 黑体；阿拉伯数字走黑体（`KaiDigits` / `SongDigits` 复合字体 + `unicode-range`）。
- **楷体下限 20px（硬规则）**：`--text-xs`(18) / `--text-sm`(19) 禁止配楷体。
- 刻意**不加** `-webkit-font-smoothing: antialiased`（Windows 会关掉 ClearType，中文小字发毛）。
- 正文宋体 20px / 行高 1.95、首行缩进两字符；行宽 `--measure: 44rem`，容器 `--shell: 64rem`（分开）。
- 日期一律走 `src/utils/date.ts`；中英文之间插空隙但**不处理数字**。
- 夜间模式 `<html data-theme="dark">`，首屏前由 `THEME_BOOT` 写好，键名 `localStorage['theme']`。

### 8.2 HUD / 蓝图画布体系

- 96rem 超宽画布、细线网格、四角准星、编号（`SEC 00` / `DOC // 01`）、遥测状态行。
- 三张 canvas（DPR 封顶 2，只在窗口变化时重算尺寸）：
  - 主页白天 `DAY // 纯粒子无限环`；夜间 `NIGHT // 卡冈图雅黑洞`；文章页 `立体三体`。
  - 都按 `renderFrame` 的 `dt===0` 约定支持 `prefers-reduced-motion`。
- 加载 / 切换：loader 粒子从奇点绽放收束（~1.05s，实现在 `src/utils/loader.ts`）；昼夜切换用 veil + 形变（~0.86s）；纸墨页也复用同一套 loader。
- 主页五屏（hero / 文章 / 照片 / 程序 / 友链）+ 滚动吸附（阈值 0.2 屏，300ms easeOutCubic，用户一动就让位，实现在 `src/artifact/home-snap.js`）。
- 文章页：顶栏 + 双象限 hero + 三栏工作区 + 上下篇；正文由 `<Content />` 渲染，样式在 `src/styles/artifact-prose.css`。
- 资源加载：HUD 的 CSS/JS 不再逐页内联，改为 `/artifact/artifact.css?v=<hash>` 与
  `/artifact/artifact.js?v=<hash>`；本地 middleware 对带版本号请求下发一年 immutable 缓存，
  `public/artifact/` 里是对应静态副本（生产 Nginx 直接命中，给 30 天缓存，换指纹即换 URL）。
  `artifact-prose.css` 已与 `artifact.css` 去重，只保留文章页独有的排版规则。
- 后端注入：`src/server/site.ts` 的 `getSiteConfig()` / `applyArtifactSite()` 在 SSR 时替换
  artifact 模板里的站名、作者、导航、页脚；静态配置只做兜底。
- 当前正式视觉：主页英雄区用「相交双环 ∞」徽标；白天页脚固定为「方案三 · 纸墨律动」；
  文章无封面时显示「该内容未解锁」静态纸墨印章 + 三版 ∞ 徽标（`src/utils/cover-svg.ts`，默认 v1）。
  左下角 FX 预览悬浮窗与页脚方案一/二已移除。
- 后台登录页是独立的星场 canvas 背景（`src/studio/views/login.ts`），带星表标注与轨道环。

> ⚠️ `src/artifact/*.html` 与 `artifact.js` 已手工插入 `@@占位符@@` / 服务端数据分支。
> **不要直接重跑 `npm run import:artifact`**，会覆盖这些改动；必须重跑时先备份，再重放 `.work/patch-*.mjs` 的替换。

---

## 9. 常见操作手册

| 我要做什么 | 怎么做 |
|---|---|
| 本地看效果 | `npm run dev` → `http://localhost:4321` |
| 写新文章 | `/studio/` 点「＋」；或直接写库（不推荐） |
| 加一面照片墙 | `/studio/` 照片墙板块新建 + 上传 |
| 给文章加伴读音乐 | `/studio/` 文章编辑器 → 右栏「信息悬浮窗」→ 音乐卡 → 从媒体库选音频（自动读标签）或本地上传 |
| 换浏览器标签小图标（favicon） | /studio/ → **设置** → 01 BRAND & SEO → 「站点图标」：从本地上传（SVG/PNG/ICO/WebP）或从媒体库选择，保存后刷新页面 |
| 加友链 | `/studio/` 友链板块（生产已有 1 条：云鹿庐） |
| 审核友链申请 | `/studio/` 友链板块查看待审列表，批准后写入 `links`，也可直接删除 |
| 看访问统计 | 后台导航「06 统计」；可切日/周/月/年、点地球看国家、导出 CSV；直达 `/studio/stats` 也可 |
| 从 WordPress 导入旧数据 | `node scripts/import-wordpress.mjs --export .work/wp-export --db <库> --uploads <上传目录>`；先加 `--dry-run` 看清单。正文图片落到 `uploads/posts/<slug>/`，草稿 / 私密统一按 `draft` 入库 |
| 加旧链接 301 | 改 `src/server/legacy-redirects.json`（唯一映射表，导入脚本也读它），部署后生效 |
| 改站名 / 导航 / 自我介绍 | `/studio/` → 站点设置（写 `site_settings.site`）；关于「我」的档案卡在「设置 → 03」 |
| 改子页文案（标题 / 导语 / 空态 / 统计） | `/studio/` → **页面** → 选对应子页（主页 / 文章 / 相册 / 项目 / 友链）；74 个字段，只有改过的字段会写库，默认值就是现状 |
| 改纸墨配色 / 字号 | `src/styles/tokens.css`（注意楷体 ≥20px） |
| 改 HUD 视觉 | 主页改 `src/artifact/home/*.html`；大改走设计源 + 生成器 + 手工补丁（见 8.2 警告） |
| 改 canvas 模型 | `src/artifact/artifact.js`（重跑生成器会覆盖） |
| 改部署流程 | `scripts/deploy-server.ps1` + [docs/cutover.md](docs/cutover.md) |
| 查线上状态 | `/api/health`；服务器上用 systemd 与 Nginx 日志排查 |
| 手工备份 | 在服务器上手动执行备份脚本（SQLite `.backup` + uploads 打包） |
| 检查类型 | `npm run check` |

---

## 10. 待办与注意事项

**已完成**

- 旧 WordPress 数据迁移（文章 / 友链 / 正文配图，2026-10-19；现库 18 篇）。
- 域名绑定与 HTTPS（Let's Encrypt + certbot 自动续期，2026-10-20）。
- 后台演示模式移除；`/studio/` 只剩真实写库模式。
- 2026-10-21：采用新一版视觉（星场登录页、页脚方案三、无封面静态印章、音频媒体库）。
- 2026-10-21：旧链接 301（`?p=ID` / 中文百分号 slug / `?page_id=ID` / 旧 feed 与 sitemap），
  实现在 middleware（应用层，部署即生效），映射表 `src/server/legacy-redirects.json`。
- 2026-10-21：删除根目录误提交的 PNG `2`（当前树已移除，历史记录仍在 Git 里）；
  清理 9 个不再引用的旧内容组件与 2 个配套 utils。
- 2026-10-21：README / CLAUDE / AGENTS 与现状对齐（占位符路径、媒体数、设置块、链接映射）。
- 2026-10-21：删除无调用的 `src/content.config.ts`；构建不再同步 content collections。
  `src/content/` 与 `src/assets/` 保留，但只作为 `scripts/migrate-to-db.mjs` 的迁移源。
- 2026-10-21：合入优化版（B1–B7 / S1–S6 / P1–P6 / 4.1 / 4.2 / 4.4）：
  `$` 替换修复、`raw_markdown` 双向同步、透明图上传、相关文章标签权重、源码模式保存、
  RSS 全文、Token 占位符；登录限流 / 异步 scrypt / 友链申请限流与审核 / SVG 防护 /
  照片墙事务；HUD 资源外链缓存、列表查询瘦身、上传流式响应、Studio 预取、音频 Range、
  Canvas 可见性暂停；抽离 loader / friend-links / audio-meta / theme 桥接；
  编辑器监听器清理与粘贴截图。Schema 升到 v2（新增 `link_applications`）。
- 2026-10-22：合入 Bug 修复版（1.1–1.7 / 2.1–2.6）：
  锁定登出补 CSRF、辉光管开关 / 世界线、EXIF 乱码开关、程序空态不再注入示例数据、
  友链蜜罐字段、全局 loader / friend-links 桥接签名、Studio v2 保存文案；
  文章改 slug 原子更新并迁移配图 / 音频与 `media` 记录、二进制直传 + 体积 / 魔数校验、
  SVG 实体编码与 SMIL 绕过防护、右栏 / 友链 / 程序链接协议白名单、会话与限流定时清理；
  部署脚本改为 `${APP_DIR}.staging` 构建成功后原子切换，消除部署期间的 404/502 窗口。
- 2026-10-22：内建访客统计模块（后台导航「06 统计」，直达 `/studio/stats`）：`visitor_logs`（Schema v3）、
  middleware 自动记录公开页访问、`/api/analytics` 聚合与原始日志、日/周/月/年整合、IP/设备明细、
  3D 粒子地球、CSV 导出；已移除演示样本与模拟功能，采用真实 IP 识别与零阻塞内存写缓冲。

**待办**

1. **`/programs/` 空态**：正常状态，不是 bug。内容由站长在 `/studio/` 的「项目」板块补；
   空态标题 / 说明 / 按钮可在「页面 → 项目」里改。
2. **评论**：仍暂缓；访问统计已内建（`visitor_logs` + `/studio/stats`），评论可在下表 A/B/C 中选。
3. **`README/CLAUDE` 同步**：以后改架构 / 路由 / 部署，记得在同一提交里一起改。

**评论与统计方案的备选（评论暂缓）**

> 下面的统计列只作路线对比；当前已实现轻量的 `visitor_logs` + `/studio/stats`（见上）。

| 方案 | 统计 | 评论 | 取舍 |
|---|---|---|---|
| A · 全自建 | 新表 `page_views(path, day, count)`，middleware 只对 GET 的 HTML 计数（不存 IP） | 新表 `comments` + 公开提交 + `/studio/` 审核 | 数据全在自己的 SQLite；代码量最大，要处理垃圾评论、限流、通知 |
| B · 混合 | 自建浏览量 | Giscus（GitHub Discussions） | 评论依赖 GitHub 账号；不用维护另一套后端 |
| C · 第三方 | Umami / Plausible（自托管或云） | Waline / Twikoo（要独立服务） | 少写代码；多一个要守护或付费的服务，数据不在本站库里 |

结论：现在优先 A（和「内容不进 Git、单文件 SQLite」一致）；选 B/C 时只加配置，不动数据层。

**注意事项**

- **只改 `src/` 与配置**；`dist/`、`dist-dynamic/`、`.astro/` 是生成物。
- **内容不进 Git**：改数据走后台；备份靠每日自动备份（SQLite `.backup` + uploads tar + Nginx 配置）。
- **旧链接映射放应用层**：部署脚本只推代码、不推 Nginx 配置，所以 301 写在 middleware；
  要加映射只改 `src/server/legacy-redirects.json`，别再复制到 Nginx。
- **文档不写真实基础设施**：服务器地址 / 目录用 `<SERVER_IP>`、`<APP_DIR>`、`<DATA_DIR>` 占位，
  真实值只放在部署环境变量和服务器上的受保护文件里。
- **访客统计含 IP / UA**：`visitor_logs` 存在本地 SQLite、仅后台可见；若要公开部署，先确认
  隐私说明与保留期，必要时改成只存哈希或匿名计数。
- **部署脚本是原子切换**：先在 `${APP_DIR}.staging` 完整构建，成功后才替换 `dist-dynamic` 与
  `node_modules`；构建失败时线上保持旧版本，不需要手工回滚。
- `.work/` 是本地验证脚手架与截图（`mock-github.mjs`、`page-shot.mjs`、`artifact-check.mjs`、
  `kai-audit.mjs`、`account-test.mjs`、`1panel-login-check.mjs` 等），不进仓库。
- 构建后 HUD 页的 CSS/JS 已外链到 `/artifact/`，HTML 不再内联 ~300 KB；本地 middleware 对
  带 `?v=` 的请求发一年 immutable，生产 Nginx 对 `/artifact/` 发 30 天缓存（换指纹即换 URL）。
- 改 `src/artifact/artifact.css` / `artifact.js` 后，要同步 `public/artifact/` 下的同名副本；
  `scripts/import-artifact.mjs` 会自动写，但重跑前先看 8.2 的警告。
- `demo/` 是外部设计源（生成器输入），已被 `.gitignore` 排除；构建不依赖它。

---

## 附录：静态、SSR 与 WordPress 差在哪

理解的关键还是问一句：**HTML 在什么时候生成？**

| 时刻 | 谁在做 | 代表 |
|---|---|---|
| 构建时 | 提前生成好，服务器只发 | 静态 Astro（**本项目旧形态**）、Hugo |
| 请求时 | 服务器现场查库拼 HTML | **本项目（Astro SSR + SQLite）**、WordPress、PHP |
| 浏览时 | 浏览器跑 JS 拼 | Vue、React |

- **和静态 Astro 的区别**：以前改文章要 commit + 构建 + 上传，内容冻在 HTML 里；
  现在页面在请求时读 SQLite，后台保存即生效，内容不进 Git。
- **和 WordPress 的区别**：同样是「一直运行的程序 + 数据库」，但这里没有插件生态与 PHP，
  后台是自己写的单页应用，数据是单文件 SQLite（备份就是拷一个文件）。
- **代价**：多了一个需要守护的 Node 进程（systemd `Restart=always`）和一份要备份的数据库；
  换来的是即时编辑、图片本地上传、以及不再依赖第三方 CMS/GitHub 令牌。

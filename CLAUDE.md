## 这个项目

`D:\blog` 是「夜笙的小世界」博客：**Astro SSR（`@astrojs/node`）+ SQLite（better-sqlite3）+ 自建后台 `/studio/`**。
页面在请求时读库渲染；后台保存直接写库，**不需要构建或 commit**。内容数据不进 Git。

- 生产：`<SERVER_IP>`，`blog.service`（127.0.0.1:4322）+ Nginx 反代；`www.yesheng.wiki` 已绑定并启用 HTTPS
- 代码：`<APP_DIR>`；数据：`<DATA_DIR>/{blog.db,uploads}`（真实值只在环境变量与服务器受保护文件里）
- 详见 [README.md](README.md)、[docs/dynamic-refactor.md](docs/dynamic-refactor.md)、
  [docs/cutover.md](docs/cutover.md)、[docs/1panel.md](docs/1panel.md)

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

常用命令（`npm run dev` / `npm run build` 默认已是动态版）：

```bash
npm run dev     # BLOG_DYNAMIC=1 astro dev → http://localhost:4321
npm run build   # BLOG_DYNAMIC=1 astro build → dist-dynamic/
npm run check   # 类型检查（CI 也跑）
```

部署前先在当前 shell 里设好环境变量（仓库不写真实地址/密钥/目录）：

```powershell
$env:BLOG_SERVER  = "<SERVER_IP>"
$env:BLOG_SSH_KEY = "<SSH_KEY_PATH>"
$env:BLOG_APP_DIR = "<APP_DIR>"      # 服务器代码目录
powershell -File scripts\deploy-server.ps1 -Service blog-staging   # 部署 staging
powershell -File scripts\deploy-server.ps1                          # 部署生产
```

## 约定（改代码前先看）

- 内容在 SQLite 里，`src/content/` 与 `src/assets/` 只是**迁移来源**，运行时不再读取；改内容走 `/studio/`。
- Schema 唯一来源是 `db/schema.sql`；别在别处重复定义表结构。
- `src/artifact/*.html` 与 `artifact.js` 里有手工插入的 `@@占位符@@` 与服务端数据分支：
  **不要重跑 `npm run import:artifact`**，会覆盖。必须重跑时先备份，再重放 `.work/patch-*.mjs`。
- 站点设置统一走 `src/server/site.ts`（`getSiteConfig()` / `applyArtifactSite()`），静态配置只做兜底。
- 旧链接 301 的唯一映射表是 `src/server/legacy-redirects.json`（middleware 用它，`import-wordpress.mjs` 也读它）；
  加旧链接只改这张表，**不要再复制一份到 Nginx**（部署脚本只推代码）。
- HUD 的 `artifact.css` / `artifact.js` 同时存在 `src/artifact/` 与 `public/artifact/`；
  改完要同步两份（`import-artifact.mjs` 会自动写，但重跑前先看 `src/artifact` 的占位符警告）。
- Schema 版本在 `src/server/schema.ts`（当前 4）；v2 新增 `link_applications`，v3 新增 `visitor_logs`，v4 清理历史演示样本并升级真实 IP 与非阻塞缓冲统计。
- 访客统计是后台导航「06 统计」模块（工作区内嵌 `/studio/stats?embed=1` 独立 HUD）；
  `/studio/stats` 也可直达，均需登录。middleware 记录公开页访问，排除后台 / API / 静态资源。
  改统计页时同时看 `src/studio/stats.html` 与 `src/server/repositories/analytics.ts`。
- `/programs/` 空态是正常状态（内容由站长在后台补，别自己造内容）；评论暂缓，方案见 README 第 10 节。
- 楷体 ≥20px（硬规则）；配色只改 `src/styles/tokens.css`。
- 只改 `src/` 与配置；`dist*/`、`.astro/`、`.work/`、`data/` 都是生成物或本地数据，不进仓库。

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [On-demand rendering / SSR](https://docs.astro.build/en/guides/on-demand-rendering/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)

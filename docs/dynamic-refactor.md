# 动态化重构设计（server-backed）

> 状态：设计稿 / 实施中
> 分支：`refactor/server-dynamic`
> 目标：把“静态 Astro + GitHub CMS”换成“Astro SSR + SQLite + 自建后台”，保留现有 URL 与视觉。

## 0. 当前进度（2026-10-19）

已完成：

- `db/schema.sql` + `src/server/db.ts`（WAL、迁移、单例）
- `src/server/auth.ts`（scrypt、会话、CSRF、登录限流）
- `/api/*` middleware router：health、login/logout/me、posts CRUD、links/settings 读写
- `scripts/migrate-to-db.mjs`：6 篇文章（含 1 草稿）、1 面照片墙 6 张、6 个设置块、38 张文章图 + 11 张照片
- `src/pages/posts/[...slug].astro` 改为 SSR 读库 + markdown-it 渲染
- `/` 首页队列/焦点文章/最新照片墙由 SQLite 生成（`HomeArtifact.astro`）
- `/posts/` 时间轴、标签计数、统计、右栏快跳由 SQLite 生成
- `/photos/` 检视台数据、胶片条、筛选和档案网格由 SQLite 生成（`window.__PHOTO_DB`）
- `/links/`、`/programs/`、`/rss.xml` 已改为读库
- `artifact.js` 的焦点文章/照片数据改为优先读服务端注入，保留静态兜底
- `/studio/` 传输层已换成 `/api/fs` 虚拟文件接口：`ApiGithub extends Github`，
  `content.ts`/views 几乎不用改；登录改为账号密码 + HttpOnly 会话，不再需要 PAT/vault
- 图片上传走 `/api/fs` 的二进制模式，写入 `uploads/`；后台已有 Sharp 压缩与 EXIF 解析
- 已用无头 Edge 验证：登录 → 6 篇文章列表 → 改标题/取消草稿 → 保存 → 公开页立即 200

注意：

- **所有公开页面已改为动态；此分支的 `npm run build`（静态）不再保证通过。**
- 线上回滚点：`feat/studio-v2-desktop` 分支 + 服务器 `/var/www/blog` 的静态文件。
- **`src/artifact/*.html` 和 `artifact.js` 已手工插入 `@@占位符@@` / 服务端数据分支；不要直接重跑 `npm run import:artifact`，否则会覆盖。** 必须重跑时先备份，再重放 `.work/patch-*.mjs` 的替换。
- 下一步：动态 sitemap、staging（systemd + Nginx + 真实 DB）、切线上。

### Staging 现状（2026-10-19）

- 代码：`/var/www/blog-app`（`npm ci` + `npm run build:dynamic`）
- 数据：`/var/www/blog-data-staging/blog.db` + `uploads/`
- 服务：`blog-staging.service`（`blog` 用户，`127.0.0.1:4321`）
- 环境：`/etc/blog-staging.env`（root 600）
- 访问：SSH 隧道 `ssh -L 4323:127.0.0.1:4321 root@<server>`，浏览器开 `http://127.0.0.1:4323`
- 已验证：全部页面 200、`/api/health`、后台登录、FS 列表、创建/删除文章并即时反映到公开页、图片 `/uploads` 200
- Nginx 仍指向静态 `/var/www/blog`；生产反代配置待切换

## 1. 决策（默认按推荐方案）

| 项 | 选择 |
|---|---|
| 视觉 | **完整保留**四个 artifact 页面（`/`、`/posts/`、`/posts/<slug>/`、`/photos/`） |
| 后台 | **复用现有 `/studio/` UI**，把 GitHub 传输层换成自己的 API |
| 运行时/数据库 | **Astro SSR（@astrojs/node）+ SQLite（better-sqlite3）** |
| 切换 | **新分支 + staging + 验证后切**；线上静态站继续跑 |
| 数据位置 | SQLite + 本地 `uploads/`，不再依赖 GitHub token/vault |

如果后续要改成“简化首页”或“换后台 UI”，只影响第 2/3 阶段，不影响数据层。

## 2. 架构

```
浏览器
  │
  ▼
Nginx (443, TLS)
  ├── /_astro/ /artifact/ /uploads/  → 静态文件（缓存）
  └── 其它 → 127.0.0.1:4321
                 │
                 ▼
          Astro SSR (Node)
            ├── 页面：请求时读 SQLite
            ├── /api/admin/*：会话 + CSRF + SQLite 写入
            └── /api/upload：Sharp → uploads/
                 │
                 ▼
          /var/www/blog-data/
            ├── blog.db  (SQLite, WAL)
            └── uploads/
```

- 运行方式：`systemd` 跑 Node，Nginx 反代；不用 `astro preview`。
- 数据库：单文件 SQLite，WAL，每日 `.backup`。
- 上传：本地磁盘 + Sharp 生成 WebP；Nginx 直接发图。
- 页面：SSR 每请求读库；保存后立即生效，无需构建/commit。
- 代码仍然用 Git；**内容数据不再进 Git**（备份靠 SQLite + uploads）。

## 3. 数据模型

见 `src/server/schema.ts`（唯一 schema 源）。

| 表 | 说明 |
|---|---|
| `users` | 单管理员账号（scrypt 密码哈希） |
| `sessions` | 会话（只存 token 的 SHA-256） |
| `posts` | 文章；`body_markdown` 存原文，其余字段对应 frontmatter |
| `photo_walls` | 照片墙 |
| `photos` | 单张照片 + EXIF/直方图 |
| `links` | 友链 |
| `site_settings` | `site` / `home` / `authorDossier` / `articleRail` / `programs` 的 JSON |
| `media` | 上传文件元数据 |
| `schema_migrations` | 迁移版本 |

约定：

- 日期一律 `YYYY-MM-DD` 文本，SQLite 可直接排序。
- 数组/对象字段用 `*_json` TEXT 存 JSON（tags、railSpecs、railTopology、hist、autoFields）。
- `posts.version` 做乐观锁：保存时带上读取到的版本，服务端不匹配就 409。
- `posts.draft=1` 不出现在公开列表/RSS/sitemap。
- `photo_walls.date` 允许空串（未标注时间）。
- `site_settings` 的 key 固定为五个；值就是原来 `site.data.json` 的对应块。

## 4. API

所有写操作要求 `blog_session` Cookie + `X-CSRF-Token`。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 账号密码登录，建会话 |
| POST | `/api/auth/logout` | 销毁会话 |
| GET | `/api/auth/me` | 当前用户 + CSRF |
| GET/POST | `/api/posts` | 列表 / 新建 |
| GET/PUT/DELETE | `/api/posts/[id]` | 单篇读取 / 保存 / 删除 |
| GET/POST | `/api/walls` | 照片墙列表 / 新建 |
| GET/PUT/DELETE | `/api/walls/[id]` | 单墙 |
| GET/PUT | `/api/links` | 友链整体读写 |
| GET/PUT | `/api/settings/[key]` | 站点设置分块读写 |
| POST | `/api/upload` | multipart 图片上传（Sharp 压缩/转 WebP） |
| GET | `/api/health` | 健康检查（DB + 版本） |

后台沿用 `/studio/` 的编辑器与视图；把 `content.ts` 里的 `Github` 调用替换成 `fetch('/api/...')`。
`vault.ts` / `github.ts` / PAT 登录可以删除；`/admin/`（Sveltia）退役或重定向到 `/studio/`。

## 5. 页面映射

| 路由 | 现在 | 改后 |
|---|---|---|
| `/` | artifact 静态 partial + 写死 5 篇 | SSR + `HomePosts`/`HomePhotos` 组件循环 |
| `/posts/` | artifact 静态时间轴 | SSR + 时间轴循环 + 标签/检索 |
| `/posts/<slug>/` | `getStaticPaths` + Markdown | SSR 动态路由 + 按 slug 查库 + markdown-it |
| `/photos/` | artifact 静态 + `PHOTO_DB` | SSR + 照片墙/照片循环 |
| `/programs/` `/links/` | 读 `site.data.json` / links 集合 | SSR 读 `site_settings` / `links` |
| `/rss.xml` | 构建期 | 动态路由，读库 |
| `/sitemap.xml` | `@astrojs/sitemap` | 动态 sitemap（或构建期 + 手动触发） |
| `/studio/` | GitHub API + vault | API + 会话登录 |
| `/admin/` | Sveltia | 退役/重定向 |

最难的是 artifact 页面里写死的数据（`ARTICLE_DB`、`PHOTO_DB`、首页队列）。处理原则：

1. 服务端渲染出同样的 HTML 结构与 `data-*` 属性；
2. 保留现有 CSS/JS，不改视觉；
3. 把 `ARTICLE_DB`/`PHOTO_DB` 降级为兜底或删除；
4. 列表筛选/灯箱仍由现有 `artifact.js` 处理。

## 6. 迁移

`scripts/migrate-to-db.mjs`（待写）：

1. 读 `src/content/posts/*.md` → `posts`（frontmatter + body）。
2. 读 `src/content/photos/*.json` → `photo_walls` + `photos`。
3. 读 `src/content/links.json` → `links`。
4. 读 `src/site.data.json` → `site_settings`。
5. 复制 `src/assets/posts`、`src/assets/photos` 到 `uploads/posts`、`uploads/photos`；DB 存 `/uploads/...`。
6. 迁移后跑一致性检查：文章数、照片数、友链数、设置 key。

现有图片有两种来源：

- `src/assets/*`：Astro 构建时处理，迁移后复制到 uploads（或保留静态）。
- `public/artifact/home/images/*`：首页封面/照片，保留静态路径。

## 7. 认证与安全

- 密码：Node 内置 `crypto.scrypt`（N=16384, r=8, p=1），不引入 bcrypt/argon2。
- 会话：随机 32 字节 token → Cookie；DB 只存 SHA-256；`HttpOnly` + `Secure` + `SameSite=Lax`。
- CSRF：每会话随机 token，写请求校验 `X-CSRF-Token`。
- 登录限流：内存 Map（IP + 用户名，5 次/10 分钟），失败延迟。
- 上传：限制 MIME/尺寸；文件名服务端生成；不接受路径穿越；Sharp 重编码。
- SQLite：DB 文件在 web root 之外，权限 600；备份目录不在 web root。
- Nginx：只反代 127.0.0.1:4321；`/uploads/` 直接静态；隐藏文件拒绝。
- 管理页面：`/studio/` 保留 `noindex`；不做公开注册。

## 8. 部署与切换

### staging（不碰线上）

- 代码：`/var/www/blog-staging`（rsync 源码）。
- DB：`/var/www/blog-data-staging/blog.db`。
- 服务：`blog-staging.service`，监听 `127.0.0.1:4321`。
- Nginx：不公开；用 SSH 隧道访问 `http://localhost:4321`。
- 验证：所有路由、后台登录、保存、图片上传、RSS/sitemap。

### 切线上

1. 备份 `/var/www/blog`（当前静态站）和 `blog.db`。
2. 构建/迁移 staging → 验证。
3. 新建 `blog.service`（生产端口 4322）和 Nginx upstream；先切一小部分（可选）。
4. 切换 Nginx `root`/proxy；保留旧静态目录作为回滚。
5. 观察 24h，再删旧流水线。

回滚：Nginx 指回 `/var/www/blog` 静态目录；DB 不受影响。

## 9. 风险

| 风险 | 缓解 |
|---|---|
| artifact 页面写死数据多 | 先做只读动态页，再逐页替换；保留 CSS/JS |
| SSR 进程挂了整站 404 | systemd `Restart=always`；Nginx 静态 fallback/维护页 |
| SQLite 损坏 | WAL + 每日 `.backup` + 上传目录 tar |
| 后台改坏数据 | 保存前校验 + 版本号 + 备份 |
| 上传漏洞 | MIME/尺寸/重编码/文件名生成 |
| 迁移丢内容 | 迁移脚本 + 数量校验 + 旧静态站保留 |
| 2C2G 构建 OOM | 已加 2GB swap；构建时不同时跑别的服务 |

## 10. 实施顺序

1. schema + db 模块 + 迁移脚本
2. SSR 骨架 + `/api/health`
3. 只读页面（posts/article/photos/links/programs）+ RSS/sitemap
4. 登录 + posts API + studio 文章编辑
5. walls/links/settings API + studio 其余板块
6. 上传/EXIF + 媒体库
7. staging 验收 → 切线上

## 11. 待确认（已按推荐默认执行）

- 视觉：完整保留（1A）
- 后台：复用 studio（2A）
- DB：SQLite + SSR（3A）
- 切换：staging（4A）

如果这些默认要改，随时说；数据层不受影响。

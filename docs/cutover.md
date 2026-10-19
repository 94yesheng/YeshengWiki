# 动态版切线上清单

> 现状（2026-10-19）：
> - 生产动态版已切换，直接访问 `http://150.40.177.193/` 生效
> - 生产服务 `blog.service`（127.0.0.1:4322），数据 `/var/www/blog-data`
> - Nginx 已改为动态反代；静态配置备份在 `/root/blog-static.conf.bak`
> - 域名仍指向旧主机；HTTPS 待 DNS 切换后签
> - **域名绑定暂缓（2026-10-19 决定）：旧博客数据尚未迁移，迁移完成前不切 DNS；新站暂用 `http://150.40.177.193/` 访问**
> - `/admin/` 已 301 到 `/studio/`
> - SSH 已改为仅密钥登录（`/etc/ssh/sshd_config.d/00-hardening.conf`，密码登录关闭）；
>   忘记密钥时用华为云 VNC 控制台恢复
> - 备份已生效；`www` / 裸域 Host 头测试均 200
>
> 回滚：`cp -a /root/blog-static.conf.bak /etc/nginx/sites-available/blog && nginx -t && systemctl reload nginx`，静态文件仍在 `/var/www/blog`。

## 0. 验收 staging

在本地 Windows 开隧道：

```powershell
ssh -L 4323:127.0.0.1:4321 -i $env:USERPROFILE\.ssh\dsh_blog_ed25519 root@150.40.177.193
```

浏览器打开 `http://127.0.0.1:4323`。后台 `http://127.0.0.1:4323/studio/`，
账号 `admin`，密码在服务器：

```bash
sudo grep BLOG_ADMIN_PASSWORD /etc/blog-staging.env
```

重点验收：首页、`/posts/`、文章页、`/photos/`、后台登录、改一篇文章保存后公开页立即变化。

## 1. 准备生产数据与服务

```bash
# 生产数据目录（与 staging 分开）
install -d -o blog -g blog /var/www/blog-data
install -d -o blog -g blog /var/www/blog-data/uploads

# 从源码迁移一份生产 DB（首次；之后不再 --fresh）
cd /var/www/blog-app
BLOG_DB_PATH=/var/www/blog-data/blog.db \
BLOG_UPLOAD_DIR=/var/www/blog-data/uploads \
node scripts/migrate-to-db.mjs --fresh
chown -R blog:blog /var/www/blog-data

# 生产环境变量（密码自己换；root 600）
PW=$(node -e "console.log(require('crypto').randomBytes(15).toString('base64url'))")
cat > /etc/blog.env <<EOF
PORT=4322
HOST=127.0.0.1
NODE_ENV=production
BLOG_DB_PATH=/var/www/blog-data/blog.db
BLOG_UPLOAD_DIR=/var/www/blog-data/uploads
BLOG_ADMIN_USER=admin
BLOG_ADMIN_PASSWORD=$PW
EOF
chmod 600 /etc/blog.env

# 生产 systemd（复制 staging 改端口/路径/名字）
sed \
  -e 's/blog-staging/blog/g' \
  -e 's#/var/www/blog-data-staging#/var/www/blog-data#g' \
  -e 's#/etc/blog-staging.env#/etc/blog.env#' \
  /etc/systemd/system/blog-staging.service \
  > /etc/systemd/system/blog.service
systemctl daemon-reload
systemctl enable --now blog
curl -sS http://127.0.0.1:4322/api/health
```

## 2. 切 Nginx

```bash
cp -a /etc/nginx/sites-available/blog /root/blog-static.conf.bak
cp docs/nginx-dynamic.conf /etc/nginx/sites-available/blog
nginx -t && systemctl reload nginx
```

此时直接访问 `http://150.40.177.193/` 应该看到动态版；域名若还没切，仍然指向旧主机，不影响。

## 3. DNS + HTTPS

在阿里云 DNS（`dns11/dns12.hichina.com`）：
- `www`：CNAME → **A `150.40.177.193`**
- `@`：新增 **A `150.40.177.193`**
- TTL 300/600

确认 `nslookup www.yesheng.wiki` 返回 `150.40.177.193` 后：

```bash
certbot --nginx -d www.yesheng.wiki -d yesheng.wiki \
  --non-interactive --agree-tos --register-unsafely-without-email --redirect
```

验证 `https://www.yesheng.wiki/`、`https://yesheng.wiki/`、`/studio/`、RSS、sitemap。

## 4. 回滚

```bash
cp -a /root/blog-static.conf.bak /etc/nginx/sites-available/blog
nginx -t && systemctl reload nginx
```

静态文件仍在 `/var/www/blog`，回滚不需要动数据库。生产 Node 服务可以停：
`systemctl stop blog`。

## 5. 备份（已生效）

- `/usr/local/bin/blog-backup`：SQLite `.backup` + uploads tar + Nginx 配置，保留 7 天
- `/etc/cron.d/blog-backup`：每天 03:30
- 备份目录：`/var/www/backups`（不在 web root）

## 6. 待办

- [x] staging 验收
- [x] 生产 DB/systemd
- [x] 切 Nginx
- [x] 备份 cron
- [x] 退役 `/admin/`（301 到 `/studio/`）
- [ ] 旧博客数据迁移（文章 / 照片 / 友链；迁移完成前不切 DNS）
- [ ] DNS 改到 `150.40.177.193`（`www` A，`@` A）
- [ ] certbot 签 HTTPS
- [x] 退役 `vault` / GitHub Actions FTP 流水线（已删除 Sveltia/vault，CI 只做检查）
- [x] SSH 仅密钥 + fail2ban
- [x] README/CLAUDE 更新为动态架构（2026-10-19）

# 1Panel 运维面板（Plan A）

> 2026-10-19 安装。**只做运维面板**，不接管网站、不动主机 Nginx、不装 Docker。
>
> 文档中的 `<SERVER_IP>`、`<SSH_KEY_PATH>`、`<PANEL_PORT>`、`<PANEL_ENTRY>` 均为占位符，按实际环境替换。

## 访问方式

面板只监听 `127.0.0.1:<PANEL_PORT>`（iptables 拒绝非 loopback），公网安全组也未开放该端口。
必须走 SSH 隧道：

```powershell
ssh -N -L 8091:127.0.0.1:<PANEL_PORT> `
  -i <SSH_KEY_PATH> `
  -o ServerAliveInterval=30 root@<SERVER_IP>
```

浏览器打开：

```text
http://127.0.0.1:8091/<PANEL_ENTRY>/
```

（`<PANEL_ENTRY>` 为面板入口路径，部署后自行设置。）

- 用户名：面板管理员账号（部署后自行设置）
- 密码：见服务器上的凭据文件（root 600）
- 安全入口：面板入口路径（部署后自行设置）
- 版本：1Panel v2.3.2 stable

## 安装参数

- 安装目录：`/opt`
- 端口：`<PANEL_PORT>`
- 不安装 Docker
- 服务：`1panel-core.service`、`1panel-agent.service`
- 访问保护：`1panel-guard.service` + `/usr/local/bin/1panel-guard.sh`
- 日志：`/opt/1panel/log/1Panel.log`、面板安装日志（root 只读）

## 能做什么

- 概览 / 监控（CPU、内存、磁盘、流量）
- 文件管理
- Web 终端
- 计划任务
- 防火墙 / 日志 / 面板设置
- 用计划任务跑 `blog-backup` 或自定义脚本

## 不要做什么（Plan A 边界）

- **不要用 1Panel 创建网站 / 反向代理 / OpenResty 站点**，80/443 仍归主机 Nginx
- **不要安装 Docker 应用商店里的 OpenResty/MySQL/Redis**，那会引入容器和端口占用
- 面板里的「网站 0」是正常的：它不知道主机 Nginx 里的博客
- 不要在防火墙里放开 `<PANEL_PORT>`；需要访问就开 SSH 隧道

## 如果以后要装 Docker

先确认内存和端口，再单独评估：

```bash
# 不建议在未评估前直接执行
bash <(curl -sSL https://linuxmirrors.cn/docker.sh)
```

装完后 1Panel 的应用商店/容器/网站才会完整可用；届时也需要决定是否把 Nginx 交给 1Panel。

## 改密码

面板内「面板设置 → 修改密码」，或：

```bash
1pctl update password
```

改完同步更新服务器上的凭据记录文件。

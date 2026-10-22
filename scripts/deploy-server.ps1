param(
    [string]$Server = $env:BLOG_SERVER,
    [string]$User = "root",
    [string]$Key = $env:BLOG_SSH_KEY,
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$Service = "blog",
    [string]$AppDir = $(if ($env:BLOG_APP_DIR) { $env:BLOG_APP_DIR } else { '/srv/blog-app' })
)

# 部署前先设置环境变量（不要把真实值写进仓库）：
#   $env:BLOG_SERVER   = "<SERVER_IP>"      # 服务器地址
#   $env:BLOG_SSH_KEY  = "<SSH_KEY_PATH>"   # SSH 私钥路径
#   $env:BLOG_APP_DIR  = "<APP_DIR>"        # 代码目录（默认 /srv/blog-app）
# 也可以用 -Server / -Key / -AppDir 参数显式传入覆盖。
#
# 部署“代码”到服务器：上传源码 → 在临时目录 staging 构建 → 原子切换 dist-dynamic 与静态资源 → 重启 systemd。
# 不碰 SQLite 与 uploads（内容在数据库里）。
#   staging:    powershell -File scripts\deploy-server.ps1 -Service blog-staging
#   production: powershell -File scripts\deploy-server.ps1

if (-not $Server) { throw '缺少服务器地址：请先设置 $env:BLOG_SERVER，或用 -Server 传入' }
if (-not $Key) { throw '缺少 SSH 私钥路径：请先设置 $env:BLOG_SSH_KEY，或用 -Key 传入' }
if (-not (Test-Path $Key)) { throw "SSH 私钥不存在：$Key" }

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tar = Join-Path $root ".work\blog-src.tar.gz"

Push-Location $root
try {
    New-Item -ItemType Directory -Force .work | Out-Null
    Write-Host "==> package source" -ForegroundColor Cyan
    tar -czf $tar `
        --exclude=node_modules --exclude=dist --exclude=dist-dynamic `
        --exclude=.git --exclude=.work --exclude=.astro --exclude=demo `
        --exclude=mockups --exclude=.backup --exclude=public/admin/chunks `
        --exclude=public/admin/sveltia-cms.js .
    if ($LASTEXITCODE -ne 0) { throw "tar failed" }

    Write-Host "==> upload source" -ForegroundColor Cyan
    scp -i $Key -o BatchMode=yes $tar "${User}@${Server}:/tmp/blog-src.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp failed" }

    Write-Host "==> staging build, atomic swap, restart $Service" -ForegroundColor Cyan
    $StageDir = "${AppDir}.staging"
    $remote = @(
        "set -e",
        "rm -rf $StageDir",
        "mkdir -p $StageDir",
        "if [ -d $AppDir/node_modules ]; then cp -al $AppDir/node_modules $StageDir/node_modules 2>/dev/null || true; fi",
        "tar -xzf /tmp/blog-src.tar.gz -C $StageDir",
        "cd $StageDir",
        "npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund",
        "npm run build:dynamic",
        "mkdir -p $AppDir",
        "for item in src public scripts db docs package.json package-lock.json astro.config.mjs tsconfig.json; do",
        "  if [ -e $StageDir/`$item ]; then rm -rf $AppDir/`$item && mv $StageDir/`$item $AppDir/`$item; fi",
        "done",
        "rm -rf $AppDir/node_modules.old $AppDir/dist-dynamic.old",
        "if [ -d $AppDir/node_modules ]; then mv $AppDir/node_modules $AppDir/node_modules.old; fi",
        "mv $StageDir/node_modules $AppDir/node_modules",
        "if [ -d $AppDir/dist-dynamic ]; then mv $AppDir/dist-dynamic $AppDir/dist-dynamic.old; fi",
        "mv $StageDir/dist-dynamic $AppDir/dist-dynamic",
        "rm -rf $AppDir/node_modules.old $AppDir/dist-dynamic.old $StageDir /tmp/blog-src.tar.gz",
        "chown -R blog:blog $AppDir",
        "systemctl restart $Service",
        "systemctl is-active $Service"
    ) -join "`n"
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
    ssh -i $Key -o BatchMode=yes "${User}@${Server}" "echo $b64 | base64 -d | bash"
    if ($LASTEXITCODE -ne 0) { throw "remote deploy failed" }

    Write-Host "Deployed: $AppDir (service $Service)" -ForegroundColor Green
} finally {
    Pop-Location
}

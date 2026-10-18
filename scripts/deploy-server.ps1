param(
    [string]$Server = "150.40.177.193",
    [string]$User = "root",
    [string]$Key = "$env:USERPROFILE\.ssh\dsh_blog_ed25519",
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$Service = "blog",
    [string]$AppDir = "/var/www/blog-app"
)

# 部署“代码”到服务器：上传源码 → npm ci → build:dynamic → 重启 systemd。
# 不碰 SQLite 与 uploads（内容在数据库里）。
#   staging:    powershell -File scripts\deploy-server.ps1 -Service blog-staging
#   production: powershell -File scripts\deploy-server.ps1

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

    Write-Host "==> install, build, restart $Service" -ForegroundColor Cyan
    $remote = @(
        "set -e",
        "rm -rf $AppDir/src $AppDir/public $AppDir/scripts $AppDir/db $AppDir/docs $AppDir/dist-dynamic",
        "tar -xzf /tmp/blog-src.tar.gz -C $AppDir",
        "cd $AppDir",
        "npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund",
        "npm run build:dynamic",
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

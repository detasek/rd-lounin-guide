param(
  [string]$OutputDir = "deploy"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

$Commit = (git rev-parse --short HEAD).Trim()
$PackageName = "rd-lounin-guide-$Commit"
$StageDir = Join-Path $RepoRoot "$OutputDir\$PackageName"
$ZipPath = Join-Path $RepoRoot "$OutputDir\$PackageName.zip"

if (Test-Path -LiteralPath $StageDir) {
  Remove-Item -LiteralPath $StageDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

$Dirs = @(
  "api\controllers",
  "api\db",
  "api\lib",
  "api\middleware",
  "api\routes",
  "api\services",
  "app",
  "docs"
)

foreach ($dir in $Dirs) {
  $target = Join-Path $StageDir $dir
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Copy-Item -Path (Join-Path $RepoRoot "$dir\*") -Destination $target -Recurse -Force
}

$Files = @(
  "api\app.js",
  "api\server.js",
  "api\package.json",
  "api\package-lock.json",
  "docker-compose.yml",
  "package.json",
  "package-lock.json",
  ".gitignore"
)

foreach ($file in $Files) {
  Copy-Item -Path (Join-Path $RepoRoot $file) -Destination (Join-Path $StageDir $file) -Force
}

$RemovePatterns = @(
  ".git",
  "node_modules",
  "api\node_modules",
  "data",
  "deploy",
  "*.bak",
  "*.backup",
  "*.log"
)

foreach ($pattern in $RemovePatterns) {
  Get-ChildItem -Path $StageDir -Recurse -Force -ErrorAction SilentlyContinue -Include $pattern |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

$Manifest = @"
RD Lounin Guide deploy package
Commit: $Commit
Built: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

Copy contents of this folder to:
/volume1/docker/rd-lounin-guide

Do not overwrite Synology data:
/volume1/docker/rd-lounin-guide/data

After copying:
cd /volume1/docker/rd-lounin-guide
docker compose restart backend frontend
sleep 5
curl -s http://localhost:3010/api/health
echo
curl -s http://localhost:3010/api/status

Browser:
http://SYNOLOGY_IP:8091
"@

Set-Content -Path (Join-Path $StageDir "DEPLOY-MANIFEST.txt") -Value $Manifest -Encoding UTF8

if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}

Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $ZipPath -Force

Write-Output "Deploy folder: $StageDir"
Write-Output "Deploy zip: $ZipPath"

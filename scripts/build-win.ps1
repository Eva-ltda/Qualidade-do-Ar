$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$env:ELECTRON_CACHE = Join-Path $projectRoot ".electron-cache"
$env:ELECTRON_BUILDER_CACHE = Join-Path $projectRoot ".electron-builder-cache"

New-Item -ItemType Directory -Force -Path $env:ELECTRON_CACHE | Out-Null
New-Item -ItemType Directory -Force -Path $env:ELECTRON_BUILDER_CACHE | Out-Null

Write-Host "Usando ELECTRON_CACHE em $env:ELECTRON_CACHE"
Write-Host "Usando ELECTRON_BUILDER_CACHE em $env:ELECTRON_BUILDER_CACHE"

& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run build:renderer
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run build:electron
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npm.cmd run gen:icon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& node .\node_modules\electron-builder\cli.js --win --x64 --publish never
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Build concluido. Verifique a pasta release."

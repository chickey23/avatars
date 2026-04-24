# Run npm install when package manifests change, then unit tests. Quiet on success.
# Exit code non-zero on failure. Log append: .local/verify.log

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$localDir = Join-Path $root ".local"
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
$log = Join-Path $localDir "verify.log"
$stamp = Join-Path $localDir "npm-install.hash"

function Write-Log([string]$Message) {
    "$(Get-Date -Format "o") $Message" | Out-File -FilePath $log -Append -Encoding utf8
}

Write-Log "verify start"

$pkg = Join-Path $root "package.json"
if (-not (Test-Path $pkg)) {
    Write-Log "error: package.json missing"
    Write-Error "package.json missing"
    exit 1
}

$hashPath = if (Test-Path (Join-Path $root "package-lock.json")) {
    Join-Path $root "package-lock.json"
} else {
    $pkg
}

$current = (Get-FileHash -Path $hashPath -Algorithm SHA256).Hash
$prev = ""
if (Test-Path $stamp) {
    $prev = (Get-Content -Path $stamp -Raw).Trim()
}

if ($current -ne $prev) {
    Write-Log "npm install (manifest hash changed)"
    npm install --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) {
        Write-Log "error: npm install failed ($LASTEXITCODE)"
        Write-Error "npm install failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Set-Content -Path $stamp -Value $current -NoNewline
} else {
    Write-Log "npm install skip (hash unchanged)"
}

Write-Log "vitest run"
npm run test -- --reporter=dot
if ($LASTEXITCODE -ne 0) {
    Write-Log "error: vitest failed ($LASTEXITCODE)"
    Write-Error "tests failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Log "ensure viewer dist placeholder (Tauri frontendDist)"
& (Join-Path $PSScriptRoot "ensure-viewer-dist-placeholder.ps1")

Write-Log "cargo check avatars-viewer (workspace)"
cargo check -p avatars-viewer
if ($LASTEXITCODE -ne 0) {
    Write-Log "error: cargo check avatars-viewer failed ($LASTEXITCODE)"
    Write-Error "cargo check avatars-viewer failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Log "verify ok"
Write-Host "verify ok"

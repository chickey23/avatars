# Minimal dist-viewer so `cargo check -p avatars-viewer` succeeds (Tauri generate_context requires frontendDist).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root "dist-viewer"
$html = Join-Path $dir "index.html"
if (-not (Test-Path $html)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    @'
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /></head><body></body></html>
'@ | Set-Content -Path $html -Encoding utf8
}

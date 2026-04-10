# Signature phrase output for Avatar Interface System
# Returns JSON with phrase and style; reads from signature-config.json
# Usage: .\signature.ps1

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptDir "signature-config.json"

if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    $output = @{
        phrase = if ($config.phrase) { $config.phrase } else { "Je me souviens d'avoir fait cette chose." }
        style = if ($config.style) { $config.style } else { @{} }
    }
} else {
    $output = @{
        phrase = "Je me souviens d'avoir fait cette chose."
        style = @{}
    }
}

$output | ConvertTo-Json -Compress

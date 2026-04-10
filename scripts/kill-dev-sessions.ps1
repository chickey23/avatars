# Best-effort: free Vite dev port and close packaged Avatars processes before tauri dev.

$ErrorActionPreference = "SilentlyContinue"

$vitePort = 5173

Get-NetTCPConnection -LocalPort $vitePort -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object {
        $procId = $_.OwningProcess
        if ($procId) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }

foreach ($name in @("Avatars", "avatars")) {
    Stop-Process -Name $name -Force -ErrorAction SilentlyContinue
}

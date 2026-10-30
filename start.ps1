param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$xiangqiRoot = $PSScriptRoot
$xiangqiUrl = 'http://127.0.0.1:3000'
try {
    $xiangqiStatus = Invoke-RestMethod -Uri "$xiangqiUrl/api/health" -TimeoutSec 2
} catch { $xiangqiStatus = $null }
if ($xiangqiStatus.app -ne 'xiangqi-study') {
    $xiangqiNode = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath (Join-Path $xiangqiRoot 'node_modules\express'))) {
        Push-Location $xiangqiRoot
        try { & npm.cmd ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } } finally { Pop-Location }
    }
    $xiangqiRuntime = Join-Path $xiangqiRoot '.runtime'
    New-Item -ItemType Directory -Force -Path $xiangqiRuntime | Out-Null
    $xiangqiServerArgument = '"' + (Join-Path $xiangqiRoot 'server.js') + '"'
    $xiangqiProcess = Start-Process -FilePath $xiangqiNode -ArgumentList $xiangqiServerArgument -WorkingDirectory $xiangqiRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $xiangqiRuntime 'server.log') -RedirectStandardError (Join-Path $xiangqiRuntime 'server-error.log') -PassThru
    $xiangqiProcess.Id | Set-Content -LiteralPath (Join-Path $xiangqiRuntime 'server.pid')
    $xiangqiReady = $false
    for ($attempt=0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 250
        try { $xiangqiStatus=Invoke-RestMethod -Uri "$xiangqiUrl/api/health" -TimeoutSec 1; if ($xiangqiStatus.app -eq 'xiangqi-study') { $xiangqiReady=$true; break } } catch { }
        if ($xiangqiProcess.HasExited) { break }
    }
    if (-not $xiangqiReady) { throw 'Server could not start. Check .runtime/server-error.log and port 3000.' }
}
# The browser is the interactive result the user is launching.
if (-not $NoBrowser) { Start-Process $xiangqiUrl }

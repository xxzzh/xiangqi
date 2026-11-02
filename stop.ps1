$ErrorActionPreference = 'Stop'
$xiangqiRoot = $PSScriptRoot
$xiangqiPidFile = Join-Path $xiangqiRoot '.runtime\server.pid'
if (-not (Test-Path -LiteralPath $xiangqiPidFile)) { Write-Output '本目录没有正在运行的练习服务。'; exit 0 }
$xiangqiServerPid = 0
if (-not [int]::TryParse((Get-Content -LiteralPath $xiangqiPidFile -Raw).Trim(), [ref]$xiangqiServerPid)) { Write-Output '运行记录无效，未停止任何进程。'; exit 0 }
$xiangqiServer = Get-CimInstance Win32_Process -Filter "ProcessId = $xiangqiServerPid"
$xiangqiExpectedScript = Join-Path $xiangqiRoot 'server.js'
if ($xiangqiServer -and $xiangqiServer.Name -eq 'node.exe' -and $xiangqiServer.CommandLine -and $xiangqiServer.CommandLine.IndexOf($xiangqiExpectedScript, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
    $xiangqiChildren = Get-CimInstance Win32_Process -Filter "ParentProcessId = $xiangqiServerPid"
    foreach ($xiangqiChild in $xiangqiChildren) {
        Get-CimInstance Win32_Process -Filter "ParentProcessId = $($xiangqiChild.ProcessId)" | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
        Stop-Process -Id $xiangqiChild.ProcessId -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $xiangqiServerPid -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $xiangqiPidFile -ErrorAction SilentlyContinue
    Write-Output '象棋研习室已停止；棋谱与学习进度仍保存在浏览器中。'
} else { Write-Output '本目录的练习服务已经停止，未影响其他程序。' }

$xiangqiPidFile = Join-Path $PSScriptRoot '.runtime\server.pid'
if (Test-Path -LiteralPath $xiangqiPidFile) {
    $xiangqiServerPid = [int](Get-Content -LiteralPath $xiangqiPidFile)
    $xiangqiServer = Get-CimInstance Win32_Process -Filter "ProcessId = $xiangqiServerPid"
    if ($xiangqiServer.Name -eq 'node.exe' -and $xiangqiServer.CommandLine.Contains((Join-Path $PSScriptRoot 'server.js'))) {
        # Stop the engine descendants first, so a closed server leaves no analysis running.
        $xiangqiChildren = Get-CimInstance Win32_Process -Filter "ParentProcessId = $xiangqiServerPid"
        foreach ($xiangqiChild in $xiangqiChildren) {
            Get-CimInstance Win32_Process -Filter "ParentProcessId = $($xiangqiChild.ProcessId)" | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
            Stop-Process -Id $xiangqiChild.ProcessId -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $xiangqiServerPid -ErrorAction SilentlyContinue
    }
}

param([switch]$NoBrowser, [ValidateRange(1024, 65525)][int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$xiangqiRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
$xiangqiPortable = Test-Path -LiteralPath (Join-Path $xiangqiRoot 'portable.json')
$xiangqiBundledNode = Join-Path $xiangqiRoot 'runtime\node.exe'
$xiangqiRuntime = Join-Path $xiangqiRoot '.runtime'
$xiangqiMutex = $null
$xiangqiLockTaken = $false
$xiangqiEnvironment = @{}
$xiangqiEnvNames = @('PORT')
if ($xiangqiPortable) { $xiangqiEnvNames += @('ENGINE_PATH', 'NNUE_PATH', 'PUBLIC_PATH', 'NODE_PATH', 'NODE_OPTIONS') }
foreach ($xiangqiName in $xiangqiEnvNames) { $xiangqiEnvironment[$xiangqiName] = [Environment]::GetEnvironmentVariable($xiangqiName, 'Process'); [Environment]::SetEnvironmentVariable($xiangqiName, $null, 'Process') }
try {
    if ($xiangqiPortable -and -not [Environment]::Is64BitOperatingSystem) { throw '免安装版需要 64 位 Windows 10/11。' }
    if (Test-Path -LiteralPath $xiangqiBundledNode) { $xiangqiNode = $xiangqiBundledNode }
    elseif ($xiangqiPortable) { throw '整合包缺少 runtime\node.exe，请重新完整解压下载包。' }
    else {
        $xiangqiCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $xiangqiCommand) { throw '源码版需要安装 Node.js；普通用户请下载 windows-x64 整合包。' }
        $xiangqiNode = $xiangqiCommand.Source
    }
    $xiangqiVersion = & $xiangqiNode --version
    if ($LASTEXITCODE -ne 0 -or $xiangqiVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 18) { throw '运行环境无法启动，请使用受支持的 Windows 或重新解压整合包。' }
    if (-not (Test-Path -LiteralPath (Join-Path $xiangqiRoot 'node_modules\express\index.js')) -or -not (Test-Path -LiteralPath (Join-Path $xiangqiRoot 'node_modules\ws\index.js'))) {
        if ($xiangqiPortable) { throw '整合包依赖文件不完整，请重新完整解压；免安装版无需运行 npm。' }
        Push-Location $xiangqiRoot
        try { & npm.cmd ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' } } finally { Pop-Location }
    }
    $xiangqiEngine = Join-Path $xiangqiRoot 'engine\Pikafish-Windows-x86-64-universal.exe'
    $xiangqiNnue = Join-Path $xiangqiRoot 'engine\pikafish.nnue'
    if (-not $xiangqiPortable -and $env:ENGINE_PATH) { $xiangqiEngine = $env:ENGINE_PATH }
    if (-not $xiangqiPortable -and $env:NNUE_PATH) { $xiangqiNnue = $env:NNUE_PATH }
    foreach ($xiangqiFile in @((Join-Path $xiangqiRoot 'server.js'), (Join-Path $xiangqiRoot 'public\index.html'), $xiangqiEngine, $xiangqiNnue)) {
        if (-not (Test-Path -LiteralPath $xiangqiFile)) { throw "缺少文件 $xiangqiFile，请完整解压整合包，或按 README 配置源码版。" }
    }
    New-Item -ItemType Directory -Force -Path $xiangqiRuntime | Out-Null
    $xiangqiHasher = [Security.Cryptography.SHA256]::Create()
    try { $xiangqiHash = $xiangqiHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($xiangqiRoot.ToLowerInvariant())) } finally { $xiangqiHasher.Dispose() }
    $xiangqiInstance = ([BitConverter]::ToString($xiangqiHash).Replace('-', '').ToLowerInvariant()).Substring(0, 16)
    $xiangqiMutex = New-Object Threading.Mutex($false, "Local\XiangqiStudy-$xiangqiInstance")
    try { $xiangqiLockTaken = $xiangqiMutex.WaitOne(20000) } catch [Threading.AbandonedMutexException] { $xiangqiLockTaken = $true }
    if (-not $xiangqiLockTaken) { throw '另一个窗口正在启动，请稍后再试。' }
    $xiangqiProbeFile = Join-Path $xiangqiRuntime 'write-check.tmp'
    [IO.File]::WriteAllText($xiangqiProbeFile, 'ok')
    Remove-Item -LiteralPath $xiangqiProbeFile
    $xiangqiUrl = $null
    foreach ($xiangqiCandidate in $Port..($Port + 10)) {
        $xiangqiListener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $xiangqiCandidate)
        try { $xiangqiListener.Start(); $xiangqiAvailable = $true } catch { $xiangqiAvailable = $false } finally { $xiangqiListener.Stop() }
        $xiangqiCandidateUrl = "http://127.0.0.1:$xiangqiCandidate"
        if (-not $xiangqiAvailable) {
            try { $xiangqiStatus = Invoke-RestMethod -Uri "$xiangqiCandidateUrl/api/health" -TimeoutSec 1 } catch { $xiangqiStatus = $null }
            if ($xiangqiStatus.app -eq 'xiangqi-study' -and $xiangqiStatus.instanceId -eq $xiangqiInstance) { $xiangqiUrl = $xiangqiCandidateUrl; break }
            continue
        }
        $env:PORT = [string]$xiangqiCandidate
        $xiangqiServerArgument = '"' + (Join-Path $xiangqiRoot 'server.js') + '"'
        $xiangqiProcess = Start-Process -FilePath $xiangqiNode -ArgumentList $xiangqiServerArgument -WorkingDirectory $xiangqiRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $xiangqiRuntime 'server.log') -RedirectStandardError (Join-Path $xiangqiRuntime 'server-error.log') -PassThru
        $xiangqiProcess.Id | Set-Content -LiteralPath (Join-Path $xiangqiRuntime 'server.pid')
        $xiangqiReady = $false
        for ($xiangqiAttempt = 0; $xiangqiAttempt -lt 40; $xiangqiAttempt++) {
            Start-Sleep -Milliseconds 250
            try { $xiangqiStatus = Invoke-RestMethod -Uri "$xiangqiCandidateUrl/api/health" -TimeoutSec 1; if ($xiangqiStatus.instanceId -eq $xiangqiInstance -and $xiangqiStatus.engineInstalled) { $xiangqiReady = $true; break } } catch { }
            if ($xiangqiProcess.HasExited) { break }
        }
        if (-not $xiangqiReady) {
            if (-not $xiangqiProcess.HasExited) { Stop-Process -Id $xiangqiProcess.Id -ErrorAction SilentlyContinue }
            throw '服务未能启动。请查看 .runtime\server-error.log；也可把整合包解压到有写入权限的文件夹后重试。'
        }
        $xiangqiUrl = $xiangqiCandidateUrl
        @{ url = $xiangqiUrl; port = $xiangqiCandidate; pid = $xiangqiProcess.Id; instanceId = $xiangqiInstance } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $xiangqiRuntime 'session.json') -Encoding UTF8
        break
    }
    if (-not $xiangqiUrl) { throw '附近端口均被占用，请关闭旧练习窗口后运行“停止研习室.cmd”，再重试。' }
    Write-Output "象棋研习室已启动：$xiangqiUrl"
    if (-not $NoBrowser) { Start-Process $xiangqiUrl }
} catch {
    Write-Host ("启动失败：" + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    foreach ($xiangqiName in $xiangqiEnvNames) { [Environment]::SetEnvironmentVariable($xiangqiName, $xiangqiEnvironment[$xiangqiName], 'Process') }
    if ($xiangqiLockTaken -and $xiangqiMutex) { $xiangqiMutex.ReleaseMutex() }
    if ($xiangqiMutex) { $xiangqiMutex.Dispose() }
}
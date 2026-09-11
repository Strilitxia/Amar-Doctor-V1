<#
    Amar Doctor V1 -- start every service the video call needs.

    The video call needs THREE processes, in two different Python
    environments. Starting only the backend is the single easiest mistake to
    make: everything looks healthy, but /health reports
    lipsync.reason = "unreachable" and every video call silently falls back
    to the audio-reactive avatar -- which on screen looks like a still
    portrait, i.e. exactly like the feature is broken.

      1. MuseTalk renderer  :8100  -- isolated py3.10 venv (<AiHome>\musetalk-venv)
      2. Main backend       :8000  -- project venv (.\venv)
      3. Next.js web        :3000

    <AiHome> is wherever setup-windows.ps1 put the MuseTalk venv, clone,
    weights and ffmpeg: by default a folder NEXT TO the repo named
    amar-doctor-ai. Override with -AiHome or $env:AMAR_AI_HOME.

    Usage (or double-click start-all.cmd):
        .\start-all.ps1              # start whatever isn't already running
        .\start-all.ps1 -NoVideo     # skip the renderer (audio-reactive avatar)
        .\start-all.ps1 -Stop        # stop everything this script starts

    One-time install: .\setup-windows.ps1  (details in MUSETALK_SETUP.md).
#>

param(
    [string]$AiHome = $(if ($env:AMAR_AI_HOME) { $env:AMAR_AI_HOME } else { Join-Path (Split-Path $PSScriptRoot -Parent) "amar-doctor-ai" }),
    [switch]$NoVideo,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$Repo = $PSScriptRoot
$AiHome = [System.IO.Path]::GetFullPath($AiHome)
# Pre-setup-script installs (MUSETALK_SETUP.md's manual recipe) used D:\ai.
if (-not (Test-Path (Join-Path $AiHome "musetalk-venv")) -and (Test-Path "D:\ai\musetalk-venv")) { $AiHome = "D:\ai" }
$MuseTalkVenv = Join-Path $AiHome "musetalk-venv\Scripts\python.exe"
$ProjectVenv = Join-Path $Repo "venv\Scripts\python.exe"
$LogDir = Join-Path $Repo ".logs"

if (-not $Stop -and -not (Test-Path $ProjectVenv)) {
    Write-Host "Project venv not found at $ProjectVenv" -ForegroundColor Red
    Write-Host "Run .\setup-windows.ps1 first (or double-click setup-windows.cmd)." -ForegroundColor Red
    exit 1
}

function Get-PortPid([int]$Port) {
    $line = netstat -ano | Select-String ":$Port\s.*LISTENING" | Select-Object -First 1
    # netstat leaves a non-zero $LASTEXITCODE behind, which otherwise leaks
    # out as this script's own exit status and makes a clean run look failed.
    $global:LASTEXITCODE = 0
    if (-not $line) { return $null }
    return ($line -split '\s+')[-1]
}

if ($Stop) {
    foreach ($p in 8100, 8000, 3000) {
        $procId = Get-PortPid $p
        if ($procId) {
            Write-Host "Stopping port $p (PID $procId)..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        } else {
            Write-Host "Port $p already free." -ForegroundColor DarkGray
        }
    }
    exit 0
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# --- 1. MuseTalk renderer -------------------------------------------------
if ($NoVideo) {
    Write-Host "[1/3] Renderer skipped (-NoVideo). Video calls will use the audio-reactive avatar." -ForegroundColor Yellow
} elseif (Get-PortPid 8100) {
    Write-Host "[1/3] Renderer already running on :8100." -ForegroundColor DarkGray
} elseif (-not (Test-Path $MuseTalkVenv)) {
    Write-Host "[1/3] MuseTalk venv not found at $MuseTalkVenv" -ForegroundColor Red
    Write-Host "      Video calls will fall back to the audio-reactive avatar." -ForegroundColor Red
    Write-Host "      Run .\setup-windows.ps1 to install it, or pass -NoVideo to skip this warning." -ForegroundColor Red
} else {
    Write-Host "[1/3] Starting MuseTalk renderer on :8100 ..." -ForegroundColor Cyan
    # musetalk_service.py reads these; the child process inherits them.
    $env:MUSETALK_ROOT = Join-Path $AiHome "MuseTalk"
    $env:FFMPEG_PATH   = Join-Path $AiHome "ffmpeg\bin"
    Start-Process -FilePath $MuseTalkVenv `
        -ArgumentList "-m", "uvicorn", "musetalk_service:app", "--host", "127.0.0.1", "--port", "8100" `
        -WorkingDirectory (Join-Path $Repo "backend") `
        -RedirectStandardOutput (Join-Path $LogDir "musetalk.out.log") `
        -RedirectStandardError  (Join-Path $LogDir "musetalk.err.log") `
        -WindowStyle Hidden
}

# --- 2. Main backend ------------------------------------------------------
# Deliberately no --reload: it re-runs the Whisper warmup and doubles VRAM,
# which matters a lot on an 8GB card shared with the renderer.
if (Get-PortPid 8000) {
    Write-Host "[2/3] Backend already running on :8000." -ForegroundColor DarkGray
} else {
    Write-Host "[2/3] Starting backend on :8000 ..." -ForegroundColor Cyan
    Start-Process -FilePath $ProjectVenv `
        -ArgumentList "-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $Repo `
        -RedirectStandardOutput (Join-Path $LogDir "backend.out.log") `
        -RedirectStandardError  (Join-Path $LogDir "backend.err.log") `
        -WindowStyle Hidden
}

# --- 3. Web ---------------------------------------------------------------
if (Get-PortPid 3000) {
    Write-Host "[3/3] Web already running on :3000." -ForegroundColor DarkGray
} else {
    Write-Host "[3/3] Starting Next.js on :3000 ..." -ForegroundColor Cyan
    Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" `
        -WorkingDirectory $Repo `
        -RedirectStandardOutput (Join-Path $LogDir "web.out.log") `
        -RedirectStandardError  (Join-Path $LogDir "web.err.log") `
        -WindowStyle Hidden
}

# --- Wait for the backend, then report what the video call will actually do ---
Write-Host "`nWaiting for the backend to answer /health ..." -ForegroundColor DarkGray
$health = $null
foreach ($i in 1..90) {
    Start-Sleep -Seconds 2
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:8000/health" -TimeoutSec 3
        break
    } catch { }
}

if (-not $health) {
    Write-Host "Backend did not come up. See $LogDir\backend.err.log" -ForegroundColor Red
    exit 1
}

Write-Host ("Whisper : {0} on {1} (loaded: {2}) -- if never loaded, use the Web Speech toggle in /chat for the mic" -f $health.whisper.model_size, $health.whisper.device, $health.whisper.loaded)

# The renderer loads ~7GB of weights, so it is normally slower to become
# ready than the backend -- poll it separately rather than judging too early.
if (-not $NoVideo) {
    Write-Host "Waiting for the renderer to finish loading (first run also prepares the avatar) ..." -ForegroundColor DarkGray
    foreach ($i in 1..150) {
        try {
            $sc = Invoke-RestMethod "http://127.0.0.1:8100/health" -TimeoutSec 3
            if ($sc.ok) { break }
        } catch { }
        Start-Sleep -Seconds 2
    }
    $health = Invoke-RestMethod "http://127.0.0.1:8000/health" -TimeoutSec 5
}

if ($health.lipsync.live) {
    Write-Host ("Lip-sync: LIVE ({0})" -f $health.lipsync.engine) -ForegroundColor Green
} else {
    Write-Host ("Lip-sync: OFF (reason: {0})" -f $health.lipsync.reason) -ForegroundColor Yellow
    Write-Host "         Video calls will show the audio-reactive avatar, not GPU lip-sync." -ForegroundColor Yellow
    if ($health.lipsync.reason -eq "unreachable" -and -not $NoVideo) {
        Write-Host "         The renderer isn't answering on :8100 -- see $LogDir\musetalk.err.log" -ForegroundColor Yellow
    }
    if ($health.lipsync.error) {
        Write-Host ("         Renderer error: {0}" -f $health.lipsync.error) -ForegroundColor Red
        Write-Host "         Full traceback: $LogDir\musetalk.err.log" -ForegroundColor Yellow
    }
}

Write-Host "`nOpen http://localhost:3000/chat  ->  Video Call  ->  Start Live Call" -ForegroundColor White
Write-Host "Logs: $LogDir    Stop everything: .\start-all.ps1 -Stop" -ForegroundColor DarkGray

# Exit 0 only when the stack is actually usable; a caller (or CI) can trust it.
if ($NoVideo -or $health.lipsync.live) { exit 0 } else { exit 2 }

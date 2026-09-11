<#
    Amar Doctor V1 -- one-shot Windows installer.

    Installs everything the app needs on ANY Windows PC, without touching the
    system Python:

      * tools        uv, git, Node.js LTS            (winget, only if missing)
      * web          npm install
      * backend      .\venv  (py3.12 via uv, no Whisper -- see requirements-core.txt)
      * MuseTalk     <AiHome>\musetalk-venv (py3.10) + <AiHome>\MuseTalk + 7.3GB weights
      * ffmpeg       <AiHome>\ffmpeg\bin\ffmpeg.exe (copied from imageio-ffmpeg)

    <AiHome> defaults to a folder NEXT TO the repo, e.g.
        D:\Project Files\amar-doctor-ai
    Override with  -AiHome X:\somewhere  or  $env:AMAR_AI_HOME. Weights are
    kept outside the repo so Next's file watcher never scans them.

    Every step is idempotent: re-run after a failed download and it resumes.

    Usage (from an ordinary PowerShell, or double-click setup-windows.cmd):
        .\setup-windows.ps1                 # everything
        .\setup-windows.ps1 -NoVideo        # skip MuseTalk (audio-reactive avatar only)
        .\setup-windows.ps1 -AiHome E:\ai   # put the 8GB of AI stuff elsewhere

    Afterwards:  .\start-all.ps1   (or double-click start-all.cmd)
#>

param(
    [string]$AiHome = $(if ($env:AMAR_AI_HOME) { $env:AMAR_AI_HOME } else { Join-Path (Split-Path $PSScriptRoot -Parent) "amar-doctor-ai" }),
    [switch]$NoVideo
)

$ErrorActionPreference = "Stop"
$Repo = $PSScriptRoot
$AiHome = [System.IO.Path]::GetFullPath($AiHome)

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor DarkGray }
function Fail($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

# winget installs land on PATH only for NEW shells; re-read PATH so this
# script can use what it just installed.
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
    # uv's default install dir isn't always on PATH yet.
    foreach ($d in "$env:USERPROFILE\.local\bin", "$env:LOCALAPPDATA\Programs\uv") {
        if ((Test-Path $d) -and ($env:Path -notlike "*$d*")) { $env:Path = "$d;$env:Path" }
    }
}

function Ensure-Tool([string]$Exe, [string]$WingetId, [string]$Name) {
    if (Get-Command $Exe -ErrorAction SilentlyContinue) { Ok "$Name found: $((Get-Command $Exe).Source)"; return }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Fail "$Name is not installed and winget is unavailable. Install $Name manually, then re-run."
    }
    Write-Host "    Installing $Name via winget ..." -ForegroundColor Yellow
    winget install --id $WingetId -e --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
    if (-not (Get-Command $Exe -ErrorAction SilentlyContinue)) {
        Fail "$Name still not on PATH after install. Open a NEW terminal and re-run this script."
    }
    Ok "$Name installed."
}

# Run a native command and stop on non-zero exit (PowerShell 5.1 doesn't).
function Run { param([string]$File, [string[]]$Argv)
    & $File @Argv
    if ($LASTEXITCODE -ne 0) { Fail "'$File $($Argv -join ' ')' failed (exit $LASTEXITCODE)." }
}

Write-Host "Amar Doctor V1 -- Windows setup" -ForegroundColor White
Write-Host "Repo   : $Repo"
Write-Host "AI home: $AiHome  $(if ($NoVideo) { '(unused: -NoVideo)' })"

# --- 0. Tools -------------------------------------------------------------
Step "Checking tools"
Refresh-Path
Ensure-Tool "git"  "Git.Git"           "Git"
Ensure-Tool "node" "OpenJS.NodeJS.LTS" "Node.js"
Ensure-Tool "uv"   "astral-sh.uv"      "uv"

$hasGpu = [bool](Get-Command nvidia-smi -ErrorAction SilentlyContinue)
if (-not $NoVideo -and -not $hasGpu) {
    Write-Host "    WARNING: nvidia-smi not found. MuseTalk needs an NVIDIA GPU (>= 6GB VRAM) + driver." -ForegroundColor Yellow
    Write-Host "             Installing anyway; the renderer will report no_cuda and the app falls back to the audio-reactive avatar." -ForegroundColor Yellow
}

# --- 1. Web ---------------------------------------------------------------
Step "Web (npm install)"
if (Test-Path (Join-Path $Repo "node_modules\next")) { Ok "node_modules present, skipping." }
else { Push-Location $Repo; try { Run "npm.cmd" @("install") } finally { Pop-Location } }

# --- 2. Main backend venv -------------------------------------------------
Step "Backend venv (.\venv, no Whisper)"
$ProjectVenv = Join-Path $Repo "venv"
$ProjectPy   = Join-Path $ProjectVenv "Scripts\python.exe"
if (-not (Test-Path $ProjectPy)) {
    Run "uv" @("python", "install", "3.12")
    Run "uv" @("venv", "--python", "3.12", "--seed", $ProjectVenv)
} else { Ok "venv exists, reusing." }
Run "uv" @("pip", "install", "--python", $ProjectPy, "-r", (Join-Path $Repo "backend\requirements-core.txt"))

# --- 3. .env.local --------------------------------------------------------
Step "Config (.env.local)"
$EnvFile = Join-Path $Repo ".env.local"
if ((Test-Path $EnvFile) -and (Select-String -Path $EnvFile -Pattern '^GROQ_API_KEY=(?!PASTE_)\S+' -Quiet)) {
    Ok "GROQ_API_KEY already set."
} else {
    Write-Host "    The AI doctor needs a Groq API key (free at https://console.groq.com/keys)." -ForegroundColor Yellow
    $key = Read-Host "    Paste GROQ_API_KEY (Enter to skip; add it to .env.local later)"
    if (-not $key) { $key = "PASTE_YOUR_KEY_HERE" }
    Add-Content -Path $EnvFile -Value "GROQ_API_KEY=$key" -Encoding utf8
    Ok "Wrote $EnvFile"
}

if ($NoVideo) {
    Write-Host "`nDone (no video). Run:  .\start-all.ps1 -NoVideo" -ForegroundColor Green
    exit 0
}

# --- 4. MuseTalk: isolated py3.10 venv ------------------------------------
# Why separate: MuseTalk pins numpy 1.23 / mmcv 2.0.1, which have no wheels
# past cp311 and clash with everything modern. See MUSETALK_SETUP.md.
Step "MuseTalk venv ($AiHome\musetalk-venv, py3.10)"
New-Item -ItemType Directory -Force -Path $AiHome | Out-Null
$MtVenv = Join-Path $AiHome "musetalk-venv"
$PY     = Join-Path $MtVenv "Scripts\python.exe"
if (-not (Test-Path $PY)) {
    Run "uv" @("python", "install", "3.10")
    # --seed is mandatory: mim shells out to pip, and chumpy needs wheel.
    Run "uv" @("venv", "--python", "3.10", "--seed", $MtVenv)
} else { Ok "venv exists, reusing." }

Step "MuseTalk source ($AiHome\MuseTalk)"
$MtRoot = Join-Path $AiHome "MuseTalk"
if (Test-Path (Join-Path $MtRoot "scripts\realtime_inference.py")) { Ok "already cloned." }
else { Run "git" @("clone", "--depth", "1", "https://github.com/TMElyralab/MuseTalk", $MtRoot) }

Step "MuseTalk dependencies (torch cu118 + mmcv stack; ~3GB, takes a while)"
$Marker = Join-Path $MtVenv "deps-installed.ok"
if (Test-Path $Marker) { Ok "already installed (delete $Marker to redo)." }
else {
    # Order matters: mim resolves mmcv against whatever torch is present.
    Run $PY @("-m", "pip", "install", "-q", "torch==2.0.1", "torchvision==0.15.2", "torchaudio==2.0.2", "--index-url", "https://download.pytorch.org/whl/cu118")
    Run $PY @("-m", "pip", "install", "-q", "-U", "openmim")
    Run $PY @("-m", "pip", "install", "-q", "setuptools<70")     # mim needs pkg_resources
    Run $PY @("-m", "mim", "install", "mmengine")
    Run $PY @("-m", "mim", "install", "mmcv==2.0.1")
    Run $PY @("-m", "mim", "install", "mmdet==3.1.0")
    Run $PY @("-m", "mim", "install", "mmpose==1.1.0")

    # MuseTalk's requirements minus training-only / UI packages.
    Get-Content (Join-Path $MtRoot "requirements.txt") |
        Where-Object { $_ -notmatch '^(tensorflow|tensorboard|gradio)' } |
        Set-Content (Join-Path $MtRoot "requirements-headless.txt")
    Run $PY @("-m", "pip", "install", "-q", "-r", (Join-Path $MtRoot "requirements-headless.txt"))
    # hub 0.30.2: newer breaks diffusers 0.30 imports. fastapi/uvicorn: the sidecar itself.
    Run $PY @("-m", "pip", "install", "-q", "huggingface_hub==0.30.2", "fastapi", "uvicorn[standard]", "imageio-ffmpeg")
    New-Item -ItemType File -Path $Marker | Out-Null
}

# --- 5. ffmpeg ------------------------------------------------------------
# MuseTalk shells out to "<dir>/ffmpeg", so it needs a file literally named
# ffmpeg.exe. imageio-ffmpeg ships one under a versioned name -- copy it.
Step "ffmpeg ($AiHome\ffmpeg\bin\ffmpeg.exe)"
$FfDir = Join-Path $AiHome "ffmpeg\bin"
$FfExe = Join-Path $FfDir "ffmpeg.exe"
if (Test-Path $FfExe) { Ok "present." }
else {
    $src = Get-ChildItem (Join-Path $MtVenv "Lib\site-packages\imageio_ffmpeg\binaries") -Filter "ffmpeg-win*.exe" | Select-Object -First 1
    if (-not $src) { Fail "imageio-ffmpeg binary not found in the MuseTalk venv." }
    New-Item -ItemType Directory -Force -Path $FfDir | Out-Null
    Copy-Item $src.FullName $FfExe
    Ok "copied $($src.Name)"
}

# --- 6. Weights (~7.3GB) --------------------------------------------------
Step "Model weights -> $MtRoot\models  (7.3GB; resumable, re-run if it drops)"
$CLI = Join-Path $MtVenv "Scripts\huggingface-cli.exe"
$Models = Join-Path $MtRoot "models"
$Downloads = @(
    @{ id = "TMElyralab/MuseTalk";                dir = $Models;                          check = "musetalkV15\unet.pth";       inc = @() },
    @{ id = "yzd-v/DWPose";                       dir = "$Models\dwpose";                 check = "dw-ll_ucoco_384.pth";        inc = @("dw-ll_ucoco_384.pth") },
    @{ id = "stabilityai/sd-vae-ft-mse";          dir = "$Models\sd-vae";                 check = "diffusion_pytorch_model.bin"; inc = @("config.json", "diffusion_pytorch_model.bin") },
    @{ id = "openai/whisper-tiny";                dir = "$Models\whisper";                check = "pytorch_model.bin";          inc = @("config.json", "pytorch_model.bin", "preprocessor_config.json") },
    @{ id = "ManyOtherFunctions/face-parse-bisent"; dir = "$Models\face-parse-bisent";    check = "79999_iter.pth";             inc = @("79999_iter.pth", "resnet18-5c106cde.pth") }
)
foreach ($d in $Downloads) {
    if (Test-Path (Join-Path $d.dir $d.check)) { Ok "$($d.id) present."; continue }
    $dlArgs = @("download", $d.id, "--local-dir", $d.dir)
    if ($d.inc.Count) { $dlArgs += "--include"; $dlArgs += $d.inc }
    Run $CLI $dlArgs
}

# --- 7. Smoke test: can the sidecar's imports load? ------------------------
Step "Verifying MuseTalk install"
$env:MUSETALK_ROOT = $MtRoot
$env:FFMPEG_PATH   = $FfDir
Push-Location $MtRoot
try {
    & $PY -c "import torch, mmcv, mmpose, mmdet, diffusers; print('torch', torch.__version__, '| cuda:', torch.cuda.is_available())"
    if ($LASTEXITCODE -ne 0) { Fail "MuseTalk imports failed -- see errors above." }
} finally { Pop-Location }

Write-Host @"

All done.
  AI home : $AiHome
  Start   : .\start-all.ps1        (or double-click start-all.cmd)
  Stop    : .\start-all.ps1 -Stop
  Then    : http://localhost:3000/chat  ->  Video Call  ->  Start Live Call

Note: speech-to-text (Whisper) was deliberately NOT installed. In /chat use the
speech-engine toggle to pick the browser's Web Speech API for the mic.
"@ -ForegroundColor Green

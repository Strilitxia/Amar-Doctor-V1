# MuseTalk lip-sync — setup guide

GPU lip-sync for the AI doctor's video call. **Entirely optional.** With none of
this installed the video call still works: the avatar's mouth follows the real
audio waveform, and the UI says so instead of claiming GPU lip-sync.

Everything here installs into isolated virtualenvs and a directory outside the
repo. **Your system Python and the project's existing `venv/` are never
touched.** Teardown is deleting two folders.

> **Short version for Windows:** double-click `setup-windows.cmd` once (it runs
> steps 1–6 below automatically, idempotently, into `..\amar-doctor-ai` next to
> the repo — or `-AiHome X:\path`), then double-click `start-all.cmd`. The rest
> of this page explains what that script does and how to do it by hand. Paths
> below say `D:\ai\...`; the script's default is `<repo parent>\amar-doctor-ai\...`
> and `start-all.ps1` still recognises an old `D:\ai` install.

**This page is the local Windows recipe.** Running the backend on Google Colab
instead? Use [`backend/amar_doctor_colab.ipynb`](backend/amar_doctor_colab.ipynb) —
same isolation strategy (separate Python 3.10 venv, same mmcv/chumpy fixes),
translated to Colab's Linux runtime. Everything there installs to Colab's local
disk rather than Google Drive, so a runtime reset means re-running the install
cell. `backend/colab_runner.py` starts the renderer automatically alongside the
main backend if that notebook's install cell has been run.

---

## Why a separate process

MuseTalk needs `mmcv` / `mmpose` / `mmdet` and pins `numpy==1.23.5`.

This project's `venv/` is **Python 3.13**, and:

- mmcv 2.0.1's wheel index (`download.openmmlab.com/mmcv/dist/cu118/torch2.0/`)
  tops out around **cp311**. There is no cp313 build. Building from source on
  Windows needs MSVC 14.x plus a matching CUDA `nvcc`.
- MuseTalk's own pins (`numpy==1.23.5`, `tensorflow==2.12.0`,
  `opencv-python==4.9.0.80`) have no cp313 wheels either.
- Even if they installed, downgrading numpy would break `ctranslate2` /
  `faster-whisper` — the Bengali speech recognition that already works.

So MuseTalk runs as its **own FastAPI service on port 8100**, under its own
Python 3.10 virtualenv, and `backend/musetalk_client.py` talks to it over HTTP.
A crash, hang, or CUDA OOM in the renderer then costs a call its video and
nothing else.

```
venv/                     py3.13   main backend :8000    (untouched)
D:\ai\musetalk-venv       py3.10   renderer      :8100   (new, isolated)
D:\ai\MuseTalk            clone + models/                (outside the repo)
```

`D:\ai\MuseTalk` lives outside the repo on purpose: ~7 GB of weights inside the
project would be scanned by Next's dev file watcher.

---

## Before you start

You need a **doctor avatar asset** — see [`backend/static/AVATAR.md`](backend/static/AVATAR.md).
MuseTalk repaints a photographic mouth region; it cannot work from an
illustration. Prefer a 5–10 s clip of a person sitting still over a single
still image.

---

## 1. Python 3.10, without touching your system

`uv` installs a private 3.10 that never enters your PATH:

```powershell
winget install --id=astral-sh.uv -e      # if you don't have uv
uv python install 3.10
uv venv --python 3.10 --seed D:\ai\musetalk-venv
```

`--seed` is not optional. Without it `uv venv` creates an environment with no
`pip` in it at all, and step 3 below dies on `No module named pip` — `mim`
shells out to pip, so it cannot work either. `--seed` also installs
`setuptools` and `wheel`, both needed further down (`chumpy`'s `setup.py`
cannot build without `wheel`).

Confirm your default Python is untouched — this should still print 3.13:

```powershell
python -V
```

## 2. Clone MuseTalk

```powershell
git clone https://github.com/TMElyralab/MuseTalk D:\ai\MuseTalk
```

## 3. Dependencies, in this order

Order matters: `mim` resolves mmcv against whatever torch is already installed.

```powershell
$PY = "D:\ai\musetalk-venv\Scripts\python.exe"

& $PY -m pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
& $PY -m pip install -U openmim
# mim needs pkg_resources, dropped in setuptools >= 70 (which --seed installs).
& $PY -m pip install "setuptools<70"
& $PY -m mim install mmengine
& $PY -m mim install "mmcv==2.0.1"
& $PY -m mim install "mmdet==3.1.0"
& $PY -m mim install "mmpose==1.1.0"
```

cu118 on an Ampere card (sm_86 — the RTX 3060 Ti) is fine.

Then MuseTalk's own requirements, **with three lines removed**:

- `tensorflow==2.12.0` and `tensorboard==2.12.0` — training only, ~500 MB, and a
  common Windows install failure
- `gradio` — we run headless

```powershell
Get-Content D:\ai\MuseTalk\requirements.txt |
  Where-Object { $_ -notmatch '^(tensorflow|tensorboard|gradio)' } |
  Set-Content D:\ai\MuseTalk\requirements-headless.txt
& $PY -m pip install -r D:\ai\MuseTalk\requirements-headless.txt
& $PY -m pip install "huggingface_hub==0.30.2" fastapi "uvicorn[standard]"
```

Pin `huggingface_hub==0.30.2` — a newer hub breaks `diffusers 0.30`'s imports.

## 4. Weights (~7 GB) into `D:\ai\MuseTalk\models\`

| Directory | Contents | Source |
|---|---|---|
| `musetalk/` | `musetalk.json`, `pytorch_model.bin` | HF `TMElyralab/MuseTalk` |
| `musetalkV15/` | `musetalk.json`, `unet.pth` | HF `TMElyralab/MuseTalk` |
| `dwpose/` | `dw-ll_ucoco_384.pth` | HF `yzd-v/DWPose` |
| `sd-vae/` | `config.json`, `diffusion_pytorch_model.bin` | HF `stabilityai/sd-vae-ft-mse` |
| `whisper/` | `config.json`, `pytorch_model.bin`, `preprocessor_config.json` | HF `openai/whisper-tiny` |
| `face-parse-bisent/` | `79999_iter.pth`, `resnet18-5c106cde.pth` | HF `ManyOtherFunctions/face-parse-bisent` (no gdown/Drive needed) |
| ~~`syncnet/`~~ | — | **skip**, training only |

Note the VAE directory is `sd-vae`, **not** `sd-vae-ft-mse`.

The `whisper/` here is OpenAI Whisper used for **audio feature extraction**, and
is unrelated to the `faster-whisper` doing speech recognition in the main
backend.

```powershell
$CLI = "D:\ai\musetalk-venv\Scripts\huggingface-cli.exe"
& $CLI download TMElyralab/MuseTalk       --local-dir D:\ai\MuseTalk\models
& $CLI download yzd-v/DWPose              --local-dir D:\ai\MuseTalk\models\dwpose  --include "dw-ll_ucoco_384.pth"
& $CLI download stabilityai/sd-vae-ft-mse --local-dir D:\ai\MuseTalk\models\sd-vae  --include "config.json" "diffusion_pytorch_model.bin"
& $CLI download openai/whisper-tiny       --local-dir D:\ai\MuseTalk\models\whisper --include "config.json" "pytorch_model.bin" "preprocessor_config.json"
& $CLI download ManyOtherFunctions/face-parse-bisent --local-dir D:\ai\MuseTalk\models\face-parse-bisent --include "79999_iter.pth" "resnet18-5c106cde.pth"
```

MuseTalk's bundled `download_weights.bat` sets `HF_ENDPOINT=https://hf-mirror.com`
(a China mirror); the commands above deliberately use the default endpoint.
Actual total on disk: **7.3 GB** — the two UNet checkpoints are ~3.2 GB each.

Note `huggingface_hub==0.30.2` ships `huggingface-cli`, not the newer `hf`
command. Do not upgrade the hub to get `hf`: it breaks `transformers 4.39` /
`diffusers 0.30`, which pin `huggingface_hub<1.0`.

## 5. ffmpeg — the gotcha

MuseTalk builds its commands as `f"{ffmpeg_path}/ffmpeg ..."`, so it needs a file
literally named `ffmpeg.exe`. You do **not** need a system-wide install:
`imageio-ffmpeg` already ships a binary, just under a versioned name.

```powershell
mkdir D:\ai\ffmpeg\bin
copy "D:\Project Files\Amar-Doctor-V1\venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe" D:\ai\ffmpeg\bin\ffmpeg.exe
```

## 6. Gate: prove MuseTalk works on its own first

**Do not write or wire any integration code until this passes.**

```powershell
Set-Location D:\ai\MuseTalk
& $PY -m scripts.realtime_inference `
    --inference_config configs\inference\realtime.yaml `
    --unet_model_path models\musetalkV15\unet.pth `
    --version v15 `
    --ffmpeg_path D:\ai\ffmpeg\bin
```

If that produces a correct video from their sample data, the hard part is done.

**If mmcv will not build:** the fallback is a fork that swaps DWPose for
`face-alignment` (pip-installable, pure torch, works on 3.13). Budget a day —
the crop geometry and `bbox_shift` have to be re-derived, and a wrong crop shows
as a visible seam along the jaw.

## 7. Run it

### The easy way

```powershell
.\start-all.ps1
```

Starts the renderer, backend and web (skipping any already running), waits for
each, and finishes by printing what the video call will *actually* do:

```
Lip-sync: LIVE (musetalk-v15)          <- GPU lip-sync
Lip-sync: OFF (reason: unreachable)    <- renderer not up; still portrait
```

`.\start-all.ps1 -Stop` stops all three. `-NoVideo` skips the renderer
deliberately. Logs land in `.logs\`. Exit code is 0 only when the stack is
actually usable, so it is safe to script against.

### The manual way

Three terminals. **No environment variables are required** — the backend
defaults to the sidecar on `127.0.0.1:8100` and auto-picks a Whisper precision
that leaves the renderer room.

```powershell
# Terminal 1 — the MuseTalk renderer (py3.10 venv, NOT the project venv)
Set-Location "D:\Project Files\Amar-Doctor-V1\backend"
D:\ai\musetalk-venv\Scripts\python.exe -m uvicorn musetalk_service:app --host 127.0.0.1 --port 8100

# Terminal 2 — main backend (project venv)
Set-Location "D:\Project Files\Amar-Doctor-V1"
.\venv\Scripts\python.exe -m uvicorn backend.server:app --host 0.0.0.0 --port 8000

# Terminal 3 — web
npm run dev
```

**Start the sidecar first.** If it isn't up, the backend still runs fine and
every video call quietly falls back to the audio-reactive avatar — which looks
like a static portrait, and is the easiest way to conclude the feature is
broken when it isn't. Check `/health` before blaming the code.

The sidecar's first start on a *new* avatar spends ~60 s preparing face crops
and latents, then caches them under
`D:\ai\MuseTalk\results\v15\avatars\amar_doctor\`; later starts take seconds.
It also renders a 1 s silent warmup clip at boot so the first real reply
doesn't pay cuDNN's autotuning cost.

Do not use `--reload` on the backend: it re-runs the Whisper warmup and doubles
VRAM usage.

Optional overrides: `MUSETALK_SIDECAR_URL` (set to `""` to disable video
entirely), `MUSETALK_BATCH_SIZE` (default 8), `WHISPER_COMPUTE_TYPE`,
`MUSETALK_RENDER_TIMEOUT_MULTIPLIER`. Do **not** set
`PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` — torch 2.0.1 rejects it and
the sidecar won't start.

## 8. Verify

```powershell
# The handshake that proves it is not the fallback
(Invoke-RestMethod http://localhost:8000/health).lipsync | ConvertTo-Json
#  live=True, reason=$null   ->  real engine
#  live=False                ->  reason names which of: not_configured,
#                                unreachable, avatar_not_prepared, no_cuda, oom
```

In the UI: `/chat` → **📹 Video Call**. The badge is **green "MuseTalk Lip-Sync
(local GPU)"** only when the handshake is live; amber "Audio-reactive avatar"
otherwise, with the reason in its tooltip.

```powershell
# Standalone render, end to end
$r = Invoke-RestMethod -Method Post http://localhost:8000/api/video-avatar `
     -Body @{ text = "আমার জ্বর হয়েছে।"; voice = "bn-BD-NabanitaNeural" }
$FF = ".\venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
Invoke-WebRequest ("http://localhost:8000" + $r.video_url) -OutFile "$env:TEMP\test.mp4"
& $FF -hide_banner -i "$env:TEMP\test.mp4"
#  MUST show  Video: h264 (avc1)  AND  Audio: aac
```

**H.264 is not optional.** Chrome and Firefox cannot decode MPEG-4 Part 2
(`mp4v`), which is what `cv2.VideoWriter` writes by default — that is exactly
why the old `public/doctor_idle.mp4` never played for anyone. Never use
`cv2.VideoWriter` for browser-bound video.

Watch VRAM during a call — it should stay under ~7000 MiB on an 8 GB card:

```powershell
nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv -l 1
```

---

## VRAM and latency (RTX 3060 Ti, 8GB) — measured

Two bugs and one contention problem dominated everything here. All three are
fixed; the numbers below are after the fixes.

### The three things that made it slow

1. **Missing `@torch.no_grad()`** in `musetalk_service.py`'s render path.
   MuseTalk's own `inference()` carries it; it was dropped when that method
   was transcribed. Without it torch builds an autograd graph over every UNet
   forward and VAE decode, holding activations for a backward pass that never
   comes. Cost: ~4x the render time, and VRAM pinned at the 8GB ceiling.

2. **Whisper `large-v3` in float16 starved the renderer.** At 3.1GB it left
   ~1.5GB free on an 8GB card; every render then spilled into Windows' VRAM
   paging. `_default_compute_type()` in `server.py` now auto-selects
   `int8_float16` on cards under 9GB — same model, quantized weights, ~1GB
   freed. This keeps `large-v3`, which is the choice that matters for Bengali
   (see `backend/README.md`: model *size* dominates accuracy; quantization
   costs far less than dropping to `medium`).

3. **The render timeout discarded successful renders.** It was derived from a
   `len(text)/12` character estimate that under-shot badly on short Bengali
   phrases, so the client gave up seconds before the sidecar returned a
   finished clip — the sidecar logged success while the browser showed the
   static idle avatar. Duration now comes from the actual audio
   (`edge_tts_duration_seconds()`, exact for Edge-TTS's 48kbps CBR output),
   with a 90s floor.

### Measured effect

Identical phrases, same avatar, before → after:

| Audio duration | Before | After |
|---|---|---|
| 2.20 s | 28.2 s (12.8×) | **10.2 s (4.6×)** |
| 3.36 s | 49.5 s (14.7×) | **12.5 s (3.7×)** |

With Whisper co-resident (the configuration that actually runs):

| State | Render ratio | Full 3-clip reply |
|---|---|---|
| `large-v3` float16 (old default) | 20.0×–20.9× | 216 s |
| `large-v3` int8_float16 (auto now) | **2.9×–3.6×** | **31 s** |

End-to-end today, zero configuration: **first clip ~10 s, three-clip reply
~31 s.** Steady VRAM ~7.5/8.2GB with both models resident.

### Batch size: 8 beats 20

MuseTalk's own default is `batch_size=20`; this service defaults to **8**,
which measured roughly 2x faster here (3.7–4.7× vs 7.0–8.2×). Larger batches
push the working set past what this card absorbs. `MUSETALK_BATCH_SIZE`
overrides.

### Still true

Rendering is ~3× slower than realtime, so this is not a live face-to-face
call — a reply lands in tens of seconds, not instantly. Remaining levers, in
rough order of payoff: stream the Groq response so TTS/render start on the
first clause (saves 2–5 s); render one clip per reply instead of per phrase;
drop the avatar source below 720p. A bigger card removes the problem
outright.

Two notes for anyone tuning further:

- `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` **does not work** with
  the torch 2.0.1+cu118 MuseTalk pins — it throws
  `Unrecognized CachingAllocator option` and the sidecar never starts.
- There is still no `asyncio.Lock` around `/render`, so two simultaneous
  callers can both hit the GPU. Single-user only for now.


## Teardown

```powershell
Remove-Item -Recurse -Force D:\ai\musetalk-venv, D:\ai\MuseTalk, D:\ai\ffmpeg
Remove-Item Env:\MUSETALK_SIDECAR_URL
```

The repo is unaffected and the video call falls back to the audio-reactive
avatar.

---

## Status

| Piece | State |
|---|---|
| Capability handshake (`/health` → `lipsync`) | done |
| `backend/musetalk_client.py` (timeout + circuit breaker) | done, timeout retuned against real render times |
| `av_chunk` protocol on `/ws/voice-call` | done, verified live |
| `/api/media/{id}` delivery + TTL sweeper | done, verified live |
| Browser clip queue, double-buffered | done, verified playing a real MuseTalk clip in the live `/chat` avatar tile |
| `backend/musetalk_stub.py` (protocol stub) | done |
| Steps 1–6 (env + weights) | **done** — `D:\ai\musetalk-venv`, `D:\ai\MuseTalk`, 7.3GB of weights, gate test passed on MuseTalk's own sample data |
| `backend/musetalk_service.py` (the real renderer) | **done and verified end-to-end**: real Bengali TTS → real GPU render → real `av_chunk` → real fetchable `/api/media` clip → confirmed valid H.264+AAC → confirmed genuine lip motion by inspecting extracted frames |
| Colab support (`backend/amar_doctor_colab.ipynb` + `colab_runner.py`) | partly verified — a real Colab run got through ffmpeg, the Python 3.10 venv, and the MuseTalk clone, then failed on `No module named pip` (fixed: `uv venv` needs `--seed`, since it creates a venv with no pip and `mim` shells out to pip). **Everything past that point — the mmcv/mmdet/mmpose installs, the weight download, and the sidecar actually rendering on a T4 — has still not been observed end to end.** Treat those as less battle-tested than the Windows path above, which was run for real. |

**What "verified end-to-end" means concretely:** a raw WebSocket client sent
the exact `/ws/voice-call` payload the browser sends (`want_video: true`),
received real `av_chunk` frames with working `video_url`s, fetched those URLs
over HTTP, and `ffmpeg -i` on the downloaded files showed `h264 (High)` +
`aac`, correct duration, at 1280×720. Individual extracted frames show the
mouth open with visible teeth mid-phrase and closed between — genuine,
audio-driven lip-sync, not a looping idle clip mislabeled as live.

**Browser playback** was separately confirmed by driving `VideoAvatar`'s own
`avatar-clip-a` element through the exact sequence `startNext()` uses, on a
real rendered clip: it loaded at 1280×720, `play()` resolved **unmuted**
(so the autoplay policy is not blocking), the opacity swap put it over the
idle loop, and it played to completion. The clip is visible in the avatar
tile with the doctor mid-speech.

**Not yet done:**
- A full mic-driven click-through in a normal browser window. The sandboxed
  preview pane used for this session cannot reach `localhost:8000` (its own
  network isolation) and has no microphone, so the two halves were verified
  separately — protocol via a WebSocket client, playback via the real clip
  above. **Worth doing once yourself:** open `http://localhost:3000/chat`,
  pick "📹 Video Call", "Start Live Call", and speak.
- `asyncio.Lock` around `/render` in `musetalk_service.py`, so two concurrent
  calls can't both hit the GPU at once. Single-patient testing only so far.
- The "render one clip per reply" redesign implied by the latency numbers
  above — today's per-phrase chunking still works, it's just slow.
- `backend/static/AVATAR_SOURCE.txt` (licence provenance for the portrait) —
  the portrait and idle clip are in place, but the source/licence note isn't.

## Starting it locally, day to day

```powershell
.\start-all.ps1
```

Starts the renderer, backend and web (skipping any already running), waits
for each, and finishes by printing whether video will actually work:

```
Lip-sync: LIVE (musetalk-v15)          <- GPU lip-sync
Lip-sync: OFF (reason: unreachable)    <- renderer not up; audio-reactive avatar instead
```

`.\start-all.ps1 -Stop` stops all three; `-NoVideo` skips the renderer on
purpose. Logs land in `.logs\`. See "The easy way" under §7 above for the
same instructions with more detail, and the manual three-terminal commands if
you'd rather not use the script.

## Implementation notes (for anyone touching `musetalk_service.py`)

Verified against MuseTalk's actual `scripts/realtime_inference.py` (not
assumed): `musetalk/utils/__init__.py` appends `musetalk/utils` to
`sys.path` as an import side effect, which is how the vendored
`face_detection` package resolves — no extra wiring needed, but it does mean
`musetalk.utils.preprocessing` (and the DWPose + S3FD models it loads at
*import* time) must not be imported until the process's cwd is already
`MUSETALK_ROOT`, since several of MuseTalk's own default paths
(`./models/dwpose/...`, `./models/face-parse-bisent/...`) are cwd-relative,
not `__file__`-relative.

Models load **once** at startup and the avatar prepares **once** (MuseTalk
caches `latents.pt`, `coords.pkl`, `full_imgs/`, `mask/` under
`results/v15/avatars/<id>/` — 20–60s the first time, seconds after, exactly
as measured here). `render_clip()` does not call the shipped
`Avatar.inference()`: that writes one PNG per frame to disk and shells out to
ffmpeg to reassemble them. Frames are collected in memory and piped straight
into `imageio_ffmpeg.write_frames()` instead. The frame cursor (`self.idx`)
is **never reset** between calls — only ever incremented — so consecutive
phrases continue through the avatar's prepared cycle instead of snapping
back to frame 0 between clips.

"""
Amar Doctor V1 — MuseTalk sidecar STUB.

Speaks the same protocol as the real renderer (backend/musetalk_service.py)
but does no lip-sync: it muxes the phrase's audio onto a generated placeholder
video of exactly the right duration.

The point is to exercise the whole video path — /health handshake, want_video,
av_chunk frames, /api/media delivery, the browser's double-buffered clip queue,
autoplay unlock, and barge-in — WITHOUT the MuseTalk install (a separate Python
3.10, mmcv/mmpose, ~7GB of weights). If the call works against this stub, every
remaining risk is contained in the renderer itself.

Runs in the main py3.13 venv:

    venv\\Scripts\\python.exe -m uvicorn backend.musetalk_stub:app --port 8100

then point the backend at it:

    $env:MUSETALK_SIDECAR_URL = "http://127.0.0.1:8100"
"""

import base64
import logging
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import imageio_ffmpeg
from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("musetalk-stub")

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
WORK_DIR = Path(tempfile.gettempdir()) / "amar_doctor_musetalk_stub"
WORK_DIR.mkdir(parents=True, exist_ok=True)

FPS = 25
SIZE = "512x512"

app = FastAPI(title="MuseTalk sidecar stub")


class RenderRequest(BaseModel):
    audio_base64: str
    phrase: str = ""
    seq: int = 0


@app.get("/health")
async def health():
    # Reports cuda so the handshake goes live; engine name says "stub" so the
    # backend log never implies real lip-sync is running.
    return {
        "ok": True,
        "engine": "musetalk-stub",
        "avatar_ready": True,
        "device": "cuda",
        "warm": True,
    }


@app.post("/warmup")
async def warmup():
    return {"ok": True}


@app.post("/render")
async def render(req: RenderRequest):
    started = time.monotonic()
    job = uuid.uuid4().hex[:8]
    audio_path = WORK_DIR / f"{job}.mp3"
    out_path = WORK_DIR / f"{job}.mp4"

    try:
        audio_path.write_bytes(base64.b64decode(req.audio_base64))

        # H.264 + AAC, faststart — the same output contract the real renderer
        # must meet. The video is a placeholder; the AUDIO is the real phrase,
        # so A/V sync and clip duration are exercised for real.
        cmd = [
            FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", f"color=c=#0a1420:s={SIZE}:r={FPS}",
            "-i", str(audio_path),
            "-shortest",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "28",
            "-c:a", "aac", "-b:a", "96k",
            "-movflags", "+faststart",
            str(out_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0 or not out_path.exists():
            logger.error(f"ffmpeg failed: {proc.stderr[:400]}")
            return {"ok": False, "reason": "encode_failed"}

        video = out_path.read_bytes()
        render_ms = int((time.monotonic() - started) * 1000)
        # Probe the real duration rather than guessing it.
        duration_ms = _probe_duration_ms(out_path)
        logger.info(
            f"stub render seq={req.seq} bytes={len(video)} "
            f"render_ms={render_ms} duration_ms={duration_ms}"
        )
        return {
            "ok": True,
            "video_base64": base64.b64encode(video).decode("utf-8"),
            "duration_ms": duration_ms,
            "frames": int(duration_ms / 1000 * FPS),
            "render_ms": render_ms,
        }
    except Exception as e:
        logger.error(f"stub render error: {e}")
        return {"ok": False, "reason": "exception"}
    finally:
        for f in (audio_path, out_path):
            try:
                f.unlink(missing_ok=True)
            except OSError:
                pass


def _probe_duration_ms(path: Path) -> int:
    try:
        proc = subprocess.run(
            [FFMPEG, "-hide_banner", "-i", str(path)],
            capture_output=True, text=True, timeout=15,
        )
        for line in proc.stderr.splitlines():
            if "Duration:" in line:
                hhmmss = line.split("Duration:")[1].split(",")[0].strip()
                h, m, s = hhmmss.split(":")
                return int((int(h) * 3600 + int(m) * 60 + float(s)) * 1000)
    except Exception:
        pass
    return 0

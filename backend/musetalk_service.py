"""
Amar Doctor V1 -- MuseTalk sidecar: the real GPU lip-sync renderer.

Runs under the ISOLATED Python 3.10 virtualenv at D:\\ai\\musetalk-venv (see
MUSETALK_SETUP.md) -- MuseTalk's mmcv/mmpose/mmdet stack and its
numpy==1.23.5 pin cannot share the main backend's Python 3.13 venv without
breaking the working faster-whisper STT there. This process is reached only
through backend/musetalk_client.py's HTTP calls; the main backend never
imports anything from here.

Protocol matches backend/musetalk_stub.py exactly (GET /health, POST /render,
POST /warmup), so backend/server.py needs zero changes to point at this
instead of the stub -- only MUSETALK_SIDECAR_URL and which process is
listening on :8100 change.

Design notes, matched against MuseTalk's own scripts/realtime_inference.py
(verified working via the MUSETALK_SETUP.md gate test before this was
written):

  * Models load ONCE at startup (vae, unet, pe, whisper, face parser), not
    per request. The shipped CLI script also loads once, but only because it
    runs once per process invocation for a whole batch of audio files --
    here that's true across the service's entire lifetime instead.

  * The avatar (portrait/clip -> face crops, latents, masks) is prepared
    ONCE and cached to disk under MuseTalk's own results/ layout
    (latents.pt, coords.pkl, mask_coords.pkl, full_imgs/, mask/), so a
    restart loads in seconds instead of redoing ~60s of face detection.

  * Per-phrase rendering does NOT call the shipped Avatar.inference(): that
    method writes one PNG per frame to disk, then shells out to ffmpeg to
    reassemble them -- for a 2s phrase (50 frames) that's 50 pointless file
    writes plus 50 reads. Frames are instead piped directly into ffmpeg via
    imageio_ffmpeg.write_frames().

  * Avatar.inference() also resets its frame cursor (self.idx = 0) at the
    start of every call, so two consecutive short clips from the shipped
    script always start from the same point in the idle cycle -- visible as
    a "snap" between clips. RealtimeAvatar.idx here is NEVER reset; it only
    increases, so consecutive phrases continue smoothly through the avatar's
    prepared frame cycle, exactly like one continuous take.
"""

import base64
import json
import logging
import math
import os
import pickle
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

import numpy as np
import cv2
import torch
from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("musetalk-service")

# ─── Locate MuseTalk + ffmpeg (env-configurable; defaults match MUSETALK_SETUP.md) ───
_IS_WINDOWS = platform.system() == "Windows"
_FFMPEG_BIN_NAME = "ffmpeg.exe" if _IS_WINDOWS else "ffmpeg"


def _default_musetalk_root() -> str:
    # Windows local dev matches MUSETALK_SETUP.md's D:\ai\MuseTalk. On
    # anything else (Colab/Linux) there is no sane machine-specific default,
    # so fall back to a path under the repo's sibling -- colab_runner.py
    # always sets MUSETALK_ROOT explicitly anyway; this only matters if
    # someone runs the sidecar by hand without setting it.
    return r"D:\ai\MuseTalk" if _IS_WINDOWS else "/content/MuseTalk"


def _default_ffmpeg_dir() -> Path:
    """Locate a directory containing an `ffmpeg` (or `ffmpeg.exe`) binary.

    Windows has no system ffmpeg by convention, so MUSETALK_SETUP.md has you
    copy imageio-ffmpeg's bundled binary to D:\\ai\\ffmpeg\\bin\\ffmpeg.exe --
    that stays the default here. Colab and most Linux boxes already have a
    real `ffmpeg` on PATH (Colab installs it via apt), so there prefer
    whatever `shutil.which` finds over guessing a path that may not exist.
    """
    if _IS_WINDOWS:
        return Path(r"D:\ai\ffmpeg\bin")
    found = shutil.which("ffmpeg")
    if found:
        return Path(found).resolve().parent
    return Path("/usr/bin")


MUSETALK_ROOT = Path(os.environ.get("MUSETALK_ROOT", _default_musetalk_root())).resolve()
FFMPEG_DIR = Path(os.environ.get("FFMPEG_PATH") or _default_ffmpeg_dir()).resolve()
FFMPEG_EXE = FFMPEG_DIR / _FFMPEG_BIN_NAME

# The doctor asset. Prefer a short clip (natural micro-movement) over a
# still -- see backend/static/AVATAR.md. Both live outside this file's own
# venv, in the shared backend/static/ the main app also reads from.
_STATIC_DIR = Path(__file__).resolve().parent / "static"
AVATAR_SOURCE = Path(
    os.environ.get("MUSETALK_AVATAR")
    or (_STATIC_DIR / "doctor_idle_source.mp4" if (_STATIC_DIR / "doctor_idle_source.mp4").exists()
        else _STATIC_DIR / "doctor_avatar.png")
)

AVATAR_ID = os.environ.get("MUSETALK_AVATAR_ID", "amar_doctor")
FPS = 25
BATCH_SIZE = int(os.environ.get("MUSETALK_BATCH_SIZE", "8"))
# v15's own script hardcodes bbox_shift=0 for the "v15" version -- extra_margin
# below is what actually tunes the crop for v15, not bbox_shift.
EXTRA_MARGIN = int(os.environ.get("MUSETALK_EXTRA_MARGIN", "10"))
PARSING_MODE = os.environ.get("MUSETALK_PARSING_MODE", "jaw")

# MuseTalk resolves several of ITS OWN default model paths relative to the
# process cwd (face_parsing's "./models/face-parse-bisent/...", preprocessing's
# "./models/dwpose/..."), and loads some of those models at import time. Both
# the chdir and the sys.path insert MUST happen before any musetalk.* import.
os.chdir(MUSETALK_ROOT)
sys.path.insert(0, str(MUSETALK_ROOT))
if FFMPEG_EXE.exists():
    os.environ["PATH"] = f"{FFMPEG_DIR}{os.pathsep}{os.environ['PATH']}"
else:
    logger.warning(f"{_FFMPEG_BIN_NAME} not found at {FFMPEG_EXE} -- rendering will fail.")

import imageio_ffmpeg  # noqa: E402

app = FastAPI(title="MuseTalk sidecar (real renderer)")

# ─── Lazy globals, populated by _load_models() on startup ─────────────────
_device = None
_vae = _unet = _pe = _timesteps = None
_audio_processor = None
_whisper = None
_weight_dtype = None
_fp = None  # FaceParsing
_avatar: Optional["RealtimeAvatar"] = None
_models_loaded = False
_load_error: Optional[str] = None


def _run_ffmpeg(args: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(
        [str(FFMPEG_EXE), "-y", "-hide_banner", "-loglevel", "error", *args],
        capture_output=True, text=True, timeout=timeout,
    )


def _transcode_to_wav16k(src_path: Path, dst_path: Path) -> None:
    """MuseTalk's AudioProcessor loads via librosa at a hardcoded 16kHz mono
    assertion. The TTS audio arrives as mp3 -- transcode explicitly rather
    than hoping librosa's own decode-and-resample handles every source
    format MuseTalk might be pointed at."""
    proc = _run_ffmpeg(["-i", str(src_path), "-ar", "16000", "-ac", "1", str(dst_path)])
    if proc.returncode != 0 or not dst_path.exists():
        raise RuntimeError(f"audio transcode failed: {proc.stderr[:400]}")


class RealtimeAvatar:
    """Adapted from MuseTalk's scripts/realtime_inference.py Avatar class.

    Same on-disk cache layout (so a directory prepared by the original CLI
    script, or vice versa, is interchangeable), same prepare_material logic
    -- but inference() is replaced with render_clip(), which streams frames
    to ffmpeg instead of writing PNGs, and never resets the frame cursor.
    """

    def __init__(self, avatar_id: str, video_path: Path, extra_margin: int, batch_size: int):
        self.avatar_id = avatar_id
        self.video_path = str(video_path)
        self.extra_margin = extra_margin
        self.batch_size = batch_size

        self.avatar_path = MUSETALK_ROOT / "results" / "v15" / "avatars" / avatar_id
        self.full_imgs_path = self.avatar_path / "full_imgs"
        self.coords_path = self.avatar_path / "coords.pkl"
        self.latents_out_path = self.avatar_path / "latents.pt"
        self.mask_out_path = self.avatar_path / "mask"
        self.mask_coords_path = self.avatar_path / "mask_coords.pkl"
        self.avatar_info_path = self.avatar_path / "avator_info.json"

        # A monotonically increasing cursor into the (never-reset) avatar
        # frame cycle. Every render_clip() call continues from wherever the
        # previous one left off -- this is what makes back-to-back phrases
        # look like one continuous take instead of snapping to frame 0.
        self.idx = 0

        self.frame_list_cycle = []
        self.coord_list_cycle = []
        self.input_latent_list_cycle = []
        self.mask_list_cycle = []
        self.mask_coords_list_cycle = []

    @property
    def is_prepared(self) -> bool:
        return self.avatar_info_path.exists() and self.latents_out_path.exists()

    def load_cached(self) -> None:
        with open(self.avatar_info_path) as f:
            info = json.load(f)
        if info.get("video_path") != self.video_path:
            logger.warning(
                f"Cached avatar was prepared from a different source "
                f"({info.get('video_path')!r} vs {self.video_path!r}). "
                "Delete the results/v15/avatars/%s directory to re-prepare "
                "from the current asset.", self.avatar_id,
            )
        self.input_latent_list_cycle = torch.load(self.latents_out_path)
        with open(self.coords_path, "rb") as f:
            self.coord_list_cycle = pickle.load(f)
        with open(self.mask_coords_path, "rb") as f:
            self.mask_coords_list_cycle = pickle.load(f)

        from musetalk.utils.preprocessing import read_imgs

        img_list = sorted(
            self.full_imgs_path.glob("*.png"),
            key=lambda p: int(p.stem),
        )
        mask_list = sorted(
            self.mask_out_path.glob("*.png"),
            key=lambda p: int(p.stem),
        )
        self.frame_list_cycle = read_imgs([str(p) for p in img_list])
        self.mask_list_cycle = read_imgs([str(p) for p in mask_list])
        logger.info(f"Loaded cached avatar '{self.avatar_id}': {len(self.frame_list_cycle)} frames.")

    @torch.no_grad()
    def prepare(self) -> None:
        """One-time face detection + latent/mask extraction. ~20-60s cold,
        never re-run unless the cache directory is deleted or missing."""
        from musetalk.utils.preprocessing import get_landmark_and_bbox, read_imgs
        from musetalk.utils.blending import get_image_prepare_material

        logger.info(f"Preparing avatar '{self.avatar_id}' from {self.video_path} ...")
        for d in (self.avatar_path, self.full_imgs_path, self.mask_out_path):
            d.mkdir(parents=True, exist_ok=True)

        with open(self.avatar_info_path, "w") as f:
            json.dump(
                {"avatar_id": self.avatar_id, "video_path": self.video_path, "version": "v15"},
                f,
            )

        src = Path(self.video_path)
        if src.suffix.lower() in (".mp4", ".mov", ".avi", ".mkv", ".webm"):
            cap = cv2.VideoCapture(str(src))
            count = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                cv2.imwrite(str(self.full_imgs_path / f"{count:08d}.png"), frame)
                count += 1
            cap.release()
            if count == 0:
                raise RuntimeError(f"Could not read any frames from {src}")
        else:
            # Still image: MuseTalk cycles frames from a directory of PNGs,
            # so a single-frame "video" is just a directory with one PNG.
            img = cv2.imread(str(src))
            if img is None:
                raise RuntimeError(f"Could not read image {src}")
            cv2.imwrite(str(self.full_imgs_path / "00000000.png"), img)

        input_img_list = sorted(
            self.full_imgs_path.glob("*.png"), key=lambda p: int(p.stem)
        )
        input_img_list = [str(p) for p in input_img_list]

        logger.info("Extracting landmarks (mmpose + face detector)...")
        # bbox_shift stays 0 for v15 -- extra_margin is what actually tunes
        # the crop, matching the shipped script's own version branch.
        coord_list, frame_list = get_landmark_and_bbox(input_img_list, 0)

        input_latent_list = []
        coord_placeholder = (0.0, 0.0, 0.0, 0.0)
        kept_coords, kept_frames = [], []
        for bbox, frame in zip(coord_list, frame_list):
            if bbox == coord_placeholder:
                continue  # no face found in this frame -- drop it
            x1, y1, x2, y2 = bbox
            y2 = min(y2 + self.extra_margin, frame.shape[0])
            bbox = [x1, y1, x2, y2]
            crop = frame[y1:y2, x1:x2]
            resized = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_LANCZOS4)
            input_latent_list.append(_vae.get_latents_for_unet(resized))
            kept_coords.append(bbox)
            kept_frames.append(frame)

        if not input_latent_list:
            raise RuntimeError(
                f"No face detected in any frame of {src}. Check "
                "backend/static/AVATAR.md for the framing requirements."
            )

        # Ping-pong the cycle (forward then reverse) so the idle loop has no
        # jump cut at the wrap point -- same as the shipped script.
        self.frame_list_cycle = kept_frames + kept_frames[::-1]
        self.coord_list_cycle = kept_coords + kept_coords[::-1]
        self.input_latent_list_cycle = input_latent_list + input_latent_list[::-1]
        self.mask_list_cycle = []
        self.mask_coords_list_cycle = []

        logger.info("Building face masks...")
        for i, frame in enumerate(self.frame_list_cycle):
            cv2.imwrite(str(self.full_imgs_path / f"{i:08d}.png"), frame)
            x1, y1, x2, y2 = self.coord_list_cycle[i]
            mask, crop_box = get_image_prepare_material(
                frame, [x1, y1, x2, y2], fp=_fp, mode=PARSING_MODE
            )
            cv2.imwrite(str(self.mask_out_path / f"{i:08d}.png"), mask)
            self.mask_coords_list_cycle.append(crop_box)
            self.mask_list_cycle.append(mask)

        with open(self.mask_coords_path, "wb") as f:
            pickle.dump(self.mask_coords_list_cycle, f)
        with open(self.coords_path, "wb") as f:
            pickle.dump(self.coord_list_cycle, f)
        torch.save(self.input_latent_list_cycle, self.latents_out_path)

        logger.info(f"Avatar '{self.avatar_id}' prepared: {len(self.frame_list_cycle)} frames.")

        # DWPose + the S3FD-style face detector were loaded as a side effect
        # of importing musetalk.utils.preprocessing, purely for this one-off
        # prep step -- free what we can before the render path starts eating
        # into the same 8GB the STT model also wants.
        try:
            import musetalk.utils.preprocessing as _prep
            del _prep.model, _prep.fa
            torch.cuda.empty_cache()
        except Exception:
            pass

    @torch.no_grad()
    def render_clip(self, wav_path: Path) -> tuple[np.ndarray, int]:
        """Render lip-synced frames for one phrase. Returns (frames, count);
        frames is a single (N, H, W, 3) BGR uint8 array ready to pipe to
        ffmpeg. Does not touch disk for the frames themselves.

        The @torch.no_grad() is load-bearing, not decoration: MuseTalk's own
        inference() carries it, and without it torch builds an autograd graph
        across every UNet forward and VAE decode, holding activations for a
        backward pass that never comes. Dropping it cost ~2x the render time
        and pinned VRAM at the card's 8GB ceiling.
        """
        from musetalk.utils.utils import datagen
        from musetalk.utils.blending import get_image_blending

        whisper_input_features, librosa_length = _audio_processor.get_audio_feature(
            str(wav_path), weight_dtype=_weight_dtype
        )
        if librosa_length is None or librosa_length == 0:
            raise RuntimeError("empty or unreadable audio")

        whisper_chunks = _audio_processor.get_whisper_chunk(
            whisper_input_features, _device, _weight_dtype, _whisper, librosa_length,
            fps=FPS, audio_padding_length_left=2, audio_padding_length_right=2,
        )

        cycle_len = len(self.input_latent_list_cycle)
        gen = datagen(
            whisper_chunks, self.input_latent_list_cycle, self.batch_size,
            delay_frame=self.idx, device=_device,
        )

        out_frames = []
        for whisper_batch, latent_batch in gen:
            audio_feature_batch = _pe(whisper_batch.to(_device))
            latent_batch = latent_batch.to(device=_device, dtype=_unet.model.dtype)
            pred_latents = _unet.model(
                latent_batch, _timesteps, encoder_hidden_states=audio_feature_batch
            ).sample
            pred_latents = pred_latents.to(device=_device, dtype=_vae.vae.dtype)
            recon = _vae.decode_latents(pred_latents)
            for res_frame in recon:
                cursor = self.idx % cycle_len
                bbox = self.coord_list_cycle[cursor]
                ori_frame = self.frame_list_cycle[cursor]
                mask = self.mask_list_cycle[cursor]
                mask_crop_box = self.mask_coords_list_cycle[cursor]
                x1, y1, x2, y2 = bbox
                resized = cv2.resize(res_frame.astype(np.uint8), (x2 - x1, y2 - y1))
                combined = get_image_blending(ori_frame, resized, bbox, mask, mask_crop_box)
                out_frames.append(combined)
                self.idx += 1  # never reset -- this is the continuity fix

        if not out_frames:
            raise RuntimeError("no frames generated (phrase too short?)")
        return np.stack(out_frames), len(out_frames)


def _load_models() -> None:
    global _device, _vae, _unet, _pe, _timesteps, _audio_processor, _whisper, _weight_dtype, _fp
    global _avatar, _models_loaded, _load_error

    try:
        from musetalk.utils.utils import load_all_model
        from musetalk.utils.face_parsing import FaceParsing
        from musetalk.utils.audio_processor import AudioProcessor
        from transformers import WhisperModel

        _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Loading MuseTalk models on {_device} ...")

        unet_dir = MUSETALK_ROOT / "models" / "musetalkV15"
        _vae, _unet, _pe = load_all_model(
            unet_model_path=str(unet_dir / "unet.pth"),
            vae_type="sd-vae",
            unet_config=str(unet_dir / "musetalk.json"),
            device=_device,
        )
        _timesteps = torch.tensor([0], device=_device)
        _pe = _pe.half().to(_device)
        _vae.vae = _vae.vae.half().to(_device)
        _unet.model = _unet.model.half().to(_device)
        _weight_dtype = _unet.model.dtype

        whisper_dir = MUSETALK_ROOT / "models" / "whisper"
        _audio_processor = AudioProcessor(feature_extractor_path=str(whisper_dir))
        _whisper = WhisperModel.from_pretrained(str(whisper_dir))
        _whisper = _whisper.to(device=_device, dtype=_weight_dtype).eval()
        _whisper.requires_grad_(False)

        _fp = FaceParsing(left_cheek_width=90, right_cheek_width=90)

        _avatar = RealtimeAvatar(
            avatar_id=AVATAR_ID,
            video_path=AVATAR_SOURCE,
            extra_margin=EXTRA_MARGIN,
            batch_size=BATCH_SIZE,
        )
        if _avatar.is_prepared:
            _avatar.load_cached()
        else:
            if not AVATAR_SOURCE.exists():
                raise RuntimeError(
                    f"No avatar asset at {AVATAR_SOURCE} -- see backend/static/AVATAR.md"
                )
            _avatar.prepare()

        _models_loaded = True
        _load_error = None

        # Pay cuDNN's autotuning and the first CUDA kernel launches here,
        # during startup, instead of inside the first patient's reply. Cold
        # first render measured ~2x the cost of a warm one.
        try:
            warm_wav = Path(tempfile.gettempdir()) / "musetalk_startup_warmup.wav"
            _run_ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "1.0", str(warm_wav)])
            t0 = time.monotonic()
            _avatar.render_clip(warm_wav)
            # The warmup consumed frames from the avatar cycle; rewind so the
            # first real clip still starts at the top of the idle loop.
            _avatar.idx = 0
            warm_wav.unlink(missing_ok=True)
            logger.info(f"Warmup render done in {int((time.monotonic() - t0) * 1000)}ms.")
        except Exception as e:
            logger.warning(f"Warmup render failed (non-fatal): {e}")

        logger.info("MuseTalk sidecar ready.")
    except Exception as e:
        logger.exception("Model load failed")
        _models_loaded = False
        _load_error = str(e)


@app.on_event("startup")
async def _startup():
    # Runs in the event loop's default executor equivalent path -- this is a
    # single-worker service and startup blocking is expected (nothing can be
    # rendered before models exist anyway).
    _load_models()


@app.get("/health")
async def health():
    return {
        "ok": _models_loaded,
        "engine": "musetalk-v15",
        "avatar_ready": bool(_avatar and _avatar.frame_list_cycle),
        "device": str(_device) if _device else None,
        "cuda": bool(_device and _device.type == "cuda"),
        "error": _load_error,
        "avatar_frames": len(_avatar.frame_list_cycle) if _avatar else 0,
        "avatar_source": str(AVATAR_SOURCE),
    }


@app.post("/warmup")
async def warmup():
    if not _models_loaded:
        return {"ok": False, "reason": _load_error or "not_loaded"}
    try:
        # Half a second of silence, purely to pay cuDNN's first-call
        # autotuning cost outside of a real request.
        tmp = Path(tempfile.gettempdir()) / "musetalk_warmup.wav"
        _run_ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "0.5", str(tmp)])
        _avatar.render_clip(tmp)
        tmp.unlink(missing_ok=True)
        return {"ok": True}
    except Exception as e:
        logger.exception("Warmup failed")
        return {"ok": False, "reason": str(e)}


class RenderRequest(BaseModel):
    audio_base64: str
    phrase: str = ""
    seq: int = 0


@app.post("/render")
async def render(req: RenderRequest):
    if not _models_loaded:
        return {"ok": False, "reason": _load_error or "not_loaded"}

    started = time.monotonic()
    work_dir = Path(tempfile.gettempdir()) / "amar_doctor_musetalk"
    work_dir.mkdir(parents=True, exist_ok=True)
    job = f"{req.seq}_{int(started * 1000) % 100000}"
    audio_in = work_dir / f"{job}_in.mp3"
    wav_16k = work_dir / f"{job}.wav"
    video_only = work_dir / f"{job}_video.mp4"
    out_path = work_dir / f"{job}.mp4"

    try:
        audio_in.write_bytes(base64.b64decode(req.audio_base64))
        _transcode_to_wav16k(audio_in, wav_16k)

        frames, n_frames = _avatar.render_clip(wav_16k)

        h, w = frames.shape[1:3]
        writer = imageio_ffmpeg.write_frames(
            str(video_only), (w, h), fps=FPS,
            codec="libx264", pix_fmt_in="bgr24", pix_fmt_out="yuv420p",
            output_params=["-crf", "20", "-preset", "veryfast"],
        )
        writer.send(None)
        for frame in frames:
            writer.send(np.ascontiguousarray(frame).tobytes())
        writer.close()

        mux = _run_ffmpeg([
            "-i", str(video_only), "-i", str(wav_16k),
            "-c:v", "copy", "-c:a", "aac", "-b:a", "96k",
            "-shortest", "-movflags", "+faststart",
            str(out_path),
        ])
        if mux.returncode != 0 or not out_path.exists():
            return {"ok": False, "reason": f"mux_failed: {mux.stderr[:300]}"}

        video_bytes = out_path.read_bytes()
        render_ms = int((time.monotonic() - started) * 1000)
        duration_ms = int(n_frames / FPS * 1000)
        logger.info(
            f"render seq={req.seq} frames={n_frames} render_ms={render_ms} "
            f"duration_ms={duration_ms} realtime_ratio={render_ms / max(duration_ms, 1):.2f}x"
        )
        return {
            "ok": True,
            "video_base64": base64.b64encode(video_bytes).decode("utf-8"),
            "duration_ms": duration_ms,
            "frames": n_frames,
            "render_ms": render_ms,
        }
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        logger.error(f"CUDA OOM rendering seq={req.seq}")
        return {"ok": False, "reason": "oom"}
    except Exception as e:
        logger.exception(f"Render failed for seq={req.seq}")
        return {"ok": False, "reason": str(e)}
    finally:
        for f in (audio_in, wav_16k, video_only, out_path):
            try:
                f.unlink(missing_ok=True)
            except OSError:
                pass

"""
Amar Doctor V1 — Idle Avatar Video Pre-renderer

Generates the looping idle clip (subtle breathing + eye blink) shown between
the doctor's spoken turns, and publishes the browser-side portrait fallback.

Output is H.264 (libx264 / yuv420p), NOT the mp4v this script used to write.
Chrome and Firefox cannot decode MPEG-4 Part 2 in an MP4 container, so the
previous output silently failed to load in every browser and the UI fell back
to its canvas avatar 100% of the time. Every mp4 this project produces must be
H.264 for the same reason — never use cv2.VideoWriter for browser-bound video.

ffmpeg does not need to be installed system-wide: imageio-ffmpeg ships a
binary and we encode through it.

Usage:
    python backend/generate_idle_video.py

Requires a reference portrait — see backend/static/AVATAR.md for the contract.
"""

import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"
PUBLIC_DIR = REPO_ROOT / "public"

PORTRAIT_SRC = STATIC_DIR / "doctor_avatar.png"
CLIP_SRC = STATIC_DIR / "doctor_idle_source.mp4"
IDLE_OUT = PUBLIC_DIR / "doctor_idle.mp4"
PORTRAIT_OUT = PUBLIC_DIR / "doctor_portrait.png"

# MuseTalk renders its talking clips at 25fps from the frames of
# doctor_idle_source.mp4. The idle loop has to come from that SAME footage at
# that same rate, or the tile visibly jumps every time the doctor starts and
# stops speaking.
IDLE_FPS = 25


def build_idle_from_clip(src: Path, out_path: Path, fps: int = IDLE_FPS) -> None:
    """Ping-pong the real source footage into a seamless silent idle loop.

    Plays forward then backward so the loop point is invisible -- the same
    trick MuseTalk uses internally when it builds its avatar frame cycle
    (`frame_list_cycle = frames + frames[::-1]`). Keeps the source's own
    resolution so idle and talking clips are pixel-for-pixel the same framing.

    Audio is dropped: the tile plays this muted on loop, and carrying an audio
    track would only bloat a file the browser fetches on every page load.
    """
    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-filter_complex",
        f"[0:v]fps={fps},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[out]",
        "-map", "[out]",
        "-an",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-crf", "23", "-preset", "veryfast",
        "-movflags", "+faststart",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0 or not out_path.exists():
        raise RuntimeError(f"ffmpeg failed building idle loop: {proc.stderr[:500]}")


def encode_h264(frames, out_path: Path, size, fps: int = 25):
    """Encode an iterable of RGB uint8 frames to a browser-playable H.264 mp4."""
    import imageio_ffmpeg

    out_path.parent.mkdir(parents=True, exist_ok=True)
    writer = imageio_ffmpeg.write_frames(
        str(out_path),
        size,  # (width, height)
        fps=fps,
        codec="libx264",
        pix_fmt_in="rgb24",
        pix_fmt_out="yuv420p",  # required for playback in Safari/Chrome
        output_params=[
            "-crf", "20",
            "-preset", "veryfast",
            "-movflags", "+faststart",  # lets <video> start before full download
        ],
    )
    writer.send(None)  # prime the generator
    for frame in frames:
        writer.send(np.ascontiguousarray(frame).tobytes())
    writer.close()


def create_idle_doctor_video(image_path: Path, output_path: Path, duration_sec: int = 5, fps: int = 25):
    """Loopable idle clip: sinusoidal breathing scale plus two eye blinks."""
    import cv2

    img = cv2.imread(str(image_path))
    if img is None:
        raise FileNotFoundError(image_path)

    height, width = img.shape[:2]
    # libx264 wants even dimensions; odd ones fail or get silently padded.
    width -= width % 2
    height -= height % 2
    img = img[:height, :width]

    total_frames = duration_sec * fps
    print(f"Rendering {total_frames} frames at {width}x{height} @ {fps}fps -> {output_path}")

    def frames():
        for frame_idx in range(total_frames):
            t = frame_idx / total_frames
            scale = 1.0 + 0.008 * np.sin(2 * np.pi * t)

            blink = 0.0
            if 0.38 <= t <= 0.42 or 0.78 <= t <= 0.82:
                blink = 1.0 - abs((t % 0.4) - 0.02) * 25
                blink = max(0.0, min(1.0, blink))

            M = cv2.getRotationMatrix2D((width / 2, height / 2), 0, scale)
            frame = cv2.warpAffine(img, M, (width, height))

            if blink > 0.1:
                eye_y = int(height * 0.4)
                eye_h = int(height * 0.03 * (1 - blink))
                if eye_h > 0:
                    x0, x1 = int(width * 0.35), int(width * 0.65)
                    region = frame[eye_y:eye_y + eye_h, x0:x1]
                    frame[eye_y:eye_y + eye_h, x0:x1] = (region * 0.6).astype(np.uint8)

            yield cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    encode_h264(frames(), output_path, (width, height), fps)


def main() -> int:
    if not PORTRAIT_SRC.exists() and not CLIP_SRC.exists():
        print(
            f"No avatar asset in {STATIC_DIR}.\n"
            f"Drop one in first — see {STATIC_DIR / 'AVATAR.md'} for the required\n"
            "framing and licence note. Until then the app uses its built-in\n"
            "audio-reactive avatar, which needs no asset.",
            file=sys.stderr,
        )
        return 1

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    if CLIP_SRC.exists():
        # Preferred: the same footage MuseTalk prepares its avatar from, so
        # the idle loop and the rendered talking clips share framing,
        # resolution and frame rate, and the cut between them is invisible.
        print(f"Building idle loop from real footage: {CLIP_SRC}")
        build_idle_from_clip(CLIP_SRC, IDLE_OUT)
    else:
        # Fallback: a still portrait can only give a synthetic breathing
        # loop, which reads as a static photo on screen. Works, but supply a
        # short clip instead if you want the idle avatar to look alive.
        print(f"No {CLIP_SRC.name}; synthesising a breathing loop from the still portrait.")
        print("  (a 5-10s clip of the person sitting still looks far better — see AVATAR.md)")
        create_idle_doctor_video(PORTRAIT_SRC, IDLE_OUT)

    # The canvas fallback warps this portrait directly in the browser. Derive
    # it from the clip's own first frame when there's no separate still, so
    # the fallback face matches the video too.
    if PORTRAIT_SRC.exists():
        shutil.copyfile(PORTRAIT_SRC, PORTRAIT_OUT)
    else:
        import cv2
        cap = cv2.VideoCapture(str(CLIP_SRC))
        ok, frame = cap.read()
        cap.release()
        if ok:
            cv2.imwrite(str(PORTRAIT_OUT), frame)

    print(f"OK  idle clip     -> {IDLE_OUT}")
    print(f"OK  portrait copy -> {PORTRAIT_OUT}")
    print("\nVerify the codec (must say h264, not mpeg4/mp4v):")
    print(f'  ffmpeg -hide_banner -i "{IDLE_OUT}"')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

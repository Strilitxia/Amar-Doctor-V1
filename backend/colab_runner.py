"""
Amar Doctor V1 — Google Colab launcher: backend, optional MuseTalk sidecar,
and a public HTTPS tunnel (Cloudflare or Ngrok).

Voice calls need only this script. Video calls with real GPU lip-sync also
need the MuseTalk environment installed first — see the notebook's "Install
MuseTalk" cell, which mirrors MUSETALK_SETUP.md's local Windows recipe onto
Colab's Linux runtime. Skip that cell (or set ENABLE_MUSETALK=0) and this
script still runs the full audio pipeline; video calls just use the
audio-reactive avatar instead of GPU lip-sync — same fallback behaviour as
running locally without the MuseTalk sidecar.
"""

import os
import sys
import subprocess
import time
from pathlib import Path

import requests


def install_dependencies():
    print("📦 [1/5] Installing dependencies from backend/requirements.txt...")
    # Install from requirements.txt rather than a hand-written list. The old
    # list had drifted and was silently missing python-dotenv (so the Groq key
    # never loaded), httpx, torch, scipy, soundfile and imageio-ffmpeg.
    req = Path(__file__).resolve().parent / "requirements.txt"
    subprocess.run(
        [sys.executable, "-m", "pip", "install", "-q", "-r", str(req)],
        check=True,
    )
    print("✓ Core dependencies installed successfully.")


def download_cloudflared():
    print("🌐 [2/5] Downloading Cloudflare Tunnel (cloudflared) for free HTTPS URL...")
    if not os.path.exists("cloudflared"):
        subprocess.run(["wget", "-q", "-nc", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-O", "cloudflared"])
        subprocess.run(["chmod", "+x", "cloudflared"])
    print("✓ Cloudflared ready.")


def _musetalk_paths():
    """Where the notebook's "Install MuseTalk" cell put things.

    Everything lives on Colab's local disk, including the ~7.3GB of weights
    under <root>/models. Nothing is written to Google Drive: it keeps the
    install fast and avoids Drive's slow FUSE mount, at the cost of a runtime
    reset wiping it all. MUSETALK_ROOT / MUSETALK_VENV_PYTHON override either
    path for anyone running outside the notebook's convention.
    """
    musetalk_root = Path(os.environ.get("MUSETALK_ROOT", "/content/MuseTalk"))
    venv_python = Path(
        os.environ.get("MUSETALK_VENV_PYTHON", "/content/musetalk-venv/bin/python")
    )
    return musetalk_root, venv_python


def _musetalk_enabled() -> bool:
    return os.environ.get("ENABLE_MUSETALK", "1").strip().lower() not in ("0", "false", "no", "")


def start_musetalk_sidecar():
    """Launch the GPU lip-sync renderer as a background process, if installed.

    Never raises: a missing or broken MuseTalk install must not stop the
    voice pipeline from starting. The main backend already probes
    127.0.0.1:8100 itself and degrades a video call to the audio-reactive
    avatar whenever nothing answers there -- this function's only job is to
    give that probe something to find when it can.
    """
    if not _musetalk_enabled():
        print("ℹ️  [3/5] ENABLE_MUSETALK=0 — video calls will use the audio-reactive avatar.")
        return None

    musetalk_root, venv_python = _musetalk_paths()
    unet_path = musetalk_root / "models" / "musetalkV15" / "unet.pth"

    if not venv_python.exists():
        print(f"ℹ️  [3/5] No MuseTalk environment at {venv_python} — skipping GPU lip-sync.")
        print("    Run the notebook's 'Install MuseTalk' cell first, or set ENABLE_MUSETALK=0")
        print("    to stop seeing this. Video calls will use the audio-reactive avatar.")
        return None

    if not unet_path.exists():
        print(f"ℹ️  [3/5] MuseTalk weights missing at {unet_path} — skipping GPU lip-sync.")
        print("    The 'Install MuseTalk' cell didn't finish (or was interrupted mid-download).")
        return None

    avatar_present = any(
        (Path(__file__).resolve().parent / "static" / name).exists()
        for name in ("doctor_idle_source.mp4", "doctor_avatar.png")
    )
    if not avatar_present:
        print("ℹ️  [3/5] No doctor portrait/clip in backend/static/ — skipping GPU lip-sync.")
        print("    Run the notebook's 'Upload doctor avatar' cell first — see AVATAR.md.")
        return None

    print("🎬 [3/5] Starting MuseTalk renderer on :8100 (this loads ~7GB of weights)...")
    env = os.environ.copy()
    env["MUSETALK_ROOT"] = str(musetalk_root)
    backend_dir = Path(__file__).resolve().parent  # musetalk_service.py lives here

    proc = subprocess.Popen(
        [str(venv_python), "-m", "uvicorn", "musetalk_service:app", "--host", "127.0.0.1", "--port", "8100"],
        cwd=str(backend_dir),
        env=env,
    )

    # First boot prepares the avatar (face crops + latents, ~20-60s) on top
    # of loading the weights -- give it real time before giving up, matching
    # start-all.ps1's own patience on the local path.
    deadline_polls = 150  # ~5 minutes at 2s/poll
    for _ in range(deadline_polls):
        try:
            r = requests.get("http://127.0.0.1:8100/health", timeout=2)
            if r.ok and r.json().get("ok"):
                print("✓ MuseTalk renderer ready (musetalk-v15). Video calls get real GPU lip-sync.")
                return proc
        except requests.RequestException:
            pass
        time.sleep(2)

    print("⚠️  MuseTalk renderer did not become ready in time.")
    print("    Video calls will fall back to the audio-reactive avatar for now.")
    print("    Check its own output above for the actual error, or re-run once it settles.")
    return proc


def start_backend_and_tunnel(ngrok_token=None):
    print("🚀 [4/5] Starting FastAPI backend server on port 8000...")

    # Ensure working directory has backend package accessible
    env = os.environ.copy()
    env["PYTHONPATH"] = os.getcwd()
    # backend/musetalk_client.py already defaults to 127.0.0.1:8100 with no
    # env var needed -- both processes share this same Colab VM's loopback,
    # exactly like the local Windows setup. Only override it here if the
    # caller explicitly set a different MUSETALK_SIDECAR_URL themselves.

    server_process = subprocess.Popen([
        sys.executable, "-m", "uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"
    ], env=env)

    time.sleep(3)

    print("🔗 [5/5] Establishing secure public HTTPS tunnel...")
    if ngrok_token:
        from pyngrok import ngrok
        ngrok.set_auth_token(ngrok_token)
        public_url = ngrok.connect(8000).public_url
        print("\n" + "="*70)
        print("🎉 SUCCESS! Your Amar Doctor AI Video & Neural Voice Sandbox is LIVE!")
        print(f"👉 Public API URL: {public_url}")
        print("="*70 + "\n")
    else:
        # Start Cloudflare tunnel
        tunnel_process = subprocess.Popen(
            ["./cloudflared", "tunnel", "--url", "http://localhost:8000"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        print("\n" + "="*70)
        print("🎉 SUCCESS! Your Amar Doctor AI Backend is launching on Cloudflare!")
        print("Copy the .trycloudflare.com URL from the output below and paste it into your Next.js app:")
        print("="*70 + "\n")

        for line in tunnel_process.stdout:
            if "trycloudflare.com" in line:
                print(f"👉 {line.strip()}")
            sys.stdout.flush()


if __name__ == "__main__":
    install_dependencies()
    download_cloudflared()
    start_musetalk_sidecar()
    token = os.environ.get("NGROK_TOKEN")
    start_backend_and_tunnel(token)

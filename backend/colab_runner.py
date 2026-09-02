"""
Amar Doctor V1 — Google Colab & Cloudflare/Ngrok Tunnel Launcher
This script runs in Google Colab (with T4 GPU) to expose the FastAPI server
with a free public HTTPS endpoint (Cloudflare Tunnel or Ngrok).
"""

import os
import sys
import subprocess
import time
import requests

def install_dependencies():
    print("📦 [1/4] Installing dependencies (edge-tts, faster-whisper, fastapi, uvicorn)...")
    subprocess.run([
        sys.executable, "-m", "pip", "install", "-q",
        "fastapi", "uvicorn[standard]", "edge-tts>=7.2.8", "pydantic",
        "python-multipart", "pyngrok", "requests", "faster-whisper>=1.0.0"
    ], check=True)
    print("✓ Core dependencies installed successfully.")

def download_cloudflared():
    print("🌐 [2/4] Downloading Cloudflare Tunnel (cloudflared) for free HTTPS URL...")
    if not os.path.exists("cloudflared"):
        subprocess.run(["wget", "-q", "-nc", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-O", "cloudflared"])
        subprocess.run(["chmod", "+x", "cloudflared"])
    print("✓ Cloudflared ready.")

def start_backend_and_tunnel(ngrok_token=None):
    print("🚀 [3/4] Starting FastAPI backend server on port 8000...")
    
    # Ensure working directory has backend package accessible
    env = os.environ.copy()
    env["PYTHONPATH"] = os.getcwd()

    server_process = subprocess.Popen([
        sys.executable, "-m", "uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"
    ], env=env)

    time.sleep(3)

    print("🔗 [4/4] Establishing secure public HTTPS tunnel...")
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
    token = os.environ.get("NGROK_TOKEN")
    start_backend_and_tunnel(token)

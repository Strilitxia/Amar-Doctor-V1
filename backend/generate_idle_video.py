"""
Amar Doctor V1 — Idle Avatar Video Pre-renderer
Generates a lightweight pre-rendered idle video (blinking and subtle breathing movements)
for the AI Doctor avatar. Used to mask connection/streaming latency on the frontend.
"""

import os
import sys
import numpy as np
from pathlib import Path

def create_idle_doctor_video(image_path: str, output_path: str, duration_sec: int = 5, fps: int = 25):
    """
    Creates a smooth looping MP4 video of the doctor reference image with subtle breathing and eye-blink simulation.
    Requires imageio and imageio-ffmpeg (or opencv-python).
    """
    print(f"🎬 Pre-rendering AI Doctor idle video from image: {image_path}")

    try:
        import cv2
    except ImportError:
        print("Opencv (cv2) not found. Installing opencv-python-headless...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "opencv-python-headless", "imageio-ffmpeg"])
        import cv2

    img = cv2.imread(image_path)
    if img is None:
        print(f"⚠️ Warning: Reference image {image_path} not found. Creating a synthetic doctor avatar placeholder image.")
        # Create a professional synthetic doctor card canvas
        height, width = 512, 512
        img = np.zeros((height, width, 3), dtype=np.uint8)
        # Fill background gradient
        img[:, :] = (38, 20, 10) # Abyss navy
        # Draw doctor avatar emblem
        cv2.circle(img, (256, 210), 100, (255, 228, 106), -1) # Head
        cv2.ellipse(img, (256, 420), (160, 120), 0, 0, 180, (255, 255, 255), -1) # White coat
        cv2.putText(img, "AI DOCTOR", (160, 480), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (106, 228, 255), 2)
        cv2.imwrite(image_path, img)

    height, width, _ = img.shape
    total_frames = duration_sec * fps

    # Output video writer
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    for frame_idx in range(total_frames):
        t = frame_idx / total_frames
        # Subtle breathing scale effect (sinusoidal offset 1.0 to 1.01)
        scale = 1.0 + 0.008 * np.sin(2 * np.pi * t)
        
        # Subtle eye blink simulation (around 40% and 80% through loop)
        blink = 0.0
        if 0.38 <= t <= 0.42 or 0.78 <= t <= 0.82:
            blink = 1.0 - np.abs((t % 0.4) - 0.02) * 25
            blink = max(0.0, min(1.0, blink))

        # Apply slight scale/shift transform
        M = cv2.getRotationMatrix2D((width / 2, height / 2), 0, scale)
        frame = cv2.warpAffine(img, M, (width, height))

        if blink > 0.1:
            # Darken small eye area slightly to simulate blink motion
            eye_y = int(height * 0.4)
            eye_h = int(height * 0.03 * (1 - blink))
            if eye_h > 0:
                frame[eye_y:eye_y + eye_h, int(width * 0.35):int(width * 0.65)] = (frame[eye_y:eye_y + eye_h, int(width * 0.35):int(width * 0.65)] * 0.6).astype(np.uint8)

        writer.write(frame)

    writer.release()
    print(f"✓ Doctor idle video successfully generated at: {output_path}")

if __name__ == "__main__":
    static_dir = Path(__file__).parent / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    
    ref_img = static_dir / "doctor_avatar.png"
    out_mp4 = Path(__file__).parent.parent / "public" / "doctor_idle.mp4"
    
    create_idle_doctor_video(str(ref_img), str(out_mp4))

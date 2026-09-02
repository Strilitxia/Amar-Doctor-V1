"""
Amar Doctor V1 — MuseTalk Lip-Sync Inference Wrapper Module
Renders high-speed (30+ FPS) lip-synced video frames from static reference doctor avatar
and chunked Bengali neural audio using Tencent's open-source MuseTalk model.
"""

import os
import sys
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("musetalk-renderer")

class MuseTalkRenderer:
    def __init__(self, musetalk_dir: Optional[str] = "/content/MuseTalk"):
        self.musetalk_dir = Path(musetalk_dir)
        self.is_available = self.musetalk_dir.exists()
        if self.is_available:
            logger.info("✓ MuseTalk Avatar engine found.")
        else:
            logger.info("MuseTalk avatar directory not found. GPU video mode will use fallback synchronized pipeline.")

    def render_lip_sync_video(self, audio_file_path: str, reference_image_path: str, output_video_path: str) -> bool:
        """
        Executes MuseTalk lip-sync generation.
        """
        if not self.is_available:
            return False

        try:
            import subprocess
            cmd = [
                sys.executable,
                str(self.musetalk_dir / "inference.py"),
                "--audio_path", audio_file_path,
                "--video_path", reference_image_path,
                "--output_vid_name", output_video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0 and os.path.exists(output_video_path):
                return True
            else:
                logger.warning(f"MuseTalk process returned code {result.returncode}: {result.stderr}")
                return False
        except Exception as e:
            logger.error(f"MuseTalk rendering error: {e}")
            return False

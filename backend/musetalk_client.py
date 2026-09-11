"""
Amar Doctor V1 — MuseTalk sidecar client.

The lip-sync renderer cannot live in this process. MuseTalk needs mmcv/mmpose
and numpy 1.23, none of which have wheels for the Python 3.13 this backend
runs on, and installing them here would break the working faster-whisper STT.
So it runs as a separate FastAPI service under its own Python 3.10 virtualenv
(see MUSETALK_SETUP.md) and this module talks to it over HTTP.

Everything here is designed to fail quietly and quickly. A missing, dead, or
out-of-memory renderer must cost a voice call nothing more than the video: the
audio still plays, the avatar still animates, the consultation continues.
"""

import asyncio
import base64
import logging
import os
import time
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger("amar-doctor-backend")

# How long a /health answer is trusted. The frontend polls /health, and we
# must not probe the GPU box on every poll.
HEALTH_TTL_SECONDS = 15

# After a failed render, stop trying for this long. Without it, a dead sidecar
# adds a full timeout of dead air to every phrase of every remaining turn.
BREAKER_SECONDS = 60


class MuseTalkClient:
    def __init__(self) -> None:
        # Defaults to the local sidecar port this project's own setup guide
        # standardises on, so simply "running the backend" picks the renderer
        # up without remembering an env var -- forgetting it silently
        # downgraded every video call to the audio-reactive fallback, which
        # is indistinguishable from a broken feature.
        #
        # Costs nothing when no sidecar is running: a closed port refuses the
        # connection immediately (no timeout wait), health is cached for 15s,
        # and /health then honestly reports reason "unreachable". Set
        # MUSETALK_SIDECAR_URL="" to disable the probe entirely.
        env_url = os.environ.get("MUSETALK_SIDECAR_URL")
        if env_url is None:
            env_url = "http://127.0.0.1:8100"
        self.base_url = env_url.strip().rstrip("/")
        self._breaker_until = 0.0
        self._health: Optional[dict] = None
        self._health_at = 0.0
        # The "sidecar is down" guidance is worth saying loudly once, not on
        # every 15s health-cache miss. Same for a load error.
        self._warned_unreachable = False
        self._logged_error = False

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    @property
    def breaker_open(self) -> bool:
        return time.monotonic() < self._breaker_until

    def _trip_breaker(self, reason: str) -> None:
        if not self.breaker_open:
            logger.warning(f"MuseTalk sidecar unavailable ({reason}); pausing renders for {BREAKER_SECONDS}s.")
        self._breaker_until = time.monotonic() + BREAKER_SECONDS
        self._health = None

    async def health(self) -> dict:
        """Capability handshake, surfaced verbatim in /health.

        `live` is only ever True when the sidecar itself says it has a
        prepared avatar on a CUDA device. Anything less is reported as a
        named reason so the failure is debuggable from the browser.
        """
        if not self.configured:
            return {"live": False, "engine": None, "reason": "not_configured"}

        now = time.monotonic()
        if self._health is not None and (now - self._health_at) < HEALTH_TTL_SECONDS:
            return self._health

        if self.breaker_open:
            return {"live": False, "engine": None, "reason": "unreachable"}

        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                r = await client.get(f"{self.base_url}/health")
                r.raise_for_status()
                data = r.json()
        except Exception as e:
            # str(ConnectError) is empty for a refused connection on Windows,
            # so this used to log a bare "health probe failed:" with nothing
            # after it -- true, useless, and easy to read as a code fault when
            # the real cause is simply that nobody started the renderer.
            detail = str(e) or type(e).__name__
            if not self._warned_unreachable:
                self._warned_unreachable = True
                logger.warning(
                    f"MuseTalk sidecar not reachable at {self.base_url} ({detail}). "
                    "Video calls will use the audio-reactive avatar, which looks "
                    "like a still portrait. Start the renderer in its own terminal:\n"
                    '  Set-Location "<repo>\\backend"\n'
                    "  D:\\ai\\musetalk-venv\\Scripts\\python.exe -m uvicorn "
                    "musetalk_service:app --host 127.0.0.1 --port 8100\n"
                    "See MUSETALK_SETUP.md. Set MUSETALK_SIDECAR_URL=\"\" to silence this."
                )
            else:
                logger.debug(f"MuseTalk health probe failed: {detail}")
            result = {"live": False, "engine": None, "reason": "unreachable"}
            self._health, self._health_at = result, now
            return result

        if self._warned_unreachable:
            logger.info(f"MuseTalk sidecar is reachable again at {self.base_url}.")
            self._warned_unreachable = False

        avatar_ready = bool(data.get("avatar_ready"))
        device = data.get("device")
        sidecar_ok = data.get("ok", True)
        sidecar_error = data.get("error") or None

        # A sidecar that failed during model/avatar load answers with
        # ok=false and its own `error` string. That used to be reported here
        # as a bare "avatar_not_prepared" with the real message discarded --
        # which is true but useless, since it's never the actual problem.
        if not sidecar_ok and sidecar_error:
            reason = "sidecar_error"
        elif not avatar_ready:
            reason = "avatar_not_prepared"
        elif device != "cuda":
            reason = "no_cuda"
        else:
            reason = None

        if sidecar_error and not self._logged_error:
            self._logged_error = True
            logger.error(f"MuseTalk sidecar failed to load: {sidecar_error}")
        elif not sidecar_error:
            self._logged_error = False

        result = {
            "live": reason is None,
            "engine": data.get("engine"),
            "avatar_ready": avatar_ready,
            "device": device,
            "reason": reason,
            # The sidecar's own exception text, verbatim -- this is the field
            # to read when reason is anything other than null.
            "error": sidecar_error,
        }
        self._health, self._health_at = result, now
        return result

    async def render(self, audio_path: Path, phrase: str, seq: int, phrase_seconds: float = 2.0) -> Optional[bytes]:
        """Render one lip-synced clip. Returns mp4 bytes, or None on any failure.

        None is not an error condition for the caller — it simply means this
        phrase goes out as audio instead.
        """
        if not self.configured or self.breaker_open:
            return None

        # Render time scales with audio length, but the multiplier here is
        # NOT the ~1-1.5x "near realtime" this was first written against —
        # measured on an RTX 3060 Ti with the real renderer across 6 runs,
        # MuseTalk v15 ran 12.8x-28.0x SLOWER than realtime (GPU pegged at
        # 100%, VRAM at the card's ceiling), consistent with MuseTalk's own
        # published number of ~37x slower on a 4GB laptop GPU. A 25x
        # multiplier still clipped a render that finished at 28.0x — one
        # request timed out 0.3s before the sidecar's own response was
        # ready. 40x covers the observed variance with real margin;
        # MUSETALK_RENDER_TIMEOUT_MULTIPLIER overrides it for faster/slower
        # hardware. On this class of GPU, per-phrase rendering is not fast
        # enough for live pipelining regardless of this margin -- see
        # MUSETALK_SETUP.md's "Measured latency" section.
        # The floor matters as much as the multiplier: render cost is roughly
        # `2.4s + 26s per second of audio`, so even a very short phrase costs
        # tens of seconds. A 15s floor threw away completed renders of short
        # phrases; 90s covers everything the multiplier doesn't.
        multiplier = float(os.environ.get("MUSETALK_RENDER_TIMEOUT_MULTIPLIER", "40"))
        timeout = min(180.0, max(90.0, phrase_seconds * multiplier))

        try:
            audio_b64 = base64.b64encode(audio_path.read_bytes()).decode("utf-8")
            async with httpx.AsyncClient(timeout=timeout) as client:
                r = await client.post(
                    f"{self.base_url}/render",
                    json={"audio_base64": audio_b64, "phrase": phrase, "seq": seq},
                )
                r.raise_for_status()
                data = r.json()
        except asyncio.TimeoutError:
            self._trip_breaker("timeout")
            return None
        except httpx.TimeoutException:
            self._trip_breaker("timeout")
            return None
        except Exception as e:
            self._trip_breaker(str(e))
            return None

        if not data.get("ok"):
            reason = data.get("reason", "unknown")
            # An OOM is transient — one phrase's worth of failure, not a dead
            # service — but backing off briefly gives the GPU room to recover.
            self._trip_breaker(reason)
            return None

        video_b64 = data.get("video_base64")
        if not video_b64:
            self._trip_breaker("empty_response")
            return None

        logger.info(
            f"MuseTalk rendered seq={seq} frames={data.get('frames')} "
            f"render_ms={data.get('render_ms')} duration_ms={data.get('duration_ms')}"
        )
        # Success clears any pending backoff.
        self._breaker_until = 0.0
        try:
            return base64.b64decode(video_b64)
        except Exception as e:
            logger.warning(f"MuseTalk returned undecodable video: {e}")
            return None


musetalk = MuseTalkClient()

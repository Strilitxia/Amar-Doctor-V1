"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";

// Where a user-supplied doctor portrait lands for the browser-side fallback.
// backend/generate_idle_video.py copies it here from backend/static/.
// See backend/static/AVATAR.md for the drop-in contract.
const PORTRAIT_SRC = "/doctor_portrait.png";
const IDLE_SRC = "/doctor_idle.mp4";

// Mouth region of the portrait, as fractions of its width/height. The strip
// below the top edge is stretched downward with the audio envelope, which
// reads as a jaw opening. Only used by the fallback renderer — MuseTalk
// replaces this entirely with real inpainted frames.
const MOUTH = { top: 0.6, bottom: 0.86, left: 0.22, right: 0.78 };

const CLIP_STYLE = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  opacity: 0,
  transition: "opacity 120ms linear",
  zIndex: 2,
};

function VideoAvatar(
  {
    isTalking = false,
    engine = null, // "musetalk" | "fallback" | null (not connected)
    mode = "video",
    playerRef = null, // ref to the AudioStreamPlayer — drives the fallback mouth
    selfViewStream = null,
    selfViewError = null,
    onTalkingChange = null,
    callActive = false,
  },
  ref
) {
  const isVideoMode = mode === "video";

  const idleRef = useRef(null);
  const clipARef = useRef(null);
  const clipBRef = useRef(null);
  const canvasRef = useRef(null);
  const selfViewRef = useRef(null);

  const [idleLoaded, setIdleLoaded] = useState(false);
  const [idleError, setIdleError] = useState(false);
  const [portraitLoaded, setPortraitLoaded] = useState(false);
  const [clipPlaying, setClipPlaying] = useState(false);
  const [needsSoundTap, setNeedsSoundTap] = useState(false);

  const portraitImgRef = useRef(null);
  const rafRef = useRef(null);
  const levelRef = useRef(0);

  // Clip queue state lives in refs — it is driven by media events and must
  // never be a render behind.
  const queueRef = useRef([]);
  const frontIsARef = useRef(true); // which buffer is currently visible
  const busyRef = useRef(false);
  const talkingRef = useRef(false);
  const startNextRef = useRef(null);

  const front = useCallback(() => (frontIsARef.current ? clipARef.current : clipBRef.current), []);
  const back = useCallback(() => (frontIsARef.current ? clipBRef.current : clipARef.current), []);

  const setTalking = useCallback(
    (v) => {
      if (talkingRef.current === v) return;
      talkingRef.current = v;
      setClipPlaying(v);
      if (onTalkingChange) onTalkingChange(v);
    },
    [onTalkingChange]
  );

  // ─── Portrait preload (optional; absent until the user supplies one) ───
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      portraitImgRef.current = img;
      setPortraitLoaded(true);
    };
    img.onerror = () => setPortraitLoaded(false);
    img.src = PORTRAIT_SRC;
  }, []);

  // ─── Self-view webcam ───────────────────────────────────────────────
  // srcObject, never src. Nulling it on teardown matters: a dangling
  // srcObject keeps the track referenced after stop() and the camera
  // indicator light stays on.
  useEffect(() => {
    const el = selfViewRef.current;
    if (!el) return;
    el.srcObject = selfViewStream || null;
    if (selfViewStream) el.play().catch(() => {});
    return () => {
      if (el) el.srcObject = null;
    };
  }, [selfViewStream]);

  // ─── Clip queue ─────────────────────────────────────────────────────
  const finishClip = useCallback(() => {
    busyRef.current = false;
    if (queueRef.current.length > 0) {
      startNextRef.current?.();
      return;
    }
    // Nothing left: fade both buffers out, idle shows through again.
    [clipARef.current, clipBRef.current].forEach((el) => {
      if (el) el.style.opacity = "0";
    });
    setTalking(false);
  }, [setTalking]);

  const startNext = useCallback(() => {
    if (busyRef.current) return;
    const clip = queueRef.current.shift();
    if (!clip) {
      finishClip();
      return;
    }
    const el = back();
    if (!el) return;
    busyRef.current = true;

    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      const f = front();
      if (f) f.style.opacity = "0";
      el.style.opacity = "1";
      frontIsARef.current = !frontIsARef.current;
      setTalking(true);
    };

    const play = () => {
      el.play()
        .then(swap)
        .catch((err) => {
          if (err && err.name === "NotAllowedError") {
            // Autoplay with sound was refused. Show the clip muted rather
            // than nothing, and tell the user how to get the audio back.
            setNeedsSoundTap(true);
            el.muted = true;
            el.play().then(swap).catch(() => finishClip());
            return;
          }
          console.warn("Clip playback failed:", err);
          finishClip();
        });
    };

    const onEnded = () => {
      el.removeEventListener("ended", onEnded);
      finishClip();
    };
    el.addEventListener("ended", onEnded);

    // canplaythrough is unreliable across builds; loadeddata plus a short
    // safety timer is what actually fires consistently.
    let started = false;
    const kick = () => {
      if (started) return;
      started = true;
      play();
    };
    el.addEventListener("loadeddata", kick, { once: true });
    setTimeout(kick, 250);

    el.muted = false;
    el.src = clip.url;
    el.load();
  }, [back, front, finishClip, setTalking]);

  useEffect(() => {
    startNextRef.current = startNext;
  }, [startNext]);

  useImperativeHandle(
    ref,
    () => ({
      enqueueClip(clip) {
        if (!clip || !clip.url) return;
        queueRef.current.push(clip);
        if (!busyRef.current) startNextRef.current?.();
      },
      flush() {
        queueRef.current = [];
        busyRef.current = false;
        [clipARef.current, clipBRef.current].forEach((el) => {
          if (!el) return;
          try {
            el.pause();
            el.removeAttribute("src");
            el.load(); // releases the decoder
          } catch {}
          el.style.opacity = "0";
        });
        setTalking(false);
      },
      // Must be called from inside a real user gesture (the Start Call
      // click). Unmuted clips are refused otherwise, silently.
      unlockAutoplay() {
        [clipARef.current, clipBRef.current, idleRef.current].forEach((el) => {
          if (!el) return;
          try {
            el.load();
            const p = el.play();
            if (p && p.catch) p.catch(() => {});
          } catch {}
        });
        setNeedsSoundTap(false);
      },
      hasQueued() {
        return busyRef.current || queueRef.current.length > 0;
      },
    }),
    [setTalking]
  );

  // ─── Fallback face: driven by the REAL audio envelope ────────────────
  // Runs whenever no generated clip is on screen. The mouth follows the
  // waveform from AudioStreamPlayer's analyser, so it opens on vowels and
  // is genuinely still during silence.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (clipPlaying) return; // a real clip is showing; don't burn frames
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameCount = 0;

    const render = () => {
      frameCount++;
      const w = canvas.width;
      const h = canvas.height;

      // Real amplitude when we have it; otherwise flat (mouth closed).
      // Read through the ref inside the animation frame — never during
      // render, which is what a plain `player` prop would have required.
      const player = playerRef?.current;
      const target = player && isTalking ? player.getLevel() : 0;
      levelRef.current += (target - levelRef.current) * 0.35;
      const level = levelRef.current;

      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "#0a1420");
      bgGrad.addColorStop(1, "#17202e");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const breathOffset = Math.sin(frameCount * 0.05) * 2;

      if (portraitLoaded && portraitImgRef.current) {
        drawPortrait(ctx, portraitImgRef.current, w, h, level, breathOffset, frameCount);
      } else {
        drawVectorDoctor(ctx, w, h, level, breathOffset, frameCount);
      }

      // Visualizer bars from the real spectrum.
      if (isTalking && player) {
        const spectrum = player.getSpectrum(5);
        ctx.fillStyle = "#6ae4ff";
        for (let i = 0; i < spectrum.length; i++) {
          const barHeight = 4 + spectrum[i] * 26;
          ctx.fillRect(w / 2 - 34 + i * 15, h - 22 - barHeight, 8, barHeight);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    };

    render();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isTalking, playerRef, portraitLoaded, clipPlaying]);

  const engineLabel =
    engine === "musetalk"
      ? { text: "📹 MuseTalk Lip-Sync (local GPU)", color: "#34ed7b", bg: "rgba(52, 237, 123, 0.18)" }
      : isVideoMode
      ? { text: "📹 Audio-reactive avatar", color: "#ffb020", bg: "rgba(255, 176, 32, 0.15)" }
      : { text: "🎙️ Edge-TTS streaming voice", color: "var(--color-spectral-cyan)", bg: "rgba(106, 228, 255, 0.15)" };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: isVideoMode ? 560 : 240,
        aspectRatio: isVideoMode ? "16 / 9" : "1 / 1",
        borderRadius: "var(--radius-cards)",
        background: "var(--color-abyss-navy)",
        border: isTalking ? "2px solid var(--color-spectral-cyan)" : "1px solid var(--color-carbon-black)",
        boxShadow: isTalking ? "0 0 25px rgba(106, 228, 255, 0.4)" : "none",
        overflow: "hidden",
        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
      }}
      id="video-avatar-container"
    >
      {/* Layer 0 — audio-reactive fallback face */}
      <canvas
        ref={canvasRef}
        width={640}
        height={isVideoMode ? 360 : 640}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: !idleLoaded || idleError ? "block" : "none",
          zIndex: 0,
        }}
        id="avatar-canvas-player"
      />

      {/* Layer 1 — idle loop (H.264; see backend/generate_idle_video.py) */}
      {!idleError && (
        <video
          ref={idleRef}
          src={IDLE_SRC}
          loop
          muted
          playsInline
          autoPlay
          onLoadedData={() => setIdleLoaded(true)}
          onError={() => setIdleError(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: idleLoaded ? "block" : "none",
            zIndex: 1,
          }}
          id="idle-video-player"
        />
      )}

      {/* Layer 2 — double-buffered generated talking clips. Written out
          twice rather than mapped: collecting the refs into an array would
          read ref values during render. */}
      <video
        ref={clipARef}
        playsInline
        preload="auto"
        style={CLIP_STYLE}
        id="avatar-clip-a"
      />
      <video
        ref={clipBRef}
        playsInline
        preload="auto"
        style={CLIP_STYLE}
        id="avatar-clip-b"
      />

      {/* Engine badge */}
      <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6, zIndex: 10 }}>
        <span
          className="badge"
          style={{
            background: isTalking ? "rgba(52, 237, 123, 0.25)" : engineLabel.bg,
            color: isTalking ? "#34ed7b" : engineLabel.color,
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            border: "1px solid rgba(106, 228, 255, 0.3)",
          }}
          title={
            engine === "musetalk"
              ? "Frames rendered by MuseTalk on the GPU"
              : "Mouth driven by the live audio waveform"
          }
        >
          {isTalking ? "🔴 SPEAKING" : engineLabel.text}
        </span>
      </div>

      {needsSoundTap && (
        <button
          onClick={() => {
            const f = front();
            if (f) {
              f.muted = false;
              f.play().catch(() => {});
            }
            setNeedsSoundTap(false);
          }}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 12,
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,176,32,0.6)",
            background: "rgba(255,176,32,0.2)",
            color: "#ffb020",
            cursor: "pointer",
          }}
        >
          🔇 Tap for sound
        </button>
      )}

      {/* Self-view PiP — video mode only */}
      {isVideoMode && callActive && (
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            width: 132,
            height: 99,
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid rgba(106, 228, 255, 0.45)",
            background: "#05090f",
            zIndex: 11,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          id="self-view-pip"
        >
          <video
            ref={selfViewRef}
            muted
            playsInline
            autoPlay
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: "scaleX(-1)", // mirror, like every video-call client
              display: selfViewStream ? "block" : "none",
            }}
          />
          {!selfViewStream && (
            <div style={{ textAlign: "center", padding: 6 }}>
              <div style={{ fontSize: 18 }}>📷</div>
              <div style={{ fontSize: 9, color: "var(--color-fog-gray)", lineHeight: 1.3 }}>
                {selfViewError ? `Camera off (${selfViewError})` : "Camera off"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(10, 20, 32, 0.95), transparent)",
          padding: "14px 14px 8px",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-bone-white)" }}>
          Dr. Nabanita (AI Teleconsultant)
        </div>
        <div style={{ fontSize: 10, color: "var(--color-spectral-cyan)", marginTop: 2, fontWeight: 600 }}>
          {engine === "musetalk"
            ? isTalking
              ? "🔊 GPU lip-sync rendering"
              : "🟢 Lip-sync engine ready"
            : engine === "fallback"
            ? "🟡 Avatar follows the voice waveform"
            : "⚪ Backend not connected"}
        </div>
      </div>
    </div>
  );
}

// ─── Fallback renderers ───────────────────────────────────────────────

function drawPortrait(ctx, img, w, h, level, breathOffset, frameCount) {
  const scale = Math.max(w / img.width, h / img.height) * (1 + 0.004 * Math.sin(frameCount * 0.05));
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2 + breathOffset;

  ctx.drawImage(img, dx, dy, dw, dh);

  // Stretch the lower-face strip downward with the audio envelope. Crude
  // next to real inpainting, but it tracks the actual voice.
  const open = level * 0.14;
  if (open > 0.002) {
    const sy = img.height * MOUTH.top;
    const sh = img.height * (MOUTH.bottom - MOUTH.top);
    const sx = img.width * MOUTH.left;
    const sw = img.width * (MOUTH.right - MOUTH.left);
    ctx.drawImage(
      img,
      sx,
      sy,
      sw,
      sh,
      dx + sx * scale,
      dy + sy * scale,
      sw * scale,
      sh * scale * (1 + open)
    );
  }
}

function drawVectorDoctor(ctx, w, h, level, breathOffset, frameCount) {
  const s = Math.min(w, h) / 240; // the geometry below was authored at 240px

  ctx.save();
  ctx.translate(w / 2, h / 2 + breathOffset - 10 * s);
  ctx.scale(s, s);

  const cx = 0;
  const cy = 0;

  const glowGrad = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, 120);
  glowGrad.addColorStop(0, "rgba(106, 228, 255, 0.12)");
  glowGrad.addColorStop(1, "rgba(106, 228, 255, 0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(cx - 120, cy - 120, 240, 240);

  // Coat
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 105, 95, 60, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0a1420";
  ctx.beginPath();
  ctx.moveTo(cx - 35, cy + 60);
  ctx.lineTo(cx, cy + 110);
  ctx.lineTo(cx + 35, cy + 60);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#6ae4ff";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy + 65, 38, 0.2, Math.PI - 0.2);
  ctx.stroke();

  // Face
  ctx.fillStyle = "#f5d0a9";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 15, 55, 68, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2c1d11";
  ctx.beginPath();
  ctx.ellipse(cx, cy - 45, 58, 42, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#4b5563";
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - 42, cy - 28, 34, 22);
  ctx.strokeRect(cx + 8, cy - 28, 34, 22);
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy - 18);
  ctx.lineTo(cx + 8, cy - 18);
  ctx.stroke();

  const isBlinking = frameCount % 150 > 144;
  if (isBlinking) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1e293b";
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy - 17);
    ctx.lineTo(cx - 15, cy - 17);
    ctx.moveTo(cx + 15, cy - 17);
    ctx.lineTo(cx + 35, cy - 17);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(cx - 25, cy - 17, 6, 0, Math.PI * 2);
    ctx.arc(cx + 25, cy - 17, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx - 27, cy - 19, 2, 0, Math.PI * 2);
    ctx.arc(cx + 23, cy - 19, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx - 4, cy + 5);
  ctx.lineTo(cx + 2, cy + 5);
  ctx.stroke();

  // Mouth — opening tracks the real waveform, not a timer.
  ctx.fillStyle = level > 0.05 ? "#b91c1c" : "#dc2626";
  ctx.beginPath();
  if (level > 0.05) {
    ctx.ellipse(cx, cy + 24, 14, 2 + level * 15, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(cx, cy + 18, 12, 0.1, Math.PI - 0.1);
  }
  ctx.fill();

  ctx.restore();
}

export default forwardRef(VideoAvatar);

"use client";

import { useState, useRef, useEffect } from "react";

export default function VideoAvatar({
  isTalking = false,
  colabConnected = false,
  colabUrl = "",
  mode = "video",
  speakingText = "",
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const animationFrameRef = useRef(null);

  // Fallback Canvas Animation: Interactive 2D Doctor Avatar with natural blinking & lip-syncing
  useEffect(() => {
    if (videoLoaded && !videoError) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameCount = 0;

    const render = () => {
      frameCount++;
      const w = canvas.width;
      const h = canvas.height;

      // 1. Dark Gradient Background
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "#0a1420");
      bgGrad.addColorStop(1, "#17202e");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle cyan ambient light glow
      const glowGrad = ctx.createRadialGradient(w / 2, h / 2 - 20, 10, w / 2, h / 2, 120);
      glowGrad.addColorStop(0, "rgba(106, 228, 255, 0.12)");
      glowGrad.addColorStop(1, "rgba(106, 228, 255, 0)");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Breathing Motion Offset
      const breathOffset = Math.sin(frameCount * 0.05) * 2;
      const centerY = h / 2 + breathOffset - 10;
      const centerX = w / 2;

      // 3. Doctor Shoulders / White Coat
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + 105, 95, 60, 0, 0, Math.PI * 2);
      ctx.fill();

      // Inner Stethoscope / Navy Collar
      ctx.fillStyle = "#0a1420";
      ctx.beginPath();
      ctx.moveTo(centerX - 35, centerY + 60);
      ctx.lineTo(centerX, centerY + 110);
      ctx.lineTo(centerX + 35, centerY + 60);
      ctx.closePath();
      ctx.fill();

      // Stethoscope Cable
      ctx.strokeStyle = "#6ae4ff";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(centerX, centerY + 65, 38, 0.2, Math.PI - 0.2);
      ctx.stroke();

      // 4. Head / Face Skin
      ctx.fillStyle = "#f5d0a9";
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 15, 55, 68, 0, 0, Math.PI * 2);
      ctx.fill();

      // Hair
      ctx.fillStyle = "#2c1d11";
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 45, 58, 42, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      // Glasses Frame
      ctx.strokeStyle = "#4b5563";
      ctx.lineWidth = 3;
      // Left Lens
      ctx.strokeRect(centerX - 42, centerY - 28, 34, 22);
      // Right Lens
      ctx.strokeRect(centerX + 8, centerY - 28, 34, 22);
      // Bridge
      ctx.beginPath();
      ctx.moveTo(centerX - 8, centerY - 18);
      ctx.lineTo(centerX + 8, centerY - 18);
      ctx.stroke();

      // 5. Eyes with Blinking Effect
      const isBlinking = frameCount % 120 > 114;
      ctx.fillStyle = "#1e293b";

      if (isBlinking) {
        // Closed Eye Lines
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(centerX - 35, centerY - 17);
        ctx.lineTo(centerX - 15, centerY - 17);
        ctx.moveTo(centerX + 15, centerY - 17);
        ctx.lineTo(centerX + 35, centerY - 17);
        ctx.stroke();
      } else {
        // Open Pupil Circles
        ctx.beginPath();
        ctx.arc(centerX - 25, centerY - 17, 6, 0, Math.PI * 2);
        ctx.arc(centerX + 25, centerY - 17, 6, 0, Math.PI * 2);
        ctx.fill();

        // Eye Catchlight Reflections
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(centerX - 27, centerY - 19, 2, 0, Math.PI * 2);
        ctx.arc(centerX + 23, centerY - 19, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nose
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 10);
      ctx.lineTo(centerX - 4, centerY + 5);
      ctx.lineTo(centerX + 2, centerY + 5);
      ctx.stroke();

      // 6. Interactive Mouth / Lip-Sync Motion
      ctx.fillStyle = isTalking ? "#b91c1c" : "#dc2626";
      ctx.beginPath();

      if (isTalking) {
        // Mouth opens and closes dynamically when talking
        const mouthOpen = Math.abs(Math.sin(frameCount * 0.35)) * 14 + 4;
        ctx.ellipse(centerX, centerY + 24, 14, mouthOpen, 0, 0, Math.PI * 2);
      } else {
        // Closed subtle smile
        ctx.arc(centerX, centerY + 18, 12, 0.1, Math.PI - 0.1);
      }
      ctx.fill();

      // 7. Audio Visualizer Waves (When Talking)
      if (isTalking) {
        ctx.fillStyle = "#6ae4ff";
        for (let i = 0; i < 5; i++) {
          const barHeight = Math.abs(Math.sin(frameCount * 0.2 + i)) * 18 + 6;
          const bx = centerX - 30 + i * 15;
          ctx.fillRect(bx, h - 25 - barHeight, 8, barHeight);
        }
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isTalking, videoLoaded, videoError]);

  return (
    <div
      style={{
        position: "relative",
        width: 240,
        height: 240,
        borderRadius: "var(--radius-cards)",
        background: "var(--color-abyss-navy)",
        border: isTalking
          ? "2px solid var(--color-spectral-cyan)"
          : "1px solid var(--color-carbon-black)",
        boxShadow: isTalking ? "0 0 25px rgba(106, 228, 255, 0.4)" : "none",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.3s ease",
      }}
      id="video-avatar-container"
    >
      {/* 1. Pre-rendered Video Element (with auto-fallback to canvas) */}
      {!videoError && (
        <video
          ref={videoRef}
          src="/doctor_idle.mp4"
          loop
          muted
          playsInline
          autoPlay
          onLoadedData={() => setVideoLoaded(true)}
          onError={() => setVideoError(true)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: videoLoaded ? "block" : "none",
            zIndex: 1,
          }}
          id="idle-video-player"
        />
      )}

      {/* 2. Interactive Animated Canvas Doctor Avatar (Plays seamlessly if video is loading or missing) */}
      <canvas
        ref={canvasRef}
        width={240}
        height={240}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: !videoLoaded || videoError ? "block" : "none",
          zIndex: 0,
        }}
        id="avatar-canvas-player"
      />

      {/* Live Badge & Telemetry Overlay */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          display: "flex",
          gap: 6,
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <span
          className="badge"
          style={{
            background: isTalking ? "rgba(52, 237, 123, 0.25)" : "rgba(106, 228, 255, 0.15)",
            color: isTalking ? "#34ed7b" : "var(--color-spectral-cyan)",
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 10px",
            border: "1px solid rgba(106, 228, 255, 0.3)",
          }}
        >
          {isTalking ? "🔴 LIVE DOCTOR SPEAKING" : "📹 AI Doctor Feed"}
        </span>
      </div>

      {/* Status Footer Overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "linear-gradient(to top, rgba(10, 20, 32, 0.95), transparent)",
          padding: "14px 14px 8px",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-bone-white)" }}>
          Dr. Nabanita (AI Teleconsultant)
        </div>
        <div style={{ fontSize: 10, color: "var(--color-spectral-cyan)", marginTop: 2, fontWeight: 600 }}>
          {isTalking
            ? "🔊 Lip-Sync Audio & Video Active"
            : colabConnected
            ? "🟢 Colab GPU Video Engine Ready"
            : "🟢 Live Video Feed Active"}
        </div>
      </div>
    </div>
  );
}

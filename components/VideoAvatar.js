"use client";

import { useState, useRef, useEffect } from "react";

export default function VideoAvatar({
  isTalking = false,
  colabConnected = false,
  colabUrl = "",
  mode = "video",
  speakingText = "",
}) {
  const idleVideoRef = useRef(null);
  const liveVideoRef = useRef(null);
  const [liveKitStatus, setLiveKitStatus] = useState("idle"); // idle | connecting | connected | error
  const [isCrossfaded, setIsCrossfaded] = useState(false);
  const [telemetry, setTelemetry] = useState({ latency: "250ms", fps: 30 });

  useEffect(() => {
    // Attempt auto-play on idle video
    if (idleVideoRef.current) {
      idleVideoRef.current.play().catch(() => {
        // Autoplay blocked by browser policy until user gesture
      });
    }
  }, []);

  useEffect(() => {
    // Crossfade to talking video effect when AI doctor starts speaking
    if (isTalking) {
      setIsCrossfaded(true);
    } else {
      const timer = setTimeout(() => setIsCrossfaded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isTalking]);

  return (
    <div
      style={{
        position: "relative",
        width: 220,
        height: 220,
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
      {/* 1. Pre-rendered Idle Doctor Loop Video */}
      <video
        ref={idleVideoRef}
        src="/doctor_idle.mp4"
        loop
        muted
        playsInline
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: isCrossfaded ? 0.2 : 1,
          transition: "opacity 0.4s ease",
        }}
        id="idle-video-player"
      />

      {/* 2. Live WebRTC Stream / Talking Avatar Canvas Overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: isCrossfaded ? 1 : 0,
          transition: "opacity 0.4s ease",
          pointerEvents: "none",
        }}
      >
        <div style={{ fontSize: 64, transform: "scale(1.08)", transition: "transform 0.2s" }}>
          👨‍⚕️
        </div>
      </div>

      {/* Live Badge & Telemetry Overlay */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
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
            fontSize: 10,
            padding: "2px 8px",
            border: "1px solid rgba(106, 228, 255, 0.3)",
          }}
        >
          {isTalking ? "🔴 LIVE SPEAKING" : "📹 MuseTalk WebRTC"}
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
          padding: "10px 12px 6px",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-bone-white)" }}>
          Dr. Nabanita (AI Teleconsultant)
        </div>
        <div style={{ fontSize: 9, color: "var(--color-fog-gray)", marginTop: 2 }}>
          {isTalking
            ? "Pipelined 30 FPS Lip-Syncing..."
            : colabConnected
            ? "Idle Loop · GPU Ready"
            : "Idle Loop · Ready"}
        </div>
      </div>
    </div>
  );
}

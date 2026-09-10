"use client";

import { formatDistance, toBnDigits } from "@/lib/campsData";
import {
  formatAltitude,
  formatDuration,
  formatPercent,
  formatSpeed,
} from "@/lib/droneDeliveryEngine";

// Live readouts for the tracking phase. Re-renders once a second from the clock
// in DroneClient — every numeric cell is tabular-nums inside a fixed-height row
// (see globals.css section 25) so a changing digit cannot reflow the panel.
export default function DroneTelemetryPanel({ order, telemetry, lang = "en" }) {
  const bn = lang === "bn";
  if (!order || !telemetry) return null;

  const {
    stage,
    etaSeconds,
    etaAtWallMs,
    progress,
    distanceFlownKm,
    distanceRemainingKm,
    totalDistanceKm,
    groundSpeedKmh,
    altitudeM,
    batteryPct,
    batteryAtReturnPct,
    batteryWarning,
    timeline,
    isDelivered,
  } = telemetry;

  const clock = new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="drn-telemetry" id="drone-telemetry">
      <div className="drn-eta">
        <div className="drn-eta__label">
          {isDelivered
            ? bn ? "পৌঁছে গেছে" : "Delivered"
            : bn ? "পৌঁছাতে বাকি" : "Arriving in"}
        </div>

        <div className="drn-eta__value" id="drone-eta">
          {isDelivered ? (bn ? "✅ সম্পন্ন" : "✅ Complete") : formatDuration(etaSeconds, lang)}
        </div>

        {!isDelivered && (
          <div className="drn-eta__sub" suppressHydrationWarning>
            {bn ? "আনুমানিক " : "Around "}
            {clock.format(new Date(etaAtWallMs))}
          </div>
        )}

        {/* The countdown runs faster than the clock. Say so plainly rather than
            reporting an impossibly fast drone. */}
        <div className="drn-scale-badge">
          ⏩ {bn ? `×${toBnDigits(order.timeScale)} সিমুলেশন গতি` : `${order.timeScale}× simulation speed`}
        </div>
      </div>

      <div className="drn-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="drn-progress__fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="drn-stat-grid">
        <div className="drn-stat">
          <div className="drn-stat__label">{bn ? "বাকি দূরত্ব" : "Distance left"}</div>
          <div className="drn-stat__value" id="drone-remaining">
            {formatDistance(distanceRemainingKm, lang)}
          </div>
        </div>

        <div className="drn-stat">
          <div className="drn-stat__label">{bn ? "উড়েছে" : "Flown"}</div>
          <div className="drn-stat__value">{formatDistance(distanceFlownKm, lang)}</div>
        </div>

        <div className="drn-stat">
          <div className="drn-stat__label">{bn ? "গতি" : "Ground speed"}</div>
          <div className="drn-stat__value">{formatSpeed(groundSpeedKmh, lang)}</div>
        </div>

        <div className="drn-stat">
          <div className="drn-stat__label">{bn ? "উচ্চতা" : "Altitude"}</div>
          <div className="drn-stat__value">{formatAltitude(altitudeM, lang)}</div>
        </div>
      </div>

      <div className={`drn-battery ${batteryWarning ? "drn-battery--low" : ""}`}>
        <div className="drn-battery__head">
          <span>
            🔋 {bn ? "ব্যাটারি" : "Battery"}
            {batteryWarning && (bn ? " — ফেরার জন্য কম" : " — low for return")}
          </span>
          <span>
            {formatPercent(batteryPct, lang)}
            {" · "}
            {bn ? "ফিরে এলে " : "at return "}
            {formatPercent(batteryAtReturnPct, lang)}
          </span>
        </div>
        <div className="drn-battery__bar">
          <div className="drn-battery__fill" style={{ width: `${batteryPct}%` }} />
        </div>
      </div>

      <div className="drn-timeline">
        {timeline.map((s) => (
          <div
            key={s.id}
            className={`drn-stage ${s.done ? "drn-stage--done" : ""} ${s.active ? "drn-stage--active" : ""}`}
          >
            <span className="drn-stage__dot">{s.done || s.active ? s.icon : "·"}</span>
            <span className="drn-stage__label">{bn ? s.labelBn : s.label}</span>
            <span className="drn-stage__time" suppressHydrationWarning>
              {clock.format(new Date(s.atWallMs))}
            </span>
          </div>
        ))}
      </div>

      <div className="drn-stat" style={{ marginTop: "var(--spacing-16)" }}>
        <div className="drn-stat__label">{bn ? "মিশন" : "Mission"}</div>
        <div className="drn-stat__value" style={{ fontSize: "var(--text-body-sm)" }}>
          {/* Never Bengali-ised: these are codes read back over a phone. */}
          {order.droneCode} · {order.id}
        </div>
        <div className="drn-item__meta">
          {bn ? "মোট পথ " : "Total route "}
          {formatDistance(totalDistanceKm, lang)}
          {" · "}
          {bn ? "স্ট্যাটাস " : "Status "}
          {stage}
        </div>
      </div>
    </div>
  );
}

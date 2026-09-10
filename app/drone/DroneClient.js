"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SOSButton from "@/components/SOSButton";
import CampLocationPicker from "@/components/CampLocationPicker";
import DroneDeliveryMap from "@/components/DroneDeliveryMap";
import DroneTelemetryPanel from "@/components/DroneTelemetryPanel";
import DroneKitPicker, { DroneCart } from "@/components/DroneKitPicker";
import { formatDistance, haversineKm, toBnDigits } from "@/lib/campsData";
import {
  DISCLAIMER_BN,
  DISCLAIMER_EN,
  FLEET,
} from "@/lib/droneDeliveryData";
import {
  applyReroute,
  computeTelemetry,
  estimateFlight,
  formatDuration,
  normalizeDroneOrder,
  pickNearestHub,
  validateDroneOrder,
} from "@/lib/droneDeliveryEngine";

const DHAKA = { lat: 23.8103, lng: 90.4125 };

// Handoff from /chat and /prescription. Medicines and GPS never go in the URL —
// that would put clinical data in browser history and server access logs — so
// the payload rides in sessionStorage and the query string only says to look.
const HANDOFF_KEY = "amar_doctor_drone_handoff";
const PENDING_KEY = "amar_doctor_drone_pending";
const MIRROR_KEY = "amar_doctor_drone_last_order";

export default function DroneClient() {
  const params = useSearchParams();
  const deepLinkId = params.get("order");
  const handoffHint = params.get("from");

  const [lang, setLang] = useState("en");
  const bn = lang === "bn";

  const [phase, setPhase] = useState(deepLinkId ? "track" : "compose");
  const [cart, setCart] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [handoffSource, setHandoffSource] = useState(null);
  const [handoffNote, setHandoffNote] = useState(null);

  const [destination, setDestination] = useState(DHAKA);
  const [geoDenied, setGeoDenied] = useState(false);
  const [pinConfirmed, setPinConfirmed] = useState(false);

  // CampLocationPicker echoes an onChange for the value it is *given* as soon as
  // it mounts. Without remembering what we handed it, that echo would look like
  // the user confirming the Dhaka fallback they never chose — and we would fly
  // medicine to a guessed coordinate. Only a position that actually differs from
  // what we supplied counts as a confirmation.
  const suppliedPinRef = useRef(DHAKA);
  const [contactPhone, setContactPhone] = useState("");
  const [patientNote, setPatientNote] = useState("");
  const [timeScale, setTimeScale] = useState(FLEET.defaultTimeScale);

  const [order, setOrder] = useState(null);
  const [simulatedOnly, setSimulatedOnly] = useState(false);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // The client clock can be minutes off the server's. Every drone response
  // carries serverNow; we store the delta once and feed a corrected clock into
  // computeTelemetry, otherwise a drone can appear to arrive before it launched.
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const clockOffsetRef = useRef(0);
  useEffect(() => { clockOffsetRef.current = clockOffsetMs; }, [clockOffsetMs]);

  const adoptServerClock = useCallback((serverNow) => {
    const parsed = Date.parse(serverNow);
    if (Number.isFinite(parsed)) setClockOffsetMs(parsed - Date.now());
  }, []);

  /* ---- The 1 Hz clock -------------------------------------------------
     Telemetry is a pure function of the wall clock, so a 1 Hz interval
     self-corrects instantly after a tab suspension — no catch-up logic, no
     drift. The map runs its own 60fps loop for the marker; see
     components/DroneDeliveryMap.js for why these are deliberately separate. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== "track") return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const telemetry = useMemo(
    () => (order ? computeTelemetry(order, nowMs + clockOffsetMs) : null),
    [order, nowMs, clockOffsetMs]
  );

  /* ---- Geolocation -----------------------------------------------------
     Start on the Dhaka fallback so the map and the hub estimate have something
     to work with immediately, but leave `pinConfirmed` false: the fallback is
     for CENTRING ONLY, and submission stays blocked until the user's real
     position arrives or they drop a pin themselves. We will not ship medicine
     to a guessed coordinate.

     The explicit timer matters because a browser sitting on an unanswered
     permission prompt calls neither callback — without it the page would say
     "Locating you..." forever with no way forward. */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoDenied(true);
      return;
    }

    let settled = false;
    const giveUp = setTimeout(() => {
      if (!settled) {
        settled = true;
        setGeoDenied(true);
      }
    }, 11000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        suppliedPinRef.current = fix;
        setDestination(fix);
        // A real GPS fix IS a confirmed location.
        setPinConfirmed(true);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        setGeoDenied(true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => clearTimeout(giveUp);
  }, []);

  /* ---- Handoff from /chat or /prescription ----------------------------- */
  useEffect(() => {
    if (typeof window === "undefined" || !handoffHint) return;
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) return;
      // Consume immediately, so a later organic visit cannot resurrect a stale
      // medicine list.
      sessionStorage.removeItem(HANDOFF_KEY);
      const parsed = JSON.parse(raw);
      if (parsed?.v !== 1) return;
      setCart(Array.isArray(parsed.items) ? parsed.items : []);
      setUnmatched(Array.isArray(parsed.unmatched) ? parsed.unmatched : []);
      setHandoffSource(parsed.source || null);
      setHandoffNote({ en: parsed.noteEn || "", bn: parsed.noteBn || "" });
    } catch {
      /* a corrupt handoff is not worth breaking the page over */
    }
  }, [handoffHint]);

  /* ---- Deep link / reload: fetch the order ------------------------------ */
  useEffect(() => {
    if (!deepLinkId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/drone/orders/${deepLinkId}`);
        const data = await res.json();
        if (cancelled) return;
        adoptServerClock(data.serverNow);
        if (res.ok && data.order) {
          setOrder(data.order);
          setPhase("track");
          return;
        }
        throw new Error(data.error || "not found");
      } catch {
        if (cancelled) return;
        // Offline, or the record was trimmed. Fall back to the local mirror.
        try {
          const raw = localStorage.getItem(MIRROR_KEY);
          const mirrored = raw ? JSON.parse(raw) : null;
          if (mirrored?.id === deepLinkId) {
            setOrder(mirrored);
            setOfflineCopy(true);
            setPhase("track");
            return;
          }
        } catch { /* ignore */ }
        setNotice({
          kind: "error",
          en: "This delivery record is no longer available.",
          bn: "এই ডেলিভারির তথ্য আর পাওয়া যাচ্ছে না।",
        });
      }
    })();

    return () => { cancelled = true; };
  }, [deepLinkId, adoptServerClock]);

  /* ---- Flush a queued order when the network returns -------------------- */
  const flushPending = useCallback(async () => {
    if (typeof window === "undefined") return;
    let pending = null;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      pending = raw ? JSON.parse(raw) : null;
    } catch { return; }
    if (!pending) return;

    try {
      const res = await fetch("/api/drone/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const data = await res.json();
      if (!res.ok || !data.order) return;
      localStorage.removeItem(PENDING_KEY);
      adoptServerClock(data.serverNow);
      setOrder(data.order);
      setSimulatedOnly(false);
      setPhase("track");
      setNotice({
        kind: "ok",
        en: "You are back online — the queued delivery has now been dispatched.",
        bn: "আবার অনলাইনে — অপেক্ষমাণ ডেলিভারিটি এখন পাঠানো হয়েছে।",
      });
    } catch { /* still offline; try again next time */ }
  }, [adoptServerClock]);

  useEffect(() => {
    flushPending();
    window.addEventListener("online", flushPending);
    return () => window.removeEventListener("online", flushPending);
  }, [flushPending]);

  /* ---- Live re-route ---------------------------------------------------
     Watch the user's position while a delivery is in the air. applyReroute
     bends the route from the drone's exact current position, so the marker
     turns instead of teleporting; it also enforces the jitter threshold and
     the cooldown, and refuses once the drone is landing. */
  useEffect(() => {
    if (phase !== "track" || !order || telemetry?.isDelivered) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setOrder((current) => {
          if (!current) return current;
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const { order: updated, changed } = applyReroute(
            current,
            next,
            Date.now() + clockOffsetRef.current
          );
          if (!changed) return current;

          // Optimistic: the simulation is already correct locally. Persisting
          // is best-effort so an offline user still sees the right flight.
          fetch(`/api/drone/orders/${current.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reroute", destination: next }),
          }).catch(() => {});

          try { localStorage.setItem(MIRROR_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
          return updated;
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [phase, order?.id, telemetry?.isDelivered]);

  // Dev-only test hook: lets a re-route be exercised without physically moving,
  // which is otherwise impossible to verify. Never exposed in a production build.
  useEffect(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
    window.__droneSetDestination = (lat, lng) => {
      setOrder((current) => {
        if (!current) return current;
        const { order: updated, changed, reason } = applyReroute(
          current,
          { lat, lng },
          Date.now() + clockOffsetRef.current
        );
        if (!changed) {
          console.warn("[drone] reroute refused:", reason);
          return current;
        }
        fetch(`/api/drone/orders/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reroute", destination: { lat, lng } }),
        }).catch(() => {});
        return updated;
      });
    };
    return () => { delete window.__droneSetDestination; };
  }, []);

  /* ---- Derived: nearest hub for the current cart + destination ---------- */
  const hubPlan = useMemo(() => {
    if (!destination) return null;
    return pickNearestHub(destination, { requireItems: cart });
  }, [destination, cart]);

  const flightEstimate = useMemo(() => {
    if (!hubPlan?.hub) return null;
    return estimateFlight(hubPlan.distanceKm);
  }, [hubPlan]);

  const payloadG = cart.reduce((sum, l) => sum + (l.weightG || 0) * (l.qty || 1), 0);
  const canSubmit =
    cart.length > 0 &&
    !!hubPlan?.hub &&
    payloadG <= FLEET.maxPayloadG &&
    pinConfirmed &&
    !submitting;

  /* ---- Submit ----------------------------------------------------------- */
  async function submitOrder() {
    const payload = {
      source: handoffSource === "prescription" ? "prescription" : handoffSource === "ai_chat" ? "ai_chat" : "manual",
      items: cart,
      destination: {
        ...destination,
        label: "Your location",
        labelBn: "আপনার অবস্থান",
      },
      contactPhone,
      patientNote,
      timeScale,
    };

    // Validate with the very same function the server runs, so the user never
    // makes a round trip to learn something we already knew.
    const { valid, errors: fieldErrors } = validateDroneOrder(payload);
    if (!valid) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      const res = await fetch("/api/drone/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      adoptServerClock(data.serverNow);

      if (!res.ok || !data.order) {
        setNotice({
          kind: "error",
          en: data.error || "Could not dispatch this delivery.",
          bn: data.error || "ডেলিভারি পাঠানো যায়নি।",
        });
        setSubmitting(false);
        return;
      }

      try { localStorage.setItem(MIRROR_KEY, JSON.stringify(data.order)); } catch { /* ignore */ }
      setOrder(data.order);
      setSimulatedOnly(false);
      setPhase("track");
      window.history.replaceState(null, "", `/drone?order=${data.order.id}`);
    } catch {
      // Offline: /api/* bypasses the service worker, so fetch rejects outright.
      // Queue it and say so. We do NOT animate a drone that never launched —
      // the preview below is explicitly ribboned as not dispatched.
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
      setNotice({
        kind: "warn",
        en: "You are offline. Saved — we'll send this the moment you're back online.",
        bn: "আপনি অফলাইনে আছেন। সংরক্ষিত হয়েছে — অনলাইনে এলেই পাঠানো হবে।",
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Explicitly-labelled local preview of what the flight WOULD look like.
  function previewFlight() {
    const { order: preview } = normalizeDroneOrder(
      {
        source: "manual",
        items: cart,
        destination: { ...destination, label: "Your location", labelBn: "আপনার অবস্থান" },
        contactPhone,
        patientNote,
        timeScale,
      },
      { nowMs: Date.now() }
    );
    if (!preview) return;
    setOrder(preview);
    setSimulatedOnly(true);
    setPhase("track");
  }

  /* ---- Render ----------------------------------------------------------- */

  const disclaimer = (
    <div className="drn-disclaimer">
      <span>⚠️</span>
      <span>
        <strong>{bn ? "ডেমো:" : "Demo:"}</strong> {bn ? DISCLAIMER_BN : DISCLAIMER_EN}{" "}
        {bn
          ? "এটি প্রকল্পের একটি প্রদর্শনী বৈশিষ্ট্য।"
          : "This is a demonstration feature of the project."}
      </span>
    </div>
  );

  return (
    <>
      <Navbar />

      <div className="drn-page" id="drone-page">
        <div className="page-container">
        <div className="drn-header">
          <div>
            <h1 className="drn-header__title">
              🚁 {bn ? "ড্রোন ওষুধ ডেলিভারি" : "Drone Medicine Delivery"}
            </h1>
            <p className="text-body-sm text-muted" style={{ maxWidth: "60ch" }}>
              {bn
                ? "নিকটতম মেডিকেল সাপোর্ট সেন্টার থেকে জরুরি ওষুধ — আপনার সরাসরি অবস্থানে।"
                : "Essential medicines flown from the nearest medical support centre, straight to your live location."}
            </p>
          </div>

          {/* One compact button, the same control /map uses. A second segmented
              EN|বাং block here would sit directly under the navbar's own and
              read as a duplicate. */}
          <button
            className="camp-lang-toggle"
            onClick={() => setLang(bn ? "en" : "bn")}
            aria-label="Toggle page language"
          >
            {bn ? "EN" : "বাং"}
          </button>
        </div>

        <div className="drn-phase-steps">
          {[
            { id: "compose", en: "Choose medicines", bn: "ওষুধ বাছুন" },
            { id: "confirm", en: "Confirm location", bn: "অবস্থান নিশ্চিত" },
            { id: "track", en: "Track the flight", bn: "ফ্লাইট ট্র্যাক" },
          ].map((step, i, all) => {
            const order_ = all.findIndex((s) => s.id === phase);
            const state = i < order_ ? "done" : i === order_ ? "active" : "";
            return (
              <span key={step.id} style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)" }}>
                <span className={`drn-phase-step ${state ? `drn-phase-step--${state}` : ""}`}>
                  <span className="drn-phase-step__num">{bn ? toBnDigits(i + 1) : i + 1}</span>
                  {bn ? step.bn : step.en}
                </span>
                {i < all.length - 1 && <span className="drn-phase-arrow">→</span>}
              </span>
            );
          })}
        </div>

        {notice && (
          <div className={`drn-alert drn-alert--${notice.kind}`} style={{ marginBottom: "var(--spacing-16)" }}>
            <span>{notice.kind === "error" ? "⛔" : notice.kind === "warn" ? "⚠️" : "✅"}</span>
            <span>{bn ? notice.bn : notice.en}</span>
          </div>
        )}

        {handoffSource && phase !== "track" && (
          <div
            className={`drn-source-banner ${handoffSource === "prescription" ? "drn-source-banner--rx" : ""}`}
            style={{ marginBottom: "var(--spacing-16)" }}
          >
            <span className="drn-source-banner__icon">
              {handoffSource === "prescription" ? "📄" : "🤖"}
            </span>
            <span>
              <strong>
                {handoffSource === "prescription"
                  ? bn ? "আপনার স্ক্যান করা প্রেসক্রিপশন থেকে" : "From your scanned prescription"
                  : bn ? "এআই ডাক্তারের পরামর্শ থেকে" : "From your AI doctor consultation"}
              </strong>
              <br />
              {handoffNote && (bn ? handoffNote.bn : handoffNote.en)}
            </span>
          </div>
        )}

        {/* ---------------- COMPOSE ---------------- */}
        {phase === "compose" && (
          <div className="drn-layout">
            <div className="drn-sim">
              <DroneKitPicker lang={lang} cart={cart} onChange={setCart} />
            </div>

            <div className="drn-side">
              <DroneCart
                lang={lang}
                cart={cart}
                unmatched={unmatched}
                maxPayloadG={FLEET.maxPayloadG}
                onChange={setCart}
              />

              <HubCard lang={lang} hubPlan={hubPlan} flightEstimate={flightEstimate} />

              {geoDenied && !pinConfirmed && (
                <div className="drn-alert drn-alert--warn">
                  <span>📍</span>
                  <span>
                    {bn
                      ? "জিপিএস পাওয়া যায়নি — নিচের হিসাব ঢাকার কেন্দ্র ধরে। পরের ধাপে নিজের অবস্থানে পিন দিন।"
                      : "No GPS fix — the estimate below assumes central Dhaka. Drop a pin on your real location in the next step."}
                  </span>
                </div>
              )}

              {disclaimer}

              <div className="drn-actions">
                <button
                  className="btn-primary"
                  disabled={!cart.length || payloadG > FLEET.maxPayloadG}
                  onClick={() => setPhase("confirm")}
                >
                  {bn ? "পরবর্তী: অবস্থান" : "Next: confirm location"} →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- CONFIRM ---------------- */}
        {phase === "confirm" && (
          <div className="drn-layout">
            <div className="drn-sim">
              {geoDenied && !pinConfirmed && (
                <div className="drn-alert drn-alert--warn">
                  <span>📍</span>
                  <span>
                    {bn
                      ? "আপনার জিপিএস পড়া যায়নি — মানচিত্রে ট্যাপ করে সঠিক অবস্থানে পিন দিন।"
                      : "We couldn't read your GPS — tap the map to drop a pin on your exact location."}
                  </span>
                </div>
              )}

              {/* Reused verbatim from the camp organiser form: it already does
                  drag-to-set-pin with geolocation centring and knows nothing
                  about camps. */}
              <CampLocationPicker
                value={destination}
                onChange={(v) => {
                  setDestination(v);
                  // Ignore the picker's mount-time echo of the value we gave it;
                  // only a genuine tap or drag confirms the delivery point.
                  const supplied = suppliedPinRef.current;
                  const echo =
                    supplied &&
                    Math.abs(supplied.lat - v.lat) < 1e-7 &&
                    Math.abs(supplied.lng - v.lng) < 1e-7;
                  if (!echo) setPinConfirmed(true);
                }}
              />

              {errors.destination && (
                <div className="drn-field__error">{bn ? errors.destination.bn : errors.destination.en}</div>
              )}
            </div>

            <div className="drn-side">
              <DroneCart lang={lang} cart={cart} unmatched={unmatched} maxPayloadG={FLEET.maxPayloadG} />

              <HubCard lang={lang} hubPlan={hubPlan} flightEstimate={flightEstimate} />

              <div className="drn-cart">
                <div className="drn-field">
                  <label className="drn-field__label" htmlFor="drone-phone">
                    {bn ? "যোগাযোগের নম্বর (ঐচ্ছিক)" : "Contact number (optional)"}
                  </label>
                  <input
                    id="drone-phone"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                  />
                  {errors.contactPhone && (
                    <div className="drn-field__error">{bn ? errors.contactPhone.bn : errors.contactPhone.en}</div>
                  )}
                </div>

                <div className="drn-field">
                  <label className="drn-field__label" htmlFor="drone-note">
                    {bn ? "নোট (ঐচ্ছিক)" : "Landing note (optional)"}
                  </label>
                  <textarea
                    id="drone-note"
                    rows={2}
                    value={patientNote}
                    onChange={(e) => setPatientNote(e.target.value)}
                    placeholder={bn ? "যেমন: বাড়ির উঠানে" : "e.g. open courtyard behind the house"}
                  />
                </div>

                <div className="drn-field" style={{ marginBottom: 0 }}>
                  <span className="drn-field__label">
                    {bn ? "সিমুলেশন গতি" : "Simulation speed"}
                  </span>
                  <div className="drn-scale-row">
                    {FLEET.timeScaleOptions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`drn-scale-btn ${timeScale === s ? "drn-scale-btn--active" : ""}`}
                        onClick={() => setTimeScale(s)}
                      >
                        {bn ? `×${toBnDigits(s)}` : `${s}×`}
                      </button>
                    ))}
                  </div>
                  <p className="drn-item__meta">
                    {bn
                      ? "ড্রোনের গতি সবসময় বাস্তব (৬০ কিমি/ঘণ্টা) — শুধু ঘড়ি দ্রুত চলে।"
                      : "The drone's speed stays real (60 km/h) — only the clock runs faster."}
                  </p>
                </div>
              </div>

              {errors.items && (
                <div className="drn-alert drn-alert--error">
                  <span>⛔</span>
                  <span>{bn ? errors.items.bn : errors.items.en}</span>
                </div>
              )}
              {errors.payload && (
                <div className="drn-alert drn-alert--error">
                  <span>⚖️</span>
                  <span>{bn ? errors.payload.bn : errors.payload.en}</span>
                </div>
              )}

              {disclaimer}

              <div className="drn-actions">
                <button className="btn-ghost" onClick={() => setPhase("compose")}>
                  ← {bn ? "ফিরে যান" : "Back"}
                </button>
                <button className="btn-primary" disabled={!canSubmit} onClick={submitOrder}>
                  {submitting
                    ? bn ? "পাঠানো হচ্ছে..." : "Dispatching..."
                    : bn ? "🚁 ড্রোন পাঠান" : "🚁 Dispatch drone"}
                </button>
              </div>

              {!pinConfirmed && (
                <p className="drn-item__meta">
                  {bn
                    ? "পাঠানোর আগে মানচিত্রে আপনার অবস্থান নিশ্চিত করুন।"
                    : "Confirm your location on the map before dispatching."}
                </p>
              )}

              {/* Only offered once an order is actually queued offline. */}
              {notice?.kind === "warn" && (
                <div className="drn-actions">
                  <button className="btn-ghost" onClick={previewFlight}>
                    {bn ? "ফ্লাইট প্ল্যান দেখুন (পাঠানো হয়নি)" : "Preview flight plan (not dispatched)"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- TRACK ---------------- */}
        {phase === "track" && order && (
          <>
            {simulatedOnly && (
              <div className="drn-alert drn-alert--warn" style={{ marginBottom: "var(--spacing-16)" }}>
                <span>⚠️</span>
                <span>
                  {bn
                    ? "এটি শুধু ফ্লাইট প্ল্যানের পূর্বরূপ — কোনো অর্ডার পাঠানো হয়নি। অনলাইনে এলে স্বয়ংক্রিয়ভাবে পাঠানো হবে।"
                    : "This is a flight-plan preview only — no order has been dispatched. It will be sent automatically when you are back online."}
                </span>
              </div>
            )}

            {offlineCopy && (
              <div style={{ marginBottom: "var(--spacing-16)" }}>
                <span className="drn-offline-chip">
                  📴 {bn ? "অফলাইন কপি" : "Offline copy"}
                </span>
              </div>
            )}

            <div className="drn-layout">
              <div className="drn-sim">
                <DroneDeliveryMap
                  order={order}
                  telemetry={telemetry}
                  clockOffsetMs={clockOffsetMs}
                  lang={lang}
                  simulatedOnly={simulatedOnly}
                />

                <div className="drn-cart">
                  <div className="drn-hub-card__label">
                    {bn ? "সাপোর্ট সেন্টার" : "Dispatched from"}
                  </div>
                  <div className="drn-hub-card__name">
                    {bn ? order.hub.nameBn : order.hub.name}
                  </div>
                  <div className="drn-item__meta">
                    {formatDistance(haversineKm(order.hub, order.destination), lang)}{" "}
                    {bn ? "দূরে · " : "away · "}
                    <a href={`tel:${order.hub.phone}`} style={{ color: "var(--color-spectral-cyan)" }}>
                      {order.hub.phone}
                    </a>
                  </div>

                  {(order.events || []).slice(-3).reverse().map((e, i) => (
                    <p className="drn-item__meta" key={`${e.at}-${i}`} style={{ marginTop: "var(--spacing-8)" }}>
                      • {bn ? e.messageBn : e.messageEn}
                    </p>
                  ))}
                </div>
              </div>

              <div className="drn-side">
                <DroneTelemetryPanel order={order} telemetry={telemetry} lang={lang} />

                <DroneCart lang={lang} cart={order.items} maxPayloadG={FLEET.maxPayloadG} />

                {disclaimer}

                <div className="drn-actions">
                  <Link href="/drone" className="btn-ghost">
                    {bn ? "নতুন ডেলিভারি" : "New delivery"}
                  </Link>
                  <Link href="/map" className="btn-ghost">
                    {bn ? "কাছের ক্যাম্প" : "Nearby camps"}
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}

        {phase === "track" && !order && !notice && (
          <p className="text-body text-muted">{bn ? "লোড হচ্ছে..." : "Loading delivery..."}</p>
        )}
        </div>
      </div>

      <Footer />
      <SOSButton />
    </>
  );
}

/* --------------------------------------------------------------------------
   Nearest support centre, with a real explanation when nothing can serve.
   -------------------------------------------------------------------------- */
function HubCard({ lang, hubPlan, flightEstimate }) {
  const bn = lang === "bn";

  if (!hubPlan) {
    return (
      <div className="drn-hub-card">
        <div className="drn-hub-card__label">{bn ? "নিকটতম সাপোর্ট সেন্টার" : "Nearest support centre"}</div>
        <p className="text-body-sm text-muted">{bn ? "অবস্থান নির্ণয় হচ্ছে..." : "Locating you..."}</p>
      </div>
    );
  }

  // Out of range or nothing in stock: name the nearest hub anyway, give its
  // distance and the shortfall, and offer a phone number. A blank "unavailable"
  // helps nobody in a rural emergency.
  if (!hubPlan.hub) {
    const near = hubPlan.nearest;
    return (
      <div className="drn-hub-card drn-hub-card--unreachable">
        <div className="drn-hub-card__label">{bn ? "পরিষেবার বাইরে" : "Outside service range"}</div>
        {near ? (
          <>
            <div className="drn-hub-card__name">{bn ? near.hub.nameBn : near.hub.name}</div>
            <p className="text-body-sm text-muted" style={{ marginTop: "var(--spacing-8)" }}>
              {hubPlan.reason === "no_stock"
                ? bn
                  ? "কোনো হাবে এই অর্ডারের সব জিনিস মজুত নেই।"
                  : "No hub currently stocks every item in this order."
                : bn
                  ? `${formatDistance(near.distanceKm, lang)} দূরে — আমাদের ${toBnDigits(FLEET.maxOneWayKm)} কিমি সীমার চেয়ে ${formatDistance(near.shortfallKm, lang)} বেশি।`
                  : `${formatDistance(near.distanceKm, lang)} away — ${formatDistance(near.shortfallKm, lang)} beyond our ${FLEET.maxOneWayKm} km range.`}
            </p>
            <div className="drn-actions">
              <a className="btn-ghost" href={`tel:${near.hub.phone}`}>
                📞 {bn ? "হাবে ফোন করুন" : "Call the hub"}
              </a>
              <Link className="btn-ghost" href="/map">
                {bn ? "কাছের ক্যাম্প দেখুন" : "Find a nearby camp"}
              </Link>
            </div>
          </>
        ) : (
          <p className="text-body-sm text-muted">
            {bn ? "এই মুহূর্তে কোনো হাব সক্রিয় নেই।" : "No hub is active right now."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="drn-hub-card">
      <div className="drn-hub-card__label">{bn ? "নিকটতম সাপোর্ট সেন্টার" : "Nearest support centre"}</div>
      <div className="drn-hub-card__name">{bn ? hubPlan.hub.nameBn : hubPlan.hub.name}</div>

      <div className="drn-hub-card__facts">
        <div className="drn-hub-card__fact">
          {bn ? "দূরত্ব" : "Distance"}
          <strong>{formatDistance(hubPlan.distanceKm, lang)}</strong>
        </div>
        <div className="drn-hub-card__fact">
          {bn ? "মোট ফ্লাইট সময়" : "Total flight time"}
          <strong>{flightEstimate ? formatDuration(flightEstimate.totalS, lang) : "—"}</strong>
        </div>
        <div className="drn-hub-card__fact">
          {bn ? "ড্রোন প্রস্তুত" : "Drones ready"}
          <strong>{bn ? toBnDigits(hubPlan.hub.dronesAvailable) : hubPlan.hub.dronesAvailable}</strong>
        </div>
      </div>
    </div>
  );
}

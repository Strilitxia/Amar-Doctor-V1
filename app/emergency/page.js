"use client";

import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  getStoredEmergencies,
  updateEmergencyStatus,
  subscribeToEmergencies,
  broadcastSOS,
} from "@/lib/emergencyBroadcaster";

export default function EmergencyDashboard() {
  const [emergencies, setEmergencies] = useState([]);
  const [activeEmergency, setActiveEmergency] = useState(null);
  const [sirenActive, setSirenActive] = useState(false);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const audioContextRef = useRef(null);
  const sirenOscillatorRef = useRef(null);

  useEffect(() => {
    setEmergencies(getStoredEmergencies());
    const initialList = getStoredEmergencies();
    if (initialList.length > 0) {
      setActiveEmergency(initialList[0]);
    }

    const unsubscribe = subscribeToEmergencies(() => {
      const refreshed = getStoredEmergencies();
      setEmergencies(refreshed);
    });

    return () => {
      unsubscribe();
      stopSiren();
    };
  }, []);

  const playSiren = () => {
    try {
      if (sirenActive) {
        stopSiren();
        return;
      }

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(600, ctx.currentTime);

      // Create a siren wobble
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 1.5; // 1.5 Hz wobble
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 300; // Swing between 300Hz and 900Hz

      lfo.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);

      lfo.start();
      osc.start();

      sirenOscillatorRef.current = { osc, lfo, ctx };
      setSirenActive(true);
    } catch (e) {
      console.warn("Audio siren error:", e);
    }
  };

  const stopSiren = () => {
    if (sirenOscillatorRef.current) {
      try {
        sirenOscillatorRef.current.osc.stop();
        sirenOscillatorRef.current.lfo.stop();
        sirenOscillatorRef.current.ctx.close();
      } catch (e) {
        console.warn("Stop siren error:", e);
      }
      sirenOscillatorRef.current = null;
    }
    setSirenActive(false);
  };

  const handleStatusChange = (id, newStatus) => {
    const updated = updateEmergencyStatus(id, newStatus);
    setEmergencies(updated);
    if (activeEmergency?.id === id) {
      setActiveEmergency(updated.find((e) => e.id === id) || null);
    }
  };

  const handleSimulateAlert = () => {
    const testCases = [
      {
        patientName: "Mizanur Rahman",
        patientPhone: "+880 1712-445566",
        locationName: "Dhamrai Rural Union, Dhaka",
        lat: 23.9167,
        lng: 90.2167,
        severity: "CRITICAL",
        category: "Cardiovascular / Acute Chest Pain",
        notes: "Patient collapsed, difficulty breathing. Immediate oxygen needed."
      },
      {
        patientName: "Fatema Khatun",
        patientPhone: "+880 1819-112233",
        locationName: "Shibpur, Narsingdi",
        lat: 24.0333,
        lng: 90.7333,
        severity: "HIGH",
        category: "Thermal Burn Emergency (Hot Cooking Oil)",
        notes: "Second degree burns on arms and chest. Cooling applied on site."
      }
    ];

    const pick = testCases[Math.floor(Math.random() * testCases.length)];
    const created = broadcastSOS(pick);
    setEmergencies(getStoredEmergencies());
    setActiveEmergency(created);
  };

  const filteredEmergencies = emergencies.filter((e) => {
    if (filterStatus === "ALL") return true;
    return e.status === filterStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case "PENDING":
        return <span className="badge" style={{ background: "rgba(255, 71, 87, 0.2)", color: "var(--color-sos-red)", border: "1px solid var(--color-sos-red)" }}>● PENDING DISPATCH</span>;
      case "DISPATCHED":
        return <span className="badge" style={{ background: "rgba(255, 177, 66, 0.2)", color: "#ffb142", border: "1px solid #ffb142" }}>🚑 DISPATCHED</span>;
      case "EN_ROUTE":
        return <span className="badge badge-cyan">⚡ EN ROUTE</span>;
      case "RESOLVED":
        return <span className="badge" style={{ background: "rgba(52, 237, 123, 0.2)", color: "#34ed7b", border: "1px solid #34ed7b" }}>✓ RESOLVED</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  return (
    <>
      <Navbar />
      <div className="prescription-page" id="emergency-dashboard" style={{ paddingBottom: 80 }}>
        <div className="page-container">
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20, marginBottom: 32 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span className="badge" style={{ background: "var(--color-sos-red)", color: "var(--color-bone-white)", fontWeight: 700 }}>
                  🚨 LIVE DISPATCH
                </span>
                <span className="text-caption text-muted">
                  Supabase Realtime & Geolocation Command Center
                </span>
              </div>
              <h1 className="text-heading" style={{ margin: 0 }}>
                Emergency <span style={{ color: "var(--color-sos-red)" }}>SOS Command Center</span>
              </h1>
            </div>

            {/* Quick Action Controls */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className={`btn-ghost ${sirenActive ? "active" : ""}`}
                onClick={playSiren}
                style={{
                  borderColor: sirenActive ? "var(--color-sos-red)" : undefined,
                  color: sirenActive ? "var(--color-sos-red)" : undefined,
                }}
                id="toggle-siren-btn"
              >
                {sirenActive ? "🚨 Stop Audio Siren" : "🔊 Test Siren Audio"}
              </button>
              <button
                className="btn-primary"
                onClick={handleSimulateAlert}
                id="simulate-sos-btn"
              >
                ➕ Simulate Incoming SOS
              </button>
            </div>
          </div>

          {/* Metrics Row */}
          <div className="grid-4" style={{ marginBottom: 32 }}>
            <div className="card" style={{ padding: 20, textAlign: "center", borderColor: "rgba(255, 71, 87, 0.4)" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "var(--color-sos-red)" }}>
                {emergencies.filter((e) => e.status === "PENDING").length}
              </div>
              <div className="text-caption text-muted" style={{ marginTop: 4 }}>
                Unassigned / Pending SOS
              </div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#ffb142" }}>
                {emergencies.filter((e) => e.status === "DISPATCHED" || e.status === "EN_ROUTE").length}
              </div>
              <div className="text-caption text-muted" style={{ marginTop: 4 }}>
                Ambulances Active
              </div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "#34ed7b" }}>
                {emergencies.filter((e) => e.status === "RESOLVED").length}
              </div>
              <div className="text-caption text-muted" style={{ marginTop: 4 }}>
                Patients Resolved
              </div>
            </div>
            <div className="card" style={{ padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: "var(--color-spectral-cyan)" }}>
                &lt; 9 min
              </div>
              <div className="text-caption text-muted" style={{ marginTop: 4 }}>
                Avg Rural Response Time
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="tab-pills" style={{ marginBottom: 24 }}>
            {["ALL", "PENDING", "DISPATCHED", "EN_ROUTE", "RESOLVED"].map((st) => (
              <button
                key={st}
                className={`tab-pill ${filterStatus === st ? "active" : ""}`}
                onClick={() => setFilterStatus(st)}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Main Dispatch Queue & Detail Panel */}
          <div className="grid-3" style={{ gap: 24, alignItems: "start" }}>
            {/* Left Emergency List */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="text-caption text-muted" style={{ fontWeight: 600, textTransform: "uppercase" }}>
                Active Queue ({filteredEmergencies.length})
              </div>

              {filteredEmergencies.map((item) => {
                const isSelected = activeEmergency?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`card ${isSelected ? "card-featured" : ""}`}
                    onClick={() => setActiveEmergency(item)}
                    style={{
                      padding: 16,
                      cursor: "pointer",
                      borderColor: isSelected ? "var(--color-spectral-cyan)" : undefined,
                      background: isSelected ? "rgba(106, 228, 255, 0.06)" : undefined,
                    }}
                    id={`emergency-card-${item.id}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-body-sm)", color: "var(--color-bone-white)" }}>
                        {item.id}
                      </span>
                      {getStatusBadge(item.status)}
                    </div>
                    <div style={{ fontSize: "var(--text-body-sm)", fontWeight: 600, color: "var(--color-spectral-cyan)", marginBottom: 4 }}>
                      {item.category}
                    </div>
                    <div style={{ fontSize: "var(--text-caption)", color: "var(--color-fog-gray)" }}>
                      📍 {item.locationName}
                    </div>
                    <div suppressHydrationWarning style={{ fontSize: 11, color: "var(--color-fog-gray)", marginTop: 6, opacity: 0.7 }}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                  </div>
                );
              })}

              {filteredEmergencies.length === 0 && (
                <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--color-fog-gray)" }}>
                  No emergency tickets in this status.
                </div>
              )}
            </div>

            {/* Right: Active Ticket Details (Span 2) */}
            <div style={{ gridColumn: "span 2" }}>
              {activeEmergency ? (
                <div className="card card-featured" style={{ padding: 32 }}>
                  {/* Header info */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, borderBottom: "1px solid rgba(0,0,0,0.4)", paddingBottom: 20, marginBottom: 24 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                        <h2 className="text-heading-sm" style={{ margin: 0 }}>
                          {activeEmergency.id}
                        </h2>
                        {getStatusBadge(activeEmergency.status)}
                      </div>
                      <p className="text-body" style={{ color: "var(--color-spectral-cyan)", fontWeight: 600 }}>
                        {activeEmergency.category}
                      </p>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div className="text-caption text-muted">Alert Received</div>
                      <div style={{ fontSize: "var(--text-body-sm)", fontWeight: 600 }}>
                        {new Date(activeEmergency.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Patient & Geolocation Grid */}
                  <div className="grid-2" style={{ gap: 20, marginBottom: 28 }}>
                    <div style={{ background: "var(--color-abyss-navy)", padding: 18, borderRadius: "var(--radius-cards)", border: "1px solid var(--color-carbon-black)" }}>
                      <div className="text-caption text-muted" style={{ fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>
                        Patient Details
                      </div>
                      <div style={{ fontSize: "var(--text-body)", fontWeight: 600, marginBottom: 4 }}>
                        👤 {activeEmergency.patientName}
                      </div>
                      <div style={{ fontSize: "var(--text-body-sm)", color: "var(--color-spectral-cyan)", marginBottom: 8 }}>
                        📞 {activeEmergency.patientPhone}
                      </div>
                      <div className="text-caption text-muted">
                        Priority Level: <span style={{ color: "var(--color-sos-red)", fontWeight: 700 }}>{activeEmergency.severity}</span>
                      </div>
                    </div>

                    <div style={{ background: "var(--color-abyss-navy)", padding: 18, borderRadius: "var(--radius-cards)", border: "1px solid var(--color-carbon-black)" }}>
                      <div className="text-caption text-muted" style={{ fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>
                        GPS Geolocation
                      </div>
                      <div style={{ fontSize: "var(--text-body-sm)", fontWeight: 600, marginBottom: 4 }}>
                        📍 {activeEmergency.locationName}
                      </div>
                      <div className="font-source" style={{ fontSize: "var(--text-caption)", color: "var(--color-spectral-cyan)", marginBottom: 8 }}>
                        Lat: {activeEmergency.lat}, Lng: {activeEmergency.lng}
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${activeEmergency.lat},${activeEmergency.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost"
                        style={{ fontSize: 11, padding: "4px 12px", display: "inline-flex" }}
                      >
                        Open in Google Maps ↗
                      </a>
                    </div>
                  </div>

                  {/* Dispatch Unit Info */}
                  <div style={{ background: "var(--color-tide-card)", border: "1px solid rgba(106, 228, 255, 0.2)", borderRadius: "var(--radius-cards)", padding: 20, marginBottom: 28 }}>
                    <div className="text-caption text-cyan" style={{ fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                      Assigned Emergency Response Unit
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: "var(--text-body)", fontWeight: 600 }}>
                          🚑 {activeEmergency.ambulanceUnit}
                        </div>
                        <div className="text-caption text-muted" style={{ marginTop: 2 }}>
                          {activeEmergency.notes}
                        </div>
                      </div>
                      {activeEmergency.status !== "RESOLVED" && (
                        <div className="badge badge-gradient" style={{ fontSize: 13, padding: "6px 14px" }}>
                          Est. ETA: ~{activeEmergency.etaMinutes} mins
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dispatch Workflow Actions */}
                  <div>
                    <div className="text-caption text-muted" style={{ fontWeight: 600, marginBottom: 12, textTransform: "uppercase" }}>
                      Update Dispatch Status
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <button
                        className="btn-ghost"
                        style={{
                          borderColor: activeEmergency.status === "DISPATCHED" ? "#ffb142" : undefined,
                          color: activeEmergency.status === "DISPATCHED" ? "#ffb142" : undefined,
                        }}
                        onClick={() => handleStatusChange(activeEmergency.id, "DISPATCHED", "Ambulance Unit Sadar #4")}
                      >
                        1. 🚑 Dispatch Ambulance
                      </button>

                      <button
                        className="btn-ghost"
                        style={{
                          borderColor: activeEmergency.status === "EN_ROUTE" ? "var(--color-spectral-cyan)" : undefined,
                          color: activeEmergency.status === "EN_ROUTE" ? "var(--color-spectral-cyan)" : undefined,
                        }}
                        onClick={() => handleStatusChange(activeEmergency.id, "EN_ROUTE")}
                      >
                        2. ⚡ First Responder En Route
                      </button>

                      <button
                        className="btn-primary"
                        style={{
                          backgroundColor: "#34ed7b",
                          color: "#000",
                        }}
                        onClick={() => handleStatusChange(activeEmergency.id, "RESOLVED")}
                      >
                        3. ✓ Mark Patient Resolved
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--color-fog-gray)" }}>
                  Select an emergency alert from the queue to view telemetry and dispatch controls.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

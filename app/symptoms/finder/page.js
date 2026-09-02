"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SOSButton from "@/components/SOSButton";
import Link from "next/link";
import {
  BODY_AREAS,
  PRIMARY_SYMPTOMS_BY_AREA,
  DURATIONS,
  SEVERITIES,
  evaluateSymptomFinder,
} from "@/lib/symptomFinderEngine";

export default function FastSymptomFinderPage() {
  const [step, setStep] = useState(1);
  const [selectedBodyArea, setSelectedBodyArea] = useState("general");
  const [selectedPrimarySymptom, setSelectedPrimarySymptom] = useState("dengue_high_fever");
  const [selectedDuration, setSelectedDuration] = useState("1_to_3_days");
  const [selectedSeverity, setSelectedSeverity] = useState("moderate");
  const [result, setResult] = useState(null);
  const [speaking, setSpeaking] = useState(false);

  const availableSymptoms = PRIMARY_SYMPTOMS_BY_AREA[selectedBodyArea] || [];

  const handleEvaluate = () => {
    const evalData = evaluateSymptomFinder({
      bodyArea: selectedBodyArea,
      primarySymptom: selectedPrimarySymptom,
      duration: selectedDuration,
      severity: selectedSeverity,
    });
    setResult(evalData);
    setStep(5); // Results step
  };

  const speakResult = (text) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.lang = "bn-BD";
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <>
      <Navbar />
      <div className="symptoms-finder-page" style={{ paddingBottom: 80, paddingTop: 30 }}>
        <div className="page-container" style={{ maxWidth: 860 }}>
          {/* Header */}
          <div className="text-center" style={{ marginBottom: 36 }}>
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span className="badge badge-gradient">⚡ 100% Offline Fast Triage Engine</span>
              <span className="badge badge-cyan">বাংলা ও English</span>
            </div>
            <h1 className="text-heading-lg" style={{ marginBottom: 10 }}>
              Offline <span className="text-cyan">Fast Symptom Finder</span>
            </h1>
            <p className="text-body text-muted" style={{ maxWidth: 620, margin: "0 auto" }}>
              জরুরি ধাপভিত্তিক লক্ষণ নিরূপণ — Step-by-step guided dropdown triage to evaluate emergency risks with zero internet connection.
            </p>
          </div>

          {/* Wizard Card Container */}
          <div className="card card-featured" style={{ padding: "32px 36px" }}>
            {/* Step Progress Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32, gap: 8, position: "relative" }}>
              {[1, 2, 3, 4, 5].map((num) => (
                <div
                  key={num}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "8px 0",
                    borderRadius: "var(--radius-badges)",
                    background: step === num ? "var(--color-spectral-cyan)" : step > num ? "rgba(106, 228, 255, 0.2)" : "var(--color-abyss-navy)",
                    color: step === num ? "var(--color-carbon-black)" : "var(--color-bone-white)",
                    fontWeight: 700,
                    fontSize: 13,
                    transition: "all 0.3s ease",
                  }}
                >
                  Step {num} {num === 5 ? "(Result)" : ""}
                </div>
              ))}
            </div>

            {/* STEP 1: Body Area */}
            {step === 1 && (
              <div>
                <h2 className="text-heading-sm" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📍 Step 1:</span> আপনার শারীরিক সমস্যা কোন অংশে? (Select Body Area)
                </h2>
                <p className="text-caption text-muted" style={{ marginBottom: 20 }}>
                  Select the primary area of your body where discomfort is felt:
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                  {BODY_AREAS.map((area) => (
                    <div
                      key={area.id}
                      onClick={() => {
                        setSelectedBodyArea(area.id);
                        const firstSymp = PRIMARY_SYMPTOMS_BY_AREA[area.id]?.[0]?.id || "";
                        setSelectedPrimarySymptom(firstSymp);
                      }}
                      style={{
                        padding: "16px 20px",
                        borderRadius: "var(--radius-cards)",
                        background: selectedBodyArea === area.id ? "rgba(106, 228, 255, 0.12)" : "var(--color-abyss-navy)",
                        border: selectedBodyArea === area.id ? "2px solid var(--color-spectral-cyan)" : "1px solid var(--color-carbon-black)",
                        cursor: "pointer",
                        fontWeight: 600,
                        color: "var(--color-bone-white)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>{area.nameBn}</span>
                      {selectedBodyArea === area.id && <span style={{ color: "var(--color-spectral-cyan)" }}>✓ Selected</span>}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button className="btn-primary" onClick={() => setStep(2)}>
                    Next Step (পরবর্তী ধাপ) →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Primary Symptom Dropdown */}
            {step === 2 && (
              <div>
                <h2 className="text-heading-sm" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🔍 Step 2:</span> প্রধান লক্ষণ কী? (Select Primary Symptom)
                </h2>
                <p className="text-caption text-muted" style={{ marginBottom: 20 }}>
                  Select the symptom from the dropdown list below:
                </p>

                <div style={{ marginBottom: 28 }}>
                  <label className="text-body-sm" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                    মূল লক্ষণ (Primary Symptom):
                  </label>
                  <select
                    value={selectedPrimarySymptom}
                    onChange={(e) => setSelectedPrimarySymptom(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "14px 18px",
                      borderRadius: "var(--radius-cards)",
                      background: "var(--color-abyss-navy)",
                      border: "1px solid var(--color-spectral-cyan)",
                      color: "var(--color-bone-white)",
                      fontSize: 15,
                    }}
                  >
                    {availableSymptoms.map((symp) => (
                      <option key={symp.id} value={symp.id}>
                        {symp.labelBn}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button className="btn-ghost" onClick={() => setStep(1)}>
                    ← Back
                  </button>
                  <button className="btn-primary" onClick={() => setStep(3)}>
                    Next Step (পরবর্তী ধাপ) →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Duration Dropdown */}
            {step === 3 && (
              <div>
                <h2 className="text-heading-sm" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>⏱️ Step 3:</span> লক্ষণ কতদিন যাবত শুরু হয়েছে? (Duration)
                </h2>
                <p className="text-caption text-muted" style={{ marginBottom: 20 }}>
                  Select how long the symptom has been present:
                </p>

                <div style={{ marginBottom: 28 }}>
                  <label className="text-body-sm" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                    সময়সীমা (Duration):
                  </label>
                  <select
                    value={selectedDuration}
                    onChange={(e) => setSelectedDuration(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "14px 18px",
                      borderRadius: "var(--radius-cards)",
                      background: "var(--color-abyss-navy)",
                      border: "1px solid var(--color-spectral-cyan)",
                      color: "var(--color-bone-white)",
                      fontSize: 15,
                    }}
                  >
                    {DURATIONS.map((dur) => (
                      <option key={dur.id} value={dur.id}>
                        {dur.labelBn}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button className="btn-ghost" onClick={() => setStep(2)}>
                    ← Back
                  </button>
                  <button className="btn-primary" onClick={() => setStep(4)}>
                    Next Step (পরবর্তী ধাপ) →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: Severity Dropdown & Evaluate */}
            {step === 4 && (
              <div>
                <h2 className="text-heading-sm" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>⚠️ Step 4:</span> কষ্টের মাত্রা কেমন? (Severity Level)
                </h2>
                <p className="text-caption text-muted" style={{ marginBottom: 20 }}>
                  Indicate how severe the discomfort feels right now:
                </p>

                <div style={{ marginBottom: 28 }}>
                  <label className="text-body-sm" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
                    কষ্টের তীব্রতা (Severity):
                  </label>
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "14px 18px",
                      borderRadius: "var(--radius-cards)",
                      background: "var(--color-abyss-navy)",
                      border: "1px solid var(--color-spectral-cyan)",
                      color: "var(--color-bone-white)",
                      fontSize: 15,
                    }}
                  >
                    {SEVERITIES.map((sev) => (
                      <option key={sev.id} value={sev.id}>
                        {sev.labelBn}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button className="btn-ghost" onClick={() => setStep(3)}>
                    ← Back
                  </button>
                  <button className="btn-primary" onClick={handleEvaluate} style={{ padding: "12px 28px", fontSize: 16 }}>
                    ⚡ Evaluate Now (লক্ষণ নিরূপণ করুন)
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: Results Display */}
            {step === 5 && result && (
              <div>
                {/* Emergency Alert Banner (RED / YELLOW / GREEN) */}
                <div
                  style={{
                    padding: "20px 24px",
                    borderRadius: "var(--radius-cards)",
                    marginBottom: 24,
                    background:
                      result.calculatedEmergencyLevel === "RED"
                        ? "rgba(255, 71, 87, 0.15)"
                        : result.calculatedEmergencyLevel === "YELLOW"
                        ? "rgba(255, 171, 0, 0.15)"
                        : "rgba(52, 237, 123, 0.15)",
                    border:
                      result.calculatedEmergencyLevel === "RED"
                        ? "2px solid var(--color-sos-red)"
                        : result.calculatedEmergencyLevel === "YELLOW"
                        ? "2px solid #ffab00"
                        : "2px solid #34ed7b",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color:
                          result.calculatedEmergencyLevel === "RED"
                            ? "var(--color-sos-red)"
                            : result.calculatedEmergencyLevel === "YELLOW"
                            ? "#ffab00"
                            : "#34ed7b",
                      }}
                    >
                      {result.titleBn}
                    </span>
                    <button
                      className="btn-ghost"
                      onClick={() =>
                        speakResult(result.urgencyTextBn + ". " + result.recommendationsBn.join(" "))
                      }
                      style={{ padding: "4px 12px", fontSize: 12 }}
                    >
                      {speaking ? "⏹️ Stop" : "🔊 Listen"}
                    </button>
                  </div>

                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-bone-white)", marginBottom: 4 }}>
                    {result.urgencyTextBn}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--color-fog-gray)" }}>{result.urgencyTextEn}</p>
                </div>

                {/* Recommendations & First Aid */}
                <div style={{ marginBottom: 28 }}>
                  <h3 className="text-body-sm" style={{ fontWeight: 700, color: "var(--color-spectral-cyan)", marginBottom: 12 }}>
                    🩺 জরুরি প্রাথমিক করণীয় (Action Protocol):
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {result.recommendationsBn.map((rec, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "var(--color-abyss-navy)",
                          padding: "14px 18px",
                          borderRadius: "var(--radius-cards)",
                          border: "1px solid var(--color-carbon-black)",
                          fontSize: 14,
                          lineHeight: 1.5,
                          color: "var(--color-bone-white)",
                        }}
                      >
                        {rec}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Links */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
                  <button className="btn-ghost" onClick={() => setStep(1)}>
                    🔄 Start New Search
                  </button>

                  <div style={{ display: "flex", gap: 10 }}>
                    <Link href="/symptoms" className="btn-ghost">
                      📖 View Full Medical Guide
                    </Link>
                    <Link href="/chat" className="btn-primary">
                      💬 Consult AI Doctor
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
      <SOSButton />
    </>
  );
}

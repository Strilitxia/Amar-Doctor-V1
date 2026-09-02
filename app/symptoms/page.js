"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SOSButton from "@/components/SOSButton";
import Link from "next/link";
import { OFFLINE_CONDITIONS, initOfflineDb, getOfflineConditions, searchByKeywords } from "@/lib/offlineMedicalDb";

const CATEGORIES = ["All", "Emergency", "Infectious Disease", "Pediatric", "Cardiovascular", "Trauma", "Gastrointestinal"];

export default function SymptomsPage() {
  const [conditions, setConditions] = useState(OFFLINE_CONDITIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [activeCondition, setActiveCondition] = useState(OFFLINE_CONDITIONS[0]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    // Initialize IndexedDB cache
    initOfflineDb().then(() => {
      getOfflineConditions().then((data) => {
        if (data && data.length > 0) setConditions(data);
      });
    });

    const updateOnlineStatus = () => {
      setIsOfflineMode(!navigator.onLine);
    };

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const matches = searchByKeywords(searchQuery);
      setSearchResults(matches);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const filteredConditions = conditions.filter((c) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesCategory = selectedCategory === "All" || c.category === selectedCategory;
    const matchesSearch =
      !query ||
      c.titleEn.toLowerCase().includes(query) ||
      c.titleBn.includes(query) ||
      c.symptoms.some((s) => s.toLowerCase().includes(query)) ||
      c.firstAidEn.some((f) => f.toLowerCase().includes(query)) ||
      c.firstAidBn.some((f) => f.includes(query));

    return matchesCategory && matchesSearch;
  });

  const speakText = (text) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <>
      <Navbar />
      <div className="prescription-page" id="symptoms-page" style={{ paddingBottom: 80 }}>
        <div className="page-container">
          {/* Header */}
          <div className="text-center" style={{ marginBottom: 40 }}>
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
              <span className="badge badge-gradient">
                📶 100% Offline Capable & PWA
              </span>
              {isOfflineMode && (
                <span className="badge badge-cyan" style={{ background: "rgba(255, 71, 87, 0.2)", borderColor: "var(--color-sos-red)", color: "var(--color-sos-red)" }}>
                  ● Currently Offline (অফলাইন মোড)
                </span>
              )}
            </div>

            <h1 className="text-heading-lg" style={{ marginBottom: 12 }}>
              Offline <span className="text-cyan">Symptom Checker</span> & First-Aid
            </h1>
            <p className="text-body text-muted" style={{ maxWidth: 640, margin: "0 auto", marginBottom: 20 }}>
              জরুরি প্রাথমিক চিকিৎসা ও লক্ষণ নির্দেশিকা — Complete emergency protocols cached on your device. Works seamlessly in remote villages with zero internet.
            </p>

            {/* Offline Fast Symptom Finder Callout Banner */}
            <div style={{ display: "inline-block" }}>
              <Link href="/symptoms/finder" className="btn-primary" style={{ padding: "12px 28px", fontSize: 15, textDecoration: "none" }}>
                ⚡ Open Fast Symptom Finder (ধাপভিত্তিক লক্ষণ নিরূপণ) →
              </Link>
            </div>
          </div>

          {/* Search & Category Tabs */}
          <div className="card" style={{ marginBottom: 32, padding: "20px 24px" }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <input
                  type="text"
                  className="chat-input"
                  style={{ width: "100%", borderRadius: "var(--radius-badges)", padding: "12px 20px" }}
                  placeholder="🔍 Describe symptoms or keywords: জ্বর, সাপের কামড়, dengue, diarrhea, burn, cough..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  id="symptom-search-input"
                />
              </div>
            </div>

            {/* Keyword Compare Search Engine Results Banner */}
            {searchResults.length > 0 && (
              <div style={{ background: "rgba(106, 228, 255, 0.08)", border: "1px solid var(--color-spectral-cyan)", borderRadius: "var(--radius-cards)", padding: "16px 20px", marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: "var(--color-spectral-cyan)", marginBottom: 8, fontSize: 14 }}>
                  ⚡ Probable Matching Situations (শব্দ মেলানো সম্ভাব্য পরিস্থিতি):
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {searchResults.map((res, idx) => (
                    <div
                      key={idx}
                      onClick={() => setActiveCondition(res.condition)}
                      style={{
                        padding: "8px 12px",
                        background: "var(--color-abyss-navy)",
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-bone-white)" }}>
                        {res.condition.icon} {res.condition.titleBn} ({res.condition.titleEn})
                      </span>
                      <span className="badge badge-cyan" style={{ fontSize: 10 }}>
                        {res.confidence}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Filter Pills */}
            <div className="tab-pills">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  className={`tab-pill ${selectedCategory === cat ? "active" : ""}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Master Detail View */}
          <div className="grid-3" style={{ gap: 24, alignItems: "start" }}>
            {/* Left List of Conditions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="text-caption text-muted" style={{ fontWeight: 600, textTransform: "uppercase", paddingLeft: 4 }}>
                Conditions Found ({filteredConditions.length})
              </div>

              {filteredConditions.map((item) => {
                const isSelected = activeCondition?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`card ${isSelected ? "card-featured" : ""}`}
                    onClick={() => setActiveCondition(item)}
                    style={{
                      padding: 16,
                      cursor: "pointer",
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      borderColor: isSelected ? "var(--color-spectral-cyan)" : undefined,
                      background: isSelected ? "rgba(106, 228, 255, 0.06)" : undefined,
                    }}
                    id={`condition-item-${item.id}`}
                  >
                    <div style={{ fontSize: 32, flexShrink: 0 }}>{item.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: "var(--text-body-sm)", color: "var(--color-bone-white)" }}>
                          {item.titleBn}
                        </span>
                      </div>
                      <div style={{ fontSize: "var(--text-caption)", color: "var(--color-fog-gray)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.titleEn}
                      </div>
                    </div>
                    {item.severity === "critical" && (
                      <span className="badge" style={{ background: "rgba(255, 71, 87, 0.15)", color: "var(--color-sos-red)", border: "1px solid rgba(255, 71, 87, 0.4)", fontSize: 10, padding: "2px 8px" }}>
                        EMERGENCY
                      </span>
                    )}
                  </div>
                );
              })}

              {filteredConditions.length === 0 && (
                <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--color-fog-gray)" }}>
                  কোনো তথ্য পাওয়া যায়নি। No offline medical matches found.
                </div>
              )}
            </div>

            {/* Right: Active Condition Detail Guide (Takes 2 Columns) */}
            <div style={{ gridColumn: "span 2" }}>
              {activeCondition && (
                <div className="card card-featured" style={{ padding: 32 }}>
                  {/* Title & Audio Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, borderBottom: "1px solid rgba(0,0,0,0.4)", paddingBottom: 20, marginBottom: 24 }}>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(106, 228, 255, 0.1)", border: "1px solid rgba(106, 228, 255, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                        {activeCondition.icon}
                      </div>
                      <div>
                        <h2 className="text-heading-sm" style={{ marginBottom: 4 }}>
                          {activeCondition.titleBn}
                        </h2>
                        <p className="text-body-sm text-cyan">
                          {activeCondition.titleEn} · <span className="text-muted">{activeCondition.category}</span>
                        </p>
                      </div>
                    </div>

                    {/* Audio Listen Button */}
                    <button
                      className="btn-ghost"
                      onClick={() => speakText(activeCondition.firstAidBn.join(" ") + " " + activeCondition.warningsBn)}
                      style={{ padding: "8px 16px", fontSize: 13 }}
                      id="listen-audio-btn"
                    >
                      {speaking ? "⏹️ Stop Audio" : "🔊 Listen (শুনুন)"}
                    </button>
                  </div>

                  {/* Warning Banner */}
                  {activeCondition.warningsBn && (
                    <div style={{ background: "rgba(255, 71, 87, 0.1)", border: "1px solid rgba(255, 71, 87, 0.3)", borderRadius: "var(--radius-cards)", padding: "14px 18px", marginBottom: 24, display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 24 }}>⚠️</span>
                      <span style={{ fontSize: "var(--text-body-sm)", color: "#ff8b94", fontWeight: 500 }}>
                        {activeCondition.warningsBn}
                      </span>
                    </div>
                  )}

                  {/* Symptoms Section */}
                  <div style={{ marginBottom: 28 }}>
                    <h3 className="text-body" style={{ fontWeight: 700, color: "var(--color-spectral-cyan)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>🔍</span> লক্ষণসমূহ (Recognizing Symptoms)
                    </h3>
                    <div style={{ background: "var(--color-abyss-navy)", borderRadius: "var(--radius-cards)", padding: "16px 20px", border: "1px solid var(--color-carbon-black)" }}>
                      <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {activeCondition.symptoms.map((s, idx) => (
                          <li key={idx} style={{ fontSize: "var(--text-body-sm)", color: "var(--color-bone-white)", display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <span style={{ color: "var(--color-spectral-cyan)" }}>●</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* First Aid Steps (Bengali & English) */}
                  <div style={{ marginBottom: 28 }}>
                    <h3 className="text-body" style={{ fontWeight: 700, color: "#34ed7b", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>🩺</span> করণীয় ও প্রাথমিক চিকিৎসা (First-Aid Protocol)
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {activeCondition.firstAidBn.map((step, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: "var(--color-tide-card)",
                            border: "1px solid var(--color-carbon-black)",
                            borderRadius: "var(--radius-cards)",
                            padding: "14px 18px",
                            fontSize: "var(--text-body-sm)",
                            lineHeight: 1.6,
                            color: "var(--color-bone-white)",
                          }}
                        >
                          <div style={{ fontWeight: 600, color: "var(--color-bone-white)", marginBottom: 4 }}>
                            {step}
                          </div>
                          {activeCondition.firstAidEn[idx] && (
                            <div style={{ fontSize: "var(--text-caption)", color: "var(--color-fog-gray)" }}>
                              {activeCondition.firstAidEn[idx]}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Immediate Action Row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, paddingTop: 16, borderTop: "1px solid rgba(0,0,0,0.3)" }}>
                    <span className="text-caption text-muted">
                      Need emergency transport or doctor assistance?
                    </span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <a href="/map" className="btn-ghost" style={{ padding: "8px 18px", fontSize: 13 }}>
                        🗺️ Find Nearby Clinic
                      </a>
                      <a href="/chat" className="btn-primary" style={{ padding: "8px 18px", fontSize: 13 }}>
                        💬 Consult AI Doctor
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
      <SOSButton />
    </>
  );
}

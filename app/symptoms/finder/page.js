"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SOSButton from "@/components/SOSButton";
import Link from "next/link";
import {
  SYMPTOM_CHIPS,
  SYMPTOM_GROUPS,
  SOLO_SUFFICIENT_CHIPS,
  rankConditions,
  detectRedFlags,
} from "@/lib/symptomScoringEngine";

// Chips are bucketed once, at module load, so a chip toggle never re-runs a
// filter over all 40 entries. Re-render then only walks pre-built arrays.
const CHIPS_BY_GROUP = SYMPTOM_GROUPS.map((group) => ({
  ...group,
  chips: SYMPTOM_CHIPS.filter((chip) => chip.group === group.id),
}));

const SOLO_SUFFICIENT = new Set(SOLO_SUFFICIENT_CHIPS);

// On a phone only the first two groups start open, so the page opens short; at
// desktop widths every group starts open. Read through useSyncExternalStore rather
// than an effect: the server snapshot is "mobile", which is also the safe first
// paint on a phone, and a width change never costs a cascading re-render.
const DEFAULT_OPEN_GROUPS = new Set(["fever", "head"]);
const DESKTOP_QUERY = "(min-width: 900px)";

const subscribeToDesktop = (onChange) => {
  const mql = window.matchMedia(DESKTOP_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
};
const getDesktopSnapshot = () => window.matchMedia(DESKTOP_QUERY).matches;
const getDesktopServerSnapshot = () => false;

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

const LEVEL_STYLES = {
  RED: { color: "var(--color-sos-red)", tint: "rgba(255, 71, 87, 0.05)", badge: "🔴 জরুরি" },
  YELLOW: { color: "#ffab00", tint: "rgba(255, 171, 0, 0.05)", badge: "🟡 সতর্কতা" },
  GREEN: { color: "#34ed7b", tint: "rgba(52, 237, 123, 0.05)", badge: "🟢 ঘরে থাকুন" },
};

const CONFIDENCE_LABELS = {
  HIGH: "উচ্চ সম্ভাবনা",
  MEDIUM: "মধ্যম সম্ভাবনা",
  LOW: "কম সম্ভাবনা",
};

export default function SymptomCheckerPage() {
  const [selectedIds, setSelectedIds] = useState([]);
  const [patientType, setPatientType] = useState("adult");
  const [duration, setDuration] = useState("acute");
  const [groupOverrides, setGroupOverrides] = useState({});
  const [results, setResults] = useState(null); // null = not run, [] = no match
  const [redFlags, setRedFlags] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [resultsVisible, setResultsVisible] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);

  const resultsRef = useRef(null);
  const chipsRef = useRef(null);

  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    getDesktopSnapshot,
    getDesktopServerSnapshot
  );

  // A group the user has tapped keeps whatever they chose; everything else falls
  // back to the width-based default.
  const isGroupOpen = (id) => groupOverrides[id] ?? (isDesktop || DEFAULT_OPEN_GROUPS.has(id));

  // Fade the results in one frame after they mount, then scroll them into view.
  useEffect(() => {
    if (results === null) return;
    const timer = setTimeout(() => {
      setResultsVisible(true);
      if (resultsRef.current) {
        window.scrollTo({ top: resultsRef.current.offsetTop - 80, behavior: "smooth" });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [results]);

  // Never leave the browser talking after the user navigates away.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleChip = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleGroup = (id) =>
    setGroupOverrides((prev) => ({ ...prev, [id]: !isGroupOpen(id) }));

  // A single chip is enough only when it is physical evidence — a bite, a burn.
  // Everything else needs two, because one generic symptom cannot discriminate.
  const canAnalyze =
    selectedIds.length >= 2 || (selectedIds.length === 1 && SOLO_SUFFICIENT.has(selectedIds[0]));

  const handleAnalyze = () => {
    if (!canAnalyze) return;
    stopSpeaking();
    setResultsVisible(false);
    setExpandedId(null);
    setRedFlags(detectRedFlags(selectedIds));
    setResults(rankConditions(selectedIds, { patientType, duration }));
  };

  const handleReset = () => {
    stopSpeaking();
    setSelectedIds([]);
    setPatientType("adult");
    setDuration("acute");
    setResults(null);
    setRedFlags([]);
    setExpandedId(null);
    setResultsVisible(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const stopSpeaking = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeakingId(null);
  };

  // Web Speech API — built into the browser, so it costs nothing to ship and
  // works with no connection.
  const speak = (id, text) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speakingId === id) {
      stopSpeaking();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "bn-BD";
    utterance.rate = 0.9;
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const scrollToChips = () => {
    if (chipsRef.current) {
      window.scrollTo({ top: chipsRef.current.offsetTop - 80, behavior: "smooth" });
    }
  };

  const count = selectedIds.length;

  return (
    <>
      <Navbar />
      <div className="symptoms-finder-page" style={{ paddingBottom: 80 }}>
        <div className="page-container" style={{ maxWidth: 860 }}>
          {/* Page header */}
          <div className="text-center" style={{ marginBottom: 32 }}>
            <div
              style={{
                display: "inline-flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <span className="badge badge-gradient">⚡ ১০০% অফলাইন — Works Without Internet</span>
              <span className="badge badge-cyan">বাংলা ও English</span>
            </div>
            <h1 className="text-heading-lg" style={{ marginBottom: 10 }}>
              <span className="text-cyan">Symptom Checker</span> — লক্ষণ থেকে রোগ চিনুন
            </h1>
            <p className="text-body text-muted" style={{ maxWidth: 620, margin: "0 auto" }}>
              আপনি শুধু বলুন কী কী সমস্যা হচ্ছে — কোন রোগ হতে পারে তা আমরা বের করব। Tap the symptoms
              you feel; the checker ranks the most likely conditions offline.
            </p>
          </div>

          {/* ---------- Phase 1: symptom selection ---------- */}
          <div className="card card-featured" style={{ padding: "28px 28px 32px" }} ref={chipsRef}>
            <h2 className="text-heading-sm" style={{ marginBottom: 8 }}>
              আপনার লক্ষণ বেছে নিন
            </h2>
            <p className="text-caption text-muted" style={{ marginBottom: 16, lineHeight: 1.6 }}>
              যত বেশি লক্ষণ বাছাই করবেন, ফলাফল তত নির্ভুল হবে — Select all that apply
            </p>

            <div style={{ marginBottom: 20 }}>
              <span
                className={count > 0 ? "sc-counter" : "sc-counter sc-counter--empty"}
                aria-live="polite"
              >
                {count > 0 ? `✓ ${toBn(count)}টি লক্ষণ বাছাই হয়েছে` : "এখনো কোনো লক্ষণ বাছাই হয়নি"}
              </span>
            </div>

            {/* Accordion groups */}
            <div style={{ marginBottom: 28 }}>
              {CHIPS_BY_GROUP.map((group) => {
                const isOpen = isGroupOpen(group.id);
                const groupCount = group.chips.reduce(
                  (n, chip) => (selectedIds.includes(chip.id) ? n + 1 : n),
                  0
                );

                return (
                  <div className="sc-group" key={group.id}>
                    <button
                      type="button"
                      className="sc-group__header"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={isOpen}
                    >
                      <span className="sc-group__emoji" aria-hidden="true">
                        {group.emoji}
                      </span>
                      <span className="sc-group__titles">
                        <span className="sc-group__title-bn">{group.labelBn}</span>
                        <span className="sc-group__title-en">
                          {group.labelEn} · {toBn(group.chips.length)}টি
                        </span>
                      </span>
                      {groupCount > 0 && (
                        <span className="sc-group__count">{toBn(groupCount)}</span>
                      )}
                      <span
                        className={isOpen ? "sc-group__caret sc-group__caret--open" : "sc-group__caret"}
                        aria-hidden="true"
                      >
                        ▼
                      </span>
                    </button>

                    {isOpen && (
                      <div className="sc-group__body">
                        {group.chips.map((chip) => {
                          const active = selectedIds.includes(chip.id);
                          return (
                            <button
                              type="button"
                              key={chip.id}
                              className={active ? "sc-chip sc-chip--active" : "sc-chip"}
                              onClick={() => toggleChip(chip.id)}
                              aria-pressed={active}
                            >
                              <span className="sc-chip__emoji" aria-hidden="true">
                                {chip.emoji}
                              </span>
                              <span className="sc-chip__labels">
                                <span className="sc-chip__bn">{chip.labelBn}</span>
                                <span className="sc-chip__en">{chip.labelEn}</span>
                              </span>
                              <span className="sc-chip__check" aria-hidden="true">
                                ✓
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Context: who, and how long */}
            <div
              style={{
                padding: "20px",
                borderRadius: "var(--radius-cards)",
                background: "var(--color-abyss-navy)",
                border: "1px solid var(--color-carbon-black)",
                marginBottom: 24,
              }}
            >
              <div className="sc-context-row">
                <span className="sc-context-row__label">👤 রোগী কে?</span>
                <button
                  type="button"
                  className={patientType === "child" ? "sc-toggle sc-toggle--active" : "sc-toggle"}
                  onClick={() => setPatientType("child")}
                  aria-pressed={patientType === "child"}
                >
                  👶 শিশু (১২ বছরের কম)
                </button>
                <button
                  type="button"
                  className={patientType === "adult" ? "sc-toggle sc-toggle--active" : "sc-toggle"}
                  onClick={() => setPatientType("adult")}
                  aria-pressed={patientType === "adult"}
                >
                  🧑 প্রাপ্তবয়স্ক
                </button>
              </div>

              <div className="sc-context-row">
                <span className="sc-context-row__label">⏱️ লক্ষণ কতদিনের?</span>
                <button
                  type="button"
                  className={duration === "acute" ? "sc-toggle sc-toggle--active" : "sc-toggle"}
                  onClick={() => setDuration("acute")}
                  aria-pressed={duration === "acute"}
                >
                  ⚡ হঠাৎ শুরু (৩ দিনের কম)
                </button>
                <button
                  type="button"
                  className={duration === "chronic" ? "sc-toggle sc-toggle--active" : "sc-toggle"}
                  onClick={() => setDuration("chronic")}
                  aria-pressed={duration === "chronic"}
                >
                  📅 দীর্ঘস্থায়ী (৩+ দিন)
                </button>
              </div>
            </div>

            {/* Analyze */}
            <button
              type="button"
              className={canAnalyze ? "sc-cta" : "sc-cta sc-cta--disabled"}
              onClick={handleAnalyze}
              disabled={!canAnalyze}
            >
              ⚡ লক্ষণ বিশ্লেষণ করুন — Analyze Symptoms
            </button>

            {!canAnalyze && (
              <p
                className="text-caption text-muted"
                style={{ marginTop: 12, textAlign: "center" }}
              >
                (ন্যূনতম ২টি লক্ষণ বাছাই করুন)
              </p>
            )}
          </div>

          {/* ---------- Phase 2: results ---------- */}
          {results !== null && (
            <div
              ref={resultsRef}
              className={resultsVisible ? "sc-results sc-results--visible" : "sc-results"}
              style={{ marginTop: 32 }}
            >
              <h2 className="text-heading-sm" style={{ marginBottom: 8 }}>
                বিশ্লেষণ ফলাফল <span className="text-muted">/ Analysis Results</span>
              </h2>
              <p
                className="text-caption"
                style={{
                  marginBottom: 20,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-links)",
                  background: "rgba(255, 171, 0, 0.1)",
                  border: "1px solid rgba(255, 171, 0, 0.4)",
                  color: "var(--color-bone-white)",
                  lineHeight: 1.6,
                }}
              >
                ⚠️ এটি প্রাথমিক সহায়তা তথ্য — ডাক্তারের পরামর্শের বিকল্প নয়।
              </p>

              {/* Red-flag advisory. Shown whether or not anything scored: the
                  dataset has no cardiac profile, so chest pain must be surfaced
                  by its own path rather than through the ranking. */}
              {redFlags.map((flag) => (
                <div
                  key={flag.chipId}
                  style={{
                    padding: "18px 20px",
                    borderRadius: "var(--radius-cards)",
                    background: "rgba(255, 71, 87, 0.12)",
                    border: "2px solid var(--color-sos-red)",
                    borderLeft: "6px solid var(--color-sos-red)",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 24 }} aria-hidden="true">
                      {flag.icon}
                    </span>
                    <span
                      style={{
                        fontSize: 17,
                        fontWeight: 800,
                        color: "var(--color-sos-red)",
                      }}
                    >
                      🔴 {flag.titleBn}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "var(--color-bone-white)",
                      marginBottom: 12,
                    }}
                  >
                    {flag.messageBn}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {flag.actionsBn.map((action, idx) => (
                      <div className="sc-step" key={idx}>
                        <span className="sc-step__num" aria-hidden="true">
                          {toBn(idx + 1)}
                        </span>
                        <span>{action}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="sc-listen"
                    onClick={() =>
                      speak(
                        `flag-${flag.chipId}`,
                        `${flag.titleBn}। ${flag.messageBn} ${flag.actionsBn.join(" ")}`
                      )
                    }
                  >
                    {speakingId === `flag-${flag.chipId}` ? "⏹️ বন্ধ করুন" : "🔊 শুনুন"}
                  </button>
                </div>
              ))}

              {results.length > 0 ? (
                <>
                  {results.map((entry) => {
                    const { condition, normalizedScore, confidence, rank } = entry;
                    const level = LEVEL_STYLES[condition.emergencyLevel] || LEVEL_STYLES.GREEN;
                    const isPrimary = rank === 1;
                    const isExpanded = expandedId === condition.id;
                    const ttsText = [
                      condition.titleBn,
                      ...condition.firstAidBn,
                      ...condition.warningSigns,
                    ].join(" ");

                    return (
                      <div
                        key={condition.id}
                        className={isPrimary ? "sc-result sc-result--primary" : "sc-result sc-result--secondary"}
                        style={
                          isPrimary
                            ? { borderLeftColor: level.color, background: level.tint }
                            : undefined
                        }
                      >
                        {/* Title row */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                            marginBottom: 12,
                          }}
                        >
                          <span
                            style={{ fontSize: isPrimary ? 32 : 24, lineHeight: 1 }}
                            aria-hidden="true"
                          >
                            {condition.icon}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: isPrimary ? 20 : 16,
                                fontWeight: 800,
                                color: "var(--color-bone-white)",
                                lineHeight: 1.3,
                              }}
                            >
                              {condition.titleBn}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--color-fog-gray)" }}>
                              {condition.titleEn}
                            </div>
                          </div>
                          <span
                            className="badge"
                            style={{
                              background: "var(--color-abyss-navy)",
                              color: "var(--color-fog-gray)",
                              border: "1px solid var(--color-carbon-black)",
                              flexShrink: 0,
                            }}
                          >
                            #{toBn(rank)}
                          </span>
                        </div>

                        {/* Emergency + confidence badges */}
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            marginBottom: isPrimary ? 14 : 12,
                          }}
                        >
                          <span
                            className="badge"
                            style={{
                              background: level.tint,
                              color: level.color,
                              border: `1px solid ${level.color}`,
                              fontWeight: 700,
                            }}
                          >
                            {level.badge}
                          </span>
                          <span
                            className="badge"
                            style={{
                              background: "var(--color-abyss-navy)",
                              color: "var(--color-spectral-cyan)",
                              border: "1px solid var(--color-spectral-cyan)",
                            }}
                          >
                            {CONFIDENCE_LABELS[confidence]} · {toBn(normalizedScore)}%
                          </span>
                        </div>

                        {/* Score bar — rank 1 only, per spec */}
                        {isPrimary && (
                          <div className="sc-result__score-track" style={{ marginBottom: 16 }}>
                            <div
                              className="sc-result__score-fill"
                              style={{ width: `${normalizedScore}%`, background: level.color }}
                            />
                          </div>
                        )}

                        {/* TTS sits above the text: for a non-reading user this is
                            the only way to consume the first aid at all. */}
                        <button
                          type="button"
                          className="sc-listen"
                          style={{ marginBottom: 12 }}
                          onClick={() => speak(condition.id, ttsText)}
                        >
                          {speakingId === condition.id ? "⏹️ বন্ধ করুন" : "🔊 শুনুন"}
                        </button>

                        {/* First aid, collapsed by default */}
                        <button
                          type="button"
                          className="sc-disclose"
                          onClick={() => setExpandedId(isExpanded ? null : condition.id)}
                          aria-expanded={isExpanded}
                        >
                          <span>🩺 প্রাথমিক করণীয় দেখুন</span>
                          <span aria-hidden="true">{isExpanded ? "▲" : "▼"}</span>
                        </button>

                        {isExpanded && (
                          <div style={{ marginTop: 12 }}>
                            <div
                              style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}
                            >
                              {condition.firstAidBn.map((step, idx) => (
                                <div className="sc-step" key={idx}>
                                  <span className="sc-step__num" aria-hidden="true">
                                    {toBn(idx + 1)}
                                  </span>
                                  <span>{step}</span>
                                </div>
                              ))}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {condition.warningSigns.map((warning, idx) => (
                                <div className="sc-warning" key={idx}>
                                  ⚠️ {warning}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={handleReset}>
                      🔄 নতুন করে শুরু করুন
                    </button>
                    <Link href="/symptoms" className="btn-ghost">
                      📖 বিস্তারিত মেডিকেল গাইড
                    </Link>
                  </div>
                </>
              ) : (
                /* Zero match — the one place chat is offered, as a real last resort
                   rather than as cover for the engine failing. */
                <div
                  className="card"
                  style={{ padding: "32px 28px", textAlign: "center" }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }} aria-hidden="true">
                    ❓
                  </div>
                  <p
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--color-bone-white)",
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    আপনার বর্ণনা করা লক্ষণগুলো থেকে কোনো সুনির্দিষ্ট ফলাফল পাওয়া যাচ্ছে না।
                  </p>
                  <p
                    className="text-body-sm text-muted"
                    style={{ marginBottom: 24, lineHeight: 1.6, maxWidth: 480, margin: "0 auto 24px" }}
                  >
                    আরও লক্ষণ বাছাই করুন, অথবা নিজে বিস্তারিত বলতে চাইলে AI ডাক্তারের সাথে কথা বলুন।
                  </p>
                  <div
                    style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}
                  >
                    <button type="button" className="btn-ghost" onClick={scrollToChips}>
                      ➕ আরও লক্ষণ যোগ করুন
                    </button>
                    <Link href="/chat" className="btn-primary">
                      AI ডাক্তারের সাথে কথা বলুন →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
      <SOSButton />
    </>
  );
}

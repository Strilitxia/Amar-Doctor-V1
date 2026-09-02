"use client";

import { useState, useRef } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SOSButton from "@/components/SOSButton";

export default function PrescriptionPage() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setImage(file);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("image", image);

      const res = await fetch("/api/prescription", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResults(data.analysis);
    } catch {
      setResults({
        error: true,
        medications: [],
        summary: "Failed to analyze prescription. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImage(null);
    setImagePreview(null);
    setResults(null);
  };

  return (
    <>
      <Navbar />
      <div className="prescription-page" id="prescription-page">
        <div className="page-container">
          {/* Header */}
          <div className="text-center" style={{ marginBottom: 48 }}>
            <span className="badge badge-gradient" style={{ marginBottom: 16, display: "inline-flex" }}>
              📋 AI-Powered OCR
            </span>
            <h1 className="text-heading-lg" style={{ marginBottom: 12, marginTop: 16 }}>
              Prescription <span className="text-cyan">Scanner</span>
            </h1>
            <p className="text-body text-muted" style={{ maxWidth: 550, margin: "0 auto" }}>
              Upload a photo of your prescription. Our AI will extract and explain every medication — dosage, timing, purpose, and side effects.
              <br />
              আপনার প্রেসক্রিপশনের ছবি আপলোড করুন।
            </p>
          </div>

          <div className="grid-2" style={{ gap: 32, alignItems: "start" }}>
            {/* Left: Upload */}
            <div>
              {!imagePreview ? (
                <div
                  className={`upload-zone ${dragover ? "dragover" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
                  onDragLeave={() => setDragover(false)}
                  onDrop={handleDrop}
                  id="upload-zone"
                >
                  <div className="upload-zone__icon">📷</div>
                  <div className="upload-zone__title">
                    Drop prescription image here
                  </div>
                  <div className="upload-zone__hint">
                    or click to browse · JPG, PNG supported
                    <br />
                    প্রেসক্রিপশনের ছবি এখানে ড্রপ করুন
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleFile(e.target.files[0])}
                    style={{ display: "none" }}
                    id="file-input"
                  />
                </div>
              ) : (
                <div className="card" style={{ padding: 16 }}>
                  <img
                    src={imagePreview}
                    alt="Prescription preview"
                    style={{
                      width: "100%",
                      borderRadius: "var(--radius-cards)",
                      marginBottom: 16,
                    }}
                  />
                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      className="btn-primary"
                      onClick={handleAnalyze}
                      disabled={loading}
                      style={{ flex: 1 }}
                      id="analyze-btn"
                    >
                      {loading ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                          Analyzing...
                        </span>
                      ) : (
                        "🔍 Analyze Prescription"
                      )}
                    </button>
                    <button className="btn-ghost" onClick={handleReset} id="reset-btn">
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile camera option */}
              {!imagePreview && (
                <button
                  className="btn-ghost"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: "100%", marginTop: 12, justifyContent: "center" }}
                >
                  📱 Take Photo with Camera
                </button>
              )}
            </div>

            {/* Right: Results */}
            <div>
              {!results && !loading && (
                <div className="card" style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>💊</div>
                  <p className="text-body text-muted">
                    Upload a prescription to see the analysis results here.
                  </p>
                </div>
              )}

              {loading && (
                <div className="card" style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 16, animation: "spin 2s linear infinite", display: "inline-block" }}>
                    🔍
                  </div>
                  <p className="text-body">Analyzing your prescription...</p>
                  <p className="text-body-sm text-muted" style={{ marginTop: 8 }}>
                    AI is reading the medication details
                  </p>
                </div>
              )}

              {results && !results.error && (
                <div className="rx-results" id="rx-results">
                  {/* Summary */}
                  {results.summary && (
                    <div className="card card-featured" style={{ padding: 20 }}>
                      <p className="text-body-sm" style={{ fontWeight: 600, marginBottom: 8 }}>
                        📋 Summary
                      </p>
                      <p className="text-body-sm text-muted">{results.summary}</p>
                    </div>
                  )}

                  {/* Medications */}
                  {results.medications?.map((med, i) => (
                    <div className="rx-medicine-card" key={i} id={`rx-med-${i}`}>
                      <div className="rx-medicine-card__name">{med.name}</div>
                      <div className="rx-medicine-card__dosage">{med.dosage}</div>

                      <div className="rx-detail-row">
                        <span className="rx-detail-row__label">Timing</span>
                        <span className="rx-detail-row__value">{med.timing}</span>
                      </div>
                      <div className="rx-detail-row">
                        <span className="rx-detail-row__label">Purpose</span>
                        <span className="rx-detail-row__value">{med.purpose}</span>
                      </div>
                      <div className="rx-detail-row">
                        <span className="rx-detail-row__label">Side Effects</span>
                        <span className="rx-detail-row__value">{med.sideEffects}</span>
                      </div>
                    </div>
                  ))}

                  {/* Warning */}
                  <div className="card" style={{ padding: 16, borderColor: "rgba(255, 71, 87, 0.3)" }}>
                    <p className="text-caption" style={{ color: "var(--color-sos-red)" }}>
                      ⚠️ This AI analysis is for informational purposes only. Always consult a qualified doctor before taking any medication.
                      <br />
                      এই এআই বিশ্লেষণ শুধুমাত্র তথ্যের জন্য। ওষুধ সেবনের আগে সর্বদা একজন যোগ্য ডাক্তারের সাথে পরামর্শ করুন।
                    </p>
                  </div>
                </div>
              )}

              {results?.error && (
                <div className="card" style={{ padding: 24, textAlign: "center" }}>
                  <p className="text-body" style={{ color: "var(--color-sos-red)" }}>
                    ❌ {results.summary}
                  </p>
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

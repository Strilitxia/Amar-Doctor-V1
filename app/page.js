import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SOSButton from "@/components/SOSButton";

const FEATURES = [
  {
    icon: "🤖",
    title: "AI Doctor & Voice Consultation",
    titleBn: "এআই ডাক্তার ও ভয়েস পরামর্শ",
    desc: "Speak or type in natural Bengali and English. Features real-time voice synthesis and simulated avatar video call with low-bandwidth offline/audio fallback.",
    href: "/chat",
    linkText: "Start Consultation",
  },
  {
    icon: "📶",
    title: "Offline Symptoms & First-Aid",
    titleBn: "অফলাইন লক্ষণ ও প্রাথমিক চিকিৎসা",
    desc: "100% offline-ready PWA database covering snake bites, dengue, diarrhea/cholera, burns, child pneumonia, and stroke emergency protocols with audio playback.",
    href: "/symptoms",
    linkText: "Check Symptoms Offline",
  },
  {
    icon: "⚡",
    title: "Fast Symptom Finder (Triage)",
    titleBn: "ধাপভিত্তিক লক্ষণ নিরূপণ উইজার্ড",
    desc: "Step-by-step 5-stage guided triage decision tree with immediate RED/YELLOW/GREEN emergency assessment and Bengali audio solutions.",
    href: "/symptoms/finder",
    linkText: "Open Fast Finder",
  },
  {
    icon: "💊",
    title: "Prescription OCR Scanner",
    titleBn: "প্রেসক্রিপশন এআই স্ক্যানার",
    desc: "Upload or take a photo of any handwritten/printed prescription. Gemini Vision extracts dosage, schedule, purpose, and side effects in simple language.",
    href: "/prescription",
    linkText: "Scan Prescription",
  },
  {
    icon: "🗺️",
    title: "Doctor & Hospital Map",
    titleBn: "ডাক্তার ও হাসপাতাল ম্যাপ",
    desc: "Find nearest upazila health complexes, government clinics, and private hospitals with GPS routing, ratings, and phone contacts across Bangladesh.",
    href: "/map",
    linkText: "Find Nearby",
  },
  {
    icon: "🚨",
    title: "SOS Emergency & Ambulance Routing",
    titleBn: "জরুরি এসওএস ও অ্যাম্বুলেন্স কমান্ড",
    desc: "One-tap emergency dispatch with GPS coordinate transmission, real-time alert triage, and ambulance tracking queue.",
    href: "/emergency",
    linkText: "Open SOS Command",
  },
  {
    icon: "⚡",
    title: "Zero-Cost Rural Architecture",
    titleBn: "সম্পূর্ণ বিনামূল্যে গ্রামীণ সেবা",
    desc: "Engineered specifically for low-end mobile phones and intermittent 2G/3G connectivity in remote areas with zero server subscription barriers.",
    href: "/chat",
    linkText: "Explore Platform",
  },
];

const STATS = [
  { number: "24/7", label: "Always Available", labelBn: "সর্বদা উপলব্ধ" },
  { number: "100%", label: "Completely Free", labelBn: "সম্পূর্ণ বিনামূল্যে" },
  { number: "বাংলা", label: "Bengali Neural AI", labelBn: "বাংলা ভাষায় এআই" },
  { number: "📶 Offline", label: "Zero Bandwidth Mode", labelBn: "অফলাইন মোড" },
];

const STEPS = [
  {
    num: "1",
    title: "Open Amar Doctor",
    titleBn: "আমার ডাক্তার খুলুন",
    desc: "Works instantly on any mobile or desktop browser without installation.",
  },
  {
    num: "2",
    title: "Describe in Bengali / Voice",
    titleBn: "মুখে বলুন বা লক্ষণ লিখুন",
    desc: "Speak naturally in Bengali or type your symptoms and pain areas.",
  },
  {
    num: "3",
    title: "Get AI Medical Triage",
    titleBn: "তাত্ক্ষণিক পরামর্শ নিন",
    desc: "Receive clear first-aid, dosage instructions, and disease risk assessment.",
  },
  {
    num: "4",
    title: "Locate Hospital / Send SOS",
    titleBn: "হাসপাতাল খুঁজুন বা এসওএস দিন",
    desc: "Find nearest emergency health complex with one-tap ambulance dispatch.",
  },
];

export default function Home() {
  return (
    <>
      <Navbar />

      {/* ═══════════════════════ HERO ═══════════════════════ */}
      <section className="hero" id="hero">
        <div className="hero__content">
          <div className="hero__badge">
            <span className="badge badge-gradient">🩺 Free AI Telemedicine for Rural Bangladesh</span>
          </div>

          <h1 className="hero__title">
            Your AI <span className="highlight">Doctor</span> is Here
          </h1>

          <p className="hero__subtitle">
            আপনার এআই ডাক্তার এখানে — Free, 24/7 medical consultations for rural Bangladesh.
            Speak in Bengali, scan prescriptions, get offline first-aid, and dispatch emergency SOS.
          </p>

          <div className="hero__ctas">
            <Link href="/chat" className="btn-primary" id="hero-cta-primary">
              🩺 Start Consultation (পরামর্শ নিন)
            </Link>
            <Link href="/symptoms/finder" className="btn-primary" style={{ background: "rgba(106, 228, 255, 0.2)", border: "1px solid var(--color-spectral-cyan)" }} id="hero-cta-finder">
              ⚡ Fast Symptom Finder (লক্ষণ নিরূপণ)
            </Link>
            <Link href="/symptoms" className="btn-ghost" id="hero-cta-offline">
              📶 Offline First-Aid <span className="arrow">→</span>
            </Link>
            <Link href="/emergency" className="btn-sos" style={{ textDecoration: "none" }} id="hero-cta-sos">
              🚨 Emergency SOS
            </Link>
          </div>
        </div>

        {/* Feature cards grid */}
        <div className="hero__cards">
          <div className="grid-3">
            {FEATURES.map((f, i) => (
              <div className="feature-card" key={i} id={`feature-card-${i}`}>
                <div className="feature-card__icon">{f.icon}</div>
                <h3 className="feature-card__title">{f.title}</h3>
                <p className="feature-card__desc">{f.desc}</p>
                <Link href={f.href} className="feature-card__link">
                  {f.linkText} <span className="arrow">→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ STATS ═══════════════════════ */}
      <section className="section" id="stats-section">
        <div className="page-container">
          <div className="grid-4">
            {STATS.map((s, i) => (
              <div className="stat-block" key={i}>
                <div className="stat-block__number">{s.number}</div>
                <div className="stat-block__label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ HOW IT WORKS ═══════════════════════ */}
      <section className="section" id="how-it-works">
        <div className="page-container text-center">
          <h2 className="text-heading" style={{ marginBottom: "8px" }}>
            How It <span className="text-cyan">Works</span>
          </h2>
          <p className="text-body text-muted" style={{ marginBottom: "48px", maxWidth: "550px", margin: "0 auto 48px" }}>
            চিকিৎসা সেবা এখন সবার হাতের নাগালে — Simple, accessible healthcare for every village.
          </p>

          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div className="step-item" key={i}>
                <div className="step-item__number">{step.num}</div>
                <h4 className="step-item__title">{step.title}</h4>
                <p className="step-item__desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════ CTA BANNER ═══════════════════════ */}
      <section className="section" id="cta-banner">
        <div className="page-container text-center">
          <div className="card card-featured" style={{ padding: "60px 40px", maxWidth: "860px", margin: "0 auto" }}>
            <h2 className="text-heading-sm" style={{ marginBottom: "12px" }}>
              Need Medical Guidance <span className="text-cyan">Right Now</span>?
            </h2>
            <p className="text-body text-muted" style={{ marginBottom: "32px", maxWidth: "520px", margin: "0 auto 32px" }}>
              Our AI doctor is online and ready — zero cost, zero waiting, works with or without high-speed internet.
              <br />
              আমাদের এআই ডাক্তার এখনই সাহায্য করতে প্রস্তুত।
            </p>
            <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/chat" className="btn-primary">
                🩺 Talk to AI Doctor
              </Link>
              <Link href="/prescription" className="btn-ghost">
                📋 Scan Prescription
              </Link>
              <Link href="/symptoms" className="btn-ghost">
                📶 Offline First-Aid Guide
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <SOSButton />
    </>
  );
}

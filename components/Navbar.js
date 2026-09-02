"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home", labelBn: "হোম" },
  { href: "/chat", label: "AI Doctor", labelBn: "এআই ডাক্তার" },
  { href: "/symptoms", label: "Offline Care", labelBn: "অফলাইন চিকিৎসা" },
  { href: "/symptoms/finder", label: "⚡ Symptom Finder", labelBn: "⚡ লক্ষণ নিরূপণ" },
  { href: "/map", label: "Find Hospital", labelBn: "হাসপাতাল" },
  { href: "/prescription", label: "Prescription", labelBn: "প্রেসক্রিপশন" },
  { href: "/emergency", label: "SOS Command", labelBn: "জরুরি কন্ট্রোল" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lang, setLang] = useState("en");

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <nav className={`navbar ${scrolled ? "scrolled" : ""}`} id="main-navbar">
        <div className="navbar__inner">
          {/* Logo */}
          <Link href="/" className="navbar__logo">
            <span className="navbar__logo-icon">🩺</span>
            <span>{lang === "bn" ? "আমার ডাক্তার" : "Amar Doctor"}</span>
          </Link>

          {/* Desktop nav links */}
          <div className="navbar__links">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`navbar__link ${pathname === link.href ? "active" : ""}`}
              >
                {lang === "bn" ? link.labelBn : link.label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="navbar__actions">
            {/* Language Toggle */}
            <div className="lang-toggle">
              <button
                className={`lang-toggle__btn ${lang === "en" ? "active" : ""}`}
                onClick={() => setLang("en")}
                aria-label="Switch to English"
              >
                EN
              </button>
              <button
                className={`lang-toggle__btn ${lang === "bn" ? "active" : ""}`}
                onClick={() => setLang("bn")}
                aria-label="Switch to Bengali"
              >
                বাং
              </button>
            </div>

            {/* Emergency SOS Shortcut */}
            <Link
              href="/emergency"
              className="btn-sos"
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                textDecoration: "none",
                display: "inline-flex",
              }}
            >
              🚨 SOS
            </Link>

            {/* Hamburger */}
            <button
              className={`navbar__hamburger ${mobileOpen ? "open" : ""}`}
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
              id="nav-hamburger"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile nav overlay */}
      <div className={`mobile-nav ${mobileOpen ? "open" : ""}`} id="mobile-nav">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`mobile-nav__link ${pathname === link.href ? "active" : ""}`}
          >
            {lang === "bn" ? link.labelBn : link.label}
          </Link>
        ))}
        <Link href="/chat" className="btn-primary" style={{ marginTop: "16px", textAlign: "center" }}>
          {lang === "bn" ? "পরামর্শ শুরু করুন" : "Start Consultation"}
        </Link>
      </div>
    </>
  );
}

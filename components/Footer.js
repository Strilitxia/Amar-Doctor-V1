import Link from "next/link";

export default function Footer() {
  return (
    <footer className="footer" id="footer">
      <div className="footer__inner">
        <p className="footer__text">
          © {new Date().getFullYear()} আমার ডাক্তার (Amar Doctor) — Free AI Telemedicine for Rural Bangladesh
        </p>
        <div className="footer__links">
          <Link href="/chat" className="footer__link">AI Doctor</Link>
          <Link href="/symptoms" className="footer__link">Offline Care</Link>
          <Link href="/symptoms/finder" className="footer__link">⚡ Fast Symptom Finder</Link>
          <Link href="/map" className="footer__link">Find Hospital</Link>
          <Link href="/prescription" className="footer__link">Prescription</Link>
        </div>
      </div>
    </footer>
  );
}

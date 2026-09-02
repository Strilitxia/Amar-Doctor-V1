"use client";

import { useState } from "react";
import Link from "next/link";
import { broadcastSOS } from "@/lib/emergencyBroadcaster";

export default function SOSButton() {
  const [showModal, setShowModal] = useState(false);
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentAlertId, setSentAlertId] = useState(null);

  const handleSOSClick = () => {
    setLocating(true);
    setSent(false);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6),
          });
          setLocating(false);
          setShowModal(true);
        },
        () => {
          setLocation({ lat: "23.810300", lng: "90.412500" });
          setLocating(false);
          setShowModal(true);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocation({ lat: "23.810300", lng: "90.412500" });
      setLocating(false);
      setShowModal(true);
    }
  };

  const handleConfirmSOS = () => {
    const created = broadcastSOS({
      lat: location?.lat || 23.8103,
      lng: location?.lng || 90.4125,
      category: "Emergency Medical Distress (জরুরি চিকিৎসা)",
      notes: "Emergency SOS triggered from patient web app."
    });

    setSentAlertId(created?.id || "EMG-LIVE");
    setSent(true);
  };

  return (
    <>
      <button
        className="sos-fab"
        onClick={handleSOSClick}
        disabled={locating}
        aria-label="Emergency SOS"
        id="sos-button"
      >
        {locating ? "..." : "SOS"}
      </button>

      {showModal && (
        <div className="sos-modal-overlay" onClick={() => !sent && setShowModal(false)} id="sos-modal">
          <div className="sos-modal" onClick={(e) => e.stopPropagation()}>
            {sent ? (
              <>
                <div className="sos-modal__icon">🚨</div>
                <h2 className="sos-modal__title" style={{ color: "var(--color-sos-red)" }}>
                  Emergency Alert Dispatched!
                </h2>
                <p className="sos-modal__desc">
                  সতর্কতা পাঠানো হয়েছে (Alert ID: <strong>{sentAlertId}</strong>).<br />
                  Ambulance & medical dispatchers have received your geolocation coordinates.
                </p>

                <div className="sos-modal__location" style={{ marginBottom: 20 }}>
                  📍 {location?.lat}, {location?.lng}
                </div>

                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <Link
                    href="/emergency"
                    className="btn-primary"
                    onClick={() => setShowModal(false)}
                    style={{ backgroundColor: "var(--color-sos-red)", color: "white" }}
                  >
                    View Live Dispatch Track ↗
                  </Link>
                  <button className="btn-ghost" onClick={() => setShowModal(false)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="sos-modal__icon">🚨</div>
                <h2 className="sos-modal__title">Emergency SOS Alert</h2>
                <p className="sos-modal__desc">
                  This will broadcast an urgent emergency alert with your current GPS coordinates to the ambulance dispatch team.
                  <br />
                  <br />
                  এটি আপনার বর্তমান অবস্থান সহ নিকটবর্তী অ্যাম্বুলেন্স ও স্বাস্থ্যসেবা কেন্দ্রে জরুরি বার্তা পাঠাবে।
                </p>

                {location && (
                  <div className="sos-modal__location">
                    📍 Detected GPS: {location.lat}, {location.lng}
                  </div>
                )}

                <div className="sos-modal__actions">
                  <button className="btn-ghost" onClick={() => setShowModal(false)}>
                    Cancel (বাতিল)
                  </button>
                  <button className="btn-sos" onClick={handleConfirmSOS}>
                    🚑 Dispatch Emergency SOS
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

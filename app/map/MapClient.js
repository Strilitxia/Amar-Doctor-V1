"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import SOSButton from "@/components/SOSButton";
import OpenStreetMapView from "@/components/OpenStreetMapView";
import {
  CAMP_STATUS,
  HOSPITALS,
  SPECIALTIES,
  formatCampCountdown,
  formatCampWindow,
  formatDistance,
  getSpecialty,
  haversineKm,
} from "@/lib/campsData";

const DHAKA = { lat: 23.8103, lng: 90.4125 };

const STATUS_TABS = [
  { id: "ONGOING", label: "Ongoing", labelBn: "চলমান" },
  { id: "UPCOMING", label: "Upcoming", labelBn: "আসন্ন" },
  { id: "ALL", label: "All", labelBn: "সব" },
];

// "Any" first so the list is never silently truncated before the user opts in.
const RADIUS_OPTIONS = [
  { id: 0, label: "Any" },
  { id: 10, label: "10 km" },
  { id: 25, label: "25 km" },
  { id: 50, label: "50 km" },
  { id: 100, label: "100 km" },
];

const STATUS_BADGE = {
  ONGOING: { label: "Ongoing", labelBn: "চলমান", className: "camp-status--ongoing" },
  UPCOMING: { label: "Upcoming", labelBn: "আসন্ন", className: "camp-status--upcoming" },
  ENDED: { label: "Finished", labelBn: "সমাপ্ত", className: "camp-status--ended" },
};

export default function MapClient() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("camp");

  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(true);
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusTab, setStatusTab] = useState("ONGOING");
  const [activeSpecialties, setActiveSpecialties] = useState([]);
  const [radiusKm, setRadiusKm] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [showHospitals, setShowHospitals] = useState(false);
  const [lang, setLang] = useState("en");

  const bn = lang === "bn";

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
        },
        () => {
          setLocation(DHAKA);
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocation(DHAKA);
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/camps")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setCamps(Array.isArray(data.camps) ? data.camps : []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load camps:", err);
        setLoadError("Could not load medical camps. Check your connection and retry.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link from the organizer form: /map?camp=CAMP-xxxx
  useEffect(() => {
    if (!focusId || camps.length === 0) return;
    const match = camps.find((c) => c.id === focusId);
    if (match) {
      setSelected(match);
      setStatusTab("ALL");
    }
  }, [focusId, camps]);

  const toggleSpecialty = (id) => {
    setActiveSpecialties((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  // Attach real computed distance once, then filter.
  const campsWithDistance = useMemo(
    () =>
      camps.map((c) => ({
        ...c,
        distanceKm: location ? haversineKm(location, { lat: c.lat, lng: c.lng }) : null,
      })),
    [camps, location]
  );

  const visibleCamps = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return campsWithDistance.filter((c) => {
      // Finished camps only show up under the "All" tab.
      if (statusTab === "ALL" ? false : c.status !== statusTab) return false;

      if (activeSpecialties.length > 0) {
        const hit = (c.specialties || []).some((s) => activeSpecialties.includes(s));
        if (!hit) return false;
      }

      if (radiusKm > 0 && c.distanceKm !== null && c.distanceKm > radiusKm) return false;

      if (query) {
        const haystack = [c.title, c.organizer, c.venue, c.district, c.upazila]
          .join(" ")
          .toLowerCase();
        const bnHaystack = [c.titleBn, c.organizerBn, c.venueBn].join(" ");
        if (!haystack.includes(query) && !bnHaystack.includes(searchQuery.trim())) return false;
      }
      return true;
    });
  }, [campsWithDistance, statusTab, activeSpecialties, radiusKm, searchQuery]);

  const ongoingCount = campsWithDistance.filter((c) => c.status === CAMP_STATUS.ONGOING).length;

  const handleSelect = useCallback((camp) => setSelected(camp), []);

  return (
    <>
      <Navbar />
      <div className="map-page" id="map-page">
        {/* Sidebar */}
        <div className="map-sidebar">
          <div className="map-sidebar__header">
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <h1 className="map-sidebar__title" style={{ margin: 0 }}>
                ⛑️ {bn ? "মেডিকেল " : "Medical "}
                <span className="text-cyan">{bn ? "ক্যাম্প" : "Camps"}</span>
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {locating && <span className="text-caption text-cyan">GPS...</span>}
                <button
                  className="camp-lang-toggle"
                  onClick={() => setLang(bn ? "en" : "bn")}
                  aria-label="Toggle camp language"
                >
                  {bn ? "EN" : "বাং"}
                </button>
              </div>
            </div>

            <p className="text-caption text-muted" style={{ marginBottom: 12 }}>
              {bn
                ? `আপনার আশেপাশে এনজিও পরিচালিত অস্থায়ী চিকিৎসা ক্যাম্প। এখন চলছে ${ongoingCount}টি।`
                : `Temporary NGO medical camps near you. ${ongoingCount} running right now.`}
            </p>

            <input
              className="map-sidebar__search"
              type="text"
              placeholder={bn ? "ক্যাম্প, সংস্থা বা জেলা খুঁজুন..." : "Search camp, NGO or district..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="map-search"
            />

            <Link href="/camps/new" className="btn-primary camp-post-btn" id="post-camp-btn">
              ➕ {bn ? "ক্যাম্পের তথ্য দিন" : "Post a Camp"}
            </Link>
          </div>

          {/* Filters */}
          <div className="map-sidebar__filters">
            <div className="tab-pills" style={{ marginBottom: 10 }}>
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`tab-pill ${statusTab === tab.id ? "active" : ""}`}
                  onClick={() => setStatusTab(tab.id)}
                  id={`status-tab-${tab.id.toLowerCase()}`}
                >
                  {bn ? tab.labelBn : tab.label}
                </button>
              ))}
            </div>

            <div className="camp-filter-label">
              {bn ? "বিশেষজ্ঞের ধরন" : "Specialist type"}
              {activeSpecialties.length > 0 && (
                <button className="camp-filter-clear" onClick={() => setActiveSpecialties([])}>
                  {bn ? "সব বাদ" : "Clear"}
                </button>
              )}
            </div>
            <div className="specialty-chips">
              {SPECIALTIES.map((s) => (
                <button
                  key={s.id}
                  className={`specialty-chip ${activeSpecialties.includes(s.id) ? "active" : ""}`}
                  onClick={() => toggleSpecialty(s.id)}
                  style={activeSpecialties.includes(s.id) ? { borderColor: s.color, color: s.color } : undefined}
                  id={`specialty-${s.id}`}
                >
                  <span>{s.icon}</span> {bn ? s.labelBn : s.label}
                </button>
              ))}
            </div>

            <div className="camp-filter-label" style={{ marginTop: 12 }}>
              {bn ? "দূরত্ব" : "Distance"}
            </div>
            <div className="tab-pills">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r.id}
                  className={`tab-pill ${radiusKm === r.id ? "active" : ""}`}
                  onClick={() => setRadiusKm(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Results */}
          <div className="map-sidebar__results" id="camp-results">
            {loading && (
              <div className="camp-empty">{bn ? "ক্যাম্প লোড হচ্ছে..." : "Loading camps..."}</div>
            )}

            {loadError && !loading && <div className="camp-empty camp-empty--error">{loadError}</div>}

            {!loading &&
              !loadError &&
              visibleCamps.map((camp) => {
                const badge = STATUS_BADGE[camp.status];
                return (
                  <div
                    key={camp.id}
                    className={`camp-card ${selected?.id === camp.id ? "card-featured" : ""}`}
                    onClick={() => setSelected(camp)}
                    id={`camp-${camp.id}`}
                  >
                    <div className="camp-card__top">
                      <span className={`camp-status ${badge.className}`}>
                        ● {bn ? badge.labelBn : badge.label}
                      </span>
                      <span className="camp-card__countdown">
                        {formatCampCountdown(camp, lang)}
                      </span>
                    </div>

                    <div className="camp-card__name">{bn && camp.titleBn ? camp.titleBn : camp.title}</div>
                    <div className="camp-card__organizer">
                      🏳️ {bn && camp.organizerBn ? camp.organizerBn : camp.organizer}
                    </div>

                    <div className="camp-card__when">🗓️ {formatCampWindow(camp, lang)}</div>

                    <div className="camp-card__chips">
                      {(camp.specialties || []).map((id) => {
                        const s = getSpecialty(id);
                        if (!s) return null;
                        return (
                          <span
                            key={id}
                            className="camp-card__chip"
                            style={{ borderColor: s.color, color: s.color }}
                          >
                            {s.icon} {bn ? s.labelBn : s.label}
                          </span>
                        );
                      })}
                    </div>

                    <div className="camp-card__meta">
                      <span className="camp-card__place">
                        📍 {bn && camp.venueBn ? camp.venueBn : camp.venue}
                        {camp.upazila ? `, ${camp.upazila}` : ""}
                      </span>
                      {camp.distanceKm !== null && (
                        <span className="camp-card__distance">
                          {formatDistance(camp.distanceKm, lang)}
                        </span>
                      )}
                      <span className={camp.isFree ? "camp-card__free" : "camp-card__fee"}>
                        {camp.isFree ? (bn ? "বিনামূল্যে" : "Free") : `৳${camp.fee}`}
                      </span>
                    </div>

                    <a
                      href={`tel:${camp.phone}`}
                      className="camp-card__call"
                      onClick={(e) => e.stopPropagation()}
                    >
                      📞 {camp.phone}
                    </a>
                  </div>
                );
              })}

            {!loading && !loadError && visibleCamps.length === 0 && (
              <div className="camp-empty">
                {bn
                  ? "এই ফিল্টারে কোনো ক্যাম্প পাওয়া যায়নি। অন্য ধরন বা দূরত্ব দেখুন।"
                  : "No camps match these filters. Try another specialty, a wider distance, or the All tab."}
              </div>
            )}
          </div>
        </div>

        {/* Map area */}
        <div className="map-container" id="map-container">
          <div className="map-layer-toggle">
            <label>
              <input
                type="checkbox"
                checked={showHospitals}
                onChange={(e) => setShowHospitals(e.target.checked)}
                id="toggle-hospitals"
              />
              🏥 {bn ? "স্থায়ী হাসপাতাল দেখান" : "Show permanent hospitals"}
            </label>
          </div>

          <OpenStreetMapView
            userLocation={location}
            camps={visibleCamps}
            hospitals={HOSPITALS}
            showHospitals={showHospitals}
            selected={selected}
            onSelect={handleSelect}
          />
        </div>
      </div>
      <SOSButton />
    </>
  );
}

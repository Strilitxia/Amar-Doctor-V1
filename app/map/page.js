"use client";

import { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import SOSButton from "@/components/SOSButton";
import OpenStreetMapView from "@/components/OpenStreetMapView";

const MOCK_HOSPITALS = [
  {
    id: 1,
    name: "Dhaka Medical College Hospital",
    nameBn: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
    type: "Government Hospital",
    distance: "1.2 km",
    rating: 4.2,
    reviews: 1847,
    address: "Secretariat Rd, Dhaka 1000",
    phone: "+880-2-55165001",
    open: true,
  },
  {
    id: 2,
    name: "Square Hospital",
    nameBn: "স্কয়ার হাসপাতাল",
    type: "Private Hospital",
    distance: "2.8 km",
    rating: 4.5,
    reviews: 2103,
    address: "18/F Bir Uttam Qazi Nuruzzaman Sarak, West Panthapath",
    phone: "+880-2-8159457",
    open: true,
  },
  {
    id: 3,
    name: "Upazila Health Complex",
    nameBn: "উপজেলা স্বাস্থ্য কমপ্লেক্স",
    type: "Government Clinic",
    distance: "3.5 km",
    rating: 3.8,
    reviews: 342,
    address: "Upazila Sadar, Rural Health Complex",
    phone: "+880-2-1234567",
    open: true,
  },
  {
    id: 4,
    name: "Community Health Center",
    nameBn: "কমিউনিটি স্বাস্থ্য কেন্দ্র",
    type: "Community Clinic",
    distance: "5.1 km",
    rating: 3.5,
    reviews: 89,
    address: "Village Health Center, Union Parishad",
    phone: "+880-2-9876543",
    open: false,
  },
  {
    id: 5,
    name: "National Institute of Diseases",
    nameBn: "জাতীয় বক্ষব্যাধি ইনস্টিটিউট",
    type: "Specialized Hospital",
    distance: "6.2 km",
    rating: 4.0,
    reviews: 567,
    address: "Mohakhali, Dhaka",
    phone: "+880-2-8821566",
    open: true,
  },
];

const RADIUS_OPTIONS = ["1 km", "5 km", "10 km", "25 km"];

export default function MapPage() {
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(true);
  const [selectedRadius, setSelectedRadius] = useState("5 km");
  const [selectedHospital, setSelectedHospital] = useState(MOCK_HOSPITALS[0]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setLocating(false);
        },
        () => {
          setLocation({ lat: 23.8103, lng: 90.4125 });
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocation({ lat: 23.8103, lng: 90.4125 });
      setLocating(false);
    }
  }, []);

  const filteredHospitals = MOCK_HOSPITALS.filter(
    (h) =>
      h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.nameBn.includes(searchQuery) ||
      h.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderStars = (rating) => {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    let stars = "";
    for (let i = 0; i < full; i++) stars += "★";
    if (half) stars += "☆";
    return stars;
  };

  return (
    <>
      <Navbar />
      <div className="map-page" id="map-page">
        {/* Sidebar */}
        <div className="map-sidebar">
          <div className="map-sidebar__header">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h1 className="map-sidebar__title" style={{ margin: 0 }}>
                🗺️ Find <span className="text-cyan">Hospitals</span>
              </h1>
              {locating && <span className="text-caption text-cyan">GPS...</span>}
            </div>

            <input
              className="map-sidebar__search"
              type="text"
              placeholder="Search hospitals, upazila complex..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="map-search"
            />
          </div>

          {/* Radius filter */}
          <div className="map-sidebar__filters">
            <div className="tab-pills">
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  className={`tab-pill ${selectedRadius === r ? "active" : ""}`}
                  onClick={() => setSelectedRadius(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Results List */}
          <div className="map-sidebar__results" id="hospital-results">
            {filteredHospitals.map((h) => (
              <div
                key={h.id}
                className={`hospital-card ${selectedHospital?.id === h.id ? "card-featured" : ""}`}
                onClick={() => setSelectedHospital(h)}
                id={`hospital-${h.id}`}
              >
                <div className="hospital-card__name">{h.name}</div>
                <div className="hospital-card__type">
                  {h.nameBn} · {h.type}
                  {h.open ? (
                    <span style={{ color: "#34ed7b", marginLeft: 8, fontSize: 11 }}>● Open</span>
                  ) : (
                    <span style={{ color: "var(--color-sos-red)", marginLeft: 8, fontSize: 11 }}>● Closed</span>
                  )}
                </div>
                <div className="hospital-card__meta">
                  <span className="hospital-card__distance">📍 {h.distance}</span>
                  <span className="hospital-card__rating">
                    <span style={{ color: "#ffd700" }}>{renderStars(h.rating)}</span> {h.rating}
                  </span>
                  <span>({h.reviews})</span>
                </div>
              </div>
            ))}

            {filteredHospitals.length === 0 && (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--color-fog-gray)" }}>
                No facilities found matching your search.
              </div>
            )}
          </div>
        </div>

        {/* Map area */}
        <div className="map-container" id="map-container">
          <OpenStreetMapView
            userLocation={location}
            hospitals={filteredHospitals}
            selectedHospital={selectedHospital}
            onSelectHospital={setSelectedHospital}
          />
        </div>
      </div>
      <SOSButton />
    </>
  );
}

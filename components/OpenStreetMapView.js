"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import {
  CAMP_STATUS,
  formatCampWindow,
  formatDistance,
  getSpecialty,
  haversineKm,
} from "@/lib/campsData";

const DHAKA = { lat: 23.8103, lng: 90.4125 };

// Marker palette per derived camp status.
const STATUS_STYLE = {
  [CAMP_STATUS.ONGOING]: { bg: "#34ed7b", border: "#ffffff", text: "#062b14", pulse: true },
  [CAMP_STATUS.UPCOMING]: { bg: "#202a3e", border: "#6ae4ff", text: "#6ae4ff", pulse: false },
  [CAMP_STATUS.ENDED]: { bg: "#1b2230", border: "#5a6b80", text: "#8fa0b5", pulse: false },
};

function escapeHtml(value) {
  // Popups are built as raw HTML strings, and camp text is user-submitted.
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function directionsUrl(from, to) {
  const origin = from || DHAKA;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lng}%3B${to.lat}%2C${to.lng}`;
}

export default function OpenStreetMapView({
  userLocation,
  camps = [],
  hospitals = [],
  showHospitals = false,
  selected,
  onSelect,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const campsLayerRef = useRef(null);
  const hospitalsLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const didFitBoundsRef = useRef(false);
  const pendingFitRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [tileMode, setTileMode] = useState("dark"); // "dark" | "standard" | "satellite"

  // Frames the pending camp bounds, but only once the container has a real
  // size. Leaflet derives the fitted zoom from pixel dimensions, so running
  // this while the flex layout (or the dev-time stylesheet) is still settling
  // collapses the map to zoom 0 — the whole world. The attempt is retried from
  // the ResizeObserver below until it lands.
  const attemptFit = useCallback(() => {
    const map = mapInstanceRef.current;
    const points = pendingFitRef.current;
    if (!map || !points || points.length === 0) return;

    map.invalidateSize();
    const size = map.getSize();
    if (size.x < 50 || size.y < 50) return;

    // fitBounds accepts a plain array of [lat, lng] pairs, so no Leaflet
    // namespace is needed here.
    map.fitBounds(points, { padding: [40, 40], maxZoom: 13 });
    pendingFitRef.current = null;
    didFitBoundsRef.current = true;
  }, []);

  // Initialize Leaflet Map with Official OpenStreetMap (100% Free, NO API KEY)
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let L;
    import("leaflet").then((leafletModule) => {
      L = leafletModule.default || leafletModule;

      if (mapInstanceRef.current) return;

      const initialCenter = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [DHAKA.lat, DHAKA.lng];

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 12,
        zoomControl: false,
      });

      // Add Zoom control at top right
      L.control.zoom({ position: "topright" }).addTo(map);

      // 100% Free OpenStreetMap Tile Layer (No watermark, No API key)
      const osmTileLayer = L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
          className: "osm-dark-tiles", // Filtered via CSS for dark mode
        }
      ).addTo(map);

      tileLayerRef.current = osmTileLayer;

      // Camps and hospitals live in separate layer groups so toggling the
      // hospital layer never disturbs the camp markers.
      campsLayerRef.current = L.layerGroup().addTo(map);
      hospitalsLayerRef.current = L.layerGroup();
      mapInstanceRef.current = map;
      // This is a brand new map, so it still owes us its opening fit. The ref
      // outlives the map itself (React remounts effects in development), and
      // without this reset the fit is spent on a map that was thrown away.
      didFitBoundsRef.current = false;

      // Leaflet caches the container's pixel size and only repaints tiles for
      // that area. Inside this flex layout the container is still settling when
      // the map is created (and it changes again when the sidebar stacks on
      // mobile), so keep Leaflet's idea of its own size in sync.
      if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
        const observer = new ResizeObserver(() => {
          map.invalidateSize();
          attemptFit();
        });
        observer.observe(mapContainerRef.current);
        resizeObserverRef.current = observer;
      }

      setMapReady(true);
    });

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      campsLayerRef.current = null;
      hospitalsLayerRef.current = null;
      userMarkerRef.current = null;
      setMapReady(false);
    };
    // Runs once to build the map. `userLocation` only seeds the opening centre
    // (a dedicated effect below tracks it afterwards), and re-running this on
    // every GPS update would tear the map down and rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch Tile Modes (Dark OSM / Standard OSM / Satellite)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      const map = mapInstanceRef.current;
      if (!map) return;

      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }

      let newLayer;
      if (tileMode === "dark") {
        newLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
          className: "osm-dark-tiles",
        });
      } else if (tileMode === "standard") {
        newLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
          className: "osm-standard-tiles",
        });
      } else if (tileMode === "satellite") {
        newLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
            maxZoom: 18,
            className: "osm-standard-tiles",
          }
        );
      }

      newLayer.addTo(map);
      tileLayerRef.current = newLayer;
    });
  }, [tileMode]);

  // Update User Location Marker
  useEffect(() => {
    if (!mapInstanceRef.current || !userLocation) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      const map = mapInstanceRef.current;
      if (!map) return;

      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }

      const userIcon = L.divIcon({
        className: "custom-user-marker",
        html: `
          <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(106, 228, 255, 0.3); animation: pulseRadar 2s infinite;"></div>
            <div style="width: 14px; height: 14px; border-radius: 50%; background: #6ae4ff; border: 2px solid #ffffff; box-shadow: 0 0 10px #6ae4ff;"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
        zIndexOffset: 1000,
      })
        .addTo(map)
        .bindPopup(`
          <div style="color: #17202e; font-family: 'Open Sans', sans-serif; font-size: 13px; font-weight: bold;">
            📍 Your GPS Location (আপনার অবস্থান)
          </div>
        `);

      userMarkerRef.current = marker;
    });
  }, [userLocation, mapReady]);

  // Render Medical Camp Markers at their REAL coordinates
  useEffect(() => {
    if (!mapInstanceRef.current || !campsLayerRef.current) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      const map = mapInstanceRef.current;
      const layer = campsLayerRef.current;
      if (!map || !layer) return;

      layer.clearLayers();

      camps.forEach((camp) => {
        if (!Number.isFinite(camp.lat) || !Number.isFinite(camp.lng)) return;

        const isSelected = selected?.id === camp.id;
        const style = STATUS_STYLE[camp.status] || STATUS_STYLE[CAMP_STATUS.UPCOMING];
        const primary = getSpecialty(camp.specialties?.[0]);
        const shortTitle = camp.title.split(" ").slice(0, 2).join(" ");

        const campIcon = L.divIcon({
          className: "custom-camp-marker",
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center;">
              ${style.pulse
                ? `<div style="position: absolute; width: 46px; height: 46px; border-radius: 50%; background: rgba(52, 237, 123, 0.25); animation: pulseRadar 2s infinite;"></div>`
                : ""}
              <div style="
                position: relative;
                background: ${style.bg};
                border: 2px solid ${isSelected ? "#ffffff" : style.border};
                color: ${style.text};
                border-radius: 12px;
                padding: 4px 8px;
                display: flex;
                align-items: center;
                gap: 4px;
                font-family: 'Open Sans', sans-serif;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
                box-shadow: 0 4px 12px rgba(0,0,0,0.6);
                cursor: pointer;
                transform: ${isSelected ? "scale(1.15)" : "scale(1)"};
                transition: transform 0.2s ease;
              ">
                <span>${primary ? primary.icon : "⛑️"}</span>
                <span>${escapeHtml(shortTitle)}</span>
              </div>
            </div>
          `,
          iconSize: [110, 34],
          iconAnchor: [55, 17],
        });

        const marker = L.marker([camp.lat, camp.lng], { icon: campIcon });

        const distance = userLocation
          ? formatDistance(haversineKm(userLocation, { lat: camp.lat, lng: camp.lng }))
          : "";
        const chips = (camp.specialties || [])
          .map((id) => getSpecialty(id))
          .filter(Boolean)
          .map(
            (s) => `<span style="
              background: ${s.color}22;
              color: #17202e;
              border: 1px solid ${s.color};
              border-radius: 10px;
              padding: 1px 6px;
              font-size: 10px;
              font-weight: 600;
              margin-right: 4px;
              display: inline-block;
            ">${s.icon} ${escapeHtml(s.label)}</span>`
          )
          .join("");

        const statusLabel =
          camp.status === CAMP_STATUS.ONGOING
            ? "● Ongoing now"
            : camp.status === CAMP_STATUS.UPCOMING
            ? "● Upcoming"
            : "● Finished";

        const popupContent = `
          <div style="font-family: 'Open Sans', sans-serif; padding: 4px; min-width: 230px; max-width: 280px;">
            <div style="font-size: 11px; font-weight: 700; color: ${style.pulse ? "#0a8f45" : "#08218f"}; margin-bottom: 4px;">
              ${statusLabel}
            </div>
            <div style="font-size: 14px; font-weight: bold; color: #17202e; margin-bottom: 2px;">
              ${escapeHtml(camp.title)}
            </div>
            <div style="font-size: 12px; color: #555; margin-bottom: 6px;">
              ${escapeHtml(camp.titleBn)}
            </div>
            <div style="font-size: 11px; color: #17202e; margin-bottom: 6px;">
              🗓️ ${escapeHtml(formatCampWindow(camp))}
            </div>
            <div style="margin-bottom: 6px;">${chips}</div>
            <div style="font-size: 11px; color: #555; margin-bottom: 2px;">
              📍 ${escapeHtml(camp.venue)}${camp.upazila ? `, ${escapeHtml(camp.upazila)}` : ""}${distance ? ` · ${distance}` : ""}
            </div>
            <div style="font-size: 11px; color: #555; margin-bottom: 8px;">
              🏳️ ${escapeHtml(camp.organizer)} · ${camp.isFree ? "Free" : `৳${camp.fee}`}
            </div>
            <div style="display: flex; gap: 6px;">
              <a href="${directionsUrl(userLocation, camp)}" target="_blank" rel="noopener noreferrer" style="
                background: #17202e;
                color: #6ae4ff;
                padding: 4px 10px;
                border-radius: 4px;
                text-decoration: none;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
              ">
                🧭 Directions
              </a>
              <a href="tel:${escapeHtml(camp.phone)}" style="
                background: #34ed7b;
                color: #000;
                padding: 4px 10px;
                border-radius: 4px;
                text-decoration: none;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
              ">
                📞 Call
              </a>
            </div>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on("click", () => onSelect && onSelect(camp));
        layer.addLayer(marker);

        if (isSelected) {
          map.flyTo([camp.lat, camp.lng], 14, { duration: 0.8 });
          marker.openPopup();
        }
      });

      // Frame the whole camp list once, the first time markers are drawn. This
      // lives here rather than in its own effect because this effect is the one
      // that re-runs when the camp data actually arrives.
      //
      // camps.length matters: this effect also runs while the fetch is still in
      // flight, and fitting to the lone user pin there would zoom to the street
      // the visitor is standing on and use up the one-shot fit.
      if (didFitBoundsRef.current || selected || camps.length === 0) return;

      const points = camps
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
        .map((c) => [c.lat, c.lng]);
      if (userLocation) points.push([userLocation.lat, userLocation.lng]);
      if (points.length === 0) return;

      pendingFitRef.current = points;
      attemptFit();
    });
  }, [camps, selected, userLocation, mapReady, onSelect, attemptFit]);

  // Render the optional permanent-hospital layer
  useEffect(() => {
    if (!mapInstanceRef.current || !hospitalsLayerRef.current) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      const map = mapInstanceRef.current;
      const layer = hospitalsLayerRef.current;
      if (!map || !layer) return;

      layer.clearLayers();

      if (!showHospitals) {
        if (map.hasLayer(layer)) map.removeLayer(layer);
        return;
      }

      hospitals.forEach((h) => {
        const hospitalIcon = L.divIcon({
          className: "custom-hospital-marker",
          html: `
            <div style="
              background: rgba(23, 32, 46, 0.94);
              border: 1px dashed #c8d6e5;
              color: #c8d6e5;
              border-radius: 12px;
              padding: 3px 7px;
              display: flex;
              align-items: center;
              gap: 4px;
              font-family: 'Open Sans', sans-serif;
              font-size: 10px;
              font-weight: 600;
              white-space: nowrap;
              box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            ">
              <span>🏥</span>
              <span>${escapeHtml(h.name.split(" ")[0])}</span>
            </div>
          `,
          iconSize: [90, 26],
          iconAnchor: [45, 13],
        });

        const distance = userLocation
          ? formatDistance(haversineKm(userLocation, { lat: h.lat, lng: h.lng }))
          : "";

        const marker = L.marker([h.lat, h.lng], { icon: hospitalIcon }).bindPopup(`
          <div style="font-family: 'Open Sans', sans-serif; padding: 4px; min-width: 200px;">
            <div style="font-size: 14px; font-weight: bold; color: #17202e; margin-bottom: 2px;">
              ${escapeHtml(h.name)}
            </div>
            <div style="font-size: 12px; color: #555; margin-bottom: 6px;">
              ${escapeHtml(h.nameBn)} · ${escapeHtml(h.type)}
            </div>
            <div style="font-size: 11px; color: #08218f; font-weight: 600; margin-bottom: 8px;">
              📍 ${escapeHtml(h.address)}${distance ? ` · ${distance}` : ""} (${h.open ? "Open 24/7" : "Closed"})
            </div>
            <div style="display: flex; gap: 6px;">
              <a href="${directionsUrl(userLocation, h)}" target="_blank" rel="noopener noreferrer" style="
                background: #17202e; color: #6ae4ff; padding: 4px 10px; border-radius: 4px;
                text-decoration: none; font-size: 11px; font-weight: 600; display: inline-block;
              ">🧭 Directions</a>
              <a href="tel:${escapeHtml(h.phone)}" style="
                background: #34ed7b; color: #000; padding: 4px 10px; border-radius: 4px;
                text-decoration: none; font-size: 11px; font-weight: 600; display: inline-block;
              ">📞 Call</a>
            </div>
          </div>
        `);

        layer.addLayer(marker);
      });

      if (!map.hasLayer(layer)) layer.addTo(map);
    });
  }, [hospitals, showHospitals, userLocation, mapReady]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Leaflet Map DOM Container */}
      <div ref={mapContainerRef} style={{ width: "100%", height: "100%", background: "#17202e" }} />

      {/* Floating Map Controls & Overlays */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 24,
          zIndex: 500,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            background: "rgba(23, 32, 46, 0.92)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(106, 228, 255, 0.3)",
            borderRadius: "var(--radius-badges)",
            padding: "4px 12px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-spectral-cyan)", fontWeight: 600 }}>
            🗺️ OpenStreetMap
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {[
              { id: "dark", label: "🌙 Dark" },
              { id: "standard", label: "☀️ Standard" },
              { id: "satellite", label: "🛰️ Satellite" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setTileMode(mode.id)}
                style={{
                  background: tileMode === mode.id ? "var(--color-spectral-cyan)" : "var(--color-tide-card)",
                  color: tileMode === mode.id ? "#000000" : "var(--color-bone-white)",
                  border: "1px solid var(--color-carbon-black)",
                  borderRadius: "var(--radius-badges)",
                  padding: "2px 8px",
                  fontSize: 10,
                  fontWeight: tileMode === mode.id ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {userLocation && (
          <button
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.flyTo([userLocation.lat, userLocation.lng], 15);
              }
            }}
            style={{
              background: "rgba(23, 32, 46, 0.92)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(106, 228, 255, 0.3)",
              borderRadius: "var(--radius-badges)",
              padding: "6px 14px",
              color: "var(--color-spectral-cyan)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🎯 Re-center GPS
          </button>
        )}
      </div>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 500,
          background: "rgba(23, 32, 46, 0.92)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(106, 228, 255, 0.2)",
          borderRadius: "var(--radius-badges)",
          padding: "8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 10,
          color: "var(--color-fog-gray)",
        }}
      >
        <span><span style={{ color: "#34ed7b" }}>●</span> Ongoing now</span>
        <span><span style={{ color: "#6ae4ff" }}>●</span> Upcoming</span>
        {showHospitals && <span><span style={{ color: "#c8d6e5" }}>●</span> Hospital</span>}
      </div>
    </div>
  );
}

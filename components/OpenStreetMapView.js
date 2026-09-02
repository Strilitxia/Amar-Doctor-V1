"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export default function OpenStreetMapView({
  userLocation,
  hospitals,
  selectedHospital,
  onSelectHospital,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const tileLayerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [tileMode, setTileMode] = useState("dark"); // "dark" | "standard" | "satellite"

  // Initialize Leaflet Map with Official OpenStreetMap (100% Free, NO API KEY)
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let L;
    import("leaflet").then((leafletModule) => {
      L = leafletModule.default || leafletModule;

      if (mapInstanceRef.current) return;

      const initialCenter = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [23.8103, 90.4125]; // Dhaka, Bangladesh

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 13,
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

      // Store layer group for markers
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Switch Tile Modes (Dark OSM / Standard OSM / Satellite)
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      const map = mapInstanceRef.current;

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

  // Render Hospital Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !hospitals) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      const map = mapInstanceRef.current;
      const markersLayer = markersLayerRef.current;

      markersLayer.clearLayers();

      hospitals.forEach((h) => {
        const isSelected = selectedHospital?.id === h.id;
        const lat = userLocation ? userLocation.lat + (h.id - 3) * 0.009 : 23.8103 + (h.id - 3) * 0.009;
        const lng = userLocation ? userLocation.lng + (h.id - 2) * 0.009 : 90.4125 + (h.id - 2) * 0.009;

        const hospitalIcon = L.divIcon({
          className: "custom-hospital-marker",
          html: `
            <div style="
              background: ${isSelected ? "#34ed7b" : "#202a3e"};
              border: 2px solid ${isSelected ? "#ffffff" : "#6ae4ff"};
              color: ${isSelected ? "#000000" : "#6ae4ff"};
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
              <span>🏥</span>
              <span>${h.name.split(" ")[0]}</span>
            </div>
          `,
          iconSize: [80, 30],
          iconAnchor: [40, 15],
        });

        const marker = L.marker([lat, lng], { icon: hospitalIcon });

        const directionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${userLocation?.lat || 23.8103}%2C${userLocation?.lng || 90.4125}%3B${lat}%2C${lng}`;

        const popupContent = `
          <div style="font-family: 'Open Sans', sans-serif; padding: 4px; min-width: 200px;">
            <div style="font-size: 14px; font-weight: bold; color: #17202e; margin-bottom: 2px;">
              ${h.name}
            </div>
            <div style="font-size: 12px; color: #555; margin-bottom: 6px;">
              ${h.nameBn} · ${h.type}
            </div>
            <div style="font-size: 11px; color: #08218f; font-weight: 600; margin-bottom: 8px;">
              📍 Distance: ${h.distance} (${h.open ? "Open 24/7" : "Closed"})
            </div>
            <div style="display: flex; gap: 6px;">
              <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="
                background: #17202e;
                color: #6ae4ff;
                padding: 4px 10px;
                border-radius: 4px;
                text-decoration: none;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
              ">
                🧭 OSM Directions
              </a>
              <a href="tel:${h.phone}" style="
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

        marker.on("click", () => {
          onSelectHospital(h);
        });

        markersLayer.addLayer(marker);

        if (isSelected) {
          map.flyTo([lat, lng], 14, { duration: 0.8 });
          marker.openPopup();
        }
      });
    });
  }, [hospitals, selectedHospital, userLocation, mapReady, onSelectHospital]);

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
            <button
              onClick={() => setTileMode("dark")}
              style={{
                background: tileMode === "dark" ? "var(--color-spectral-cyan)" : "var(--color-tide-card)",
                color: tileMode === "dark" ? "#000000" : "var(--color-bone-white)",
                border: "1px solid var(--color-carbon-black)",
                borderRadius: "var(--radius-badges)",
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: tileMode === "dark" ? 700 : 400,
                cursor: "pointer",
              }}
            >
              🌙 Dark
            </button>
            <button
              onClick={() => setTileMode("standard")}
              style={{
                background: tileMode === "standard" ? "var(--color-spectral-cyan)" : "var(--color-tide-card)",
                color: tileMode === "standard" ? "#000000" : "var(--color-bone-white)",
                border: "1px solid var(--color-carbon-black)",
                borderRadius: "var(--radius-badges)",
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: tileMode === "standard" ? 700 : 400,
                cursor: "pointer",
              }}
            >
              ☀️ Standard
            </button>
            <button
              onClick={() => setTileMode("satellite")}
              style={{
                background: tileMode === "satellite" ? "var(--color-spectral-cyan)" : "var(--color-tide-card)",
                color: tileMode === "satellite" ? "#000000" : "var(--color-bone-white)",
                border: "1px solid var(--color-carbon-black)",
                borderRadius: "var(--radius-badges)",
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: tileMode === "satellite" ? 700 : 400,
                cursor: "pointer",
              }}
            >
              🛰️ Satellite
            </button>
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
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const DHAKA = { lat: 23.8103, lng: 90.4125 };

// Compact map for the organizer form: click (or drag the pin) to set the camp's
// exact coordinates. Uses the same dynamic import("leaflet") SSR-safe pattern as
// components/OpenStreetMapView.js — no API key, no geocoding service.
export default function CampLocationPicker({ value, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);

  // Keep the latest callback without re-running the init effect.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      if (mapRef.current) return;

      const start = value?.lat && value?.lng ? value : DHAKA;
      const map = L.map(containerRef.current, {
        center: [start.lat, start.lng],
        zoom: value?.lat ? 15 : 11,
        zoomControl: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: "osm-dark-tiles",
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: "custom-camp-pin",
        html: `
          <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;">
            <div style="position:absolute;width:34px;height:34px;border-radius:50%;background:rgba(52,237,123,0.25);"></div>
            <div style="position:relative;font-size:22px;line-height:1;">⛑️</div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 30],
      });

      const setPin = (lat, lng) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          const marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
          marker.on("dragend", () => {
            const p = marker.getLatLng();
            onChangeRef.current?.({ lat: p.lat, lng: p.lng });
          });
          markerRef.current = marker;
        }
        onChangeRef.current?.({ lat, lng });
      };

      map.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng));

      if (value?.lat && value?.lng) setPin(value.lat, value.lng);

      mapRef.current = map;
      setReady(true);

      // Centre on the organizer's own position when nothing is chosen yet, so a
      // field worker only has to nudge the pin.
      if (!value?.lat && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!mapRef.current) return;
            mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 14);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
    // Intentionally runs once: later `value` changes come from this map itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={containerRef} className="camp-picker" id="camp-location-picker" />
      <div className="camp-picker__readout">
        {value?.lat && value?.lng ? (
          <>
            📍 <strong>{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</strong> — tap the map or drag the
            pin to adjust.
          </>
        ) : (
          <>{ready ? "Tap the map to drop a pin on the camp venue." : "Loading map..."}</>
        )}
      </div>
    </div>
  );
}

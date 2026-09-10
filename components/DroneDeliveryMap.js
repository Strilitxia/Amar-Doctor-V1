"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { DRONE_HUBS } from "@/lib/droneDeliveryData";
import { computeTelemetry } from "@/lib/droneDeliveryEngine";

// Live flight map. Same SSR-safe dynamic-import pattern as
// components/OpenStreetMapView.js and components/CampLocationPicker.js — no API
// key, no geocoding service, OpenStreetMap tiles only.
//
// THE IMPORTANT DESIGN DECISION IN THIS FILE:
//
// The drone marker is animated by a requestAnimationFrame loop that lives
// entirely OUTSIDE React. It reads the order from a ref, calls computeTelemetry
// itself, and moves the marker imperatively. It never calls setState, so this
// component does not re-render at 60fps and the Leaflet map is never rebuilt.
//
// The panel next to it updates from a separate 1 Hz interval in DroneClient.
// Two clocks, deliberately: text is only legible at ~1 Hz and 60 React renders
// a second would burn the frame budget on the low-end Android phones this app
// targets, but a marker that only moved once a second would visibly hop.
export default function DroneDeliveryMap({
  order,
  telemetry,
  clockOffsetMs = 0,
  lang = "en",
  simulatedOnly = false,
}) {
  const bn = lang === "bn";

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hubsLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const flownLineRef = useRef(null);
  const remainingLineRef = useRef(null);
  const destMarkerRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const pendingFitRef = useRef(null);
  const rafRef = useRef(null);
  const lastPathUpdateRef = useRef(0);
  const followRef = useRef(false);
  const lastPanRef = useRef(0);

  // Kept in refs so the rAF loop always sees the latest values without being
  // torn down and restarted on every order change.
  const orderRef = useRef(order);
  const offsetRef = useRef(clockOffsetMs);
  useEffect(() => { orderRef.current = order; }, [order]);
  useEffect(() => { offsetRef.current = clockOffsetMs; }, [clockOffsetMs]);

  const [follow, setFollow] = useState(true);
  // Leaflet is imported asynchronously, so the layer effects below would
  // otherwise run before the map exists, bail out, and never re-run (their only
  // other dependency is the order id, which does not change). This flag is what
  // re-triggers them once the map is genuinely ready.
  const [mapReady, setMapReady] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => { followRef.current = follow; }, [follow]);

  /* ---- prefers-reduced-motion ---------------------------------------- */
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  /* ---- Init (runs once) ----------------------------------------------- */
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      // React StrictMode double-invokes effects in dev; without this guard
      // Leaflet throws "map container is already initialized".
      if (mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [23.8103, 90.4125],
        zoom: 11,
        zoomControl: false,
        attributionControl: true,
      });

      L.control.zoom({ position: "topright" }).addTo(map);

      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: "osm-dark-tiles",
      }).addTo(map);

      // Offline: tiles never arrive. The container is already abyss-navy, so
      // markers and the route stay perfectly legible over an empty field — we
      // just have to say so, and label the pins since there is no basemap to
      // orient against.
      tiles.on("tileerror", () => setTilesFailed(true));

      hubsLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);

      // Never fight the user: dragging turns auto-follow off.
      map.on("dragstart", () => setFollow(false));

      mapRef.current = map;
      setMapReady(true);

      // fitBounds before the container has a size collapses to zoom 0, so the
      // fit is deferred until a ResizeObserver says the box is real. Same guard
      // as components/OpenStreetMapView.js.
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => {
          if (!mapRef.current) return;
          mapRef.current.invalidateSize();
          attemptFit();
        });
        observer.observe(containerRef.current);
        resizeObserverRef.current = observer;
      }

      attemptFit();
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      hubsLayerRef.current = null;
      routeLayerRef.current = null;
      droneMarkerRef.current = null;
      flownLineRef.current = null;
      remainingLineRef.current = null;
      destMarkerRef.current = null;
      setMapReady(false);
    };
    // Intentionally runs once — every later change is applied imperatively.
  }, []);

  function attemptFit() {
    const map = mapRef.current;
    const points = pendingFitRef.current;
    if (!map || !points || !points.length) return;
    const size = map.getSize();
    if (!size || size.x < 40 || size.y < 40) return;
    map.fitBounds(points, { padding: [50, 50], maxZoom: 14 });
    pendingFitRef.current = null;
  }

  /* ---- Static layers: hubs, destination, planned route ----------------- */
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !order) return;

    import("leaflet").then((leafletModule) => {
      const L = leafletModule.default || leafletModule;
      if (!mapRef.current) return;

      hubsLayerRef.current?.clearLayers();
      routeLayerRef.current?.clearLayers();

      // --- hubs ---
      for (const hub of DRONE_HUBS) {
        const isActive = hub.id === order.hubId;
        const label = bn ? hub.nameBn : hub.name;
        const icon = L.divIcon({
          className: `drn-marker-hub ${isActive ? "drn-marker-hub--active" : ""}`,
          html: `
            <div style="position:relative;width:${isActive ? 30 : 20}px;height:${isActive ? 30 : 20}px;display:flex;align-items:center;justify-content:center;">
              <div class="drn-marker-hub__ring"></div>
              <div style="position:relative;font-size:${isActive ? 18 : 12}px;line-height:1;">${isActive ? "🏥" : "▫️"}</div>
              ${isActive ? `<span class="drn-marker-label">${escapeHtml(label)}</span>` : ""}
            </div>
          `,
          iconSize: [isActive ? 30 : 20, isActive ? 30 : 20],
          iconAnchor: [isActive ? 15 : 10, isActive ? 15 : 10],
        });
        L.marker([hub.lat, hub.lng], { icon }).addTo(hubsLayerRef.current);
      }

      // --- planned route, drawn under everything else ---
      const planned = [
        [order.hub.lat, order.hub.lng],
        ...(order.route || [])
          .filter((l) => l.phase !== "return")
          .map((l) => [l.toLat, l.toLng]),
      ];
      L.polyline(planned, {
        color: "#6ae4ff",
        weight: 1,
        opacity: 0.25,
        dashArray: "2 8",
      }).addTo(routeLayerRef.current);

      const ret = (order.route || []).find((l) => l.phase === "return");
      if (ret) {
        L.polyline(
          [
            [ret.fromLat, ret.fromLng],
            [ret.toLat, ret.toLng],
          ],
          { color: "#cdd0d6", weight: 1, opacity: 0.18, dashArray: "4 10" }
        ).addTo(routeLayerRef.current);
      }

      // --- flown / remaining, updated every frame by the rAF loop ---
      remainingLineRef.current = L.polyline([], {
        color: "#6ae4ff",
        weight: 2,
        opacity: 0.55,
        dashArray: "6 8",
      }).addTo(routeLayerRef.current);

      flownLineRef.current = L.polyline([], {
        color: "#34edb3",
        weight: 3,
        opacity: 0.95,
      }).addTo(routeLayerRef.current);

      // --- destination ---
      const destLabel = bn ? order.destination.labelBn : order.destination.label;
      destMarkerRef.current = L.marker([order.destination.lat, order.destination.lng], {
        icon: L.divIcon({
          className: "drn-marker-dest",
          html: `
            <div style="position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;">
              <div class="drn-marker-dest__ring"></div>
              <div style="position:relative;font-size:18px;line-height:1;">📍</div>
              <span class="drn-marker-label">${escapeHtml(destLabel || "")}</span>
            </div>
          `,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      }).addTo(routeLayerRef.current);

      // --- the drone ---
      droneMarkerRef.current = L.marker([order.hub.lat, order.hub.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: "drn-marker-drone",
          html: `
            <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
              <div class="drn-marker-drone__rotor"></div>
              <div class="drn-marker-drone__body">🚁</div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      }).addTo(routeLayerRef.current);

      pendingFitRef.current = [
        [order.hub.lat, order.hub.lng],
        [order.destination.lat, order.destination.lng],
      ];
      attemptFit();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, order?.id, bn]);

  /* ---- Destination moved (re-route) ------------------------------------ */
  useEffect(() => {
    if (!destMarkerRef.current || !order?.destination) return;
    destMarkerRef.current.setLatLng([order.destination.lat, order.destination.lng]);
    // Only the two coordinates matter; depending on the whole `order` object
    // would re-run this on every unrelated field change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.destination?.lat, order?.destination?.lng]);

  /* ---- The animation loop ---------------------------------------------
     Touches no React state, so this component never re-renders from it. */
  useEffect(() => {
    if (!mapReady || !order) return;

    // Reduced motion: skip the loop entirely. The marker is still live, it just
    // steps once a second from the `telemetry` prop (see the effect below).
    if (reducedMotion) return;

    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      const current = orderRef.current;
      const marker = droneMarkerRef.current;
      if (!current || !marker) return;

      const t = computeTelemetry(current, Date.now() + offsetRef.current);
      if (!t) return;

      marker.setLatLng([t.position.lat, t.position.lng]);
      marker.getElement()?.querySelector(".drn-marker-drone__body")
        ?.style.setProperty("--drn-rot", `${t.headingDeg}deg`);

      // setLatLngs on a growing array is the expensive call here, and the path
      // does not need 60 Hz to look continuous.
      const now = performance.now();
      if (now - lastPathUpdateRef.current > 100) {
        lastPathUpdateRef.current = now;
        flownLineRef.current?.setLatLngs(t.flownPath);
        remainingLineRef.current?.setLatLngs(t.remainingPath);
      }

      if (followRef.current && mapRef.current && now - lastPanRef.current > 500) {
        lastPanRef.current = now;
        mapRef.current.panTo([t.position.lat, t.position.lng], { animate: false });
      }
    };

    rafRef.current = requestAnimationFrame(render);

    // Battery courtesy only — correctness does not need this, because telemetry
    // is derived from the wall clock and is therefore always right on return.
    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, order?.id, reducedMotion]);

  /* ---- 1 Hz floor ------------------------------------------------------
     Drives the marker from the telemetry prop whether or not reduced motion is
     on. This is the correctness floor: requestAnimationFrame does not fire at
     all in a hidden or backgrounded tab, and some browsers throttle it hard, so
     without this the marker could sit at the hub while the panel counts down.
     When the rAF loop is running it simply overwrites this a few milliseconds
     later with a smoother value. */
  useEffect(() => {
    if (!telemetry || !droneMarkerRef.current) return;
    droneMarkerRef.current.setLatLng([telemetry.position.lat, telemetry.position.lng]);
    droneMarkerRef.current
      .getElement()
      ?.querySelector(".drn-marker-drone__body")
      ?.style.setProperty("--drn-rot", `${telemetry.headingDeg}deg`);
    flownLineRef.current?.setLatLngs(telemetry.flownPath);
    remainingLineRef.current?.setLatLngs(telemetry.remainingPath);
  }, [telemetry]);

  return (
    <div className="drn-map" id="drone-map">
      <div ref={containerRef} className="drn-map__canvas" />

      {simulatedOnly && (
        <div className="drn-map__ribbon">
          {bn ? "সিমুলেশন — পাঠানো হয়নি" : "Simulation — not dispatched"}
        </div>
      )}

      <div className="drn-map__legend">
        <span>🏥 {bn ? "সাপোর্ট সেন্টার" : "Support centre"}</span>
        <span>🚁 {bn ? "ড্রোন" : "Drone"}</span>
        <span>📍 {bn ? "আপনার অবস্থান" : "Your location"}</span>
      </div>

      {tilesFailed && (
        <div className="drn-map__offline">
          {bn
            ? "মানচিত্র অফলাইনে লোড হচ্ছে না — ট্র্যাকিং চালু আছে।"
            : "Map tiles unavailable offline — tracking continues."}
        </div>
      )}

      <button
        type="button"
        className={`drn-map__follow ${follow ? "drn-map__follow--on" : ""}`}
        onClick={() => setFollow((v) => !v)}
      >
        {follow ? "🎯 " : "○ "}
        {bn ? "ড্রোন অনুসরণ" : "Follow drone"}
      </button>
    </div>
  );
}

// Popups and labels are built as HTML strings (the house pattern in
// components/OpenStreetMapView.js), so anything interpolated has to be escaped.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

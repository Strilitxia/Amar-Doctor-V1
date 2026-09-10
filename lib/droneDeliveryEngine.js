/* ==========================================================================
   Drone medicine delivery — flight engine
   ==========================================================================
   Pure, synchronous, zero-dependency. Same contract as lib/symptomScoringEngine.js
   and lib/campsData.js's validateCamp: no I/O, no DOM, no fetch, so BOTH the
   client and the API route import this and cannot disagree about a flight plan.

   The single most important property in this file:

       computeTelemetry(order, nowMs) is a PURE FUNCTION.

   Nothing accumulates. There is no running position, no tick counter, no
   "distance so far" that has to be kept in sync. Every value is re-derived from
   the stored `launchedAt` timestamp plus the current wall clock. That is what
   makes a reload resume the flight at exactly the right point, what lets two
   tabs show the same drone with no messaging between them, and what makes a
   laptop waking from sleep simply correct instead of needing catch-up logic.
   ========================================================================== */

import { haversineKm, toBnDigits, BD_BOUNDS } from "@/lib/campsData";
import {
  DRONE_HUBS,
  FLEET,
  DELIVERY_STAGES,
  getCatalogItem,
  getHub,
} from "@/lib/droneDeliveryData";

/* --------------------------------------------------------------------------
   Geometry
   -------------------------------------------------------------------------- */

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Initial great-circle bearing, 0 = north, used only to rotate the marker.
export function bearingDeg(a, b) {
  if (!a || !b) return 0;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Linear interpolation on raw lat/lng — deliberately NOT a great-circle slerp.
//
// L.polyline renders a straight segment in Web Mercator screen space, so a
// slerped marker would drift off the very line the user is watching. Linear
// interpolation is the only choice that keeps the drone exactly on its own
// drawn track. At our maximum leg length (30 km, ~24°N) the divergence between
// the two is sub-metre — orders of magnitude below one screen pixel at zoom 13.
//
// Scalars (distance flown, remaining, ETA) still use haversineKm. Linear is for
// POSITION ONLY.
export function interpolate(a, b, t) {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    lat: a.lat + (b.lat - a.lat) * clamped,
    lng: a.lng + (b.lng - a.lng) * clamped,
  };
}

/* --------------------------------------------------------------------------
   Hub selection
   -------------------------------------------------------------------------- */

// Stock is a hub-SELECTION input, not a post-hoc rejection. If we picked the
// nearest hub first and only then checked stock, we would tell the user "out of
// stock" when a hub 4 km further away had everything.
//
// On failure the caller gets `nearest` too, so the UI can say "Nearest hub is
// Savar, 41.2 km — 11.2 km beyond our 30 km range" instead of a blank error.
export function pickNearestHub(destination, { requireItems = [] } = {}) {
  if (!destination || typeof destination.lat !== "number" || typeof destination.lng !== "number") {
    return { hub: null, distanceKm: null, reason: "no_destination", nearest: null };
  }

  const active = DRONE_HUBS.filter((h) => h.active);
  if (!active.length) {
    return { hub: null, distanceKm: null, reason: "no_active_hub", nearest: null };
  }

  const withDistance = active
    .map((hub) => ({ hub, distanceKm: haversineKm(hub, destination) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearestOverall = withDistance[0];

  const hasStock = (hub) =>
    requireItems.every((line) => {
      if (!line || !line.itemId) return true;
      const held = hub.stock?.[line.itemId] ?? 0;
      return held >= (line.qty || 1);
    });

  const stocked = withDistance.filter(({ hub }) => hasStock(hub));
  if (!stocked.length) {
    return {
      hub: null,
      distanceKm: null,
      reason: "no_stock",
      nearest: { ...nearestOverall, shortfallKm: 0 },
    };
  }

  const inRange = stocked.find(
    ({ hub, distanceKm }) => distanceKm <= Math.min(hub.serviceRadiusKm, FLEET.maxOneWayKm)
  );

  if (!inRange) {
    const closestStocked = stocked[0];
    const limit = Math.min(closestStocked.hub.serviceRadiusKm, FLEET.maxOneWayKm);
    return {
      hub: null,
      distanceKm: null,
      reason: "out_of_range",
      nearest: { ...closestStocked, shortfallKm: closestStocked.distanceKm - limit },
    };
  }

  return {
    hub: inRange.hub,
    distanceKm: inRange.distanceKm,
    reason: null,
    nearest: { ...nearestOverall, shortfallKm: 0 },
  };
}

/* --------------------------------------------------------------------------
   Flight planning
   -------------------------------------------------------------------------- */

function cruiseSeconds(distanceKm, speedKmh = FLEET.cruiseSpeedKmh) {
  return Math.max((distanceKm / speedKmh) * 3600, FLEET.minCruiseS);
}

// Prep and handoff are included in the headline flight time on purpose: they
// are physically real (packing, pre-flight checks, hovering while the package
// is lowered) and they give the status timeline more than one state to show.
export function estimateFlight(distanceKm, speedKmh = FLEET.cruiseSpeedKmh) {
  const cruiseS = cruiseSeconds(distanceKm, speedKmh);
  return {
    cruiseS,
    totalS: FLEET.prepS + FLEET.climbS + cruiseS + FLEET.descentS + FLEET.handoffS,
    distanceKm,
  };
}

// The route is an ARRAY OF LEGS rather than a single hub->destination pair.
// That is what makes a mid-flight re-route possible without teleporting the
// drone: applyReroute() truncates the active leg at the drone's exact current
// position and appends a new one starting from there.
//
// `startMissionS` is measured from launch, and the cruise legs begin after prep
// and climb are done.
export function planRoute(hub, destination, speedKmh = FLEET.cruiseSpeedKmh) {
  const distanceKm = haversineKm(hub, destination);
  return [
    {
      seq: 0,
      phase: "outbound",
      fromLat: hub.lat,
      fromLng: hub.lng,
      toLat: destination.lat,
      toLng: destination.lng,
      distanceKm,
      startMissionS: FLEET.prepS + FLEET.climbS,
      durationS: cruiseSeconds(distanceKm, speedKmh),
    },
  ];
}

const legFrom = (leg) => ({ lat: leg.fromLat, lng: leg.fromLng });
const legTo = (leg) => ({ lat: leg.toLat, lng: leg.toLng });

const outboundLegs = (route) => (route || []).filter((l) => l.phase !== "return");

// End of the last delivery leg, in mission seconds. Everything after this is
// descent, handoff, then the drone's own trip home.
function cruiseEndMissionS(order) {
  const legs = outboundLegs(order.route);
  if (!legs.length) return FLEET.prepS + FLEET.climbS;
  const last = legs[legs.length - 1];
  return last.startMissionS + last.durationS;
}

function timings(order) {
  return { ...FLEET, ...(order.timings || {}) };
}

// Mission seconds from launch to the moment the package is in the user's hands.
export function deliveredAtMissionS(order) {
  const t = timings(order);
  return cruiseEndMissionS(order) + t.descentS + t.handoffS;
}

export function plannedDistanceKm(order) {
  return outboundLegs(order.route).reduce((sum, l) => sum + l.distanceKm, 0);
}

/* --------------------------------------------------------------------------
   Telemetry
   -------------------------------------------------------------------------- */

// `timeScale` compresses the WALL CLOCK, never the physics. A 12 km delivery is
// genuinely a 15-minute mission and the panel says so; at the default scale of 8
// that quarter hour of simulated time elapses in about two real minutes. The
// alternative — inflating cruiseSpeedKmh to 240 — would make every readout
// self-consistent but would have the app reporting a 240 km/h drone, which is a
// lie we are not willing to tell in a medical product.
export function missionSecondsAt(order, nowMs) {
  const launched = Date.parse(order?.launchedAt);
  if (!Number.isFinite(launched)) return 0;
  const scale = order.timeScale || FLEET.defaultTimeScale;
  return Math.max(0, ((nowMs - launched) / 1000) * scale);
}

function stageAt(order, missionS) {
  const t = timings(order);
  const cruiseStart = t.prepS + t.climbS;
  const cruiseEnd = cruiseEndMissionS(order);
  const descentEnd = cruiseEnd + t.descentS;
  const handoffEnd = descentEnd + t.handoffS;

  if (missionS < t.prepS) return "preparing";
  if (missionS < cruiseStart) return "climbing";
  if (missionS < cruiseEnd) return "enroute";
  if (missionS < descentEnd) return "descending";
  if (missionS < handoffEnd) return "handoff";

  const ret = (order.route || []).find((l) => l.phase === "return");
  if (!ret) return "delivered";
  // "Delivered" is a moment, not a phase, so the return leg starts a beat later
  // (FLEET.deliveredHoldS) and this window is what keeps the success state on
  // screen long enough to read instead of flashing past.
  if (missionS < ret.startMissionS) return "delivered";
  if (missionS < ret.startMissionS + ret.durationS) return "returning";
  return "completed";
}

function positionAt(order, missionS) {
  const t = timings(order);
  const legs = order.route || [];
  const outbound = outboundLegs(legs);
  const hubPoint = order.hub
    ? { lat: order.hub.lat, lng: order.hub.lng }
    : outbound[0]
      ? legFrom(outbound[0])
      : { lat: 0, lng: 0 };

  // Before cruise begins the drone is still on the pad.
  if (missionS < t.prepS + t.climbS) {
    const next = outbound[0] ? legTo(outbound[0]) : hubPoint;
    return { position: hubPoint, heading: bearingDeg(hubPoint, next), legIndex: -1 };
  }

  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    const end = leg.startMissionS + leg.durationS;
    if (missionS >= leg.startMissionS && missionS < end) {
      const t01 = leg.durationS > 0 ? (missionS - leg.startMissionS) / leg.durationS : 1;
      return {
        position: interpolate(legFrom(leg), legTo(leg), t01),
        heading: bearingDeg(legFrom(leg), legTo(leg)),
        legIndex: i,
      };
    }
  }

  // Between legs or past them all: park at the end of the last leg that has
  // actually STARTED. This matters during descent/handoff and the delivered
  // hold, when the return leg exists but has not begun — taking legs[last]
  // there would put the drone back at its hub while it is still hovering over
  // the patient.
  let started = null;
  for (const leg of legs) {
    if (missionS >= leg.startMissionS) started = leg;
  }
  if (!started) return { position: hubPoint, heading: 0, legIndex: -1 };
  return {
    position: legTo(started),
    heading: bearingDeg(legFrom(started), legTo(started)),
    legIndex: legs.indexOf(started),
  };
}

// Distance actually covered along the delivery legs so far.
function flownKmAt(order, missionS) {
  let flown = 0;
  for (const leg of outboundLegs(order.route)) {
    const end = leg.startMissionS + leg.durationS;
    if (missionS >= end) {
      flown += leg.distanceKm;
    } else if (missionS > leg.startMissionS) {
      const t01 = leg.durationS > 0 ? (missionS - leg.startMissionS) / leg.durationS : 1;
      flown += leg.distanceKm * t01;
    }
  }
  return flown;
}

function buildPaths(order, missionS, position, legIndex) {
  const legs = order.route || [];
  const outbound = outboundLegs(legs);

  const flownPath = [];
  const remainingPath = [];

  const hubPoint = order.hub ? { lat: order.hub.lat, lng: order.hub.lng } : null;
  if (hubPoint) flownPath.push([hubPoint.lat, hubPoint.lng]);

  for (let i = 0; i < outbound.length; i += 1) {
    const leg = outbound[i];
    const end = leg.startMissionS + leg.durationS;
    if (missionS >= end) {
      flownPath.push([leg.toLat, leg.toLng]);
    } else if (i === legIndex) {
      flownPath.push([position.lat, position.lng]);
      remainingPath.push([position.lat, position.lng], [leg.toLat, leg.toLng]);
    } else if (missionS < leg.startMissionS) {
      if (!remainingPath.length) remainingPath.push([leg.fromLat, leg.fromLng]);
      remainingPath.push([leg.toLat, leg.toLng]);
    }
  }

  // Still on the pad: the whole planned route is ahead.
  if (!remainingPath.length && legIndex === -1 && outbound.length) {
    remainingPath.push([outbound[0].fromLat, outbound[0].fromLng]);
    for (const leg of outbound) remainingPath.push([leg.toLat, leg.toLng]);
  }

  const ret = legs.find((l) => l.phase === "return");
  const returnPath = ret
    ? [
        [ret.fromLat, ret.fromLng],
        [ret.toLat, ret.toLng],
      ]
    : null;

  return { flownPath, remainingPath, returnPath };
}

function buildTimeline(order, missionS, launchedMs) {
  const t = timings(order);
  const scale = order.timeScale || FLEET.defaultTimeScale;
  const cruiseStart = t.prepS + t.climbS;
  const cruiseEnd = cruiseEndMissionS(order);
  const ret = (order.route || []).find((l) => l.phase === "return");

  const at = {
    queued: 0,
    preparing: 0,
    climbing: t.prepS,
    enroute: cruiseStart,
    descending: cruiseEnd,
    handoff: cruiseEnd + t.descentS,
    delivered: cruiseEnd + t.descentS + t.handoffS,
    returning: ret ? ret.startMissionS : null,
    completed: ret ? ret.startMissionS + ret.durationS : null,
  };

  const current = stageAt(order, missionS);

  return DELIVERY_STAGES.filter((s) => at[s.id] !== null).map((s) => ({
    ...s,
    atMissionS: at[s.id],
    // Wall-clock instant this stage begins, un-scaled back to real time so the
    // UI can print an actual "9:42 pm".
    atWallMs: launchedMs + (at[s.id] / scale) * 1000,
    done: missionS >= at[s.id],
    active: s.id === current,
  }));
}

export function computeTelemetry(order, nowMs) {
  if (!order || !order.launchedAt) return null;

  const t = timings(order);
  const scale = order.timeScale || FLEET.defaultTimeScale;
  const launchedMs = Date.parse(order.launchedAt);
  const missionS = missionSecondsAt(order, nowMs);

  const stage = stageAt(order, missionS);
  const { position, heading, legIndex } = positionAt(order, missionS);

  const totalKm = plannedDistanceKm(order);
  const flownKm = Math.min(flownKmAt(order, missionS), totalKm);
  const remainingKm = Math.max(totalKm - flownKm, 0);

  // A 200 m delivery must not divide by zero.
  const progress = totalKm > 0 ? Math.min(flownKm / totalKm, 1) : missionS > 0 ? 1 : 0;

  const deliveredAt = deliveredAtMissionS(order);
  const etaSeconds = Math.max(deliveredAt - missionS, 0);

  // Altitude ramps rather than snapping, so the readout tells the take-off and
  // landing story instead of jumping 0 -> 90 -> 0.
  let altitudeM = 0;
  const cruiseEnd = cruiseEndMissionS(order);
  if (missionS >= t.prepS && missionS < t.prepS + t.climbS) {
    altitudeM = t.cruiseAltitudeM * ((missionS - t.prepS) / t.climbS);
  } else if (missionS >= t.prepS + t.climbS && missionS < cruiseEnd) {
    altitudeM = t.cruiseAltitudeM;
  } else if (missionS >= cruiseEnd && missionS < cruiseEnd + t.descentS) {
    altitudeM = t.cruiseAltitudeM * (1 - (missionS - cruiseEnd) / t.descentS);
  } else if (stage === "returning") {
    altitudeM = t.cruiseAltitudeM;
  }

  const moving = stage === "enroute" || stage === "returning";
  const groundSpeedKmh = moving ? order.speedKmh || FLEET.cruiseSpeedKmh : 0;

  // Battery burns on airborne seconds only — sitting on the pad during prep
  // costs nothing.
  const airborneS = Math.max(missionS - t.prepS, 0);
  const enduranceS = t.enduranceMinutes * 60;
  const batteryPct = Math.max(0, Math.min(100, 100 - (airborneS / enduranceS) * 100));

  const ret = (order.route || []).find((l) => l.phase === "return");
  const fullMissionS = ret ? ret.startMissionS + ret.durationS : deliveredAt;
  const batteryAtReturnPct = Math.max(
    0,
    Math.min(100, 100 - (Math.max(fullMissionS - t.prepS, 0) / enduranceS) * 100)
  );

  const { flownPath, remainingPath, returnPath } = buildPaths(order, missionS, position, legIndex);

  return {
    missionS,
    stage,
    stageIndex: DELIVERY_STAGES.findIndex((s) => s.id === stage),
    position,
    headingDeg: heading,
    altitudeM,
    groundSpeedKmh,
    distanceFlownKm: flownKm,
    distanceRemainingKm: remainingKm,
    totalDistanceKm: totalKm,
    progress,
    etaSeconds,
    // Real wall-clock instant of delivery — etaSeconds is simulated time, so it
    // has to be divided back down by the scale to be a clock prediction.
    etaAtWallMs: nowMs + (etaSeconds / scale) * 1000,
    batteryPct,
    batteryAtReturnPct,
    batteryWarning: batteryAtReturnPct < 20,
    flownPath,
    remainingPath,
    returnPath,
    timeline: buildTimeline(order, missionS, launchedMs),
    isDelivered: missionS >= deliveredAt,
    isDone: stage === "completed" || (!ret && missionS >= deliveredAt),
  };
}

/* --------------------------------------------------------------------------
   Re-route
   -------------------------------------------------------------------------- */

// Returns a NEW order object with the route bent towards `newDestination`, or
// `{ order, changed: false, reason }` when the move should be ignored.
//
// The trick that stops the marker jumping: we truncate the leg the drone is
// currently flying so that it ENDS at the drone's exact present position, then
// append a new leg that STARTS from that same position at that same mission
// time. The drone turns; it never teleports. ETA and remaining distance then
// recompute for free, because both are derived from the leg list.
export function applyReroute(order, newDestination, nowMs) {
  if (!order || !newDestination) return { order, changed: false, reason: "no_input" };

  const telemetry = computeTelemetry(order, nowMs);
  if (!telemetry) return { order, changed: false, reason: "no_telemetry" };

  if (telemetry.stage !== "enroute" && telemetry.stage !== "climbing") {
    // Once the package is being lowered the delivery point is locked.
    return { order, changed: false, reason: "stage_locked" };
  }

  const movedM = haversineKm(order.destination, newDestination) * 1000;
  if (movedM < FLEET.rerouteThresholdM) {
    return { order, changed: false, reason: "below_threshold" };
  }

  const lastReroute = Date.parse(order.lastRerouteAt || 0);
  if (Number.isFinite(lastReroute) && lastReroute > 0) {
    const scale = order.timeScale || FLEET.defaultTimeScale;
    const sinceS = ((nowMs - lastReroute) / 1000) * scale;
    if (sinceS < FLEET.rerouteCooldownS) {
      return { order, changed: false, reason: "cooldown" };
    }
  }

  const t = telemetry.missionS;
  const P = telemetry.position;
  const speed = order.speedKmh || FLEET.cruiseSpeedKmh;

  const kept = [];
  for (const leg of outboundLegs(order.route)) {
    if (leg.startMissionS + leg.durationS <= t) {
      kept.push(leg);
    } else if (leg.startMissionS < t) {
      // The active leg: cut it short exactly where the drone is right now.
      kept.push({
        ...leg,
        toLat: P.lat,
        toLng: P.lng,
        distanceKm: haversineKm(legFrom(leg), P),
        durationS: Math.max(t - leg.startMissionS, 0),
      });
    }
    // Legs entirely in the future are dropped.
  }

  const newDistanceKm = haversineKm(P, newDestination);
  kept.push({
    seq: kept.length,
    phase: "reroute",
    fromLat: P.lat,
    fromLng: P.lng,
    toLat: newDestination.lat,
    toLng: newDestination.lng,
    distanceKm: newDistanceKm,
    startMissionS: t,
    durationS: cruiseSeconds(newDistanceKm, speed),
  });

  const next = {
    ...order,
    destination: { ...order.destination, ...newDestination },
    route: kept,
    lastRerouteAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString(),
  };

  next.plannedDistanceKm = plannedDistanceKm(next);
  next.route = [...kept, buildReturnLeg(next)];
  next.plannedFlightS = deliveredAtMissionS(next);
  next.events = [
    ...(order.events || []),
    {
      at: new Date(nowMs).toISOString(),
      code: "reroute",
      messageEn: `Destination updated — re-routing in flight (${newDistanceKm.toFixed(1)} km to go).`,
      messageBn: `গন্তব্য পরিবর্তিত — আকাশেই নতুন পথ (${toBnDigits(newDistanceKm.toFixed(1))} কিমি বাকি)।`,
    },
  ];

  return { order: next, changed: true, reason: null };
}

// The drone's trip home. Deliberately NOT counted in etaSeconds, progress or
// distanceRemainingKm — the user's delivery is finished at "delivered". It
// exists so the simulation ends with the drone back at its hub instead of
// freezing over the destination.
function buildReturnLeg(order) {
  const hub = order.hub || getHub(order.hubId);
  const dest = order.destination;
  const distanceKm = haversineKm(dest, hub);
  return {
    seq: outboundLegs(order.route).length,
    phase: "return",
    fromLat: dest.lat,
    fromLng: dest.lng,
    toLat: hub.lat,
    toLng: hub.lng,
    distanceKm,
    startMissionS: deliveredAtMissionS(order) + FLEET.deliveredHoldS,
    durationS: cruiseSeconds(distanceKm, order.speedKmh || FLEET.cruiseSpeedKmh),
  };
}

/* --------------------------------------------------------------------------
   Validation
   -------------------------------------------------------------------------- */

// Patient-facing, so errors are { en, bn } pairs rather than the flat strings
// validateCamp uses for the organiser form.
export function validateDroneOrder(payload) {
  const errors = {};
  const p = payload || {};

  const items = Array.isArray(p.items) ? p.items.filter((i) => i && !i.unavailable) : [];
  if (!items.length) {
    errors.items = { en: "Add at least one item to the delivery.", bn: "অন্তত একটি জিনিস যোগ করুন।" };
  }

  const lat = Number(p.destination?.lat);
  const lng = Number(p.destination?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    errors.destination = { en: "Confirm the delivery location on the map.", bn: "মানচিত্রে ডেলিভারির স্থান নিশ্চিত করুন।" };
  } else if (
    lat < BD_BOUNDS.minLat || lat > BD_BOUNDS.maxLat ||
    lng < BD_BOUNDS.minLng || lng > BD_BOUNDS.maxLng
  ) {
    errors.destination = {
      en: "That location is outside Bangladesh. Drop the pin on your actual location.",
      bn: "স্থানটি বাংলাদেশের বাইরে। আপনার প্রকৃত অবস্থানে পিন দিন।",
    };
  }

  const payloadG = items.reduce((sum, i) => sum + (i.weightG || 0) * (i.qty || 1), 0);
  if (payloadG > FLEET.maxPayloadG) {
    errors.payload = {
      en: `Payload is ${payloadG} g — the drone carries ${FLEET.maxPayloadG} g. Remove some items.`,
      bn: `ওজন ${toBnDigits(payloadG)} গ্রাম — ড্রোন ${toBnDigits(FLEET.maxPayloadG)} গ্রাম বহন করে। কিছু কমান।`,
    };
  }

  // Guardrail: a prescription-only medicine can only ride along when it came
  // from a scanned prescription. The manual picker never renders these, and this
  // check makes that structural rather than cosmetic.
  const illegalRx = items.filter((i) => {
    const cat = i.itemId ? getCatalogItem(i.itemId) : null;
    return cat && cat.otc === false && p.source !== "prescription";
  });
  if (illegalRx.length) {
    errors.items = {
      en: "Prescription-only medicines can only be delivered from a scanned prescription.",
      bn: "প্রেসক্রিপশনের ওষুধ শুধু স্ক্যান করা প্রেসক্রিপশন থেকেই পাঠানো যায়।",
    };
  }

  const phone = String(p.contactPhone || "").trim();
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
    errors.contactPhone = { en: "Enter a valid phone number.", bn: "সঠিক ফোন নম্বর দিন।" };
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/* --------------------------------------------------------------------------
   Order construction
   -------------------------------------------------------------------------- */

export function makeOrderId() {
  return `DRN-${Math.random().toString(36).slice(2, 8)}`;
}

function makeDroneCode() {
  return `AD-DRN-${String(Math.floor(Math.random() * 90) + 10)}`;
}

// Builds the full, launched order record. Called by the API route; also used
// client-side to preview a flight plan when the server cannot be reached.
export function normalizeDroneOrder(payload, { nowMs = Date.now() } = {}) {
  const p = payload || {};
  const items = (Array.isArray(p.items) ? p.items : [])
    .filter((i) => i && !i.unavailable)
    .map((i) => {
      const cat = i.itemId ? getCatalogItem(i.itemId) : null;
      const maxQty = cat?.maxQty || 1;
      return {
        itemId: i.itemId || null,
        name: cat?.name || i.name || i.rxText || "Item",
        nameBn: cat?.nameBn || i.nameBn || i.name || "",
        qty: Math.max(1, Math.min(Number(i.qty) || 1, maxQty)),
        weightG: cat?.weightG ?? i.weightG ?? 0,
        requiresRx: cat ? cat.otc === false : false,
        source: i.source || p.source || "manual",
        rxText: i.rxText || null,
        unavailable: false,
      };
    });

  const destination = {
    lat: Number(p.destination.lat),
    lng: Number(p.destination.lng),
    label: p.destination.label || "Your location",
    labelBn: p.destination.labelBn || "আপনার অবস্থান",
  };

  const picked = pickNearestHub(destination, { requireItems: items });
  if (!picked.hub) return { order: null, reason: picked.reason, nearest: picked.nearest };

  const hub = picked.hub;
  const speedKmh = FLEET.cruiseSpeedKmh;
  const launchedAt = new Date(nowMs).toISOString();

  const order = {
    id: makeOrderId(),
    createdAt: launchedAt,
    launchedAt,
    updatedAt: launchedAt,
    status: "in_flight",
    source: p.source || "manual",
    hubId: hub.id,
    // Denormalised snapshot: the order stays readable even if the hub list changes.
    hub: { id: hub.id, name: hub.name, nameBn: hub.nameBn, lat: hub.lat, lng: hub.lng, phone: hub.phone },
    destination,
    items,
    payloadG: items.reduce((sum, i) => sum + i.weightG * i.qty, 0),
    speedKmh,
    timeScale: FLEET.timeScaleOptions.includes(Number(p.timeScale))
      ? Number(p.timeScale)
      : FLEET.defaultTimeScale,
    timings: {
      prepS: FLEET.prepS,
      climbS: FLEET.climbS,
      descentS: FLEET.descentS,
      handoffS: FLEET.handoffS,
      cruiseAltitudeM: FLEET.cruiseAltitudeM,
      enduranceMinutes: FLEET.enduranceMinutes,
    },
    route: planRoute(hub, destination, speedKmh),
    contactPhone: String(p.contactPhone || "").trim(),
    patientNote: String(p.patientNote || "").trim(),
    droneCode: makeDroneCode(),
    events: [
      {
        at: launchedAt,
        code: "launched",
        messageEn: `Dispatched from ${hub.name}.`,
        messageBn: `${hub.nameBn} থেকে ছেড়েছে।`,
      },
    ],
  };

  order.plannedDistanceKm = plannedDistanceKm(order);
  order.route = [...order.route, buildReturnLeg(order)];
  order.plannedFlightS = deliveredAtMissionS(order);

  return { order, reason: null, nearest: picked.nearest };
}

// Coarse status, always derived on read so a stored record cannot go stale —
// the same discipline as getCampStatus in lib/campsData.js.
export function deriveStatus(order, nowMs = Date.now()) {
  if (!order) return "unknown";
  if (order.status === "cancelled") return "cancelled";
  const telemetry = computeTelemetry(order, nowMs);
  if (!telemetry) return order.status || "unknown";
  return telemetry.isDelivered ? "delivered" : "in_flight";
}

/* --------------------------------------------------------------------------
   Formatting
   -------------------------------------------------------------------------- */

// formatCampCountdown in lib/campsData.js is camp-specific (days/hours,
// "Starts in..."), so this is a separate helper rather than a bent one.
export function formatDuration(seconds, lang = "en") {
  const total = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (lang === "bn") {
    if (m <= 0) return `${toBnDigits(s)} সেকেন্ড`;
    if (s === 0) return `${toBnDigits(m)} মিনিট`;
    return `${toBnDigits(m)} মিনিট ${toBnDigits(s)} সেকেন্ড`;
  }
  if (m <= 0) return `${s} s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} s`;
}

export function formatSpeed(kmh, lang = "en") {
  const v = Math.round(kmh || 0);
  return lang === "bn" ? `${toBnDigits(v)} কিমি/ঘণ্টা` : `${v} km/h`;
}

export function formatAltitude(m, lang = "en") {
  const v = Math.round(m || 0);
  return lang === "bn" ? `${toBnDigits(v)} মিটার` : `${v} m`;
}

export function formatPercent(pct, lang = "en") {
  const v = Math.round(pct || 0);
  return lang === "bn" ? `${toBnDigits(v)}%` : `${v}%`;
}

export function formatGrams(g, lang = "en") {
  const v = Math.round(g || 0);
  return lang === "bn" ? `${toBnDigits(v)} গ্রাম` : `${v} g`;
}

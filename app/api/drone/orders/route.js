import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DRONE_HUBS } from "@/lib/droneDeliveryData";
import {
  computeTelemetry,
  deriveStatus,
  normalizeDroneOrder,
  validateDroneOrder,
} from "@/lib/droneDeliveryEngine";

// Drone order store. There is no database in this project, so orders live in a
// JSON file on disk — the same approach as app/api/camps/route.js, and for the
// same reason: it survives a restart and is shared across visitors with no new
// dependencies.
//
// NOTE: this needs a writable filesystem. Fine on a normal Node server; on a
// read-only serverless host the two helpers below are the only place to swap.
// When the write fails we return 503 with code "storage_unavailable" so the
// client can fall back to its local queue instead of silently losing the order.
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "drone-orders.json");

// A demo store should not grow without bound.
const MAX_STORED_ORDERS = 200;

function readOrders() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Drone orders read error:", error);
    return [];
  }
}

function writeOrders(orders) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const trimmed = orders.slice(-MAX_STORED_ORDERS);
  fs.writeFileSync(DATA_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
}

// Serializes read-modify-write so two near-simultaneous orders cannot clobber
// each other. Same pattern as the camps route.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  // Keep the chain alive even if one task rejects.
  writeQueue = run.catch(() => {});
  return run;
}

// `status` is always derived, never trusted from the file, so a stored order
// cannot go stale — the same discipline as withStatus() in lib/campsData.js.
function withDerivedStatus(order, now) {
  return { ...order, status: deriveStatus(order, now) };
}

export async function GET(request) {
  try {
    const now = Date.now();
    const id = request.nextUrl.searchParams.get("id");
    const orders = readOrders();

    if (id) {
      const found = orders.find((o) => o.id === id);
      if (!found) {
        return NextResponse.json(
          { error: "This delivery record is no longer available.", serverNow: new Date(now).toISOString() },
          { status: 404 }
        );
      }
      return NextResponse.json({
        order: withDerivedStatus(found, now),
        serverNow: new Date(now).toISOString(),
      });
    }

    return NextResponse.json({
      orders: orders.map((o) => withDerivedStatus(o, now)),
      serverNow: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error("Drone orders API error:", error);
    return NextResponse.json({ orders: [], error: "Could not load deliveries." }, { status: 500 });
  }
}

export async function POST(request) {
  const now = Date.now();
  const serverNow = new Date(now).toISOString();

  try {
    const payload = await request.json();

    // Like app/api/camps/route.js (and unlike the chat route, which returns 200
    // + `degraded` so the chat UI never breaks), this is a form endpoint: real
    // status codes and a per-field `errors` object let the compose screen
    // highlight exactly what to fix.
    const { valid, errors } = validateDroneOrder(payload);
    if (!valid) {
      return NextResponse.json(
        { error: "Please correct the highlighted fields.", errors, serverNow },
        { status: 400 }
      );
    }

    const { order, reason, nearest } = normalizeDroneOrder(payload, { nowMs: now });

    if (!order) {
      // No hub could take this order. Hand back the nearest one anyway so the
      // UI can name it, give its distance, and offer a phone number.
      const status = reason === "no_stock" ? 409 : 422;
      return NextResponse.json(
        {
          error:
            reason === "no_stock"
              ? "No hub currently stocks every item in this order."
              : "This location is outside our drone service range.",
          reason,
          nearest: nearest
            ? {
                hub: {
                  id: nearest.hub.id,
                  name: nearest.hub.name,
                  nameBn: nearest.hub.nameBn,
                  phone: nearest.hub.phone,
                },
                distanceKm: nearest.distanceKm,
                shortfallKm: nearest.shortfallKm,
              }
            : null,
          serverNow,
        },
        { status }
      );
    }

    const existing = readOrders();

    // Light duplicate guard: a double-tapped submit button should not launch
    // two drones.
    if (order.contactPhone) {
      const recent = existing.find(
        (o) =>
          o.contactPhone === order.contactPhone &&
          now - Date.parse(o.createdAt) < 30_000 &&
          o.status !== "cancelled"
      );
      if (recent) {
        return NextResponse.json(
          { order: withDerivedStatus(recent, now), duplicate: true, serverNow },
          { status: 200 }
        );
      }
    }

    // Fleet capacity. An order counts against its hub until the drone is home,
    // which is why this looks at the full mission and not just the delivery.
    const hubSpec = DRONE_HUBS.find((h) => h.id === order.hubId);
    const inFlight = existing.filter((o) => {
      if (o.hubId !== order.hubId || o.status === "cancelled") return false;
      const telemetry = computeTelemetry(o, now);
      return telemetry ? !telemetry.isDone : false;
    });

    if (hubSpec && inFlight.length >= hubSpec.dronesAvailable) {
      const freeAt = inFlight
        .map((o) => {
          const scale = o.timeScale || 1;
          const mission = o.route?.reduce((max, l) => Math.max(max, l.startMissionS + l.durationS), 0) || 0;
          return Date.parse(o.launchedAt) + (mission / scale) * 1000;
        })
        .sort((a, b) => a - b)[0];

      return NextResponse.json(
        {
          error: `All drones at ${hubSpec.name} are currently in the air.`,
          reason: "fleet_busy",
          freeAt: new Date(freeAt).toISOString(),
          serverNow,
        },
        { status: 503 }
      );
    }

    try {
      await enqueueWrite(() => {
        const orders = readOrders();
        orders.push(order);
        writeOrders(orders);
      });
    } catch (writeError) {
      console.error("Drone orders write error:", writeError);
      return NextResponse.json(
        {
          error: "Deliveries cannot be saved on this server right now.",
          code: "storage_unavailable",
          serverNow,
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ order: withDerivedStatus(order, now), serverNow }, { status: 201 });
  } catch (error) {
    console.error("Drone orders API error:", error);
    return NextResponse.json(
      { error: "Could not dispatch this delivery. Please try again.", serverNow },
      { status: 500 }
    );
  }
}

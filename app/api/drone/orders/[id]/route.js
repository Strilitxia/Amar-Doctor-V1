import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { applyReroute, deriveStatus } from "@/lib/droneDeliveryEngine";

// Single drone order: fetch it, bend its route mid-flight, or cancel it.
// Storage is the same JSON file the collection route owns — see
// app/api/drone/orders/route.js for the read-only-filesystem caveat.
//
// NOTE on Next 16: the dynamic `params` argument is a Promise and must be
// awaited (verified against node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/route.md).
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "drone-orders.json");

function readOrders() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Drone order read error:", error);
    return [];
  }
}

function writeOrders(orders) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders, null, 2), "utf-8");
}

let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

export async function GET(request, { params }) {
  const now = Date.now();
  const serverNow = new Date(now).toISOString();

  try {
    const { id } = await params;
    const order = readOrders().find((o) => o.id === id);

    if (!order) {
      return NextResponse.json(
        { error: "This delivery record is no longer available.", serverNow },
        { status: 404 }
      );
    }

    return NextResponse.json({ order: { ...order, status: deriveStatus(order, now) }, serverNow });
  } catch (error) {
    console.error("Drone order API error:", error);
    return NextResponse.json({ error: "Could not load this delivery.", serverNow }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const now = Date.now();
  const serverNow = new Date(now).toISOString();

  try {
    const { id } = await params;
    const body = await request.json();
    const action = body?.action;

    let result = null;

    await enqueueWrite(() => {
      const orders = readOrders();
      const index = orders.findIndex((o) => o.id === id);
      if (index === -1) {
        result = { status: 404, body: { error: "This delivery record is no longer available." } };
        return;
      }

      const order = orders[index];

      if (action === "cancel") {
        const updated = {
          ...order,
          status: "cancelled",
          updatedAt: serverNow,
          events: [
            ...(order.events || []),
            {
              at: serverNow,
              code: "cancelled",
              messageEn: "Delivery cancelled — the drone is returning to its hub.",
              messageBn: "ডেলিভারি বাতিল — ড্রোন হাবে ফিরে যাচ্ছে।",
            },
          ],
        };
        orders[index] = updated;
        writeOrders(orders);
        result = { status: 200, body: { order: updated } };
        return;
      }

      if (action === "reroute") {
        const destination = body?.destination;
        if (
          !destination ||
          !Number.isFinite(Number(destination.lat)) ||
          !Number.isFinite(Number(destination.lng))
        ) {
          result = { status: 400, body: { error: "A valid destination is required." } };
          return;
        }

        // All the flight maths lives in the engine, so the server and the
        // client produce byte-identical routes from the same inputs.
        const { order: next, changed, reason } = applyReroute(
          order,
          { lat: Number(destination.lat), lng: Number(destination.lng) },
          now
        );

        if (!changed) {
          // Not an error — the move was jitter, too soon, or the drone is
          // already landing. Hand back the unchanged order so the client can
          // reconcile without treating it as a failure.
          result = { status: 200, body: { order, changed: false, reason } };
          return;
        }

        orders[index] = next;
        writeOrders(orders);
        result = { status: 200, body: { order: next, changed: true } };
        return;
      }

      result = { status: 400, body: { error: "Unknown action." } };
    });

    if (!result) {
      return NextResponse.json({ error: "Could not update this delivery.", serverNow }, { status: 500 });
    }

    const payload = result.body.order
      ? { ...result.body, order: { ...result.body.order, status: deriveStatus(result.body.order, now) } }
      : result.body;

    return NextResponse.json({ ...payload, serverNow }, { status: result.status });
  } catch (error) {
    console.error("Drone order PATCH error:", error);
    // A read-only filesystem lands here; the client falls back to its local copy.
    return NextResponse.json(
      { error: "Could not update this delivery.", code: "storage_unavailable", serverNow },
      { status: 503 }
    );
  }
}

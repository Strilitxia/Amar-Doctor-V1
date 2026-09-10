import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  buildSeedCamps,
  normalizeCamp,
  validateCamp,
  withStatus,
} from "@/lib/campsData";

// Medical camp store. There is no database in this project, so camps live in a
// JSON file on disk. This keeps them shared across every visitor (unlike the
// localStorage pattern in lib/emergencyBroadcaster.js) with no new dependencies.
//
// NOTE: this needs a writable filesystem. Fine on a normal Node server; on a
// read-only serverless host the two helpers below are the only place to swap.
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "medical-camps.json");

function readCamps() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      // No file yet: serve freshly generated seeds (dated relative to now) but
      // do not write them, so the demo data stays current until a real camp is
      // posted. The first POST persists seeds + the new camp together.
      return buildSeedCamps();
    }
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Camps API read error:", error);
    return buildSeedCamps();
  }
}

function writeCamps(camps) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(camps, null, 2), "utf-8");
}

// Serializes read-modify-write so two near-simultaneous posts cannot clobber
// each other's camp.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const run = writeQueue.then(task, task);
  // Keep the chain alive even if one task rejects.
  writeQueue = run.catch(() => {});
  return run;
}

export async function GET() {
  try {
    // `status` is always derived, never read from the file, so stored camps
    // cannot go stale. See lib/campsData.js.
    return NextResponse.json({ camps: withStatus(readCamps()) });
  } catch (error) {
    console.error("Camps API error:", error);
    return NextResponse.json({ camps: [], error: "Could not load camps." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const passcode = request.headers.get("x-camp-passcode") || "";
    const expected = process.env.CAMP_ORGANIZER_PASSCODE;

    if (!expected) {
      console.error("Camps API error: CAMP_ORGANIZER_PASSCODE is not set");
      return NextResponse.json(
        { error: "Camp posting is not configured on this server." },
        { status: 503 }
      );
    }
    if (passcode !== expected) {
      return NextResponse.json({ error: "Invalid organizer passcode." }, { status: 401 });
    }

    const payload = await request.json();

    // Unlike app/api/chat/route.js (which returns 200 + `degraded` so the chat
    // UI never breaks), this is a form endpoint: real status codes and a
    // per-field `errors` object let the organizer form highlight what to fix.
    const { valid, errors } = validateCamp(payload);
    if (!valid) {
      return NextResponse.json({ error: "Please correct the highlighted fields.", errors }, { status: 400 });
    }

    const camp = normalizeCamp(payload);

    await enqueueWrite(() => {
      const camps = readCamps();
      camps.push(camp);
      writeCamps(camps);
    });

    return NextResponse.json({ camp }, { status: 201 });
  } catch (error) {
    console.error("Camps API error:", error);
    return NextResponse.json({ error: "Could not save this camp. Please try again." }, { status: 500 });
  }
}

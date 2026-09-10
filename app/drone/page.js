import { Suspense } from "react";
import DroneClient from "./DroneClient";

// DroneClient reads the ?order= deep link and the ?from= handoff hint with
// useSearchParams, which Next requires to sit inside a Suspense boundary so the
// rest of the route can still prerender. Same shape as app/map/page.js.
export default function DronePage() {
  return (
    <Suspense fallback={null}>
      <DroneClient />
    </Suspense>
  );
}

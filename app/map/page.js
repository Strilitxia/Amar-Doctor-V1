import { Suspense } from "react";
import MapClient from "./MapClient";

// MapClient reads the ?camp= deep link with useSearchParams, which Next requires
// to sit inside a Suspense boundary so the rest of the route can still prerender.
export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapClient />
    </Suspense>
  );
}

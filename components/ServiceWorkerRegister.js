"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.protocol.startsWith("http")
    ) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.log("SW registration error:", err));
    }
  }, []);

  return null;
}

"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  deriveKitFromCaseSheet,
  deriveKitFromMedications,
  shouldOfferDroneDelivery,
} from "@/lib/medicineKitRules";

// The bridge from the AI doctor and the prescription scanner to /drone.
//
// Medicines and GPS never travel in the URL — that would put clinical data into
// browser history and server access logs — so the kit rides in sessionStorage
// and the query string only tells /drone to go looking for it.
const HANDOFF_KEY = "amar_doctor_drone_handoff";

export default function DroneDeliveryCTA({ source, caseSheet, medications, lang = "en" }) {
  const bn = lang === "bn";
  const router = useRouter();

  const kit = useMemo(() => {
    if (source === "prescription") {
      const { items, unmatched } = deriveKitFromMedications(medications);
      return {
        items,
        unmatched,
        rationaleEn: "These were matched against what our drone hubs stock.",
        rationaleBn: "আপনার প্রেসক্রিপশনের সাথে ড্রোন হাবের মজুত মিলিয়ে দেখা হয়েছে।",
      };
    }
    const derived = deriveKitFromCaseSheet(caseSheet);
    return { ...derived, unmatched: [] };
  }, [source, caseSheet, medications]);

  // Chat: the gate is strict — nothing while the AI is still gathering, and
  // nothing at all when the case sheet carries a red flag.
  if (source === "ai_chat" && !shouldOfferDroneDelivery(caseSheet)) return null;
  if (!kit.items.length) return null;

  function handoff() {
    try {
      sessionStorage.setItem(
        HANDOFF_KEY,
        JSON.stringify({
          v: 1,
          source,
          items: kit.items,
          unmatched: kit.unmatched,
          noteEn: kit.rationaleEn,
          noteBn: kit.rationaleBn,
          createdAt: Date.now(),
        })
      );
    } catch {
      /* private mode: the user can still build the order by hand on /drone */
    }
    router.push(`/drone?from=${source === "prescription" ? "prescription" : "chat"}`);
  }

  return (
    <div className="drn-cta-card" id="drone-cta">
      <div className="drn-cta-card__title">
        🚁{" "}
        {bn
          ? "এই ওষুধগুলো ড্রোনে পাঠানো যাবে"
          : "These can be delivered by drone"}
      </div>

      <p className="drn-cta-card__rationale">{bn ? kit.rationaleBn : kit.rationaleEn}</p>

      {/* Show the kit before the user leaves, so nobody navigates to find out
          what they would have been sent. */}
      <div className="drn-cta-card__kit">
        {kit.items.map((item) => (
          <span className="drn-cta-card__chip" key={item.itemId || item.rxText}>
            {bn ? item.nameBn || item.name : item.name}
            {item.qty > 1 ? ` ×${item.qty}` : ""}
            {item.requiresRx ? " 🔒" : ""}
          </span>
        ))}
      </div>

      {kit.unmatched.length > 0 && (
        <p className="drn-cta-card__note">
          {bn ? "ড্রোন হাবে নেই: " : "Not stocked at drone hubs: "}
          {kit.unmatched.join(", ")}
        </p>
      )}

      <button className="btn-primary" type="button" onClick={handoff}>
        {bn ? "ড্রোন ডেলিভারি দেখুন" : "Request drone delivery"}
      </button>

      <p className="drn-cta-card__note">
        {bn
          ? "ডেমো সিমুলেশন — বাস্তবে কোনো ড্রোন পাঠানো হয় না। এই পরামর্শ ডাক্তারের বিকল্প নয়।"
          : "Demonstration simulation — no physical drone is dispatched. This suggestion is not a substitute for a doctor."}
      </p>
    </div>
  );
}

/* ==========================================================================
   Case sheet / prescription -> deliverable medicine kit
   ==========================================================================
   Pure, synchronous, zero-dependency weighted rules, in the same shape as
   lib/symptomScoringEngine.js: all data as module-level literals so this
   bundles into the client chunk and the service worker caches it. Runs with no
   network and no model call.

   WHY THIS EXISTS RATHER THAN A PROMPT CHANGE
   -------------------------------------------
   The obvious way to get a medicine list out of the AI doctor would be to add a
   `suggested_meds` field to the case sheet. We deliberately do not: the system
   prompt at backend/prompts/triage_prompt.txt is read verbatim by BOTH
   app/api/chat/route.js and the separate Python service at backend/server.py,
   so changing the schema would silently desync two services. Everything here is
   derived from the case sheet the model already fills in.

   THE THREE SAFETY RULES, ALL ENFORCED BELOW
   ------------------------------------------
   1. Only `otc: true` medicines are ever suggested. A rules engine must never
      put an antibiotic in a basket.
   2. Nothing is suggested while the AI is still gathering — an opinion formed
      halfway through the questions is not an opinion.
   3. Nothing at all is suggested when the case sheet carries a red flag. Chest
      pain gets the emergency path, not a paracetamol button.
   ========================================================================== */

import { findCatalogMatches, getCatalogItem } from "@/lib/droneDeliveryData";

/* --------------------------------------------------------------------------
   Rules
   --------------------------------------------------------------------------
   The Groq triage prompt fills the case sheet in Bengali, so every rule carries
   Bengali match terms alongside the English ones. `excludeIf` exists to stop a
   rule firing on a phrase that merely mentions its keyword — "no fever", or a
   bloody diarrhoea that needs a clinic rather than a sachet of ORS.
   -------------------------------------------------------------------------- */
export const KIT_RULES = [
  {
    id: "fever-adult",
    matchAny: ["fever", "temperature", "জ্বর", "গা গরম", "শরীর গরম"],
    // Excluded for children so this cannot fire alongside `fever-child` and put
    // adult 500mg tablets in a four-year-old's basket. haystackFromCaseSheet()
    // injects "child শিশু" whenever the sheet's age is under 12, so this holds
    // even when the complaint itself never says so.
    excludeIf: ["no fever", "জ্বর নেই", "child", "শিশু", "বাচ্চা", "infant", "baby"],
    items: [
      { itemId: "para-500", qty: 1 },
      { itemId: "thermometer", qty: 1 },
    ],
    rationaleEn: "For fever: paracetamol to bring the temperature down, and a thermometer so you can measure it rather than guess.",
    rationaleBn: "জ্বরের জন্য: তাপমাত্রা কমাতে প্যারাসিটামল, আর অনুমান না করে মাপার জন্য থার্মোমিটার।",
  },
  {
    id: "fever-child",
    matchAny: ["child", "baby", "infant", "শিশু", "বাচ্চা", "শিশুর জ্বর"],
    requiresAny: ["fever", "জ্বর"],
    items: [
      { itemId: "para-syrup", qty: 1 },
      { itemId: "thermometer", qty: 1 },
    ],
    rationaleEn: "A child's fever needs weight-based syrup dosing, not adult tablets.",
    rationaleBn: "শিশুর জ্বরে বড়দের ট্যাবলেট নয় — ওজন অনুযায়ী সিরাপ দরকার।",
  },
  {
    id: "dehydration",
    matchAny: [
      "diarrhoea", "diarrhea", "loose motion", "watery stool", "vomiting",
      "ডায়রিয়া", "পাতলা পায়খানা", "পায়খানা", "বমি", "ডিহাইড্রেশন",
    ],
    // Blood in the stool is a clinic visit, not a home rehydration kit.
    excludeIf: ["blood in stool", "bloody", "রক্ত", "আমাশয়"],
    items: [
      { itemId: "ors-sachet", qty: 2 },
      { itemId: "zinc-20", qty: 1 },
    ],
    rationaleEn: "For diarrhoea or vomiting: ORS replaces the fluid you are losing, and zinc shortens the illness (give a child all 10 days).",
    rationaleBn: "ডায়রিয়া বা বমিতে: হারানো পানি পূরণে ওরস্যালাইন, আর অসুস্থতা কমাতে জিংক (শিশুকে পুরো ১০ দিন)।",
  },
  {
    id: "nausea",
    matchAny: ["nausea", "vomit", "বমি বমি", "বমি ভাব"],
    excludeIf: ["রক্ত বমি", "vomiting blood"],
    items: [{ itemId: "domperidone", qty: 1 }],
    rationaleEn: "For persistent nausea, taken half an hour before food.",
    rationaleBn: "একটানা বমি ভাবের জন্য, খাওয়ার আধা ঘণ্টা আগে।",
  },
  {
    id: "acidity",
    matchAny: [
      "acidity", "heartburn", "gastric", "reflux", "burning chest after eating",
      "গ্যাস্ট্রিক", "অম্লতা", "বুকজ্বালা", "চোঁয়া ঢেকুর",
    ],
    items: [
      { itemId: "antacid", qty: 1 },
      { itemId: "omeprazole", qty: 1 },
    ],
    rationaleEn: "For acidity and reflux: an antacid for immediate relief and omeprazole for the underlying acid.",
    rationaleBn: "গ্যাস্ট্রিক ও রিফ্লাক্সে: তাৎক্ষণিক আরামে অ্যান্টাসিড, আর অ্যাসিড কমাতে ওমিপ্রাজল।",
  },
  {
    id: "cramps",
    matchAny: ["cramp", "colicky", "period pain", "পেটে মোচড়", "মাসিকের ব্যথা", "খিঁচুনি ব্যথা"],
    items: [{ itemId: "hyoscine", qty: 1 }],
    rationaleEn: "For cramping abdominal or period pain.",
    rationaleBn: "পেটে মোচড়ানো বা মাসিকের ব্যথার জন্য।",
  },
  {
    id: "cold-allergy",
    matchAny: [
      "runny nose", "sneezing", "blocked nose", "allergy", "itching", "rash",
      "সর্দি", "নাক দিয়ে পানি", "হাঁচি", "নাক বন্ধ", "এলার্জি", "চুলকানি",
    ],
    items: [
      { itemId: "cetirizine", qty: 1 },
      { itemId: "saline-drops", qty: 1 },
    ],
    rationaleEn: "For a runny or blocked nose: an antihistamine plus saline drops, which are safe even for infants.",
    rationaleBn: "সর্দি বা বন্ধ নাকে: অ্যান্টিহিস্টামিন ও স্যালাইন ড্রপ, যা শিশুদের জন্যও নিরাপদ।",
  },
  {
    id: "cough-throat",
    matchAny: ["cough", "sore throat", "throat pain", "কাশি", "গলা ব্যথা", "গলাব্যথা", "খুসখুসে"],
    // Breathlessness is not a lozenge problem.
    excludeIf: ["shortness of breath", "শ্বাসকষ্ট", "breathless"],
    items: [
      { itemId: "lozenge", qty: 1 },
      { itemId: "cough-syrup", qty: 1 },
    ],
    rationaleEn: "For a cough and sore throat. If it lasts more than two weeks, see a doctor rather than reordering.",
    rationaleBn: "কাশি ও গলা ব্যথার জন্য। দুই সপ্তাহের বেশি থাকলে আবার অর্ডার না করে ডাক্তার দেখান।",
  },
  {
    id: "minor-wound",
    matchAny: [
      "cut", "wound", "graze", "scrape", "injury", "bleeding from a cut",
      "কাটা", "ক্ষত", "ছড়ে গেছে", "আঘাত",
    ],
    excludeIf: ["deep wound", "গভীর ক্ষত", "heavy bleeding", "প্রচুর রক্ত"],
    items: [
      { itemId: "antiseptic", qty: 1 },
      { itemId: "gauze", qty: 1 },
      { itemId: "tape", qty: 1 },
    ],
    rationaleEn: "A basic dressing kit for a small clean wound: antiseptic, gauze and tape.",
    rationaleBn: "ছোট পরিষ্কার ক্ষতের প্রাথমিক ড্রেসিং কিট: অ্যান্টিসেপটিক, গজ ও টেপ।",
  },
  {
    id: "minor-burn",
    matchAny: ["burn", "scald", "পোড়া", "ছেঁকা"],
    excludeIf: ["large burn", "বড় পোড়া", "electrical burn"],
    items: [
      { itemId: "burn-gel", qty: 1 },
      { itemId: "gauze", qty: 1 },
    ],
    rationaleEn: "For a small superficial burn — cool it under running water for 20 minutes first, then dress it.",
    rationaleBn: "ছোট ও উপরিভাগের পোড়ায় — আগে ২০ মিনিট চলমান পানিতে ঠান্ডা করুন, তারপর ড্রেসিং।",
  },
  {
    id: "pregnancy-support",
    matchAny: ["pregnan", "antenatal", "গর্ভবতী", "গর্ভাবস্থা", "সন্তানসম্ভবা"],
    items: [
      { itemId: "iron-folic", qty: 1 },
      { itemId: "calcium-d", qty: 1 },
    ],
    rationaleEn: "Routine pregnancy supplements. These support a check-up schedule, they do not replace one.",
    rationaleBn: "গর্ভাবস্থার নিয়মিত সাপ্লিমেন্ট। এগুলো নিয়মিত চেকআপের বিকল্প নয়।",
  },
];

const MAX_KIT_ITEMS = 5;

/* --------------------------------------------------------------------------
   Case sheet -> kit
   -------------------------------------------------------------------------- */

function haystackFromCaseSheet(sheet) {
  if (!sheet) return "";
  const parts = [
    sheet.chief_complaint,
    sheet.location,
    sheet.severity,
    sheet.duration,
    sheet.onset,
    sheet.aggravating_relieving,
    ...(Array.isArray(sheet.associated_symptoms) ? sheet.associated_symptoms : []),
    ...(Array.isArray(sheet.history) ? sheet.history : []),
  ];
  // Age is a number in the sheet; fold "child" in so the paediatric rule can fire
  // on a 4-year-old whose complaint never uses the word.
  const age = Number(sheet.age);
  if (Number.isFinite(age) && age > 0 && age < 12) parts.push("child শিশু");

  return parts.filter(Boolean).join(" ").toLowerCase();
}

function ruleMatches(rule, haystack) {
  if (rule.excludeIf?.some((term) => haystack.includes(term.toLowerCase()))) return false;
  if (rule.requiresAny && !rule.requiresAny.some((term) => haystack.includes(term.toLowerCase()))) {
    return false;
  }
  return rule.matchAny.some((term) => haystack.includes(term.toLowerCase()));
}

// Returns { items, rationaleEn, rationaleBn, ruleIds }.
export function deriveKitFromCaseSheet(caseSheet) {
  const empty = { items: [], rationaleEn: "", rationaleBn: "", ruleIds: [] };
  if (!caseSheet) return empty;

  const haystack = haystackFromCaseSheet(caseSheet);
  if (!haystack) return empty;

  const fired = KIT_RULES.filter((rule) => ruleMatches(rule, haystack));
  if (!fired.length) return empty;

  // Already-tried medicines are subtracted: there is no point flying someone a
  // second box of the thing that is not working.
  const alreadyTried = new Set();
  for (const med of Array.isArray(caseSheet.meds_tried) ? caseSheet.meds_tried : []) {
    for (const match of findCatalogMatches(med)) alreadyTried.add(match.item.id);
  }

  const byId = new Map();
  for (const rule of fired) {
    for (const line of rule.items) {
      if (alreadyTried.has(line.itemId)) continue;
      const item = getCatalogItem(line.itemId);
      // Belt and braces: a rule must never reach a prescription-only medicine.
      if (!item || !item.otc) continue;
      const qty = Math.min(Math.max(byId.get(line.itemId)?.qty || 0, line.qty), item.maxQty);
      byId.set(line.itemId, {
        itemId: item.id,
        name: item.name,
        nameBn: item.nameBn,
        qty,
        weightG: item.weightG,
        requiresRx: false,
        source: "ai_kit",
        rxText: null,
        unavailable: false,
      });
    }
  }

  return {
    items: [...byId.values()].slice(0, MAX_KIT_ITEMS),
    rationaleEn: fired.map((r) => r.rationaleEn).join(" "),
    rationaleBn: fired.map((r) => r.rationaleBn).join(" "),
    ruleIds: fired.map((r) => r.id),
  };
}

// Gate for the chat CTA. Deliberately strict — see the three safety rules at the
// top of this file.
export function shouldOfferDroneDelivery(caseSheet) {
  if (!caseSheet) return false;
  if (caseSheet.stage !== "assessing" && caseSheet.stage !== "closed") return false;
  if (Array.isArray(caseSheet.red_flags) && caseSheet.red_flags.length > 0) return false;
  return deriveKitFromCaseSheet(caseSheet).items.length > 0;
}

/* --------------------------------------------------------------------------
   Prescription OCR -> kit
   -------------------------------------------------------------------------- */

// "Napa Extra (Paracetamol 500mg + Caffeine 65mg)" -> ["napa extra", "paracetamol", "caffeine"]
function candidateNames(raw) {
  const name = String(raw || "").toLowerCase();
  if (!name) return [];

  const inside = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const outside = name.replace(/\([^)]*\)/g, " ");

  return [outside, ...inside]
    .flatMap((chunk) => chunk.split("+"))
    // Drop strengths and units; they are noise for matching.
    .map((chunk) => chunk.replace(/\b\d+(\.\d+)?\s*(mg|ml|mcg|g|iu)\b/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function qtyFromDosage(dosage, maxQty) {
  const match = String(dosage || "").match(/\d+/);
  const n = match ? Number(match[0]) : 1;
  return Math.max(1, Math.min(Number.isFinite(n) ? n : 1, maxQty || 1));
}

// medications[] comes from app/api/prescription/route.js as
// { name, dosage, timing, purpose, sideEffects }.
//
// Prescription-sourced items MAY be prescription-only: that is the entire point
// of this path, and each one is flagged requiresRx so the UI shows the lock
// badge and the server accepts it only with source === "prescription".
export function deriveKitFromMedications(medications) {
  const items = [];
  const unmatched = [];
  const seen = new Set();

  for (const med of Array.isArray(medications) ? medications : []) {
    const candidates = candidateNames(med?.name);
    let best = null;

    for (const candidate of candidates) {
      const [match] = findCatalogMatches(candidate, { limit: 1 });
      if (match && (!best || match.score > best.score)) best = match;
    }

    if (!best) {
      // Shown to the user rather than silently dropped, so they know exactly
      // what the drone is NOT bringing.
      if (med?.name) unmatched.push(med.name);
      continue;
    }

    if (seen.has(best.item.id)) continue;
    seen.add(best.item.id);

    items.push({
      itemId: best.item.id,
      name: best.item.name,
      nameBn: best.item.nameBn,
      qty: qtyFromDosage(med?.dosage, best.item.maxQty),
      weightG: best.item.weightG,
      requiresRx: best.item.otc === false,
      source: "prescription",
      rxText: med?.name || null,
      unavailable: false,
    });
  }

  return { items, unmatched };
}

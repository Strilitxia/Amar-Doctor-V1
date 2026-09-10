/* ==========================================================================
   Drone medicine delivery — static data
   ==========================================================================
   Everything in this file is a module-level literal, exactly like
   lib/symptomScoringEngine.js. That is deliberate: it means the whole medicine
   catalogue, the hub network and the fleet spec are bundled into the client
   chunk and cached by the service worker, so a user with no network can still
   browse medicines, see which support centre is nearest and get a flight-time
   estimate. Nothing here does I/O, so this module is also safe to import from
   the API route.

   IMPORTANT: this is a demonstration simulation. No physical drone exists. The
   UI must say so on every surface — see DISCLAIMER below.
   ========================================================================== */

export const DISCLAIMER_EN =
  "Demonstration simulation — no physical drone is dispatched.";
export const DISCLAIMER_BN =
  "ডেমো সিমুলেশন — বাস্তবে কোনো ড্রোন পাঠানো হয় না।";

/* --------------------------------------------------------------------------
   Fleet specification
   -------------------------------------------------------------------------- */

// One km per minute. Slow enough to be honest for a payload multirotor, and
// round enough that "12 km" reads as "12 minutes of cruise" while debugging.
//
// Note on demo speed: we do NOT inflate cruiseSpeedKmh to make the simulation
// finish quickly. A medical app that reports a 240 km/h drone is lying to the
// user. Instead every order carries a `timeScale` (see droneDeliveryEngine.js)
// that compresses the wall clock while every physical readout stays real.
export const FLEET = {
  cruiseSpeedKmh: 60,
  maxPayloadG: 1500,
  maxOneWayKm: 30,
  enduranceMinutes: 45,
  cruiseAltitudeM: 90,

  // Mission phases either side of cruise. These are real (packing and
  // pre-flight checks, spooling up, descending, hovering while the package is
  // lowered) and they give the status timeline more than one interesting state.
  prepS: 90,
  climbS: 20,
  descentS: 25,
  handoffS: 30,

  // Re-route guards. Below the threshold a "movement" is GPS jitter, not a
  // person walking; the cooldown stops a drifting fix from re-planning every tick.
  rerouteThresholdM: 150,
  rerouteCooldownS: 20,

  // A destination 200 m from the hub still needs a non-zero cruise leg or the
  // progress maths divides by zero.
  minCruiseS: 5,

  // "Delivered" is a moment rather than a phase. The drone waits this many
  // mission-seconds over the destination before starting home, so the success
  // state stays on screen long enough to actually read.
  deliveredHoldS: 15,

  defaultTimeScale: 8,
  timeScaleOptions: [1, 8, 20],
};

/* --------------------------------------------------------------------------
   Hub network
   -------------------------------------------------------------------------- */

// Five of these deliberately reuse the coordinates and names of entries in
// HOSPITALS (lib/campsData.js) via `hospitalId`, so /map and /drone tell the
// same story about the same buildings. Two rural hubs are added so that a
// destination outside greater Dhaka is not automatically out of range.
//
// We do NOT add drone fields to HOSPITALS itself — that array is rendered by
// components/OpenStreetMapView.js and should not grow a stock ledger.
export const DRONE_HUBS = [
  {
    id: "HUB-DMC",
    hospitalId: "HOSP-1",
    name: "Dhaka Medical College Drone Hub",
    nameBn: "ঢাকা মেডিকেল কলেজ ড্রোন হাব",
    lat: 23.7258,
    lng: 90.3976,
    district: "Dhaka",
    districtBn: "ঢাকা",
    phone: "+880-2-55165001",
    active: true,
    serviceRadiusKm: 30,
    dronesAvailable: 3,
    stock: {
      "para-500": 240, "para-syrup": 90, "ors-sachet": 800, "zinc-20": 300,
      "antacid": 160, "loratadine": 120, "cetirizine": 140, "omeprazole": 110,
      "hyoscine": 80, "domperidone": 90, "saline-drops": 130, "lozenge": 200,
      "cough-syrup": 95, "steam-inhaler": 25, "salbutamol-inhaler": 40, "azithromycin": 20,
      "antiseptic": 150, "gauze": 220, "tape": 180, "bandage": 190,
      "burn-gel": 70, "orsaline-bottle": 140, "cotton": 200, "gloves": 260,
      "thermometer": 60, "oximeter": 30, "glucose-strip": 45, "mask": 400,
      "iron-folic": 130, "calcium-d": 120, "sanitary-pad": 150,
    },
  },
  {
    id: "HUB-SQR",
    hospitalId: "HOSP-2",
    name: "Square Hospital Drone Hub",
    nameBn: "স্কয়ার হাসপাতাল ড্রোন হাব",
    lat: 23.7524,
    lng: 90.3835,
    district: "Dhaka",
    districtBn: "ঢাকা",
    phone: "+880-2-8159457",
    active: true,
    serviceRadiusKm: 28,
    dronesAvailable: 2,
    stock: {
      "para-500": 180, "para-syrup": 70, "ors-sachet": 520, "zinc-20": 210,
      "antacid": 120, "loratadine": 90, "cetirizine": 100, "omeprazole": 95,
      "hyoscine": 60, "domperidone": 70, "saline-drops": 100, "lozenge": 150,
      "cough-syrup": 80, "steam-inhaler": 18, "salbutamol-inhaler": 35, "azithromycin": 17,
      "antiseptic": 110, "gauze": 170, "tape": 140, "bandage": 150,
      "burn-gel": 55, "orsaline-bottle": 100, "cotton": 160, "gloves": 200,
      "thermometer": 45, "oximeter": 24, "glucose-strip": 36, "mask": 300,
      "iron-folic": 100, "calcium-d": 90, "sanitary-pad": 110,
    },
  },
  {
    id: "HUB-SAV",
    hospitalId: "HOSP-3",
    name: "Savar Upazila Drone Hub",
    nameBn: "সাভার উপজেলা ড্রোন হাব",
    lat: 23.8434,
    lng: 90.2661,
    district: "Savar",
    districtBn: "সাভার",
    phone: "+880-2-7745566",
    active: true,
    serviceRadiusKm: 30,
    dronesAvailable: 2,
    stock: {
      "para-500": 140, "para-syrup": 50, "ors-sachet": 460, "zinc-20": 180,
      "antacid": 90, "loratadine": 60, "cetirizine": 80, "omeprazole": 70,
      "hyoscine": 45, "domperidone": 50, "saline-drops": 75, "lozenge": 120,
      "cough-syrup": 60, "steam-inhaler": 12, "salbutamol-inhaler": 22, "azithromycin": 11,
      "antiseptic": 95, "gauze": 140, "tape": 110, "bandage": 130,
      "burn-gel": 40, "orsaline-bottle": 90, "cotton": 130, "gloves": 160,
      "thermometer": 34, "oximeter": 16, "glucose-strip": 25, "mask": 240,
      "iron-folic": 85, "calcium-d": 70, "sanitary-pad": 95,
    },
  },
  {
    id: "HUB-DHM",
    hospitalId: "HOSP-4",
    name: "Dhamrai Community Drone Hub",
    nameBn: "ধামরাই কমিউনিটি ড্রোন হাব",
    lat: 23.907,
    lng: 90.22,
    district: "Dhamrai",
    districtBn: "ধামরাই",
    phone: "+880-2-9876543",
    active: true,
    serviceRadiusKm: 25,
    dronesAvailable: 1,
    stock: {
      "para-500": 90, "para-syrup": 30, "ors-sachet": 340, "zinc-20": 120,
      "antacid": 55, "loratadine": 35, "cetirizine": 45, "omeprazole": 40,
      "hyoscine": 25, "domperidone": 30, "saline-drops": 45, "lozenge": 70,
      "cough-syrup": 40, "steam-inhaler": 8, "salbutamol-inhaler": 12, "azithromycin": 8,
      "antiseptic": 65, "gauze": 100, "tape": 80, "bandage": 90,
      "burn-gel": 26, "orsaline-bottle": 65, "cotton": 90, "gloves": 110,
      "thermometer": 22, "oximeter": 9, "glucose-strip": 15, "mask": 160,
      "iron-folic": 60, "calcium-d": 45, "sanitary-pad": 70,
    },
  },
  {
    id: "HUB-NIDC",
    hospitalId: "HOSP-5",
    name: "Mohakhali Chest Institute Drone Hub",
    nameBn: "মহাখালী বক্ষব্যাধি ড্রোন হাব",
    lat: 23.7794,
    lng: 90.4041,
    district: "Dhaka",
    districtBn: "ঢাকা",
    phone: "+880-2-8821566",
    active: true,
    serviceRadiusKm: 26,
    dronesAvailable: 2,
    // Chest institute: strong on respiratory, thin on maternal/gut supplies.
    stock: {
      "para-500": 120, "para-syrup": 40, "ors-sachet": 220, "zinc-20": 80,
      "antacid": 60, "loratadine": 110, "cetirizine": 130, "omeprazole": 55,
      "hyoscine": 30, "domperidone": 35, "saline-drops": 160, "lozenge": 210,
      "cough-syrup": 150, "steam-inhaler": 40, "salbutamol-inhaler": 90, "azithromycin": 45,
      "antiseptic": 70, "gauze": 110, "tape": 90, "bandage": 95,
      "burn-gel": 30, "orsaline-bottle": 60, "cotton": 100, "gloves": 180,
      "thermometer": 40, "oximeter": 55, "glucose-strip": 18, "mask": 420,
      "iron-folic": 40, "calcium-d": 35, "sanitary-pad": 45,
    },
  },
  {
    id: "HUB-MNG",
    hospitalId: null,
    name: "Manikganj Sadar Drone Hub",
    nameBn: "মানিকগঞ্জ সদর ড্রোন হাব",
    lat: 23.8617,
    lng: 90.0003,
    district: "Manikganj",
    districtBn: "মানিকগঞ্জ",
    phone: "+880-651-61234",
    active: true,
    serviceRadiusKm: 30,
    dronesAvailable: 1,
    stock: {
      "para-500": 110, "para-syrup": 45, "ors-sachet": 420, "zinc-20": 160,
      "antacid": 60, "loratadine": 40, "cetirizine": 55, "omeprazole": 45,
      "hyoscine": 30, "domperidone": 35, "saline-drops": 50, "lozenge": 80,
      "cough-syrup": 45, "steam-inhaler": 10, "salbutamol-inhaler": 14, "azithromycin": 8,
      "antiseptic": 80, "gauze": 120, "tape": 95, "bandage": 105,
      "burn-gel": 30, "orsaline-bottle": 80, "cotton": 105, "gloves": 120,
      "thermometer": 26, "oximeter": 11, "glucose-strip": 18, "mask": 180,
      "iron-folic": 75, "calcium-d": 55, "sanitary-pad": 85,
    },
  },
  {
    id: "HUB-NSD",
    hospitalId: null,
    name: "Narsingdi Sadar Drone Hub",
    nameBn: "নরসিংদী সদর ড্রোন হাব",
    lat: 23.9322,
    lng: 90.7151,
    district: "Narsingdi",
    districtBn: "নরসিংদী",
    phone: "+880-628-62345",
    active: true,
    serviceRadiusKm: 30,
    dronesAvailable: 1,
    stock: {
      "para-500": 105, "para-syrup": 42, "ors-sachet": 400, "zinc-20": 150,
      "antacid": 58, "loratadine": 38, "cetirizine": 52, "omeprazole": 44,
      "hyoscine": 28, "domperidone": 32, "saline-drops": 48, "lozenge": 76,
      "cough-syrup": 44, "steam-inhaler": 9, "salbutamol-inhaler": 13, "azithromycin": 8,
      "antiseptic": 76, "gauze": 115, "tape": 90, "bandage": 100,
      "burn-gel": 28, "orsaline-bottle": 76, "cotton": 100, "gloves": 115,
      "thermometer": 24, "oximeter": 10, "glucose-strip": 16, "mask": 170,
      "iron-folic": 70, "calcium-d": 52, "sanitary-pad": 80,
    },
  },
];

/* --------------------------------------------------------------------------
   Medicine catalogue
   -------------------------------------------------------------------------- */

export const CATALOG_CATEGORIES = [
  { id: "fever", label: "Fever & Pain", labelBn: "জ্বর ও ব্যথা", icon: "🌡️" },
  { id: "gut", label: "Stomach & Diarrhoea", labelBn: "পেট ও ডায়রিয়া", icon: "🥤" },
  { id: "respiratory", label: "Cough & Breathing", labelBn: "কাশি ও শ্বাস", icon: "🫁" },
  { id: "wound", label: "Wound Care", labelBn: "ক্ষত পরিচর্যা", icon: "🩹" },
  { id: "supplies", label: "Supplies & Devices", labelBn: "সরঞ্জাম", icon: "🧰" },
  { id: "maternal", label: "Maternal & Women", labelBn: "মাতৃ ও নারী স্বাস্থ্য", icon: "🤰" },
];

// `otc: false` items are NEVER rendered in the manual picker. They can only
// enter an order through the /prescription path, where a real prescription was
// scanned, and they carry requiresRx: true on the line item. The API route
// re-validates this — see validateDroneOrder in droneDeliveryEngine.js.
//
// `matchKeywords` carries Bengali spellings and common local brand names
// because it is matched against both OCR output and the AI case sheet, and the
// case sheet is filled in Bengali by the triage prompt.
export const MEDICINE_CATALOG = [
  {
    id: "para-500",
    name: "Paracetamol 500mg",
    nameBn: "প্যারাসিটামল ৫০০ মি.গ্রা.",
    generic: "paracetamol",
    brandExamples: ["Napa", "Ace", "Fast", "Renova"],
    form: "tablet",
    category: "fever",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 12,
    maxQty: 3,
    otc: true,
    useEn: "Fever and mild to moderate pain.",
    useBn: "জ্বর ও হালকা-মাঝারি ব্যথা।",
    cautionEn: "Never exceed 8 tablets in 24 hours. Avoid with liver disease.",
    cautionBn: "২৪ ঘণ্টায় ৮টির বেশি নয়। লিভারের রোগে এড়িয়ে চলুন।",
    matchKeywords: ["paracetamol", "acetaminophen", "napa", "renova", "প্যারাসিটামল", "নাপা", "পারাসিটামল"],
  },
  {
    id: "para-syrup",
    name: "Paracetamol Syrup (children)",
    nameBn: "প্যারাসিটামল সিরাপ (শিশু)",
    generic: "paracetamol syrup",
    brandExamples: ["Napa Syrup", "Ace Syrup"],
    form: "syrup",
    category: "fever",
    unitLabel: "60ml bottle",
    unitLabelBn: "৬০ মি.লি. বোতল",
    weightG: 95,
    maxQty: 2,
    otc: true,
    useEn: "Fever and pain in children. Dose by weight.",
    useBn: "শিশুর জ্বর ও ব্যথা। ওজন অনুযায়ী মাত্রা।",
    cautionEn: "Use the measuring spoon. Do not combine with adult tablets.",
    cautionBn: "মাপার চামচ ব্যবহার করুন। বড়দের ট্যাবলেটের সাথে একসাথে নয়।",
    matchKeywords: ["napa syrup", "paracetamol syrup", "para syrup", "প্যারাসিটামল সিরাপ", "নাপা সিরাপ"],
  },
  {
    id: "ors-sachet",
    name: "ORS Saline Sachet",
    nameBn: "ওরস্যালাইন প্যাকেট",
    generic: "oral rehydration salts",
    brandExamples: ["Orsaline-N", "SMC ORS"],
    form: "sachet",
    category: "gut",
    unitLabel: "pack of 5",
    unitLabelBn: "৫টির প্যাক",
    weightG: 110,
    maxQty: 4,
    otc: true,
    useEn: "Replaces fluid lost to diarrhoea, vomiting or heat.",
    useBn: "ডায়রিয়া, বমি বা গরমে হারানো পানি পূরণ করে।",
    cautionEn: "Mix one sachet in exactly half a litre of safe water.",
    cautionBn: "একটি প্যাকেট ঠিক আধা লিটার নিরাপদ পানিতে মেশান।",
    matchKeywords: ["orsaline", "oral saline", "rehydration", "ওরস্যালাইন", "খাবার স্যালাইন", "স্যালাইন"],
  },
  {
    id: "zinc-20",
    name: "Zinc 20mg (children)",
    nameBn: "জিংক ২০ মি.গ্রা. (শিশু)",
    generic: "zinc sulphate",
    brandExamples: ["Zinc-B", "Baby Zinc"],
    form: "dispersible tablet",
    category: "gut",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 10,
    maxQty: 2,
    otc: true,
    useEn: "Shortens childhood diarrhoea. Give for 10 full days.",
    useBn: "শিশুর ডায়রিয়া কমায়। পুরো ১০ দিন খাওয়াতে হবে।",
    cautionEn: "Continue all 10 days even after the diarrhoea stops.",
    cautionBn: "ডায়রিয়া থামলেও ১০ দিন পূর্ণ করুন।",
    matchKeywords: ["zinc", "baby zinc", "zinc sulphate", "জিংক", "বেবি জিংক"],
  },
  {
    id: "orsaline-bottle",
    name: "Ready ORS Drink 250ml",
    nameBn: "রেডি ওরস্যালাইন ২৫০ মি.লি.",
    generic: "oral rehydration solution",
    brandExamples: ["Testy Saline"],
    form: "bottle",
    category: "gut",
    unitLabel: "bottle",
    unitLabelBn: "বোতল",
    weightG: 265,
    maxQty: 2,
    otc: true,
    useEn: "Pre-mixed rehydration when clean water is not available.",
    useBn: "পরিষ্কার পানি না থাকলে আগে থেকে মেশানো স্যালাইন।",
    cautionEn: "Discard 24 hours after opening.",
    cautionBn: "খোলার ২৪ ঘণ্টা পর ফেলে দিন।",
    matchKeywords: ["ready saline", "testy saline", "ors drink", "রেডি স্যালাইন", "টেস্টি স্যালাইন"],
  },
  {
    id: "antacid",
    name: "Antacid Suspension",
    nameBn: "অ্যান্টাসিড সাসপেনশন",
    generic: "aluminium hydroxide",
    brandExamples: ["Antacid Plus", "Avlocid"],
    form: "suspension",
    category: "gut",
    unitLabel: "200ml bottle",
    unitLabelBn: "২০০ মি.লি. বোতল",
    weightG: 240,
    maxQty: 2,
    otc: true,
    useEn: "Heartburn, acidity and gas after meals.",
    useBn: "খাওয়ার পর বুকজ্বালা, অম্লতা ও গ্যাস।",
    cautionEn: "Shake well. Take 1 hour apart from other medicines.",
    cautionBn: "ঝাঁকিয়ে নিন। অন্য ওষুধের ১ ঘণ্টা আগে-পরে নিন।",
    matchKeywords: ["antacid", "avlocid", "acidity", "অ্যান্টাসিড", "গ্যাস্ট্রিক", "অম্লতা"],
  },
  {
    id: "omeprazole",
    name: "Omeprazole 20mg",
    nameBn: "ওমিপ্রাজল ২০ মি.গ্রা.",
    generic: "omeprazole",
    brandExamples: ["Seclo", "Losectil", "Omep"],
    form: "capsule",
    category: "gut",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 11,
    maxQty: 2,
    otc: true,
    useEn: "Persistent acidity and reflux. Take before breakfast.",
    useBn: "দীর্ঘস্থায়ী গ্যাস্ট্রিক ও রিফ্লাক্স। সকালে খালি পেটে।",
    cautionEn: "See a doctor if you still need it after 2 weeks.",
    cautionBn: "২ সপ্তাহের পরও লাগলে ডাক্তার দেখান।",
    matchKeywords: ["omeprazole", "seclo", "losectil", "omep", "ওমিপ্রাজল", "সেকলো"],
  },
  {
    id: "domperidone",
    name: "Domperidone 10mg",
    nameBn: "ডমপেরিডন ১০ মি.গ্রা.",
    generic: "domperidone",
    brandExamples: ["Omidon", "Motigut"],
    form: "tablet",
    category: "gut",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 10,
    maxQty: 1,
    otc: true,
    useEn: "Nausea and vomiting. Take 30 minutes before food.",
    useBn: "বমি বমি ভাব ও বমি। খাওয়ার ৩০ মিনিট আগে।",
    cautionEn: "Not for children under 12 without advice.",
    cautionBn: "১২ বছরের নিচে পরামর্শ ছাড়া নয়।",
    matchKeywords: ["domperidone", "omidon", "motigut", "ডমপেরিডন"],
  },
  {
    id: "hyoscine",
    name: "Hyoscine 10mg",
    nameBn: "হায়োসিন ১০ মি.গ্রা.",
    generic: "hyoscine butylbromide",
    brandExamples: ["Algin", "Buscopan"],
    form: "tablet",
    category: "gut",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 10,
    maxQty: 1,
    otc: true,
    useEn: "Cramping stomach pain and period cramps.",
    useBn: "পেটে মোচড়ানো ব্যথা ও মাসিকের ব্যথা।",
    cautionEn: "Stop and seek care if the pain is severe or constant.",
    cautionBn: "ব্যথা তীব্র বা একটানা হলে বন্ধ করে চিকিৎসা নিন।",
    matchKeywords: ["hyoscine", "algin", "buscopan", "হায়োসিন"],
  },
  {
    id: "cetirizine",
    name: "Cetirizine 10mg",
    nameBn: "সেটিরিজিন ১০ মি.গ্রা.",
    generic: "cetirizine",
    brandExamples: ["Alatrol", "Cetzin"],
    form: "tablet",
    category: "respiratory",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 9,
    maxQty: 2,
    otc: true,
    useEn: "Runny nose, sneezing, itching and hives.",
    useBn: "নাক দিয়ে পানি, হাঁচি, চুলকানি ও চাকা।",
    cautionEn: "May cause drowsiness. Do not drive after taking it.",
    cautionBn: "ঘুম আসতে পারে। খেয়ে গাড়ি চালাবেন না।",
    matchKeywords: ["cetirizine", "alatrol", "cetzin", "সেটিরিজিন", "অ্যালাট্রল"],
  },
  {
    id: "loratadine",
    name: "Loratadine 10mg",
    nameBn: "লোরাটাডিন ১০ মি.গ্রা.",
    generic: "loratadine",
    brandExamples: ["Loratin", "Orin"],
    form: "tablet",
    category: "respiratory",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 9,
    maxQty: 2,
    otc: true,
    useEn: "Daytime allergy relief without much drowsiness.",
    useBn: "দিনের বেলার এলার্জি, ঘুম কম আসে।",
    cautionEn: "One tablet a day is enough.",
    cautionBn: "দিনে একটির বেশি নয়।",
    matchKeywords: ["loratadine", "loratin", "লোরাটাডিন"],
  },
  {
    id: "saline-drops",
    name: "Nasal Saline Drops",
    nameBn: "নাকের স্যালাইন ড্রপ",
    generic: "sodium chloride nasal",
    brandExamples: ["Nasomist", "Antazol"],
    form: "drops",
    category: "respiratory",
    unitLabel: "15ml bottle",
    unitLabelBn: "১৫ মি.লি. বোতল",
    weightG: 30,
    maxQty: 2,
    otc: true,
    useEn: "Clears a blocked nose. Safe for infants.",
    useBn: "বন্ধ নাক পরিষ্কার করে। শিশুদের জন্যও নিরাপদ।",
    cautionEn: "One bottle per person — do not share.",
    cautionBn: "একজনের বোতল অন্যে ব্যবহার করবেন না।",
    matchKeywords: ["nasal saline", "nasomist", "nose drops", "নাকের ড্রপ"],
  },
  {
    id: "lozenge",
    name: "Throat Lozenges",
    nameBn: "গলার লজেন্স",
    generic: "amylmetacresol lozenge",
    brandExamples: ["Strepsils", "Tyrothricin"],
    form: "lozenge",
    category: "respiratory",
    unitLabel: "pack of 8",
    unitLabelBn: "৮টির প্যাক",
    weightG: 25,
    maxQty: 2,
    otc: true,
    useEn: "Sore throat and irritating dry cough.",
    useBn: "গলা ব্যথা ও শুকনো খুসখুসে কাশি।",
    cautionEn: "Not for children under 6 — choking risk.",
    cautionBn: "৬ বছরের নিচে নয় — গলায় আটকে যেতে পারে।",
    matchKeywords: ["lozenge", "strepsils", "tyrothricin", "গলার লজেন্স"],
  },
  {
    id: "cough-syrup",
    name: "Cough Syrup (non-drowsy)",
    nameBn: "কাশির সিরাপ",
    generic: "guaifenesin",
    brandExamples: ["Adovas", "Tussca"],
    form: "syrup",
    category: "respiratory",
    unitLabel: "100ml bottle",
    unitLabelBn: "১০০ মি.লি. বোতল",
    weightG: 150,
    maxQty: 2,
    otc: true,
    useEn: "Loosens chest congestion so a cough clears.",
    useBn: "বুকে জমা কফ পাতলা করে বের করতে সাহায্য করে।",
    cautionEn: "See a doctor if the cough lasts more than 2 weeks.",
    cautionBn: "কাশি ২ সপ্তাহের বেশি থাকলে ডাক্তার দেখান।",
    matchKeywords: ["cough syrup", "adovas", "tussca", "guaifenesin", "কাশির সিরাপ"],
  },
  {
    id: "steam-inhaler",
    name: "Steam Inhaler Cup",
    nameBn: "ভাপ নেওয়ার কাপ",
    generic: "steam inhaler",
    brandExamples: [],
    form: "device",
    category: "respiratory",
    unitLabel: "1 unit",
    unitLabelBn: "১টি",
    weightG: 180,
    maxQty: 1,
    otc: true,
    useEn: "Steam relieves blocked nose and chest tightness.",
    useBn: "ভাপ নিলে বন্ধ নাক ও বুকের চাপ কমে।",
    cautionEn: "Never let a child handle boiling water alone.",
    cautionBn: "শিশুকে একা ফুটন্ত পানি ধরতে দেবেন না।",
    matchKeywords: ["steam inhaler", "steam cup", "ভাপ"],
  },
  {
    id: "salbutamol-inhaler",
    name: "Salbutamol Inhaler",
    nameBn: "সালবিউটামল ইনহেলার",
    generic: "salbutamol",
    brandExamples: ["Ventolin", "Sultolin", "Asthalin"],
    form: "inhaler",
    category: "respiratory",
    unitLabel: "1 inhaler",
    unitLabelBn: "১টি ইনহেলার",
    weightG: 55,
    maxQty: 1,
    // Prescription-only: an inhaler for undiagnosed breathlessness can mask a
    // cardiac cause. Only reachable through the /prescription path.
    otc: false,
    useEn: "Opens the airways in diagnosed asthma.",
    useBn: "নির্ণীত হাঁপানিতে শ্বাসনালী খুলে দেয়।",
    cautionEn: "Prescription only. Go to hospital if it stops working.",
    cautionBn: "শুধু প্রেসক্রিপশনে। কাজ না করলে হাসপাতালে যান।",
    matchKeywords: ["salbutamol", "ventolin", "sultolin", "asthalin", "inhaler", "সালবিউটামল", "ইনহেলার"],
  },
  {
    id: "azithromycin",
    name: "Azithromycin 500mg",
    nameBn: "অ্যাজিথ্রোমাইসিন ৫০০ মি.গ্রা.",
    generic: "azithromycin",
    brandExamples: ["Zimax", "Azin", "Azithrocin"],
    form: "tablet",
    category: "respiratory",
    unitLabel: "strip of 3",
    unitLabelBn: "৩টির পাতা",
    weightG: 8,
    maxQty: 1,
    // Antibiotic — prescription only. Reachable only via /prescription.
    otc: false,
    useEn: "Antibiotic for confirmed bacterial infection.",
    useBn: "নিশ্চিত ব্যাকটেরিয়া সংক্রমণে অ্যান্টিবায়োটিক।",
    cautionEn: "Prescription only. Finish the full course exactly as written.",
    cautionBn: "শুধু প্রেসক্রিপশনে। পুরো কোর্স শেষ করুন।",
    matchKeywords: ["azithromycin", "zimax", "azin", "azithrocin", "অ্যাজিথ্রোমাইসিন", "জিম্যাক্স"],
  },
  {
    id: "antiseptic",
    name: "Antiseptic Solution",
    nameBn: "অ্যান্টিসেপটিক সলিউশন",
    generic: "povidone iodine",
    brandExamples: ["Viodin", "Povisep", "Savlon"],
    form: "solution",
    category: "wound",
    unitLabel: "100ml bottle",
    unitLabelBn: "১০০ মি.লি. বোতল",
    weightG: 130,
    maxQty: 2,
    otc: true,
    useEn: "Cleans cuts, grazes and minor wounds.",
    useBn: "কাটা, ছড়ে যাওয়া ও ছোট ক্ষত পরিষ্কার করে।",
    cautionEn: "Do not pour into deep or bleeding wounds — get help.",
    cautionBn: "গভীর বা রক্তক্ষরণকারী ক্ষতে ঢালবেন না — সাহায্য নিন।",
    matchKeywords: ["antiseptic", "povidone", "iodine", "viodin", "savlon", "অ্যান্টিসেপটিক", "স্যাভলন"],
  },
  {
    id: "gauze",
    name: "Sterile Gauze Pads",
    nameBn: "স্টেরাইল গজ",
    generic: "sterile gauze",
    brandExamples: [],
    form: "dressing",
    category: "wound",
    unitLabel: "pack of 10",
    unitLabelBn: "১০টির প্যাক",
    weightG: 40,
    maxQty: 3,
    otc: true,
    useEn: "Covers a cleaned wound.",
    useBn: "পরিষ্কার করা ক্ষত ঢেকে রাখে।",
    cautionEn: "Change daily, or sooner if it gets wet.",
    cautionBn: "প্রতিদিন বদলান, ভিজে গেলে আগেই।",
    matchKeywords: ["gauze", "sterile gauze", "গজ"],
  },
  {
    id: "tape",
    name: "Medical Tape",
    nameBn: "মেডিকেল টেপ",
    generic: "adhesive tape",
    brandExamples: ["Micropore"],
    form: "tape",
    category: "wound",
    unitLabel: "1 roll",
    unitLabelBn: "১ রোল",
    weightG: 30,
    maxQty: 2,
    otc: true,
    useEn: "Holds gauze in place.",
    useBn: "গজ আটকে রাখে।",
    cautionEn: "Do not wrap so tight that fingers or toes go pale.",
    cautionBn: "এত শক্ত নয় যাতে আঙুল ফ্যাকাশে হয়ে যায়।",
    matchKeywords: ["medical tape", "micropore", "টেপ"],
  },
  {
    id: "bandage",
    name: "Roller Bandage",
    nameBn: "রোলার ব্যান্ডেজ",
    generic: "cotton bandage",
    brandExamples: [],
    form: "bandage",
    category: "wound",
    unitLabel: "1 roll",
    unitLabelBn: "১ রোল",
    weightG: 45,
    maxQty: 3,
    otc: true,
    useEn: "Wraps a dressed wound or supports a sprain.",
    useBn: "ড্রেসিং করা ক্ষত বা মচকানো জায়গা বাঁধে।",
    cautionEn: "Loosen at once if the limb tingles or swells.",
    cautionBn: "ঝিনঝিন বা ফোলা হলে সঙ্গে সঙ্গে ঢিলা করুন।",
    matchKeywords: ["bandage", "roller bandage", "ব্যান্ডেজ"],
  },
  {
    id: "burn-gel",
    name: "Burn Relief Gel",
    nameBn: "পোড়ার জেল",
    generic: "burn gel",
    brandExamples: ["Burnol"],
    form: "gel",
    category: "wound",
    unitLabel: "30g tube",
    unitLabelBn: "৩০ গ্রাম টিউব",
    weightG: 45,
    maxQty: 2,
    otc: true,
    useEn: "Soothes small superficial burns after cooling with water.",
    useBn: "পানি দিয়ে ঠান্ডা করার পর ছোট পোড়ায় আরাম দেয়।",
    cautionEn: "Cool with running water for 20 minutes first. Never use ice.",
    cautionBn: "আগে ২০ মিনিট চলমান পানিতে ঠান্ডা করুন। বরফ নয়।",
    matchKeywords: ["burn gel", "burnol", "পোড়ার মলম"],
  },
  {
    id: "cotton",
    name: "Absorbent Cotton",
    nameBn: "তুলা",
    generic: "absorbent cotton",
    brandExamples: [],
    form: "cotton",
    category: "wound",
    unitLabel: "50g roll",
    unitLabelBn: "৫০ গ্রাম রোল",
    weightG: 60,
    maxQty: 2,
    otc: true,
    useEn: "Cleaning skin around a wound.",
    useBn: "ক্ষতের চারপাশের চামড়া পরিষ্কার করতে।",
    cautionEn: "Do not pack cotton directly into an open wound.",
    cautionBn: "খোলা ক্ষতের ভেতরে তুলা ভরবেন না।",
    matchKeywords: ["absorbent cotton", "তুলা"],
  },
  {
    id: "gloves",
    name: "Disposable Gloves",
    nameBn: "ডিসপোজেবল গ্লাভস",
    generic: "nitrile gloves",
    brandExamples: [],
    form: "gloves",
    category: "supplies",
    unitLabel: "pack of 10",
    unitLabelBn: "১০টির প্যাক",
    weightG: 55,
    maxQty: 2,
    otc: true,
    useEn: "Protects both people while dressing a wound.",
    useBn: "ড্রেসিং করার সময় দুজনকেই রক্ষা করে।",
    cautionEn: "Single use only.",
    cautionBn: "একবারই ব্যবহারযোগ্য।",
    matchKeywords: ["gloves", "nitrile", "গ্লাভস"],
  },
  {
    id: "mask",
    name: "Surgical Masks",
    nameBn: "সার্জিক্যাল মাস্ক",
    generic: "surgical mask",
    brandExamples: [],
    form: "mask",
    category: "supplies",
    unitLabel: "pack of 10",
    unitLabelBn: "১০টির প্যাক",
    weightG: 35,
    maxQty: 2,
    otc: true,
    useEn: "Reduces spread of cough and cold in the household.",
    useBn: "ঘরে কাশি-সর্দি ছড়ানো কমায়।",
    cautionEn: "Change when damp.",
    cautionBn: "ভিজে গেলে বদলান।",
    matchKeywords: ["surgical mask", "face mask", "মাস্ক"],
  },
  {
    id: "thermometer",
    name: "Digital Thermometer",
    nameBn: "ডিজিটাল থার্মোমিটার",
    generic: "digital thermometer",
    brandExamples: [],
    form: "device",
    category: "supplies",
    unitLabel: "1 unit",
    unitLabelBn: "১টি",
    weightG: 40,
    maxQty: 1,
    otc: true,
    useEn: "Measure fever properly instead of guessing by touch.",
    useBn: "হাত দিয়ে অনুমান না করে জ্বর মাপুন।",
    cautionEn: "Above 39°C in a child needs medical advice.",
    cautionBn: "শিশুর ৩৯° সে.-এর বেশি হলে চিকিৎসকের পরামর্শ নিন।",
    matchKeywords: ["thermometer", "থার্মোমিটার"],
  },
  {
    id: "oximeter",
    name: "Pulse Oximeter",
    nameBn: "পালস অক্সিমিটার",
    generic: "pulse oximeter",
    brandExamples: [],
    form: "device",
    category: "supplies",
    unitLabel: "1 unit",
    unitLabelBn: "১টি",
    weightG: 60,
    maxQty: 1,
    otc: true,
    useEn: "Checks blood oxygen during a chest infection.",
    useBn: "বুকের সংক্রমণে রক্তের অক্সিজেন মাপে।",
    cautionEn: "Below 94% at rest — go to hospital.",
    cautionBn: "বিশ্রামে ৯৪%-এর নিচে হলে হাসপাতালে যান।",
    matchKeywords: ["oximeter", "pulse oximeter", "অক্সিমিটার"],
  },
  {
    id: "glucose-strip",
    name: "Glucose Test Strips",
    nameBn: "গ্লুকোজ টেস্ট স্ট্রিপ",
    generic: "blood glucose strips",
    brandExamples: [],
    form: "strips",
    category: "supplies",
    unitLabel: "pack of 25",
    unitLabelBn: "২৫টির প্যাক",
    weightG: 35,
    maxQty: 1,
    otc: true,
    useEn: "For an existing glucose meter.",
    useBn: "আগে থেকে থাকা গ্লুকোমিটারের জন্য।",
    cautionEn: "Check the strips match your meter model.",
    cautionBn: "স্ট্রিপ আপনার মিটারের সাথে মেলে কিনা দেখুন।",
    matchKeywords: ["glucose strip", "glucometer", "গ্লুকোজ স্ট্রিপ"],
  },
  {
    id: "iron-folic",
    name: "Iron + Folic Acid",
    nameBn: "আয়রন ও ফলিক অ্যাসিড",
    generic: "ferrous fumarate",
    brandExamples: ["Feroglobin", "Zeefol"],
    form: "tablet",
    category: "maternal",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 14,
    maxQty: 3,
    otc: true,
    useEn: "Routine supplement in pregnancy and for mild anaemia.",
    useBn: "গর্ভাবস্থা ও হালকা রক্তস্বল্পতায় নিয়মিত সাপ্লিমেন্ট।",
    cautionEn: "May darken stool — that is normal. Take with vitamin C.",
    cautionBn: "পায়খানা কালচে হতে পারে — এটি স্বাভাবিক।",
    matchKeywords: ["ferrous", "folic acid", "feroglobin", "zeefol", "আয়রন", "ফলিক"],
  },
  {
    id: "calcium-d",
    name: "Calcium + Vitamin D",
    nameBn: "ক্যালসিয়াম ও ভিটামিন ডি",
    generic: "calcium carbonate",
    brandExamples: ["Calbo-D", "Ostocal-D"],
    form: "tablet",
    category: "maternal",
    unitLabel: "strip of 10",
    unitLabelBn: "১০টির পাতা",
    weightG: 18,
    maxQty: 2,
    otc: true,
    useEn: "Bone support in pregnancy and after menopause.",
    useBn: "গর্ভাবস্থা ও মেনোপজের পর হাড়ের জন্য।",
    cautionEn: "Take apart from iron tablets.",
    cautionBn: "আয়রন ট্যাবলেটের সাথে একসাথে নয়।",
    matchKeywords: ["calcium", "calbo", "ostocal", "vitamin d", "ক্যালসিয়াম"],
  },
  {
    id: "sanitary-pad",
    name: "Sanitary Pads",
    nameBn: "স্যানিটারি প্যাড",
    generic: "sanitary pad",
    brandExamples: [],
    form: "pack",
    category: "maternal",
    unitLabel: "pack of 8",
    unitLabelBn: "৮টির প্যাক",
    weightG: 120,
    maxQty: 3,
    otc: true,
    useEn: "Menstrual hygiene supplies.",
    useBn: "মাসিককালীন পরিচ্ছন্নতার সামগ্রী।",
    cautionEn: "Change every 4-6 hours.",
    cautionBn: "৪-৬ ঘণ্টা পরপর বদলান।",
    matchKeywords: ["sanitary pad", "napkin", "স্যানিটারি", "প্যাড"],
  },
];

/* --------------------------------------------------------------------------
   Delivery stages (the status timeline)
   -------------------------------------------------------------------------- */

// Order matters — computeTelemetry() reports an index into this array.
export const DELIVERY_STAGES = [
  { id: "queued", label: "Order received", labelBn: "অর্ডার গৃহীত", icon: "📋" },
  { id: "preparing", label: "Packing at hub", labelBn: "হাবে প্যাকিং", icon: "📦" },
  { id: "climbing", label: "Take-off", labelBn: "উড্ডয়ন", icon: "🛫" },
  { id: "enroute", label: "In flight", labelBn: "আকাশে", icon: "🚁" },
  { id: "descending", label: "Descending", labelBn: "অবতরণ", icon: "🛬" },
  { id: "handoff", label: "Handing over", labelBn: "হস্তান্তর", icon: "🤲" },
  { id: "delivered", label: "Delivered", labelBn: "পৌঁছে গেছে", icon: "✅" },
  { id: "returning", label: "Returning to hub", labelBn: "হাবে ফিরছে", icon: "↩️" },
  { id: "completed", label: "Mission complete", labelBn: "মিশন সম্পন্ন", icon: "🏁" },
];

// Stages up to and including "delivered" are the user's delivery; the two after
// are the drone's own trip home and must never count towards the ETA.
export const DELIVERED_STAGE_INDEX = DELIVERY_STAGES.findIndex((s) => s.id === "delivered");

/* --------------------------------------------------------------------------
   Lookups
   -------------------------------------------------------------------------- */

export function getHub(id) {
  return DRONE_HUBS.find((h) => h.id === id) || null;
}

export function getCatalogItem(id) {
  return MEDICINE_CATALOG.find((m) => m.id === id) || null;
}

export function getCategory(id) {
  return CATALOG_CATEGORIES.find((c) => c.id === id) || null;
}

// Fuzzy-match a free-text medicine name (OCR output, or a phrase from the AI
// case sheet) against the catalogue. An exact keyword/brand/generic hit scores
// 1, a substring hit scores 0.6, and callers require >= 0.6 — high enough that
// "paracetamol" cannot match "calcium", low enough to survive OCR noise.
//
// Terms shorter than 4 characters are only ever matched exactly, because a
// 3-letter brand like "Ace" is a substring of half the English language.
export function findCatalogMatches(text, { minScore = 0.6, limit = 3 } = {}) {
  const needle = String(text || "").toLowerCase().trim();
  if (!needle) return [];

  const scored = [];
  for (const item of MEDICINE_CATALOG) {
    const haystack = [item.generic, ...item.brandExamples, ...item.matchKeywords]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase());

    let best = 0;
    for (const term of haystack) {
      if (!term) continue;
      if (term === needle) {
        best = 1;
        break;
      }
      if (term.length >= 4 && (needle.includes(term) || term.includes(needle))) {
        best = Math.max(best, 0.6);
      }
    }
    if (best >= minScore) scored.push({ item, score: best });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

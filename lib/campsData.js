// Shared data layer for NGO / temporary medical camps ("Medical Camps" feature).
// Imported by the API route (server), the map page, and the organizer form,
// so validation and status rules exist in exactly one place.
//
// Camp record shape:
// {
//   id: "CAMP-9f3a2b",
//   title, titleBn,
//   organizer, organizerBn,            // NGO / hospital running the camp
//   specialties: ["eye", "general"],   // ids from SPECIALTIES below
//   startAt, endAt,                    // ISO 8601 strings (full date + time window)
//   lat, lng,                          // real coordinates
//   venue, venueBn, union, upazila, district,
//   phone,
//   notes, notesBn,
//   isFree, fee,
//   createdAt
// }
//
// NOTE: `status` is deliberately NOT stored. It is derived from startAt/endAt on
// every read (see getCampStatus) so a camp can never sit in the file claiming to
// be "ongoing" months after it finished.

/* --------------------------------------------------------------------------
   Specialist types
   -------------------------------------------------------------------------- */

export const SPECIALTIES = [
  { id: "general", icon: "🩺", label: "General Medicine", labelBn: "সাধারণ চিকিৎসা", color: "#6ae4ff" },
  { id: "eye", icon: "👁️", label: "Eye / Ophthalmology", labelBn: "চক্ষু", color: "#34ed7b" },
  { id: "heart", icon: "❤️", label: "Cardiology", labelBn: "হৃদরোগ", color: "#ff4757" },
  { id: "dental", icon: "🦷", label: "Dental", labelBn: "দন্ত", color: "#ffd700" },
  { id: "maternal", icon: "🤰", label: "Maternal & Child", labelBn: "মা ও শিশু", color: "#ff9ff3" },
  { id: "ortho", icon: "🦴", label: "Orthopaedics", labelBn: "হাড় ও জোড়া", color: "#c8d6e5" },
  { id: "skin", icon: "🧴", label: "Skin / Dermatology", labelBn: "চর্মরোগ", color: "#feca57" },
  { id: "diabetes", icon: "🩸", label: "Diabetes Screening", labelBn: "ডায়াবেটিস", color: "#54a0ff" },
  { id: "vaccination", icon: "💉", label: "Vaccination", labelBn: "টিকাদান", color: "#5f27cd" },
  { id: "blood", icon: "🩹", label: "Blood Group & Donation", labelBn: "রক্তদান", color: "#ee5253" },
];

export const SPECIALTY_IDS = SPECIALTIES.map((s) => s.id);

export function getSpecialty(id) {
  return SPECIALTIES.find((s) => s.id === id) || null;
}

/* --------------------------------------------------------------------------
   Derived status
   -------------------------------------------------------------------------- */

export const CAMP_STATUS = {
  ONGOING: "ONGOING",
  UPCOMING: "UPCOMING",
  ENDED: "ENDED",
};

export function getCampStatus(camp, now = Date.now()) {
  const start = new Date(camp?.startAt).getTime();
  const end = new Date(camp?.endAt).getTime();
  // A camp with unparseable dates is treated as ended rather than shown as live.
  if (Number.isNaN(start) || Number.isNaN(end)) return CAMP_STATUS.ENDED;
  if (now < start) return CAMP_STATUS.UPCOMING;
  if (now > end) return CAMP_STATUS.ENDED;
  return CAMP_STATUS.ONGOING;
}

const STATUS_ORDER = { ONGOING: 0, UPCOMING: 1, ENDED: 2 };

// Attaches derived status and sorts ONGOING -> UPCOMING -> ENDED, then by start time.
export function withStatus(camps, now = Date.now()) {
  return camps
    .map((c) => ({ ...c, status: getCampStatus(c, now) }))
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;
      return new Date(a.startAt) - new Date(b.startAt);
    });
}

/* --------------------------------------------------------------------------
   Geo helpers
   -------------------------------------------------------------------------- */

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in km between two { lat, lng } points.
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBnDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatDistance(km, lang = "en") {
  if (km === null || km === undefined || Number.isNaN(km)) return "";
  if (lang === "bn") {
    return km < 1
      ? `${toBnDigits(Math.round(km * 1000))} মিটার`
      : `${toBnDigits(km.toFixed(1))} কিমি`;
  }
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/* --------------------------------------------------------------------------
   Date/time formatting
   -------------------------------------------------------------------------- */

// Camps are physically in Bangladesh, so always render in Asia/Dhaka. This also
// keeps output deterministic regardless of the viewer's machine timezone.
const TZ = "Asia/Dhaka";

function dtf(lang, options) {
  return new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
    timeZone: TZ,
    ...options,
  });
}

function sameDhakaDay(a, b) {
  const key = (d) =>
    dtf("en", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return key(a) === key(b);
}

// "12 Sep, 9:00 am - 4:00 pm" (same day) or "12 Sep 9:00 am - 14 Sep 4:00 pm".
export function formatCampWindow(camp, lang = "en") {
  const start = new Date(camp?.startAt);
  const end = new Date(camp?.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const dayFmt = dtf(lang, { day: "numeric", month: "short" });
  const timeFmt = dtf(lang, { hour: "numeric", minute: "2-digit", hour12: true });

  if (sameDhakaDay(start, end)) {
    return `${dayFmt.format(start)}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  }
  return `${dayFmt.format(start)} ${timeFmt.format(start)} – ${dayFmt.format(end)} ${timeFmt.format(end)}`;
}

// Short relative hint for the card badge: "Starts in 3 days" / "5 hours left".
export function formatCampCountdown(camp, lang = "en", now = Date.now()) {
  const status = getCampStatus(camp, now);
  if (status === CAMP_STATUS.ENDED) return lang === "bn" ? "শেষ হয়েছে" : "Finished";

  const target =
    status === CAMP_STATUS.UPCOMING ? new Date(camp.startAt) : new Date(camp.endAt);
  const diffMs = target.getTime() - now;
  const hours = Math.max(Math.round(diffMs / 3600000), 1);
  const days = Math.round(diffMs / 86400000);

  if (lang === "bn") {
    const amount = days >= 1 ? `${toBnDigits(days)} দিন` : `${toBnDigits(hours)} ঘণ্টা`;
    return status === CAMP_STATUS.UPCOMING ? `${amount} পরে শুরু` : `আর ${amount} বাকি`;
  }
  const amount =
    days >= 1
      ? `${days} day${days === 1 ? "" : "s"}`
      : `${hours} hour${hours === 1 ? "" : "s"}`;
  return status === CAMP_STATUS.UPCOMING ? `Starts in ${amount}` : `${amount} left`;
}

/* --------------------------------------------------------------------------
   Validation + normalization (shared by the API route and the organizer form)
   -------------------------------------------------------------------------- */

// Rough bounding box of Bangladesh - catches swapped lat/lng and empty pickers.
export const BD_BOUNDS = { minLat: 20.5, maxLat: 26.7, minLng: 88.0, maxLng: 92.7 };
const MAX_DURATION_DAYS = 30;

export function validateCamp(payload) {
  const errors = {};
  const p = payload || {};

  if (!String(p.title || "").trim()) errors.title = "Camp title is required.";
  if (!String(p.organizer || "").trim()) errors.organizer = "Organizer / NGO name is required.";
  if (!String(p.venue || "").trim()) errors.venue = "Venue is required.";
  if (!String(p.district || "").trim()) errors.district = "District is required.";

  const phone = String(p.phone || "").trim();
  if (!phone) errors.phone = "A contact phone number is required.";
  else if (phone.replace(/\D/g, "").length < 9) errors.phone = "Enter a valid contact number.";

  const specialties = Array.isArray(p.specialties) ? p.specialties : [];
  if (specialties.filter((s) => SPECIALTY_IDS.includes(s)).length === 0) {
    errors.specialties = "Select at least one specialist type.";
  }

  const start = new Date(p.startAt).getTime();
  const end = new Date(p.endAt).getTime();
  if (!p.startAt || Number.isNaN(start)) errors.startAt = "Start date and time is required.";
  if (!p.endAt || Number.isNaN(end)) errors.endAt = "End date and time is required.";
  if (!Number.isNaN(start) && !Number.isNaN(end) && p.startAt && p.endAt) {
    if (end <= start) errors.endAt = "End time must be after the start time.";
    else if (end - start > MAX_DURATION_DAYS * 86400000) {
      errors.endAt = `A camp cannot run longer than ${MAX_DURATION_DAYS} days.`;
    }
  }

  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    errors.location = "Pick the camp location on the map.";
  } else if (
    lat < BD_BOUNDS.minLat ||
    lat > BD_BOUNDS.maxLat ||
    lng < BD_BOUNDS.minLng ||
    lng > BD_BOUNDS.maxLng
  ) {
    errors.location = "The pin must be inside Bangladesh.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

function makeId() {
  // Same spirit as the EMG-#### ids in lib/emergencyBroadcaster.js.
  let hex = "";
  for (let i = 0; i < 6; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return `CAMP-${hex}`;
}

const str = (v) => String(v ?? "").trim();

// Builds a clean record from untrusted input: assigns id/createdAt, coerces
// numbers, trims strings and drops any key we do not know about.
export function normalizeCamp(payload) {
  const p = payload || {};
  const isFree = p.isFree !== false;
  return {
    id: makeId(),
    title: str(p.title),
    titleBn: str(p.titleBn),
    organizer: str(p.organizer),
    organizerBn: str(p.organizerBn),
    specialties: (Array.isArray(p.specialties) ? p.specialties : []).filter((s) =>
      SPECIALTY_IDS.includes(s)
    ),
    startAt: new Date(p.startAt).toISOString(),
    endAt: new Date(p.endAt).toISOString(),
    lat: Number(p.lat),
    lng: Number(p.lng),
    venue: str(p.venue),
    venueBn: str(p.venueBn),
    union: str(p.union),
    upazila: str(p.upazila),
    district: str(p.district),
    phone: str(p.phone),
    notes: str(p.notes),
    notesBn: str(p.notesBn),
    isFree,
    fee: isFree ? 0 : Number(p.fee) || 0,
    createdAt: new Date().toISOString(),
  };
}

/* --------------------------------------------------------------------------
   Seed data
   -------------------------------------------------------------------------- */

const DAY = 86400000;
const HOUR = 3600000;

// Builds an ISO instant N days from today at a given Dhaka-local hour.
// Bangladesh is UTC+6 year-round (no DST), so the offset is a constant.
function atDhakaHour(dayOffset, hour) {
  const base = new Date(Date.now() + dayOffset * DAY);
  const utcMidnight = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  return new Date(utcMidnight + (hour - 6) * HOUR).toISOString();
}

// Seeds are generated relative to "now" so a fresh install always shows live
// ONGOING camps, several UPCOMING ones and one ENDED example.
export function buildSeedCamps() {
  return [
    {
      id: "CAMP-seed01",
      title: "Free Eye & Cataract Screening Camp",
      titleBn: "বিনামূল্যে চক্ষু ও ছানি পরীক্ষা ক্যাম্প",
      organizer: "Grameen Netro Sheba Foundation",
      organizerBn: "গ্রামীণ নেত্র সেবা ফাউন্ডেশন",
      specialties: ["eye", "general"],
      // Spans yesterday -> tomorrow so this seed reads ONGOING at any hour of day.
      startAt: atDhakaHour(-1, 9),
      endAt: atDhakaHour(1, 16),
      lat: 24.1957,
      lng: 90.4714,
      venue: "Sreepur Union Parishad Field",
      venueBn: "শ্রীপুর ইউনিয়ন পরিষদ মাঠ",
      union: "Sreepur",
      upazila: "Sreepur",
      district: "Gazipur",
      phone: "+880 1711-445566",
      notes:
        "Free cataract screening and reading glasses. Bring National ID. Surgery referrals issued on site.",
      notesBn: "বিনামূল্যে ছানি পরীক্ষা ও চশমা। জাতীয় পরিচয়পত্র সঙ্গে আনুন।",
      isFree: true,
      fee: 0,
      createdAt: new Date(Date.now() - 6 * DAY).toISOString(),
    },
    {
      id: "CAMP-seed02",
      title: "Mother & Child Health Camp",
      titleBn: "মা ও শিশু স্বাস্থ্য ক্যাম্প",
      organizer: "BRAC Health Programme",
      organizerBn: "ব্র্যাক স্বাস্থ্য কর্মসূচি",
      specialties: ["maternal", "vaccination", "general"],
      startAt: atDhakaHour(-1, 8),
      endAt: atDhakaHour(2, 17),
      lat: 22.1867,
      lng: 90.7103,
      venue: "Char Fasson Community Clinic",
      venueBn: "চর ফ্যাশন কমিউনিটি ক্লিনিক",
      union: "Char Fasson",
      upazila: "Char Fasson",
      district: "Bhola",
      phone: "+880 1933-220011",
      notes: "Antenatal checkup, child growth monitoring and EPI vaccination for under-fives.",
      notesBn: "গর্ভকালীন পরীক্ষা, শিশুর বৃদ্ধি পর্যবেক্ষণ ও পাঁচ বছরের নিচে শিশুদের টিকাদান।",
      isFree: true,
      fee: 0,
      createdAt: new Date(Date.now() - 9 * DAY).toISOString(),
    },
    {
      id: "CAMP-seed03",
      title: "Cardiology & Diabetes Screening Camp",
      titleBn: "হৃদরোগ ও ডায়াবেটিস পরীক্ষা ক্যাম্প",
      organizer: "Bhairab Hridoy Seba Trust",
      organizerBn: "ভৈরব হৃদয় সেবা ট্রাস্ট",
      specialties: ["heart", "diabetes"],
      startAt: atDhakaHour(3, 9),
      endAt: atDhakaHour(3, 15),
      lat: 24.05,
      lng: 90.9833,
      venue: "Bhairab Ghat High School Auditorium",
      venueBn: "ভৈরব ঘাট উচ্চ বিদ্যালয় মিলনায়তন",
      union: "Bhairab Pourashava",
      upazila: "Bhairab",
      district: "Kishoreganj",
      phone: "+880 1822-330044",
      notes:
        "Free ECG, blood pressure and blood sugar testing. Consultation with a visiting cardiologist.",
      notesBn: "বিনামূল্যে ইসিজি, রক্তচাপ ও রক্তে শর্করা পরীক্ষা। বিশেষজ্ঞ হৃদরোগ চিকিৎসকের পরামর্শ।",
      isFree: true,
      fee: 0,
      createdAt: new Date(Date.now() - 4 * DAY).toISOString(),
    },
    {
      id: "CAMP-seed04",
      title: "Dental Care & Oral Hygiene Camp",
      titleBn: "দন্ত চিকিৎসা ও মুখগহ্বর পরিচর্যা ক্যাম্প",
      organizer: "Sirajganj Youth Medical Society",
      organizerBn: "সিরাজগঞ্জ যুব মেডিকেল সোসাইটি",
      specialties: ["dental", "general"],
      startAt: atDhakaHour(6, 10),
      endAt: atDhakaHour(7, 16),
      lat: 24.4533,
      lng: 89.7006,
      venue: "Sirajganj Sadar Upazila Parishad Hall",
      venueBn: "সিরাজগঞ্জ সদর উপজেলা পরিষদ হল",
      union: "Sadar",
      upazila: "Sirajganj Sadar",
      district: "Sirajganj",
      phone: "+880 1755-908070",
      notes: "Scaling, extraction and free toothbrush distribution for school children.",
      notesBn: "স্কেলিং, দাঁত তোলা এবং স্কুল শিক্ষার্থীদের জন্য বিনামূল্যে টুথব্রাশ বিতরণ।",
      isFree: false,
      fee: 50,
      createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
    },
    {
      id: "CAMP-seed05",
      title: "Winter Skin Disease & Blood Group Camp",
      titleBn: "শীতকালীন চর্মরোগ ও রক্তের গ্রুপ নির্ণয় ক্যাম্প",
      organizer: "Kurigram Red Crescent Unit",
      organizerBn: "কুড়িগ্রাম রেড ক্রিসেন্ট ইউনিট",
      specialties: ["skin", "blood"],
      startAt: atDhakaHour(11, 9),
      endAt: atDhakaHour(11, 14),
      lat: 25.8072,
      lng: 89.6295,
      venue: "Kurigram Sadar Char Community Ground",
      venueBn: "কুড়িগ্রাম সদর চর কমিউনিটি মাঠ",
      union: "Holokhana",
      upazila: "Kurigram Sadar",
      district: "Kurigram",
      phone: "+880 1611-772233",
      notes: "Free blood grouping cards and treatment for winter skin conditions in char areas.",
      notesBn: "চরাঞ্চলে বিনামূল্যে রক্তের গ্রুপ কার্ড ও শীতকালীন চর্মরোগের চিকিৎসা।",
      isFree: true,
      fee: 0,
      createdAt: new Date(Date.now() - 1 * DAY).toISOString(),
    },
    {
      id: "CAMP-seed06",
      title: "Orthopaedic & Physiotherapy Camp",
      titleBn: "অর্থোপেডিক ও ফিজিওথেরাপি ক্যাম্প",
      organizer: "Savar Rural Health Initiative",
      organizerBn: "সাভার গ্রামীণ স্বাস্থ্য উদ্যোগ",
      specialties: ["ortho", "general"],
      startAt: atDhakaHour(-5, 9),
      endAt: atDhakaHour(-4, 16),
      lat: 23.8583,
      lng: 90.2667,
      venue: "Savar Bazar Community Centre",
      venueBn: "সাভার বাজার কমিউনিটি সেন্টার",
      union: "Savar",
      upazila: "Savar",
      district: "Dhaka",
      phone: "+880 1700-556677",
      notes: "Bone and joint consultation with free physiotherapy sessions for elderly patients.",
      notesBn: "হাড় ও জোড়ার পরামর্শসহ প্রবীণদের জন্য বিনামূল্যে ফিজিওথেরাপি।",
      isFree: true,
      fee: 0,
      createdAt: new Date(Date.now() - 14 * DAY).toISOString(),
    },
  ];
}

/* --------------------------------------------------------------------------
   Permanent facilities (secondary map layer)
   -------------------------------------------------------------------------- */

// Moved here from app/map/page.js. These now carry real coordinates - the old
// version had none, and the map faked pin positions from the array index.
export const HOSPITALS = [
  {
    id: "HOSP-1",
    name: "Dhaka Medical College Hospital",
    nameBn: "ঢাকা মেডিকেল কলেজ হাসপাতাল",
    type: "Government Hospital",
    lat: 23.7258,
    lng: 90.3976,
    address: "Secretariat Rd, Dhaka 1000",
    phone: "+880-2-55165001",
    open: true,
  },
  {
    id: "HOSP-2",
    name: "Square Hospital",
    nameBn: "স্কয়ার হাসপাতাল",
    type: "Private Hospital",
    lat: 23.7524,
    lng: 90.3835,
    address: "18/F Bir Uttam Qazi Nuruzzaman Sarak, West Panthapath",
    phone: "+880-2-8159457",
    open: true,
  },
  {
    id: "HOSP-3",
    name: "Savar Upazila Health Complex",
    nameBn: "সাভার উপজেলা স্বাস্থ্য কমপ্লেক্স",
    type: "Government Clinic",
    lat: 23.8434,
    lng: 90.2661,
    address: "Upazila Sadar, Savar, Dhaka",
    phone: "+880-2-7745566",
    open: true,
  },
  {
    id: "HOSP-4",
    name: "Dhamrai Community Health Center",
    nameBn: "ধামরাই কমিউনিটি স্বাস্থ্য কেন্দ্র",
    type: "Community Clinic",
    lat: 23.907,
    lng: 90.22,
    address: "Union Parishad Complex, Dhamrai, Dhaka",
    phone: "+880-2-9876543",
    open: false,
  },
  {
    id: "HOSP-5",
    name: "National Institute of Diseases of the Chest",
    nameBn: "জাতীয় বক্ষব্যাধি ইনস্টিটিউট",
    type: "Specialized Hospital",
    lat: 23.7794,
    lng: 90.4041,
    address: "Mohakhali, Dhaka 1212",
    phone: "+880-2-8821566",
    open: true,
  },
];

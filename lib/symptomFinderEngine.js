// Symptom Finder Engine — 100% Offline Step-by-Step Medical Decision Tree Engine
// For rural telemedicine triage in Bangladesh

export const BODY_AREAS = [
  { id: "head", nameBn: "মাথা ও গলা (Head & Neck)", nameEn: "Head & Neck" },
  { id: "chest", nameBn: "বুক ও শ্বাসতন্ত্র (Chest & Respiratory)", nameEn: "Chest & Respiratory" },
  { id: "abdomen", nameBn: "পেট ও পরিপাকতন্ত্র (Abdomen & Stomach)", nameEn: "Abdomen & Stomach" },
  { id: "limbs_skin", nameBn: "হাত-পা, ত্বক ও আঘাত (Limbs, Skin & Trauma)", nameEn: "Limbs, Skin & Trauma" },
  { id: "general", nameBn: "পুরো শরীর ও জ্বর (General Body & Fever)", nameEn: "General Body & Fever" },
];

export const PRIMARY_SYMPTOMS_BY_AREA = {
  head: [
    { id: "stroke_signs", labelBn: "মুখ বেঁকে যাওয়া, কথা জড়ানো বা একপাশ অবশ (Face drooping/Slurred speech)", labelEn: "Face drooping / Speech difficulty" },
    { id: "headache_severe", labelBn: "তীব্র মাথাব্যথা ও মাথা ঘোরানো (Severe Headache & Dizziness)", labelEn: "Severe Headache & Dizziness" },
  ],
  chest: [
    { id: "fast_breathing_child", labelBn: "শিশুর বুক দেবে যাওয়া ও দ্রুত শ্বাস (Fast breathing / Chest in-drawing)", labelEn: "Child Fast Breathing & Chest In-drawing" },
    { id: "cough_cold", labelBn: "সর্দি, কাশি ও গলা ব্যথা (Cough, Cold & Sore throat)", labelEn: "Cough, Cold & Sore Throat" },
  ],
  abdomen: [
    { id: "watery_diarrhea", labelBn: "ঘন ঘন পাতলা পায়খানা ও বমি (Watery Stool & Vomiting)", labelEn: "Watery Stool & Vomiting" },
    { id: "stomach_pain", labelBn: "পেটে তীব্র ব্যথা ও অরুচি (Severe Abdominal Pain)", labelEn: "Severe Abdominal Pain" },
  ],
  limbs_skin: [
    { id: "snake_bite_mark", labelBn: "সাপের কামড় বা ফোসকা (Snake Bite / Fang Marks)", labelEn: "Snake Bite / Fang Marks" },
    { id: "burn_wounds", labelBn: "আগুনে পুড়ে যাওয়া বা ফোসকা (Thermal / Chemical Burn)", labelEn: "Thermal / Chemical Burn" },
    { id: "animal_scratch", labelBn: "কুকুর বা বিড়ালের কামড়/আঁচড় (Dog/Cat Bite or Scratch)", labelEn: "Dog / Animal Bite or Scratch" },
  ],
  general: [
    { id: "dengue_high_fever", labelBn: "১০৩°-১০৫° তীব্র জ্বর ও শরীরে লাল দাগ (High Fever & Skin Rash)", labelEn: "High Fever (103°F+) & Skin Rash" },
    { id: "heatstroke_faint", labelBn: "প্রচণ্ড গরমে অজ্ঞান হওয়া ও তীব্র তাপমাত্রা (Heatstroke / High Temp)", labelEn: "Heatstroke & Fainting" },
    { id: "prolonged_fever", labelBn: "৩ দিনের বেশি দীর্ঘস্থায়ী জ্বর (Prolonged Fever 3+ days)", labelEn: "Prolonged Fever (3+ Days)" },
  ],
};

export const DURATIONS = [
  { id: "under_24h", labelBn: "২৪ ঘণ্টার কম সময় (Less than 24 hours)", labelEn: "Less than 24 hours" },
  { id: "1_to_3_days", labelBn: "১ থেকে ৩ দিন (1 to 3 days)", labelEn: "1 to 3 days" },
  { id: "over_3_days", labelBn: "৩ দিনের বেশি (More than 3 days)", labelEn: "More than 3 days" },
];

export const SEVERITIES = [
  { id: "mild", labelBn: "হালকা বা সহনীয় (Mild / Tolerable)", labelEn: "Mild" },
  { id: "moderate", labelBn: "মাঝারি ধরনের কষ্টকর (Moderate)", labelEn: "Moderate" },
  { id: "severe", labelBn: "তীব্র কষ্টদায়ক (Severe)", labelEn: "Severe" },
  { id: "critical", labelBn: "অত্যন্ত সংকটজনক / জরুরি (Critical Emergency)", labelEn: "Critical Emergency" },
];

export const DECISION_TREES = [
  {
    id: "snake-bite",
    titleBn: "সাপের কামড় (Snake Bite Emergency)",
    titleEn: "Snake Bite Emergency",
    bodyArea: "limbs_skin",
    primarySymptom: "snake_bite_mark",
    emergencyLevel: "RED",
    urgencyTextBn: "⚠️ এটি অত্যন্ত সংকটজনক পরিস্থিতি! দ্রুত হাসপাতালে অ্যান্টিভেনম নিন।",
    urgencyTextEn: "CRITICAL EMERGENCY! Transport patient immediately to nearest government hospital with Antivenom.",
    matchedConditions: ["snake-bite"],
    recommendationsBn: [
      "রোগীকে সম্পূর্ণ স্থির রাখুন। নড়াচড়া করলে বিষ দ্রুত ছড়ায়।",
      "কামড়ের হাত/পা শক্ত কাঠি বা ফালি দিয়ে বাঁধুন (ভাঙা হাড়ের মতো)।",
      "আংটি, ঘড়ি ও টাইট পোশাক খুলে ফেলুন।",
      "⚠️ ভুলেও কাটবেন না, মুখ দিয়ে বিষ চুষবেন না, দড়ি দিয়ে শক্ত বাঁধন দেবেন না।"
    ]
  },
  {
    id: "child-pneumonia",
    titleBn: "শিশুর নিউমোনিয়া (Child Pneumonia)",
    titleEn: "Child Pneumonia",
    bodyArea: "chest",
    primarySymptom: "fast_breathing_child",
    emergencyLevel: "RED",
    urgencyTextBn: "⚠️ শিশুর বুকের খাঁচা দেবে যাওয়া নিউমোনিয়ার বিপৎচিহ্ন! হাসপাতালে অক্সিজেন প্রয়োজন।",
    urgencyTextEn: "CRITICAL PEDIATRIC EMERGENCY! Immediate hospital transport required for oxygen therapy.",
    matchedConditions: ["child-pneumonia"],
    recommendationsBn: [
      "শিশুকে কোলে সোজা বা কাত করে রাখুন।",
      "নাক বন্ধ থাকলে স্যালাইন ড্রপ ব্যবহার করুন।",
      "বারবার অল্প করে বুকের দুধ খাওয়ান।",
      "চিকিৎসকের পরামর্শ ছাড়া কাশির তীব্র সিরাপ দেবেন না।"
    ]
  },
  {
    id: "heatstroke",
    titleBn: "হিটস্ট্রোক (Heatstroke)",
    titleEn: "Heatstroke",
    bodyArea: "general",
    primarySymptom: "heatstroke_faint",
    emergencyLevel: "RED",
    urgencyTextBn: "⚠️ হিটস্ট্রোক জীবনের জন্য ঝুঁকিপূর্ণ! দ্রুত শরীর ঠান্ডা করুন।",
    urgencyTextEn: "CRITICAL HEAT EMERGENCY! Rapid cooling required.",
    matchedConditions: ["heatstroke"],
    recommendationsBn: [
      "রোগীকে সাথে সাথে বাতাস চলাচলকারী ছায়াযুক্ত স্থানে নিন।",
      "ভেজা ঠান্ডা কাপড় দিয়ে পুরো শরীর মুছে দিন।",
      "ঘাড়, বগল ও কুঁচকিতে ভেজা কাপড় বা বরফ দিন।",
      "জ্ঞান থাকলে খাবার স্যালাইন পান করান।"
    ]
  },
  {
    id: "stroke-hypertension",
    titleBn: "স্ট্রোক (Stroke Warning F.A.S.T)",
    titleEn: "Stroke Crisis",
    bodyArea: "head",
    primarySymptom: "stroke_signs",
    emergencyLevel: "RED",
    urgencyTextBn: "⚠️ স্ট্রোকের বিপৎচিহ্ন! প্রথম ৩-৪ ঘণ্টার মধ্যে হাসপাতালে পৌঁছানো জরুরি।",
    urgencyTextEn: "CRITICAL STROKE EMERGENCY! Time is brain tissue — rush to hospital emergency.",
    matchedConditions: ["stroke-hypertension"],
    recommendationsBn: [
      "F.A.S.T: মুখ বাঁকা, হাত অবশ, কথা জড়ানো লক্ষণ খেয়াল করুন।",
      "রোগীকে একপাশে কাত করে শুইয়ে দিন।",
      "ঠিক কোন সময় লক্ষণ শুরু হয়েছে তা লিখে রাখুন।",
      "অজ্ঞান রোগীকে মুখে কোনো ওষুধ বা পানি দেবেন না।"
    ]
  },
  {
    id: "dengue-fever",
    titleBn: "ডেঙ্গু জ্বর (Dengue Fever)",
    titleEn: "Dengue Fever",
    bodyArea: "general",
    primarySymptom: "dengue_high_fever",
    emergencyLevel: "YELLOW",
    urgencyTextBn: "🟡 ডেঙ্গু সন্দেহযুক্ত। পর্যাপ্ত তরল গ্রহণ ও ২য় দিনে সিবিসি পরীক্ষা করান।",
    urgencyTextEn: "URGENT CARE NEEDED. Monitor platelet count and stay hydrated.",
    matchedConditions: ["dengue-fever"],
    recommendationsBn: [
      "জ্বরের জন্য শুধুমাত্র প্যারাসিটামল সেবন করুন।",
      "প্রচুর খাবার স্যালাইন, ডাবের পানি ও তরল পান করুন (দৈনিক আড়াই-তিন লিটার)।",
      "অ্যাসপিরিন, আইবুপ্রোফেন বা অন্যান্য ব্যথানাশক ভুলেও খাবেন না।",
      "পেটে তীব্র ব্যথা বা রক্তপাত হলে সাথে সাথে হাসপাতালে ভর্তি হন।"
    ]
  },
  {
    id: "diarrhea-cholera",
    titleBn: "তীব্র ডায়রিয়া ও কলেরা (Diarrhea & Cholera)",
    titleEn: "Diarrhea & Cholera",
    bodyArea: "abdomen",
    primarySymptom: "watery_diarrhea",
    emergencyLevel: "YELLOW",
    urgencyTextBn: "🟡 তীব্র পানিশূন্যতার ঝুঁকি। প্রতিবার পাতলা পায়খানার পর স্যালাইন দিন।",
    urgencyTextEn: "URGENT REHYDRATION REQUIRED. Give ORS immediately.",
    matchedConditions: ["diarrhea-cholera"],
    recommendationsBn: [
      "প্রতিবার পায়খানার পর আধা লিটার পানিতে ১ প্যাকেট খাবার স্যালাইন গুলিয়ে খাওয়ান।",
      "স্বাভাবিক খাবার (জাউ ভাত, কাঁচকলা) বন্ধ করবেন না।",
      "শিশুদের ১০-১৪ দিন জিংক ট্যাবলেট দিন।",
      "রোগী একদম খেতে না পারলে হাসপাতালে আইভি (IV) স্যালাইন দিন।"
    ]
  },
  {
    id: "burns",
    titleBn: "পুড়ে যাওয়া প্রাথমিক চিকিৎসা (Burns)",
    titleEn: "Thermal & Chemical Burns",
    bodyArea: "limbs_skin",
    primarySymptom: "burn_wounds",
    emergencyLevel: "YELLOW",
    urgencyTextBn: "🟡 পোড়া স্থান ঠান্ডা পানি দিয়ে ধৌত করুন। ইনফেকশন রোধে পরিচ্ছন্ন থাকুন।",
    urgencyTextEn: "URGENT BURN CARE. Cool with running water for 20 minutes.",
    matchedConditions: ["burns"],
    recommendationsBn: [
      "পোড়া স্থানে একটানা অন্তত ২০ মিনিট সাধারণ পানি ঢালুন।",
      "কোনো অলংকার বা ঘড়ি ফোলার আগেই খুলে ফেলুন।",
      "শুকনো পাতলা পরিষ্কার সুতি কাপড় দিয়ে ঢেকে দিন।",
      "টুথপেস্ট, ডিম, আটা বা বরফ ভুলেও লাগাবেন না।"
    ]
  },
  {
    id: "dog-animal-bite",
    titleBn: "পশুর কামড় ও জলাতঙ্ক (Rabies Prevention)",
    titleEn: "Animal Bite & Rabies",
    bodyArea: "limbs_skin",
    primarySymptom: "animal_scratch",
    emergencyLevel: "YELLOW",
    urgencyTextBn: "🟡 জলাতঙ্ক প্রতিরোধে সাবান দিয়ে ১৫ মিনিট ধোয়া ও প্রথম দিনই ভ্যাকসিন নেওয়া জরুরি।",
    urgencyTextEn: "URGENT VACCINE REQUIRED. Wash with soap for 15 mins, visit hospital for Day 0 vaccine.",
    matchedConditions: ["dog-animal-bite"],
    recommendationsBn: [
      "যেকোনো সাবান ও চলমান পানি দিয়ে অন্তত ১৫ মিনিট ক্ষতস্থান ধৌত করুন।",
      "পোভিডন আয়োডিন অ্যান্টিসেপ্টিক লাগান।",
      "ক্ষত সেলাই করবেন না বা শক্ত ব্যান্ডেজ করবেন না।",
      "প্রথম দিনই সরকারি হাসপাতালে জলাতঙ্ক ভ্যাকসিন (ARV) নিন।"
    ]
  },
  {
    id: "typhoid-fever",
    titleBn: "টাইফয়েড জ্বর (Typhoid Fever)",
    titleEn: "Typhoid Fever",
    bodyArea: "general",
    primarySymptom: "prolonged_fever",
    emergencyLevel: "GREEN",
    urgencyTextBn: "🟢 ৩ দিনের বেশি জ্বরে চিকিৎসকের পরামর্শে রক্ত পরীক্ষা (Widal/Typhidot) করান।",
    urgencyTextEn: "MONITOR & CONSULT DOCTOR. Medical evaluation recommended.",
    matchedConditions: ["typhoid-fever"],
    recommendationsBn: [
      "পর্যাপ্ত বিশ্রাম ও বিশুদ্ধ ফুটানো পানি পান করুন।",
      "সহজপাচ্য হালকা খাবার গ্রহণ করুন।",
      "ডাক্তারের পরামর্শে অ্যান্টিবায়োটিক সেবন করুন এবং কোর্স সম্পন্ন করুন।"
    ]
  },
  {
    id: "seasonal-flu",
    titleBn: "সর্দি-জ্বর ও সাধারণ কাশি (Seasonal Flu)",
    titleEn: "Seasonal Flu & Cold",
    bodyArea: "chest",
    primarySymptom: "cough_cold",
    emergencyLevel: "GREEN",
    urgencyTextBn: "🟢 এটি সাধারণ সর্দি-জ্বর হতে পারে। ঘরে বসেই যত্নে সুস্থ হওয়া সম্ভব।",
    urgencyTextEn: "HOME CARE SUFFICIENT. Rest, warm fluids, and stay comfortable.",
    matchedConditions: ["seasonal-flu"],
    recommendationsBn: [
      "হালকা গরম পানিতে লবণ দিয়ে কুলকুচি (গার্গল) করুন।",
      "আদা ও মধু চা পান করুন।",
      "প্রয়োজনে প্যারাসিটামল সেবন করুন। সাধারণত ৩-৫ দিনে ভালো হয়ে যায়।"
    ]
  }
];

export function evaluateSymptomFinder({ bodyArea, primarySymptom, duration, severity, additionalSymptoms = [] }) {
  let match = DECISION_TREES.find(
    (tree) => tree.bodyArea === bodyArea && tree.primarySymptom === primarySymptom
  );

  if (!match) {
    // Fallback best match by primary symptom
    match = DECISION_TREES.find((tree) => tree.primarySymptom === primarySymptom) || DECISION_TREES[0];
  }

  // Adjust emergency score if severity is marked critical
  let emergencyLevel = match.emergencyLevel;
  if (severity === "critical" && emergencyLevel !== "RED") {
    emergencyLevel = "RED";
  }

  return {
    ...match,
    calculatedEmergencyLevel: emergencyLevel,
    evaluatedAt: new Date().toISOString(),
  };
}

// Symptom Scoring Engine — 100% offline weighted-inference triage for Amar Doctor V1
//
// Replaces the lookup-table behaviour of lib/symptomFinderEngine.js. That engine
// mapped one (bodyArea, primarySymptom) pair to exactly one condition, which meant
// the user had to already know their diagnosis to pick the right "symptom" label.
// Here the user taps raw symptoms and the engine infers a ranked shortlist.
//
// Everything below is a plain JS literal in this file. No imports, no fetch, no
// IndexedDB, no localStorage, no async. Next.js bundles this into the client chunk
// for /symptoms/finder, the service worker caches that chunk, and rankConditions()
// is pure arithmetic over objects already in memory — so it works with the radio off.
//
// Weights are clinically grounded (WHO first-aid guidance, IMCI danger signs,
// standard emergency triage) and encode diagnostic specificity, not severity:
//   1.0       pathognomonic — near-conclusive on its own (e.g. fang marks)
//   0.8–0.9   highly specific to this condition
//   0.5–0.7   moderately specific, shared with a few others
//   0.2–0.4   non-specific (fever, fatigue, headache) — weak signal only
//   omitted   not clinically associated with this condition
// Do not tune these casually; the minScoreToShow thresholds are calibrated against
// them so that two generic symptoms produce no result rather than a false positive.

/**
 * The 40 symptom chips the user taps. `group` buckets them into the six
 * accordion sections; `emoji` is the primary recognition cue for users who
 * cannot read either label.
 */
export const SYMPTOM_CHIPS = [
  // --- জ্বর ও তাপমাত্রা / Fever & Temperature ---
  { id: "fever_high", group: "fever", emoji: "🌡️", labelBn: "তীব্র জ্বর (১০৩°F+)", labelEn: "High Fever (103°F+)" },
  { id: "fever_mild", group: "fever", emoji: "🌡️", labelBn: "হালকা জ্বর", labelEn: "Mild / Low-grade Fever" },
  { id: "fever_prolonged", group: "fever", emoji: "🌡️", labelBn: "৩+ দিনের জ্বর", labelEn: "Fever Lasting 3+ Days" },

  // --- মাথা ও স্নায়বিক / Head & Neurological ---
  { id: "headache_severe", group: "head", emoji: "🧠", labelBn: "তীব্র মাথাব্যথা", labelEn: "Severe Headache" },
  { id: "headache_mild", group: "head", emoji: "🧠", labelBn: "হালকা মাথাব্যথা", labelEn: "Mild Headache" },
  { id: "face_drooping", group: "head", emoji: "😶", labelBn: "মুখ বেঁকে যাওয়া", labelEn: "Face Drooping (one side)" },
  { id: "arm_weakness", group: "head", emoji: "💪", labelBn: "একহাত অবশ হয়ে যাওয়া", labelEn: "Sudden Arm / Leg Weakness" },
  { id: "slurred_speech", group: "head", emoji: "🗣️", labelBn: "কথা জড়িয়ে যাওয়া", labelEn: "Slurred / Confused Speech" },
  { id: "eye_pain", group: "head", emoji: "👁️", labelBn: "চোখের পেছনে ব্যথা", labelEn: "Pain Behind Eyes" },

  // --- বুক ও শ্বাসতন্ত্র / Chest & Breathing ---
  { id: "fast_breathing", group: "chest", emoji: "🫁", labelBn: "দ্রুত / কষ্টকর শ্বাস", labelEn: "Fast or Labored Breathing" },
  { id: "chest_indrawing", group: "chest", emoji: "🫁", labelBn: "বুকের খাঁচা দেবে যাওয়া", labelEn: "Chest In-drawing (sinking)" },
  { id: "chest_pain", group: "chest", emoji: "🫀", labelBn: "বুকে ব্যথা বা চাপ", labelEn: "Chest Pain or Tightness" },
  { id: "cough", group: "chest", emoji: "😮‍💨", labelBn: "কাশি", labelEn: "Cough" },
  { id: "sore_throat", group: "chest", emoji: "🤒", labelBn: "গলা ব্যথা", labelEn: "Sore Throat" },
  { id: "runny_nose", group: "chest", emoji: "🤧", labelBn: "নাক দিয়ে পানি পড়া", labelEn: "Runny Nose" },

  // --- পেট ও হজম / Stomach & Gut ---
  { id: "diarrhea_watery", group: "stomach", emoji: "💧", labelBn: "ঘন ঘন পাতলা পায়খানা", labelEn: "Frequent Watery Stool" },
  { id: "vomiting", group: "stomach", emoji: "🤢", labelBn: "বমি হওয়া", labelEn: "Vomiting" },
  { id: "abdominal_pain_sev", group: "stomach", emoji: "🫃", labelBn: "পেটে তীব্র ব্যথা", labelEn: "Severe Abdominal Pain" },
  { id: "abdominal_pain_mild", group: "stomach", emoji: "🫃", labelBn: "পেটে হালকা ব্যথা বা অস্বস্তি", labelEn: "Mild Abdominal Discomfort" },
  { id: "thirst_extreme", group: "stomach", emoji: "🥤", labelBn: "অতিরিক্ত তৃষ্ণা", labelEn: "Extreme Thirst" },
  { id: "no_urination", group: "stomach", emoji: "⛔", labelBn: "প্রস্রাব কমে যাওয়া বা না হওয়া", labelEn: "Reduced or No Urination" },
  { id: "constipation", group: "stomach", emoji: "⚠️", labelBn: "কোষ্ঠকাঠিন্য", labelEn: "Constipation" },

  // --- ত্বক ও আঘাত / Skin & Trauma ---
  { id: "bite_marks", group: "skin", emoji: "🐍", labelBn: "কামড়ের দাগ বা ছিদ্র", labelEn: "Puncture / Bite Marks on Skin" },
  { id: "animal_bite_scratch", group: "skin", emoji: "🐕", labelBn: "পশুর কামড় বা আঁচড়", labelEn: "Animal Bite or Scratch" },
  { id: "burn_blister", group: "skin", emoji: "🔥", labelBn: "পুড়ে ফোসকা / জ্বালাপোড়া", labelEn: "Burn or Blisters" },
  { id: "swelling_local", group: "skin", emoji: "🦵", labelBn: "স্থানীয় ফোলা (হাত/পা)", labelEn: "Localized Swelling of Limb" },
  { id: "skin_rash", group: "skin", emoji: "🔴", labelBn: "শরীরে লাল দাগ / ফুসকুড়ি", labelEn: "Skin Rash or Red Spots" },

  // --- সারা শরীর / Whole Body ---
  { id: "fainting", group: "whole", emoji: "😵", labelBn: "অজ্ঞান হয়ে যাওয়া", labelEn: "Fainting or Loss of Consciousness" },
  { id: "confusion", group: "whole", emoji: "🌀", labelBn: "মাথা গুলানো / বিভ্রান্তি", labelEn: "Confusion or Disorientation" },
  { id: "no_sweating", group: "whole", emoji: "☀️", labelBn: "প্রচণ্ড গরমেও ঘাম না হওয়া", labelEn: "No Sweating Despite Heat" },
  { id: "skin_dry_hot", group: "whole", emoji: "🌡️", labelBn: "ত্বক শুকনো ও অতিরিক্ত গরম", labelEn: "Skin Dry and Hot to Touch" },
  { id: "fatigue", group: "whole", emoji: "😴", labelBn: "অতিরিক্ত দুর্বলতা / ক্লান্তি", labelEn: "Extreme Weakness or Fatigue" },
  { id: "joint_pain", group: "whole", emoji: "🦴", labelBn: "গিরায় গিরায় ব্যথা", labelEn: "Joint / Bone Pain" },
  { id: "body_ache", group: "whole", emoji: "🤕", labelBn: "সারা শরীরে ব্যথা", labelEn: "General Body Ache" },
  { id: "chills", group: "whole", emoji: "🥶", labelBn: "কাঁপুনি দিয়ে জ্বর", labelEn: "Chills / Rigors" },
  { id: "loss_of_appetite", group: "whole", emoji: "🍽️", labelBn: "খেতে ইচ্ছে না হওয়া", labelEn: "Loss of Appetite" },
  { id: "sunken_eyes", group: "whole", emoji: "👀", labelBn: "চোখ গর্তে ঢুকে যাওয়া", labelEn: "Sunken Eyes" },
  { id: "eyelid_drooping", group: "whole", emoji: "😪", labelBn: "চোখের পাতা ভারী হয়ে পড়া", labelEn: "Drooping Eyelids" },
  { id: "gum_bleeding", group: "whole", emoji: "🩸", labelBn: "মাড়ি বা নাক থেকে রক্ত পড়া", labelEn: "Gum / Nose Bleeding" },
  { id: "child_not_feeding", group: "whole", emoji: "👶", labelBn: "শিশু বুকের দুধ বা খাবার খাচ্ছে না", labelEn: "Child Refusing to Feed" },
];

/**
 * The six accordion groups, in display order. Titles carry the group emoji so an
 * illiterate user can navigate by shape alone.
 */
export const SYMPTOM_GROUPS = [
  { id: "fever", emoji: "🌡️", labelBn: "জ্বর ও তাপমাত্রা", labelEn: "Fever & Temperature" },
  { id: "head", emoji: "🧠", labelBn: "মাথা ও স্নায়বিক", labelEn: "Head & Neurological" },
  { id: "chest", emoji: "🫁", labelBn: "বুক ও শ্বাসতন্ত্র", labelEn: "Chest & Breathing" },
  { id: "stomach", emoji: "🫃", labelBn: "পেট ও হজম", labelEn: "Stomach & Gut" },
  { id: "skin", emoji: "🩺", labelBn: "ত্বক ও আঘাত", labelEn: "Skin & Trauma" },
  { id: "whole", emoji: "💪", labelBn: "সারা শরীর", labelEn: "Whole Body" },
];

/**
 * Chips that are physical evidence rather than a sensation: seeing them is enough
 * to act, so the UI lets the user analyze with only one of these selected and the
 * engine reports HIGH confidence for the condition they trigger. Every other chip
 * still requires at least two selections before the CTA unlocks.
 */
export const SOLO_SUFFICIENT_CHIPS = ["bite_marks", "animal_bite_scratch", "burn_blister"];

/**
 * Ten condition profiles. `symptomWeights` keys are SYMPTOM_CHIPS ids.
 * `minScoreToShow` is this condition's own floor — a condition never surfaces
 * below it, which is what keeps "fatigue + mild headache" from returning typhoid.
 * `firstAidBn` / `warningSigns` are ported from the existing first-aid copy; that
 * content was always correct, only the inference around it was broken.
 */
export const CONDITION_PROFILES = [
  {
    id: "dengue-fever",
    titleBn: "ডেঙ্গু জ্বর",
    titleEn: "Dengue Fever",
    icon: "🦟",
    emergencyLevel: "YELLOW",
    minScoreToShow: 1.5,
    symptomWeights: {
      fever_high: 0.90,          // high fever is near-essential for dengue
      skin_rash: 0.85,           // dengue rash is distinctive
      eye_pain: 0.80,            // retro-orbital pain is a clinical hallmark
      joint_pain: 0.70,          // "breakbone fever" characteristic
      gum_bleeding: 0.65,        // dengue warning sign
      vomiting: 0.35,
      abdominal_pain_sev: 0.30,  // dengue warning sign if severe
      headache_severe: 0.40,
      fatigue: 0.25,
      chills: 0.20,
      loss_of_appetite: 0.20,
    },
    firstAidBn: [
      "জ্বরের জন্য শুধুমাত্র প্যারাসিটামল সেবন করুন।",
      "প্রচুর খাবার স্যালাইন, ডাবের পানি ও তরল পান করুন (দৈনিক আড়াই-তিন লিটার)।",
      "সাধারণ তাপমাত্রার পানি দিয়ে শরীর ঘন ঘন মুছে (স্পঞ্জ) দিন।",
      "দ্বিতীয়-তৃতীয় দিনে সিবিসি (CBC) ও ডেঙ্গু NS1 পরীক্ষা করান।",
      "⚠️ অ্যাসপিরিন, আইবুপ্রোফেন বা অন্যান্য ব্যথানাশক ভুলেও খাবেন না।",
    ],
    warningSigns: [
      "পেটে তীব্র ব্যথা, ক্রমাগত বমি, নাক-মাড়ি দিয়ে রক্তপাত হলে তাৎক্ষণিক হাসপাতালে ভর্তি করান।",
      "জ্বর ছেড়ে যাওয়ার পরের ২৪-৪৮ ঘণ্টাই সবচেয়ে বিপজ্জনক সময়—রোগীকে একা রাখবেন না।",
    ],
  },
  {
    id: "diarrhea-cholera",
    titleBn: "তীব্র ডায়রিয়া ও কলেরা",
    titleEn: "Severe Diarrhea & Cholera",
    icon: "💧",
    emergencyLevel: "YELLOW",
    minScoreToShow: 1.5,
    symptomWeights: {
      diarrhea_watery: 1.00,     // defining symptom
      thirst_extreme: 0.80,      // dehydration marker
      sunken_eyes: 0.80,         // dehydration marker
      no_urination: 0.75,        // severe dehydration
      vomiting: 0.60,
      fatigue: 0.40,
      abdominal_pain_mild: 0.30,
      fever_mild: 0.20,
    },
    firstAidBn: [
      "প্রতিবার পায়খানার পর আধা লিটার পানিতে ১ প্যাকেট খাবার স্যালাইন গুলিয়ে খাওয়ান।",
      "স্বাভাবিক খাবার (জাউ ভাত, কাঁচকলা) বন্ধ করবেন না।",
      "শিশুদের ১০-১৪ দিন জিংক ট্যাবলেট দিন।",
      "রোগী একদম খেতে না পারলে হাসপাতালে আইভি (IV) স্যালাইন দিন।",
    ],
    warningSigns: [
      "স্যালাইন গরম পানিতে গুলবেন না বা আধা প্যাকেট করে বানাবেন না।",
      "প্রস্রাব বন্ধ হয়ে যাওয়া, চোখ গর্তে ঢুকে যাওয়া বা রোগী নেতিয়ে পড়া মারাত্মক পানিশূন্যতার লক্ষণ—দ্রুত হাসপাতালে নিন।",
    ],
  },
  {
    id: "heatstroke",
    titleBn: "হিটস্ট্রোক",
    titleEn: "Heatstroke / Heat Emergency",
    icon: "☀️",
    emergencyLevel: "RED",
    minScoreToShow: 1.5,
    symptomWeights: {
      no_sweating: 0.90,         // anhidrosis separates heatstroke from heat exhaustion
      skin_dry_hot: 0.90,        // dry hot skin confirms heatstroke, not exhaustion
      fainting: 0.80,
      confusion: 0.75,
      fever_high: 0.60,          // core temp >= 40°C
      headache_severe: 0.40,
      fatigue: 0.25,
    },
    firstAidBn: [
      "রোগীকে সাথে সাথে বাতাস চলাচলকারী ছায়াযুক্ত স্থানে নিন।",
      "ভেজা ঠান্ডা কাপড় দিয়ে পুরো শরীর মুছে দিন।",
      "ঘাড়, বগল ও কুঁচকিতে ভেজা কাপড় বা বরফ দিন।",
      "জ্ঞান থাকলে খাবার স্যালাইন পান করান।",
    ],
    warningSigns: [
      "অজ্ঞান রোগীকে মুখে কোনো তরল খাবার বা পানি দেবেন না।",
      "শরীর ঠান্ডা করতে করতেই দ্রুত হাসপাতালে নিন—হিটস্ট্রোক জীবনের জন্য ঝুঁকিপূর্ণ।",
    ],
  },
  {
    id: "snake-bite",
    titleBn: "সাপের কামড়",
    titleEn: "Snake Bite Emergency",
    icon: "🐍",
    emergencyLevel: "RED",
    minScoreToShow: 0.9,         // confirmed bite marks alone are enough to trigger
    symptomWeights: {
      bite_marks: 1.00,          // diagnostic on its own if confirmed
      swelling_local: 0.75,      // local envenomation swelling
      eyelid_drooping: 0.75,     // neurotoxic envenomation (cobra / krait)
      gum_bleeding: 0.70,        // hemotoxic envenomation (viper)
      fainting: 0.40,
      confusion: 0.35,
      fast_breathing: 0.30,
    },
    firstAidBn: [
      "রোগীকে সম্পূর্ণ স্থির রাখুন। নড়াচড়া করলে বিষ দ্রুত ছড়ায়।",
      "কামড়ের হাত/পা শক্ত কাঠি বা ফালি দিয়ে বাঁধুন (ভাঙা হাড়ের মতো)।",
      "আংটি, ঘড়ি ও টাইট পোশাক খুলে ফেলুন।",
      "দ্রুত নিকটস্থ উপজেলা স্বাস্থ্য কমপ্লেক্স বা সরকারি হাসপাতালে নিন যেখানে অ্যান্টিভেনম আছে।",
      "⚠️ ভুলেও কাটবেন না, মুখ দিয়ে বিষ চুষবেন না, দড়ি দিয়ে শক্ত বাঁধন দেবেন না।",
    ],
    warningSigns: [
      "ওঝা বা কবিরাজের কাছে গিয়ে সময় নষ্ট করা জীবনের জন্য মারাত্মক ঝুঁকিপূর্ণ।",
      "চোখের পাতা ভারী হয়ে আসা, গিলতে কষ্ট বা শ্বাসকষ্ট শুরু হলে এক মিনিটও দেরি করবেন না।",
    ],
  },
  {
    id: "stroke-hypertension",
    titleBn: "স্ট্রোক (F.A.S.T)",
    titleEn: "Stroke Emergency",
    icon: "🧠",
    emergencyLevel: "RED",
    minScoreToShow: 1.2,
    symptomWeights: {
      face_drooping: 1.00,       // F in FAST
      arm_weakness: 0.95,        // A in FAST
      slurred_speech: 0.95,      // S in FAST
      headache_severe: 0.70,     // sudden explosive headache = hemorrhagic stroke
      confusion: 0.60,
      fainting: 0.40,
      vomiting: 0.20,
    },
    firstAidBn: [
      "F.A.S.T: মুখ বাঁকা, হাত অবশ, কথা জড়ানো লক্ষণ খেয়াল করুন।",
      "রোগীকে একপাশে কাত করে শুইয়ে দিন।",
      "ঠিক কোন সময় লক্ষণ শুরু হয়েছে তা লিখে রাখুন।",
      "অজ্ঞান রোগীকে মুখে কোনো ওষুধ বা পানি দেবেন না।",
    ],
    warningSigns: [
      "স্ট্রোকের ক্ষেত্রে প্রতিটি মিনিট অত্যন্ত মূল্যবান—দ্রুত নিকটস্থ হাসপাতালে যান।",
      "প্রথম ৩-৪ ঘণ্টার মধ্যে চিকিৎসা শুরু হলে স্থায়ী পক্ষাঘাত এড়ানো সম্ভব।",
    ],
  },
  {
    id: "child-pneumonia",
    titleBn: "শিশুর নিউমোনিয়া",
    titleEn: "Pediatric Pneumonia",
    icon: "👶",
    emergencyLevel: "RED",
    minScoreToShow: 1.2,
    childBoost: 1.5,
    symptomWeights: {
      chest_indrawing: 1.00,     // IMCI danger sign
      fast_breathing: 0.90,      // IMCI: >50/min under 12mo, >40/min under 5yr
      child_not_feeding: 0.75,   // IMCI danger sign
      fever_high: 0.50,
      cough: 0.40,
      fatigue: 0.30,
    },
    firstAidBn: [
      "শিশুকে কোলে সোজা বা কাত করে রাখুন।",
      "নাক বন্ধ থাকলে স্যালাইন ড্রপ ব্যবহার করুন।",
      "বারবার অল্প করে বুকের দুধ খাওয়ান।",
      "চিকিৎসকের পরামর্শ ছাড়া কাশির তীব্র সিরাপ দেবেন না।",
    ],
    warningSigns: [
      "বুকের খাঁচা দেবে যাওয়া নিউমোনিয়ার মারাত্মক বিপৎচিহ্ন—দেরি না করে দ্রুত হাসপাতালে যান।",
      "শিশু বুকের দুধ খেতে না চাইলে বা নেতিয়ে পড়লে অক্সিজেন প্রয়োজন হতে পারে।",
    ],
  },
  {
    id: "burns",
    titleBn: "পুড়ে যাওয়া",
    titleEn: "Thermal / Chemical Burn",
    icon: "🔥",
    emergencyLevel: "YELLOW",
    minScoreToShow: 0.9,         // a visible burn alone is enough to trigger
    symptomWeights: {
      burn_blister: 1.00,        // defining symptom
      swelling_local: 0.30,
      fatigue: 0.10,
    },
    firstAidBn: [
      "পোড়া স্থানে একটানা অন্তত ২০ মিনিট সাধারণ পানি ঢালুন।",
      "কোনো অলংকার বা ঘড়ি ফোলার আগেই খুলে ফেলুন।",
      "শুকনো পাতলা পরিষ্কার সুতি কাপড় দিয়ে ঢেকে দিন।",
      "টুথপেস্ট, ডিম, আটা বা বরফ ভুলেও লাগাবেন না।",
    ],
    warningSigns: [
      "পোড়া ফোসকা নিজে থেকে ফাটাবেন না।",
      "মুখ, শ্বাসনালী, হাতের তালু বা শরীরের বড় অংশ পুড়লে অবশ্যই হাসপাতালে যান।",
    ],
  },
  {
    id: "dog-animal-bite",
    titleBn: "পশুর কামড় ও জলাতঙ্ক প্রতিরোধ",
    titleEn: "Animal Bite & Rabies Prevention",
    icon: "🐕",
    emergencyLevel: "YELLOW",
    minScoreToShow: 0.9,         // a bite or scratch alone is enough to trigger
    symptomWeights: {
      animal_bite_scratch: 1.00, // defining symptom
      swelling_local: 0.20,
    },
    firstAidBn: [
      "যেকোনো সাবান ও চলমান পানি দিয়ে অন্তত ১৫ মিনিট ক্ষতস্থান ধৌত করুন।",
      "পোভিডন আয়োডিন অ্যান্টিসেপ্টিক লাগান।",
      "ক্ষত সেলাই করবেন না বা শক্ত ব্যান্ডেজ করবেন না।",
      "প্রথম দিনই সরকারি হাসপাতালে জলাতঙ্ক ভ্যাকসিন (ARV) নিন।",
    ],
    warningSigns: [
      "জলাতঙ্কের কোনো নিরাময় নেই, তবে তাৎক্ষণিক সাবান দিয়ে ১৫ মিনিট ধোয়া ও সময়মতো ভ্যাকসিন নেওয়া ১০০% জীবন বাঁচায়।",
      "কামড় গভীর হলে বা মাথা-মুখের কাছে হলে ভ্যাকসিনের সাথে ইমিউনোগ্লোবুলিনও প্রয়োজন।",
    ],
  },
  {
    id: "typhoid-fever",
    titleBn: "টাইফয়েড জ্বর",
    titleEn: "Typhoid Fever",
    icon: "🦠",
    emergencyLevel: "GREEN",
    minScoreToShow: 1.2,
    chronicBoost: 1.4,
    symptomWeights: {
      fever_prolonged: 0.90,     // sustained step-ladder fever is the hallmark
      constipation: 0.60,        // more common than diarrhea early in typhoid
      loss_of_appetite: 0.55,
      abdominal_pain_mild: 0.50,
      headache_mild: 0.45,
      fatigue: 0.40,
      fever_high: 0.35,          // high but sustained, not a sudden spike
      vomiting: 0.25,
      chills: 0.20,
    },
    firstAidBn: [
      "পর্যাপ্ত বিশ্রাম ও বিশুদ্ধ ফুটানো পানি পান করুন।",
      "সহজপাচ্য হালকা খাবার গ্রহণ করুন।",
      "চিকিৎসকের পরামর্শে রক্ত পরীক্ষা (Widal / Typhidot) করান।",
      "ডাক্তারের পরামর্শে অ্যান্টিবায়োটিক সেবন করুন এবং কোর্স সম্পন্ন করুন।",
    ],
    warningSigns: [
      "ভালো লাগলেই অ্যান্টিবায়োটিক কোর্স মাঝপথে বন্ধ করবেন না—রোগ ফিরে আসে ও ওষুধ কাজ করা বন্ধ করে দেয়।",
      "পেট ফুলে যাওয়া, কালো পায়খানা বা প্রচণ্ড পেটব্যথা অন্ত্র ছিদ্র হওয়ার লক্ষণ—দ্রুত হাসপাতালে যান।",
    ],
  },
  {
    id: "seasonal-flu",
    titleBn: "সর্দি-জ্বর ও সাধারণ কাশি",
    titleEn: "Seasonal Flu & Viral Cold",
    icon: "🤧",
    emergencyLevel: "GREEN",
    minScoreToShow: 1.0,
    symptomWeights: {
      runny_nose: 0.90,          // hallmark of URTI, absent from the other profiles
      sore_throat: 0.80,
      cough: 0.70,
      fever_mild: 0.60,
      body_ache: 0.50,
      headache_mild: 0.40,
      fatigue: 0.35,
      chills: 0.25,
      loss_of_appetite: 0.20,
    },
    firstAidBn: [
      "হালকা গরম পানিতে লবণ দিয়ে কুলকুচি (গার্গল) করুন।",
      "আদা ও মধু চা পান করুন।",
      "পর্যাপ্ত বিশ্রাম নিন ও প্রচুর তরল পান করুন।",
      "প্রয়োজনে প্যারাসিটামল সেবন করুন। সাধারণত ৩-৫ দিনে ভালো হয়ে যায়।",
    ],
    warningSigns: [
      "সাধারণ সর্দি-কাশিতে অ্যান্টিবায়োটিক কাজ করে না—ডাক্তারের পরামর্শ ছাড়া খাবেন না।",
      "৫ দিনের বেশি জ্বর থাকলে, শ্বাসকষ্ট হলে বা বুকে ব্যথা হলে চিকিৎসকের কাছে যান।",
    ],
  },
];

/**
 * Safety net for time-critical signs the ten profiles above cannot score.
 *
 * `chest_pain` is the case this exists for: it is a cardinal sign of acute coronary
 * syndrome, but there is no cardiac condition in this dataset, so it carries a
 * weight of zero everywhere. Left to the scoring alone, a user tapping "বুকে ব্যথা"
 * would contribute nothing and could land in the "no match" state during a heart
 * attack. detectRedFlags() runs beside rankConditions() and raises an unmissable
 * advisory whether or not anything scored.
 *
 * Keep this list short. A banner that appears on every search stops being read.
 */
export const RED_FLAG_CHIPS = [
  {
    chipId: "chest_pain",
    icon: "🫀",
    titleBn: "বুকে ব্যথা — হার্ট অ্যাটাকের ঝুঁকি",
    titleEn: "Chest Pain — Possible Heart Attack",
    messageBn:
      "বুকে ব্যথা, চাপ বা ভারী লাগা হার্ট অ্যাটাকের লক্ষণ হতে পারে। ঘাম, বাঁ হাতে বা চোয়ালে ব্যথা ছড়িয়ে পড়া, বা শ্বাসকষ্ট থাকলে দেরি না করে এখনই নিকটস্থ হাসপাতালের ইমারজেন্সিতে যান।",
    actionsBn: [
      "রোগীকে আধশোয়া অবস্থায় বসিয়ে সম্পূর্ণ বিশ্রামে রাখুন, হাঁটাচলা করাবেন না।",
      "টাইট পোশাক ঢিলা করে দিন ও খোলা বাতাসের ব্যবস্থা করুন।",
      "দ্রুত জরুরি সেবায় (৯৯৯) ফোন করুন বা যানবাহন জোগাড় করুন।",
      "⚠️ নিজে থেকে কোনো ওষুধ খাওয়াবেন না—চিকিৎসকের নির্দেশ ছাড়া নয়।",
    ],
  },
];

/**
 * Return the red-flag advisories triggered by this selection. Synchronous, and
 * independent of whether any condition scored — a red flag is not a diagnosis,
 * it is a "do not wait" notice.
 *
 * @param {string[]} selectedIds - chip ids the user selected
 * @returns {Array<object>} matching RED_FLAG_CHIPS entries, possibly empty
 */
export function detectRedFlags(selectedIds) {
  const selected = new Set(selectedIds);
  return RED_FLAG_CHIPS.filter((flag) => selected.has(flag.chipId));
}

/**
 * Rank the conditions that match a set of selected symptoms.
 *
 * Pure, synchronous, O(chips x conditions) = at most 400 operations. Safe to call
 * directly inside a click handler on a 2GB Android device; there is nothing to
 * await and nothing to fetch.
 *
 * @param {string[]} selectedIds - chip ids the user selected
 * @param {object}   [options]
 * @param {'adult'|'child'}   [options.patientType='adult']
 * @param {'acute'|'chronic'} [options.duration='acute'] acute = started < 3 days
 *                                                       ago, chronic = 3+ days
 * @returns {Array<{condition: object, rawScore: number, normalizedScore: number,
 *                  confidence: 'HIGH'|'MEDIUM'|'LOW', rank: number}>}
 *          Up to 3 results, best first. Empty array when nothing clears its own
 *          minScoreToShow — that is a real answer ("we cannot tell"), not an error.
 */
export function rankConditions(selectedIds, options = {}) {
  const { patientType = "adult", duration = "acute" } = options;
  const selected = new Set(selectedIds);

  const scored = CONDITION_PROFILES.map((condition) => {
    // Step 1: sum the weights of every selected symptom this condition knows about.
    let rawScore = 0;
    for (const [symptomId, weight] of Object.entries(condition.symptomWeights)) {
      if (selected.has(symptomId)) rawScore += weight;
    }

    // Step 2: apply context modifiers.
    if (patientType === "child" && condition.childBoost) {
      rawScore *= condition.childBoost;
    }
    if (duration === "chronic" && condition.chronicBoost) {
      rawScore *= condition.chronicBoost;
    }
    // Typhoid needs a sustained fever to be plausible at all — halve it when the
    // symptoms started today or yesterday.
    if (duration === "acute" && condition.id === "typhoid-fever") {
      rawScore *= 0.5;
    }

    return { condition, rawScore };
  });

  // Step 3: each condition clears its own floor or does not appear.
  const qualified = scored.filter((r) => r.rawScore >= r.condition.minScoreToShow);

  if (qualified.length === 0) return [];

  // Step 4 & 5: best first, keep the top three.
  qualified.sort((a, b) => b.rawScore - a.rawScore);
  const top3 = qualified.slice(0, 3);

  // Step 6: confidence from the leading raw score. Calibrated against real ceilings —
  // a textbook dengue match (fever_high + skin_rash + eye_pain + joint_pain) is 3.25,
  // a textbook flu match (runny_nose + sore_throat + cough + fever_mild) is 3.00.
  // Exception: the evidence-based conditions (snake bite, burn, animal bite) are
  // confirmed by a single pathognomonic sign, so they report HIGH on that alone
  // rather than being penalised for having few symptoms to accumulate.
  const top = top3[0];
  const topScore = top.rawScore;
  const isConfirmedByEvidence =
    top.condition.minScoreToShow <= 1.0 &&
    Object.entries(top.condition.symptomWeights).some(
      ([symptomId, weight]) => weight >= 1.0 && selected.has(symptomId)
    );

  const confidence =
    topScore >= 2.0 || isConfirmedByEvidence ? "HIGH" : topScore >= 1.2 ? "MEDIUM" : "LOW";

  // Step 7: normalize against the leader so the score bar shows the spread.
  return top3.map((r, idx) => ({
    condition: r.condition,
    rawScore: r.rawScore,
    normalizedScore: Math.round((r.rawScore / topScore) * 100),
    confidence,
    rank: idx + 1,
  }));
}

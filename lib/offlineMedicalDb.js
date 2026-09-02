// Offline Medical Database & IndexedDB Storage for Amar Doctor V1
// Optimized for zero-bandwidth rural emergency triage in Bangladesh

export const OFFLINE_CONDITIONS = [
  {
    id: "snake-bite",
    category: "Emergency",
    severity: "critical",
    icon: "🐍",
    titleEn: "Snake Bite Emergency",
    titleBn: "সাপের কামড় জরুরি চিকিৎসা",
    symptoms: [
      "Fang puncture marks on skin (দাঁতের দাগ)",
      "Severe localized pain & swelling (তীব্র ব্যথা ও ফোলা)",
      "Drowsiness, eyelid drooping (চোখের পাতা ভারী হয়ে আসা)",
      "Difficulty breathing or swallowing (শ্বাসকষ্ট ও গিলতে কষ্ট)",
      "Bleeding from gums or wound (রক্তক্ষরণ)"
    ],
    firstAidEn: [
      "1. Keep the patient completely CALM and still. Movement spreads venom faster.",
      "2. Immobilize the bitten limb with a splint or loose bandage just like a bone fracture.",
      "3. Remove rings, tight bracelets, or clothing before swelling begins.",
      "4. IMMEDIATELY transport to the nearest Upazila Health Complex or District Hospital with Antivenom.",
      "⚠️ NEVER cut the wound, NEVER suck venom, NEVER tie tight tourniquets (no tight ropes/cords)."
    ],
    firstAidBn: [
      "১. রোগীকে সম্পূর্ণ শান্ত ও স্থির রাখুন। নড়াচড়া করলে বিষ শরীরে দ্রুত ছড়ায়।",
      "২. কামড়ের স্থান বা হাত-পা নড়াচড়া বন্ধ করতে কাঠের বা শক্ত ফালি দিয়ে বেঁধে রাখুন (ভাঙা হাড়ের মতো)।",
      "৩. আংটি, চুড়ি বা টাইট জামাকাপড় দ্রুত খুলে ফেলুন যাতে ফোলা বাড়লে রক্ত চলাচল বন্ধ না হয়।",
      "৪. সময় নষ্ট না করে দ্রুত নিকটস্থ উপজেলা স্বাস্থ্য কমপ্লেক্স বা সরকারি হাসপাতালে নিয়ে যান যেখানে অ্যান্টিভেনম আছে।",
      "⚠️ ভুলেও কাটবেন না, মুখ দিয়ে বিষ চুষবেন না, এবং দড়ি বা রশি দিয়ে শক্ত করে বাঁধবেন না।"
    ],
    warningsBn: "ওঝা বা কবিরাজের কাছে গিয়ে সময় নষ্ট করা জীবনের জন্য মারাত্মক ঝুঁকিপূর্ণ।"
  },
  {
    id: "dengue-fever",
    category: "Infectious Disease",
    severity: "urgent",
    icon: "🦟",
    titleEn: "Dengue Fever & Warning Signs",
    titleBn: "ডেঙ্গু জ্বর ও সতর্কবার্তা",
    symptoms: [
      "Sudden high fever (১০৩°-১০৫°F তীব্র জ্বর)",
      "Severe eye pain / pain behind eyeballs (চোখের পেছনে ব্যথা)",
      "Severe muscle, joint and backache (গায়ে হাত-পায়ে তীব্র ব্যথা)",
      "Skin rash / red spots (শরীরে লালচে ফুসকুড়ি)",
      "Warning: Severe abdominal pain, continuous vomiting, gum bleeding (পেটে তীব্র ব্যথা, ক্রমাগত বমি, মাড়ি দিয়ে রক্ত পড়া)"
    ],
    firstAidEn: [
      "1. Take ONLY Paracetamol for fever. Adult: 500mg (1-2 tablets up to 3 times/day).",
      "2. Drink abundant fluids: ORS (খাবার স্যালাইন), coconut water, clear soups, fresh fruit juice (minimum 2.5-3 liters/day).",
      "3. Sponge body with normal room temperature water.",
      "4. Do a CBC (Complete Blood Count) test on day 2-3 to monitor Platelet count and Hematocrit.",
      "⚠️ NEVER take Aspirin, Ibuprofen, Naproxen, or Diclofenac (they cause severe internal bleeding)."
    ],
    firstAidBn: [
      "১. জ্বরের জন্য শুধুমাত্র প্যারাসিটামল সেবন করুন। ব্যথানাশক অন্য কোনো ওষুধ খাবেন না।",
      "২. প্রচুর তরল খাবার ও খাবার স্যালাইন (ORS), ডাবের পানি, ভাতের মাড় পান করুন (দৈনিক আড়াই থেকে তিন লিটার)।",
      "৩. সাধারণ তাপমাত্রার পানি দিয়ে শরীর ঘন ঘন মুছে (স্পঞ্জ) দিন।",
      "৪. ডেঙ্গু সন্দেহ হলে সিবিসি (CBC) ও ডেঙ্গু NS1 পরীক্ষা করান।",
      "⚠️ অ্যাসপিরিন, আইবুপ্রোফেন, ন্যাপ্রোক্সেন বা অন্য কোনো ব্যথানাশক ভুলেও খাবেন না—এতে রক্তক্ষরণ হতে পারে।"
    ],
    warningsBn: "পেটে তীব্র ব্যথা, ক্রমাগত বমি, নাক-মাড়ি দিয়ে রক্তপাত হলে তাৎক্ষণিক হাসপাতালে ভর্তি করান।"
  },
  {
    id: "diarrhea-cholera",
    category: "Gastrointestinal",
    severity: "urgent",
    icon: "💧",
    titleEn: "Severe Diarrhea & Cholera",
    titleBn: "তীব্র ডায়রিয়া ও কলেরা",
    symptoms: [
      "Watery stool frequent times (ঘন ঘন পাতলা পায়খানা)",
      "Sunken eyes, extreme thirst (চোখ গর্তে ঢোকা, অতিরিক্ত তৃষ্ণা)",
      "Dry tongue and loss of skin elasticity (শুকনো জিহ্বা, চামড়া ঢিলে হওয়া)",
      "Weak pulse, severe weakness (নাড়ি দুর্বল, অতিরিক্ত দুর্বলতা)",
      "Little or no urination (প্রস্রাব কমে যাওয়া বা বন্ধ হওয়া)"
    ],
    firstAidEn: [
      "1. Start Oral Rehydration Solution (ORS / খাবার স্যালাইন) immediately after EVERY loose stool.",
      "2. ORS Preparation: Mix 1 full packet of ORS into exactly 500ml (half liter) of clean drinking water.",
      "3. Continue normal food intake (rice porridge, banana, khichuri). Do not fast.",
      "4. For children under 5: Give Zinc tablet (20mg) daily for 10-14 days.",
      "5. If patient cannot drink or vomits continuously, rush to hospital for IV saline (Cholera saline)."
    ],
    firstAidBn: [
      "১. প্রতিবার পাতলা পায়খানার পরপরই পর্যাপ্ত খাবার স্যালাইন (ORS) খাওয়ান।",
      "২. স্যালাইন তৈরির নিয়ম: আধা লিটার (২৫০ মিলি এর ২ গ্লাস) নিরাপদ পানিতে পুরো এক প্যাকেট স্যালাইন ভালোভাবে গুলিয়ে নিন।",
      "৩. স্বাভাবিক খাবার (জাউ ভাত, কাঁচকলা, খিচুড়ি) চালিয়ে যান। বুকের দুধ বা খাবার বন্ধ করবেন না।",
      "৪. ৫ বছরের কম বয়সী শিশুকে প্রতিদিন ১টি করে জিংক ট্যাবলেট ১০-১৪ দিন পানিতে গুলিয়ে খাওয়ান।",
      "৫. রোগী মুখ দিয়ে খেতে না পারলে বা নিস্তেজ হয়ে পড়লে দ্রুত হাসপাতালে কলেরা স্যালাইনের (IV) জন্য নিন।"
    ],
    warningsBn: "স্যালাইন গরম পানিতে গুলবেন না বা আধা প্যাকেট করে বানাবেন না।"
  },
  {
    id: "heatstroke",
    category: "Environmental",
    severity: "critical",
    icon: "☀️",
    titleEn: "Heatstroke & Extreme Heat Exhaustion",
    titleBn: "হিটস্ট্রোক ও চরম পানিশূন্যতা",
    symptoms: [
      "Body temperature rising to 104°F (৪০° সে.) or higher without sweating",
      "Confusion, slurred speech, delirium, fainting (অসংলগ্ন কথাবার্তা বা অজ্ঞান হয়ে যাওয়া)",
      "Hot, dry red skin or profuse sweating",
      "Rapid breathing and racing pulse (দ্রুত শ্বাস ও হৃদস্পন্দন)"
    ],
    firstAidEn: [
      "1. Move the person to a shady, cool, ventilated place immediately.",
      "2. Remove excess outer clothing.",
      "3. Cool the body rapidly: apply wet cool towels, fan vigorously, place ice packs/cold cloth on neck, armpits, and groin.",
      "4. If conscious, give small sips of cool water or saline.",
      "5. Rush to the hospital while continuing active cooling."
    ],
    firstAidBn: [
      "১. দ্রুত রোগীকে ছায়াযুক্ত, শীতল ও বাতাস চলাচলকারী স্থানে সরিয়ে নিন।",
      "২. অতিরিক্ত জামাকাপড় খুলে শরীর হালকা করে দিন।",
      "৩. শরীর দ্রুত ঠান্ডা করুন: ভেজা কাপড় দিয়ে পুরো শরীর মুছুন, ঘাড়, বগল ও কুঁচকিতে ভেজা কাপড় বা বরফের প্যাক দিন।",
      "৪. রোগী জ্ঞান থাকলে ধীরে ধীরে খাবার স্যালাইন বা ঠান্ডা পানি পান করান।",
      "৫. দ্রুত চিকিৎসা কেন্দ্রে নেওয়ার ব্যবস্থা করুন।"
    ],
    warningsBn: "অজ্ঞান রোগীকে মুখে কোনো তরল খাবার বা পানি দেবেন না।"
  },
  {
    id: "burns",
    category: "Trauma",
    severity: "urgent",
    icon: "🔥",
    titleEn: "Severe Thermal & Chemical Burns",
    titleBn: "পুড়ে যাওয়া (বার্ন) প্রাথমিক চিকিৎসা",
    symptoms: [
      "Redness, blistering, severe skin pain (লাল হওয়া, ফোসকা পড়া, তীব্র জ্বালাপোড়া)",
      "Charred or white skin (গভীর পোড়া)",
      "Chemical burn from acid/battery/alkali"
    ],
    firstAidEn: [
      "1. Immediately pour clean, normal room-temperature running water for AT LEAST 20 MINUTES.",
      "2. Remove jewelry, belts, or tight clothes before swelling occurs (do not pull clothes stuck to burnt skin).",
      "3. Cover with a clean, dry, non-stick plastic wrap or clean sterile cloth.",
      "4. Keep the patient warm to prevent hypothermia and give fluids.",
      "⚠️ NEVER apply toothpaste, eggs, flour, cow dung, or ice directly on burns."
    ],
    firstAidBn: [
      "১. পোড়া স্থানে সাথে সাথে সাধারণ তাপমাত্রার পরিষ্কার পানি একটানা অন্তত ২০ মিনিট ঢালুন।",
      "২. কোনো চুড়ি, আংটি বা বেল্ট থাকলে ফোলা শুরুর আগেই আলতোভাবে খুলে ফেলুন।",
      "৩. পোড়া স্থান পরিষ্কার পাতলা শুকনো সুতি কাপড় বা পলিথিন দিয়ে আলতোভাবে ঢেকে দিন।",
      "৪. রোগীকে স্যালাইন বা তরল খেতে দিন।",
      "⚠️ টুথপেস্ট, ডিম, আটা, মাটি বা বরফ ভুলেও পোড়া স্থানে লাগাবেন না—এতে ইনফেকশন ভয়াবহ হয়।"
    ],
    warningsBn: "পোড়া ফোসকা নিজে থেকে ফাটাবেন না।"
  },
  {
    id: "child-pneumonia",
    category: "Pediatric",
    severity: "critical",
    icon: "👶",
    titleEn: "Child Pneumonia & Fast Breathing",
    titleBn: "শিশুর নিউমোনিয়া ও শ্বাসকষ্ট",
    symptoms: [
      "Fast breathing (দ্রুত শ্বাস নেওয়া: ২-১২ মাস বয়সে ৫০+/মিনিট, ১-৫ বছরে ৪০+/মিনিট)",
      "Chest in-drawing / lower chest wall goes in during inhalation (বুকের খাঁচা ভেতরের দিকে দেবে যাওয়া)",
      "High fever, persistent cough (তীব্র জ্বর ও কাশি)",
      "Unable to breastfeed / drink liquids (বুকের দুধ বা তরল টানতে না পারা)",
      "Grunting sound while breathing (শ্বাসের সাথে গোঙানির শব্দ)"
    ],
    firstAidEn: [
      "1. Keep the child warm and comfortable in an upright or slightly tilted position.",
      "2. Clear nose if blocked with saline nasal drops.",
      "3. Continue frequent breastfeeding in small amounts.",
      "4. DO NOT give over-the-counter heavy cough syrups to infants.",
      "5. RUSH to the nearest hospital for oxygen and pediatrician-guided antibiotic therapy immediately."
    ],
    firstAidBn: [
      "১. শিশুকে সোজা বা হালকা কাত করে কোলে রাখুন যাতে শ্বাস নিতে সুবিধা হয়।",
      "২. নাক বন্ধ থাকলে স্যালাইন ড্রপ দিয়ে নাক পরিষ্কার রাখুন।",
      "৩. শিশুকে অল্প অল্প করে বারবার বুকের দুধ বা তরল খাবার খাওয়ান।",
      "৪. ছোট শিশুদের চিকিৎসকের পরামর্শ ছাড়া অ্যান্টিবায়োটিক বা ভারী কাশির সিরাপ খাওয়াবেন না।",
      "৫. বুকের খাঁচা দেবে গেলে বা নিস্তেজ হলে অবিলম্বে হাসপাতালে অক্সিজেন ও চিকিৎসার জন্য নিয়ে যান।"
    ],
    warningsBn: "বুকের খাঁচা দেবে যাওয়া নিউমোনিয়ার মারাত্মক বিপৎচিহ্ন—দেরি না করে দ্রুত হাসপাতালে যান।"
  },
  {
    id: "stroke-hypertension",
    category: "Cardiovascular",
    severity: "critical",
    icon: "🧠",
    titleEn: "Stroke & High Blood Pressure Crisis",
    titleBn: "স্ট্রোক ও উচ্চ রক্তচাপের বিপৎচিহ্ন (F.A.S.T)",
    symptoms: [
      "Face drooping on one side (মুখ একদিকে বেঁকে যাওয়া)",
      "Arm / leg weakness or numbness on one side (একপাশের হাত বা পা অবশ হয়ে যাওয়া)",
      "Speech difficulty / slurred speech (কথা জড়িয়ে যাওয়া বা অস্পষ্ট হওয়া)",
      "Sudden severe explosive headache with blurred vision (হঠাৎ তীব্র মাথাব্যথা ও চোখে ঝাপসা দেখা)",
      "Loss of balance or sudden fainting (ভারসাম্য হারানো)"
    ],
    firstAidEn: [
      "1. Remember F.A.S.T: Face drooping? Arm weakness? Speech slurred? Time to call SOS!",
      "2. Note the EXACT time symptoms started (critical for hospital clot-busting medication within 3-4.5 hours).",
      "3. Lay the patient on their side with head slightly elevated.",
      "4. Loosen tight collar or clothing.",
      "⚠️ DO NOT give food, water, or aspirin until evaluated by a hospital doctor."
    ],
    firstAidBn: [
      "১. F.A.S.T নিয়ম মনে রাখুন: মুখ বাঁকা (Face), হাত অবশ (Arm), কথা অস্পষ্ট (Speech), দ্রুত হাসপাতালে নেওয়ার সময় (Time)।",
      "২. লক্ষণ ঠিক কোন সময় শুরু হয়েছে তা লিখে রাখুন (প্রথম ৪ ঘণ্টার মধ্যে চিকিৎসা নিলে রোগী সুস্থ হওয়ার সম্ভাবনা অনেক বেশি)।",
      "৩. রোগীকে একপাশে কাত করে মাথা সামান্য উঁচুতে রেখে শুইয়ে দিন।",
      "৪. গলার বোতাম বা টাইট পোশাক ঢিলে করে দিন যাতে শ্বাস নিতে কষ্ট না হয়।",
      "⚠️ অজ্ঞান বা অর্ধচেতন রোগীকে মুখে পানি, ওষুধ বা অ্যাসপিরিন খাওয়াবেন না।"
    ],
    warningsBn: "স্ট্রোকের ক্ষেত্রে প্রতিটি মিনিট অত্যন্ত মূল্যবান—দ্রুত নিকটস্থ হাসপাতালে যান।"
  },
  {
    id: "dog-animal-bite",
    category: "Infectious Disease",
    severity: "urgent",
    icon: "🐕",
    titleEn: "Dog / Animal Bite & Rabies Prevention",
    titleBn: "কুকুর বা বিড়ালের কামড় (জলাতঙ্ক প্রতিরোধ)",
    symptoms: [
      "Bite, puncture wound, or scratch by dog, cat, monkey, or jackal (কুকুর বা বিড়ালের আঁচড় বা কামড়)",
      "Skin breakage with bleeding",
      "Saliva contact with open wounds"
    ],
    firstAidEn: [
      "1. IMMEDIATELY wash the wound with running water and alkaline soap for AT LEAST 15 MINUTES.",
      "2. Apply an antiseptic like Povidone Iodine (Betadine).",
      "3. DO NOT stitch or tightly bandage the bite wound.",
      "4. Visit the government hospital on Day 0 (Today) for Anti-Rabies Vaccine (ARV).",
      "5. Complete all required doses (Day 0, 3, 7, 28)."
    ],
    firstAidBn: [
      "১. সাথে সাথে যেকোনো সাবান ও প্রচুর চলমান পানি দিয়ে একটানা অন্তত ১৫ মিনিট ক্ষতস্থানটি ভালোভাবে ধৌত করুন।",
      "২. ধোয়ার পর পোভিডন আয়োডিন (যেমন ভায়োডিন/পোভিডন) দ্রবণ লাগান।",
      "৩. ক্ষতস্থানে কোনো ব্যান্ডেজ দিয়ে শক্ত করে বাঁধপাক করবেন না বা সেলাই করবেন না।",
      "৪. প্রথম দিনই (Day 0) সরকারি হাসপাতালে গিয়ে বিনামূল্যে জলাতঙ্কের ভ্যাকসিন (ARV) গ্রহণ করুন।",
      "৫. ভ্যাকসিনের পুরো কোর্স সম্পন্ন করুন।"
    ],
    warningsBn: "জলাতঙ্কের কোনো নিরাময় নেই, তবে তাৎক্ষণিক সাবান দিয়ে ১৫ মিনিট ধোয়া ও সময়মতো ভ্যাকসিন নেওয়া ১০০% জীবন বাঁচায়।"
  }
];

export const KEYWORD_INDEX = [
  {
    keywords: ["fever", "জ্বর", "temperature", "hot", "গরম", "তাপ", "শরীর গরম"],
    matchedConditionId: "dengue-fever",
    severity: "urgent",
    matchLabelBn: "সম্ভাব্য ডেঙ্গু বা সংক্রামক জ্বর (Possible Dengue / Viral Fever)"
  },
  {
    keywords: ["snake", "bite", "সাপ", "কামড়", "বিষ", "সাপের কামড়", "গায়ে দাগ", "ফোসকা"],
    matchedConditionId: "snake-bite",
    severity: "critical",
    matchLabelBn: "জরুরি সাপের কামড় (Snake Bite Emergency)"
  },
  {
    keywords: ["diarrhea", "stool", "vomit", "ডায়রিয়া", "পায়খানা", "বমি", "পাতলা পায়খানা", "কলেরা", "পেট খারাপ"],
    matchedConditionId: "diarrhea-cholera",
    severity: "urgent",
    matchLabelBn: "তীব্র ডায়রিয়া বা কলেরা (Acute Diarrhea / Cholera)"
  },
  {
    keywords: ["burn", "fire", "acid", "পোড়া", "ফোসকা", "আগুন", "জ্বালাপোড়া"],
    matchedConditionId: "burns",
    severity: "urgent",
    matchLabelBn: "পোড়া স্থান প্রাথমিক চিকিৎসা (Burn Injury Protocol)"
  },
  {
    keywords: ["heat", "sun", "stroke", "হিটস্ট্রোক", "অজ্ঞান", "গরম", "রোদ"],
    matchedConditionId: "heatstroke",
    severity: "critical",
    matchLabelBn: "হিটস্ট্রোক ও চরম পানিশূন্যতা (Heatstroke Crisis)"
  },
  {
    keywords: ["child", "pneumonia", "cough", "শিশু", "কাশি", "শ্বাসকষ্ট", "বুকের খাঁচা", "নিউমোনিয়া"],
    matchedConditionId: "child-pneumonia",
    severity: "critical",
    matchLabelBn: "শিশুর নিউমোনিয়া ও শ্বাসকষ্ট (Pediatric Pneumonia)"
  },
  {
    keywords: ["stroke", "paralysis", "face", "মুখ বেঁকে যাওয়া", "অবশ", "হাত অবশ", "কথা জড়ানো"],
    matchedConditionId: "stroke-hypertension",
    severity: "critical",
    matchLabelBn: "স্ট্রোক ও উচ্চ রক্তচাপ (Stroke Emergency F.A.S.T)"
  },
  {
    keywords: ["dog", "cat", "animal", "bite", "কুকুর", "বিড়াল", "আঁচড়", "কামড়", "জলাতঙ্ক"],
    matchedConditionId: "dog-animal-bite",
    severity: "urgent",
    matchLabelBn: "পশুর কামড় ও জলাতঙ্ক প্রতিরোধ (Animal Bite & Rabies)"
  }
];

export function searchByKeywords(inputText) {
  if (!inputText || !inputText.trim()) return [];
  const text = inputText.toLowerCase().trim();
  const words = text.split(/\s+/);

  const results = [];

  OFFLINE_CONDITIONS.forEach((condition) => {
    let score = 0;
    const allSearchable = [
      condition.titleEn,
      condition.titleBn,
      ...condition.symptoms,
      ...condition.firstAidEn,
      ...condition.firstAidBn
    ].join(" ").toLowerCase();

    // Word match scoring
    words.forEach((word) => {
      if (word.length >= 2 && allSearchable.includes(word)) {
        score += 2;
      }
    });

    // Check keyword index bonus
    KEYWORD_INDEX.forEach((idxItem) => {
      if (idxItem.matchedConditionId === condition.id) {
        idxItem.keywords.forEach((kw) => {
          if (text.includes(kw.toLowerCase())) {
            score += 5;
          }
        });
      }
    });

    if (score > 0) {
      results.push({
        condition,
        matchScore: score,
        confidence: score >= 7 ? "High Match (উচ্চ সম্ভাবনা)" : "Probable Match (সম্ভাব্য)"
      });
    }
  });

  return results.sort((a, b) => b.matchScore - a.matchScore);
}

// IndexedDB Helper
const DB_NAME = "AmarDoctorOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "conditions";

export function initOfflineDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("severity", "severity", { unique: false });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      OFFLINE_CONDITIONS.forEach((item) => store.put(item));
      resolve(db);
    };

    request.onerror = (err) => {
      console.warn("IndexedDB error:", err);
      resolve(null);
    };
  });
}

export function getOfflineConditions() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(OFFLINE_CONDITIONS);
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
      const db = event.target.result;
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          if (getAll.result && getAll.result.length > 0) {
            resolve(getAll.result);
          } else {
            resolve(OFFLINE_CONDITIONS);
          }
        };
        getAll.onerror = () => resolve(OFFLINE_CONDITIONS);
      } catch {
        resolve(OFFLINE_CONDITIONS);
      }
    };
    request.onerror = () => resolve(OFFLINE_CONDITIONS);
  });
}


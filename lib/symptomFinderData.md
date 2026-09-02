# Amar Doctor V1 — Offline Fast Symptom Finder Decision Tree

This document defines the structured decision tree schema for the 10 core conditions included in the **Offline Fast Symptom Finder**.
You can edit this file or add new diseases following the markdown schema below to expand the offline decision engine.

---

## Decision Tree Schema

Each disease entry defines:
1. **Condition ID**: Unique slug
2. **Body Area**: `Head & Neck` | `Chest & Respiratory` | `Abdomen & Stomach` | `Limbs & Skin` | `General & Full Body`
3. **Primary Symptom**: Main physical complaint
4. **Duration**: `Less than 24 hours` | `1 to 3 days` | `More than 3 days`
5. **Severity**: `Mild` | `Moderate` | `Severe` | `Critical Emergency`
6. **Associated Symptoms**: List of secondary signs
7. **Emergency Status**: `CRITICAL (RED)` | `URGENT (YELLOW)` | `MONITOR AT HOME (GREEN)`
8. **Clinical Guidance & First-Aid**: Steps in Bengali & English

---

## Initial 10 Core Diseases

### 1. Snake Bite Emergency (সাপের কামড়)
- **ID:** `snake-bite`
- **Body Area:** `Limbs & Skin`
- **Primary Symptom:** Puncture wound / Snake bite (দাঁতের দাগ ও ফোসকা)
- **Duration:** `Less than 24 hours`
- **Severity:** `Critical Emergency`
- **Associated Symptoms:** Drooping eyelids, swelling, difficulty breathing, gum bleeding
- **Status:** 🔴 **CRITICAL EMERGENCY (RED)**
- **Solution:** Keep patient still, immobilize limb, rush immediately to nearest hospital for Antivenom. Never cut or suck wound.

### 2. Dengue Hemorrhagic Fever (ডেঙ্গু জ্বর)
- **ID:** `dengue-fever`
- **Body Area:** `General & Full Body`
- **Primary Symptom:** High Fever 103°F-105°F (তীব্র জ্বর)
- **Duration:** `1 to 3 days`
- **Severity:** `Severe`
- **Associated Symptoms:** Eye pain, joint ache, skin red spots, abdominal pain, vomiting
- **Status:** 🟡 **URGENT MEDICAL CARE (YELLOW)**
- **Solution:** Take ONLY Paracetamol. Drink 3L fluids (ORS, coconut water). Test CBC on Day 2. Avoid Aspirin/Ibuprofen.

### 3. Acute Diarrhea & Cholera (তীব্র ডায়রিয়া ও কলেরা)
- **ID:** `diarrhea-cholera`
- **Body Area:** `Abdomen & Stomach`
- **Primary Symptom:** Watery stool frequent times (ঘন ঘন পাতলা পায়খানা)
- **Duration:** `Less than 24 hours` / `1 to 3 days`
- **Severity:** `Severe`
- **Associated Symptoms:** Extreme thirst, sunken eyes, dry mouth, weakness, little urination
- **Status:** 🟡 **URGENT CARE (YELLOW)**
- **Solution:** Start ORS (500ml per packet) after every stool. Give Zinc tablets to children for 14 days. Continue normal food.

### 4. Severe Heatstroke (হিটস্ট্রোক)
- **ID:** `heatstroke`
- **Body Area:** `General & Full Body`
- **Primary Symptom:** High body temperature without sweating (৪০°সে জ্বর ও ঘাম না হওয়া)
- **Duration:** `Less than 24 hours`
- **Severity:** `Critical Emergency`
- **Associated Symptoms:** Confusion, slurred speech, fainting, rapid breathing
- **Status:** 🔴 **CRITICAL EMERGENCY (RED)**
- **Solution:** Move to shaded cool area, wet body with cool water, apply ice packs to neck/armpits. Rush to hospital.

### 5. Thermal / Acid Burn Injury (পুড়ে যাওয়া)
- **ID:** `burns`
- **Body Area:** `Limbs & Skin`
- **Primary Symptom:** Blisters, severe skin burning pain (ফোসকা ও জ্বালাপোড়া)
- **Duration:** `Less than 24 hours`
- **Severity:** `Severe`
- **Associated Symptoms:** Redness, charred skin, pain
- **Status:** 🟡 **URGENT CARE (YELLOW)**
- **Solution:** Pour normal room temperature water continuously for AT LEAST 20 MINUTES. Cover with sterile wrap. Do not apply toothpaste or ice.

### 6. Child Pneumonia (শিশুর নিউমোনিয়া)
- **ID:** `child-pneumonia`
- **Body Area:** `Chest & Respiratory`
- **Primary Symptom:** Fast breathing & chest in-drawing (বুকের খাঁচা দেবে যাওয়া)
- **Duration:** `1 to 3 days`
- **Severity:** `Critical Emergency`
- **Associated Symptoms:** High fever, persistent cough, grunting breath sound, inability to breastfeed
- **Status:** 🔴 **CRITICAL EMERGENCY (RED)**
- **Solution:** Keep child upright, clear nose with saline drops, rush to hospital immediately for oxygen support.

### 7. Stroke & High BP Crisis (স্ট্রোক)
- **ID:** `stroke-hypertension`
- **Body Area:** `Head & Neck`
- **Primary Symptom:** Sudden face drooping, arm weakness, slurred speech (F.A.S.T)
- **Duration:** `Less than 24 hours`
- **Severity:** `Critical Emergency`
- **Associated Symptoms:** Explosive headache, blurred vision, loss of balance
- **Status:** 🔴 **CRITICAL EMERGENCY (RED)**
- **Solution:** Lay patient on side with head elevated. Note exact onset time. Rush to emergency hospital within 3-4 hours.

### 8. Rabies / Animal Bite (কুকুর বা বিড়ালের কামড়)
- **ID:** `dog-animal-bite`
- **Body Area:** `Limbs & Skin`
- **Primary Symptom:** Animal bite scratch with bleeding (পশুর কামড় বা আঁচড়)
- **Duration:** `Less than 24 hours`
- **Severity:** `Severe`
- **Associated Symptoms:** Skin puncture, bleeding
- **Status:** 🟡 **URGENT CARE (YELLOW)**
- **Solution:** Wash wound with soap and running water for AT LEAST 15 MINUTES. Apply Povidone Iodine. Visit hospital for Day 0 Anti-Rabies Vaccine.

### 9. Acute Typhoid Fever (টাইফয়েড জ্বর)
- **ID:** `typhoid-fever`
- **Body Area:** `General & Full Body`
- **Primary Symptom:** Prolonged step-ladder fever (দীর্ঘস্থায়ী জ্বর)
- **Duration:** `More than 3 days`
- **Severity:** `Moderate`
- **Associated Symptoms:** Headaches, abdominal discomfort, constipation or diarrhea, loss of appetite
- **Status:** 🟢 **MONITOR & CONSULT DOCTOR (GREEN)**
- **Solution:** Maintain hydration, eat soft clean cooked food, consult a physician for Widal/Typhidot blood test and prescribed antibiotics.

### 10. Seasonal Viral Flu & Bronchitis (সর্দি-জ্বর ও কাশি)
- **ID:** `seasonal-flu`
- **Body Area:** `Chest & Respiratory`
- **Primary Symptom:** Mild fever, runny nose, sore throat (সর্দি, কাশি ও গলা ব্যথা)
- **Duration:** `1 to 3 days`
- **Severity:** `Mild`
- **Associated Symptoms:** Sneezing, mild body ache, nasal congestion
- **Status:** 🟢 **MONITOR AT HOME (GREEN)**
- **Solution:** Warm water gargle with salt, honey and ginger tea, rest, Paracetamol if needed. Resolves in 3-5 days.

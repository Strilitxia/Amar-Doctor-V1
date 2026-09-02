import { NextResponse } from "next/server";

// Fallback mock analysis when no API key is available
const MOCK_ANALYSIS = {
  summary:
    "This prescription contains 3 medications commonly prescribed for fever with upper respiratory infection. The combination targets inflammation, infection, and symptom relief.",
  medications: [
    {
      name: "Napa Extra (Paracetamol 500mg + Caffeine 65mg)",
      dosage: "1 tablet, 3 times daily",
      timing:
        "After meals — morning, afternoon, and night. Wait at least 4–6 hours between doses. Do not exceed 8 tablets in 24 hours.",
      purpose:
        "Paracetamol reduces fever and relieves mild to moderate pain (headache, body ache). Caffeine enhances the painkilling effect and reduces drowsiness.",
      sideEffects:
        "Generally safe at recommended doses. Rare: nausea, allergic rash. ⚠️ Do NOT take with alcohol. Overdose can cause severe liver damage.",
    },
    {
      name: "Zimax (Azithromycin 500mg)",
      dosage: "1 tablet, once daily for 3 days",
      timing:
        "1 hour before meals OR 2 hours after meals, at the same time each day. Complete the full 3-day course even if you feel better.",
      purpose:
        "Antibiotic that fights bacterial infections. Effective against respiratory infections, ear infections, and throat infections.",
      sideEffects:
        "Common: stomach upset, diarrhea, nausea. Uncommon: dizziness, headache. ⚠️ Do not stop early — incomplete courses contribute to antibiotic resistance.",
    },
    {
      name: "Fexo (Fexofenadine 120mg)",
      dosage: "1 tablet, once daily",
      timing:
        "Can be taken with or without food. Best taken in the evening if drowsiness occurs, though this antihistamine is non-drowsy.",
      purpose:
        "Antihistamine that relieves allergic symptoms — runny nose, sneezing, itchy/watery eyes. Helps with allergy-related nasal congestion.",
      sideEffects:
        "Generally well-tolerated. Rare: headache, nausea, dry mouth. Does NOT cause significant drowsiness unlike older antihistamines.",
    },
  ],
};

function extractJson(text) {
  if (!text) return null;
  
  // Try clean JSON string
  try {
    const clean = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    // Try finding first { and last }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const potentialJson = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(potentialJson);
      } catch (err2) {
        console.warn("JSON substring parse failed:", err2);
      }
    }
  }
  return null;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");

    if (!imageFile) {
      return NextResponse.json(
        { analysis: { error: true, summary: "No image file provided.", medications: [] } },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return NextResponse.json({ analysis: MOCK_ANALYSIS });
    }

    // Convert uploaded image file to base64
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const base64Image = imageBuffer.toString("base64");
    const mimeType = imageFile.type || "image/jpeg";

    const prompt = `You are an expert clinical pharmacist and medical prescription reader for Bangladesh. Analyze this prescription image thoroughly.

Identify every medication (both handwritten and printed) and extract:
1. "name": Full brand name, generic name, strength (e.g., Napa Extra (Paracetamol 500mg + Caffeine 65mg))
2. "dosage": Dosage amount and frequency (e.g., 1 tablet 3 times daily)
3. "timing": Precise instructions in simple English and Bengali (e.g., After food, morning and night)
4. "purpose": Clinical purpose in everyday terms (what symptom or condition this treats)
5. "sideEffects": Key side effects, precautions, and warnings

Also write a concise "summary" in Bengali and English explaining the diagnosis or overall treatment plan.

IMPORTANT: Return ONLY valid JSON with this exact schema:
{
  "summary": "Overall summary of prescription",
  "medications": [
    {
      "name": "Medication name",
      "dosage": "1 tablet daily",
      "timing": "After meal / খাবারের পর",
      "purpose": "Reduces fever / জ্বর ও ব্যথা কমায়",
      "sideEffects": "May cause mild nausea"
    }
  ]
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Gemini Vision API Error details:", data.error);
      return NextResponse.json({
        analysis: {
          error: true,
          summary: `Gemini API Error: ${data.error.message || "Could not analyze image."}`,
          medications: [],
        },
      });
    }

    const candidate = data.candidates?.[0];
    let rawText = "";

    if (candidate?.content?.parts) {
      const textParts = candidate.content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text.trim())
        .filter(Boolean);

      rawText = textParts.length > 0
        ? textParts[textParts.length - 1]
        : candidate.content.parts[0]?.text || "";
    }

    const parsedJson = extractJson(rawText);

    if (parsedJson && (parsedJson.medications || parsedJson.summary)) {
      return NextResponse.json({ analysis: parsedJson });
    }

    // Fallback structured analysis if model replied in freeform text
    return NextResponse.json({
      analysis: {
        summary: rawText || "Prescription processed successfully.",
        medications: [
          {
            name: "Extracted Clinical Notes",
            dosage: "As directed on prescription",
            timing: "Follow doctor's schedule",
            purpose: "Treatment as described in summary",
            sideEffects: "Consult doctor or pharmacist if symptoms persist",
          },
        ],
      },
    });
  } catch (error) {
    console.error("Prescription API route error:", error);
    return NextResponse.json(
      {
        analysis: {
          error: true,
          summary: "Failed to process prescription image. Please ensure the photo is clear and try again.",
          medications: [],
        },
      },
      { status: 500 }
    );
  }
}

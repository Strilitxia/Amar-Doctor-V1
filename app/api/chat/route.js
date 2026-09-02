import { NextResponse } from "next/server";

// Mock responses for when no API key is configured
const MOCK_RESPONSES = [
  "Based on your symptoms, this could be a common viral infection. I recommend:\n\n১। পর্যাপ্ত বিশ্রাম নিন (Rest well)\n২। প্রচুর পানি পান করুন (Stay hydrated)\n৩। যদি জ্বর ১০২°F এর বেশি হয়, প্যারাসিটামল নিন (Take paracetamol if fever exceeds 102°F)\n\n⚠️ If symptoms persist for more than 3 days, please visit a nearby hospital. Use our Map feature to find one.",
  "Thank you for sharing your concern. Based on what you've described:\n\n🔹 This appears to be a mild condition that can be managed at home\n🔹 আপনার উদ্বেগের জন্য ধন্যবাদ\n\nRecommendations:\n- Take adequate rest\n- Maintain a light, nutritious diet\n- Avoid strenuous activity\n\nIf you notice any worsening, please tap the SOS button or visit the nearest hospital.",
  "আমি আপনার লক্ষণগুলো বুঝতে পেরেছি। Here's my assessment:\n\nThis could potentially be related to seasonal changes. Common in rural areas of Bangladesh during this time.\n\nSuggested steps:\n১। হালকা গরম পানি পান করুন\n২। পুষ্টিকর খাবার খান\n৩। পর্যাপ্ত ঘুমান\n\n📋 Would you like me to look at a prescription? Use our Prescription Scanner feature.\n🗺️ Need to find a doctor? Use the Hospital Map.",
];

export async function POST(request) {
  try {
    const { message, history } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // Return a mock response
      const randomIndex = Math.floor(Math.random() * MOCK_RESPONSES.length);
      // Simulate a small delay for realism
      await new Promise((resolve) => setTimeout(resolve, 1200));

      return NextResponse.json({ reply: MOCK_RESPONSES[randomIndex] });
    }

    // Real Gemini API call
    const systemPrompt = `You are "Amar Doctor" (আমার ডাক্তার), a compassionate and knowledgeable AI medical assistant designed for rural Bangladesh. 

Your responsibilities:
- Provide preliminary medical guidance based on symptoms described by the patient
- Speak naturally in both Bengali (বাংলা) and English — mix both languages as appropriate
- Be empathetic, clear, and use simple language that rural patients can understand
- Always recommend visiting a real doctor for serious conditions
- Explain medications, dosages, and timing in simple terms
- Suggest first-aid steps when relevant
- Never claim to replace a real doctor — you are a preliminary consultation aid

Important guidelines:
- If the patient describes emergency symptoms (chest pain, severe bleeding, difficulty breathing, stroke signs), immediately advise calling emergency services and using the SOS feature
- Be culturally sensitive to Bangladeshi customs and dietary practices
- Consider common diseases in rural Bangladesh (dengue, typhoid, diarrhea, malaria, respiratory infections)
- Suggest affordable, commonly available medications when appropriate
- Always end with a recommendation to consult a real doctor if symptoms persist`;

    const contents = [];

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history) {
        contents.push({
          role: msg.role === "ai" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Add current message
    contents.push({
      role: "user",
      parts: [{ text: message }],
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error("Gemini API Error details:", data.error);
    }

    const candidate = data.candidates?.[0];
    let reply = "";

    if (candidate?.content?.parts) {
      // Filter parts with text (Gemini 3.6 Flash returns text parts, with the main answer in the text part)
      const textParts = candidate.content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text.trim())
        .filter(Boolean);

      reply = textParts.length > 0
        ? textParts[textParts.length - 1]
        : candidate.content.parts[0]?.text || "";
    }

    if (!reply) {
      reply = "I'm sorry, I couldn't process your request. Please try again.";
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { reply: "Sorry, an error occurred. Please try again." },
      { status: 500 }
    );
  }
}

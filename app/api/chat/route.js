import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const GROQ_MODEL = "openai/gpt-oss-120b";

const EMPTY_CASE_SHEET = {
  age: null, sex: null, chief_complaint: null, onset: null, duration: null,
  severity: null, location: null, associated_symptoms: [],
  aggravating_relieving: null, meds_tried: [], history: [], red_flags: [],
  unknowns: [], next_question: null, stage: "gathering",
};

// Shared with backend/server.py so the two prompts cannot drift apart again.
let cachedPrompt = null;
function getSystemPrompt() {
  if (!cachedPrompt) {
    cachedPrompt = fs.readFileSync(
      path.join(process.cwd(), "backend", "prompts", "triage_prompt.txt"),
      "utf-8"
    );
  }
  return cachedPrompt;
}

function parseTriageOutput(raw) {
  let sheet = null;

  if (raw.includes("<case_sheet>")) {
    const block = raw.split("<case_sheet>")[1].split("</case_sheet>")[0];
    try {
      const parsed = JSON.parse(block.trim());
      if (parsed && typeof parsed === "object") sheet = parsed;
    } catch {
      console.warn("Case sheet was not valid JSON, carrying previous sheet forward.");
    }
  }

  // Closing tag first — the model routinely omits the opening <reply>.
  let reply = raw;
  if (reply.includes("</reply>")) reply = reply.split("</reply>")[0];
  if (reply.includes("<reply>")) reply = reply.split("<reply>")[1];
  reply = reply.split("<case_sheet>")[0];

  return { reply: reply.trim(), sheet };
}

export async function POST(request) {
  try {
    const { message, history, case_sheet } = await request.json();

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      console.error(
        "GROQ_API_KEY is missing — the chat API cannot reach an LLM. Put it in .env.local."
      );
      return NextResponse.json({
        reply:
          "দুঃখিত, এই মুহূর্তে এআই ডাক্তারের সাথে সংযোগ করা যাচ্ছে না। অনুগ্রহ করে আবার চেষ্টা করুন।",
        degraded: true,
        degraded_reason: "no_api_key",
      });
    }

    const chatMessages = [
      { role: "system", content: getSystemPrompt() },
      {
        // Its own system message, so a long transcript can never bury it.
        role: "system",
        content:
          "CURRENT CASE SHEET:\n" + JSON.stringify(case_sheet || EMPTY_CASE_SHEET),
      },
    ];

    // Add conversation history
    if (history && history.length > 0) {
      for (const msg of history) {
        chatMessages.push({
          role: msg.role === "ai" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    // Add current message
    chatMessages.push({ role: "user", content: message });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: chatMessages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("Groq API error:", response.status, data.error || data);
      return NextResponse.json({
        reply:
          "দুঃখিত, এই মুহূর্তে এআই ডাক্তারের সাথে সংযোগ করা যাচ্ছে না। অনুগ্রহ করে আবার চেষ্টা করুন।",
        degraded: true,
        degraded_reason: "groq_error",
      });
    }

    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    const { reply, sheet } = parseTriageOutput(raw);

    if (!reply) {
      return NextResponse.json({
        reply: "দুঃখিত, আবার চেষ্টা করুন।",
        degraded: true,
        degraded_reason: "empty_reply",
      });
    }

    return NextResponse.json({ reply, case_sheet: sheet || case_sheet || null });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        reply: "দুঃখিত, একটি ত্রুটি হয়েছে। আবার চেষ্টা করুন।",
        degraded: true,
        degraded_reason: "server_error",
      },
      { status: 500 }
    );
  }
}

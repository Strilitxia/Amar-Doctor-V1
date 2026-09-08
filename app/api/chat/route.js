import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const GROQ_MODEL = "openai/gpt-oss-120b";

const EMPTY_CASE_SHEET = {
  age: null, sex: null, chief_complaint: null, onset: null, duration: null,
  severity: null, location: null, associated_symptoms: [],
  aggravating_relieving: null, meds_tried: [], history: [], red_flags: [],
  unknowns: [], next_question: null, next_question_field: null,
  asked_counts: {}, stage: "gathering",
};

const CLINICAL_FIELDS = [
  "age", "sex", "chief_complaint", "onset", "duration", "severity", "location",
  "associated_symptoms", "aggravating_relieving", "meds_tried", "history", "red_flags",
];

const MAX_ASKS_PER_FIELD = 2;
const MAX_GATHERING_EXCHANGES = 6;

// The model rewrites the whole sheet each turn and drops fields it already
// filled; replacing wholesale let a known answer revert to null, which is what
// made it ask the same question over and over.
function mergeCaseSheet(old, next) {
  if (!next) return old || null;
  const merged = old ? { ...old } : { ...EMPTY_CASE_SHEET };

  for (const [k, v] of Object.entries(next)) {
    const empty = v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (CLINICAL_FIELDS.includes(k) && empty) continue;
    merged[k] = v;
  }

  const counts = { ...((old && old.asked_counts) || {}) };
  if (next.next_question_field) {
    counts[next.next_question_field] = (counts[next.next_question_field] || 0) + 1;
  }
  merged.asked_counts = counts;

  return merged;
}

function buildContextMessage(sheet, history) {
  const parts = ["CURRENT CASE SHEET:", JSON.stringify(sheet)];

  const exhausted = Object.entries(sheet.asked_counts || {})
    .filter(([, c]) => c >= MAX_ASKS_PER_FIELD)
    .map(([f]) => f);
  if (exhausted.length) {
    parts.push(
      `\nALREADY ASKED, DO NOT ASK AGAIN: ${exhausted.join(", ")}. ` +
        "The patient has been asked about these and could not give a usable answer. " +
        "Leave them null, remove them from unknowns, and move on to something else. " +
        "Asking again is a serious error."
    );
  }

  const asked = (history || []).filter((h) => h.role === "ai").length;
  if (asked >= MAX_GATHERING_EXCHANGES && sheet.stage !== "closed") {
    parts.push(
      `\nYou have already had ${asked} exchanges. STOP GATHERING NOW. ` +
        "In THIS reply give your assessment using whatever you already know: the likely cause, " +
        "what to do right now, and when to see a doctor. Ask NO further questions. " +
        'Set stage to "assessing" and next_question to null. ' +
        "The patient came for help and must not leave without an answer."
    );
  }

  return parts.join("\n");
}

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
        content: buildContextMessage(case_sheet || EMPTY_CASE_SHEET, history),
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

    // The free tier bills the requested max_tokens against its per-minute
    // ceiling, so keep the ask close to what a turn actually needs (~1400 of
    // it goes to this model's hidden reasoning) and wait out the short 429s.
    let response, data;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 2200,
        }),
      });

      if (response.status === 429 && attempt < 2) {
        const body = await response.text();
        const m = body.match(/try again in ([\d.]+)(ms|s)/);
        const wait = m ? Number(m[1]) / (m[2] === "ms" ? 1000 : 1) : 1;
        console.warn(`Groq rate limit, retrying in ${wait}s`);
        await new Promise((r) => setTimeout(r, Math.min(wait + 0.25, 5) * 1000));
        continue;
      }

      data = await response.json();
      break;
    }

    if (!response.ok || !data || data.error) {
      const rateLimited = response.status === 429;
      console.error("Groq API error:", response.status, data?.error || "");
      return NextResponse.json({
        reply: rateLimited
          ? "এক মিনিট অপেক্ষা করে আবার বলুন, সার্ভার এখন ব্যস্ত আছে।"
          : "দুঃখিত, এই মুহূর্তে এআই ডাক্তারের সাথে সংযোগ করা যাচ্ছে না। অনুগ্রহ করে আবার চেষ্টা করুন।",
        degraded: true,
        degraded_reason: rateLimited ? "rate_limited" : "groq_error",
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

    return NextResponse.json({ reply, case_sheet: mergeCaseSheet(case_sheet, sheet) });
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

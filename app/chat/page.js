"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import SOSButton from "@/components/SOSButton";
import VideoAvatar from "@/components/VideoAvatar";
import DroneDeliveryCTA from "@/components/DroneDeliveryCTA";
import { AudioStreamPlayer } from "@/lib/audioStreamPlayer";

const INITIAL_MESSAGES = [
  {
    id: "welcome-1",
    role: "ai",
    content:
      "আসসালামু আলাইকুম! আমি আপনার এআই ডাক্তার। আপনার শারীরিক সমস্যা বা লক্ষণ সম্পর্কে বলুন, আমি সাহায্য করতে চেষ্টা করবো।\n\nHello! I'm your AI Doctor. Please describe your symptoms or health concerns, and I'll do my best to help.",
    time: "Just now",
  },
];

// Verbatim turns sent with each request. The rolling case sheet carries
// anything clinically important that falls outside this window.
const HISTORY_WINDOW = 20;
const SESSION_KEY = "amar_doctor_session";

// Speech-to-text engines the call can use. The privacy difference between
// them is real and is stated in the UI rather than buried: Whisper keeps the
// patient's audio inside this project's own backend, Web Speech uploads it
// to Google. See lib/webSpeechRecognizer.js.
const STT_ENGINE_META = {
  whisper: {
    short: "🖥️ Whisper",
    label: "Whisper (self-hosted)",
    badge: "🖥️ Whisper — audio stays on your backend",
    color: "var(--color-spectral-cyan)",
    border: "rgba(106, 228, 255, 0.5)",
    hint: "Self-hosted faster-whisper. Audio never leaves your backend. Click to try Google Web Speech.",
  },
  webspeech: {
    short: "☁️ Web Speech",
    label: "Google Web Speech",
    badge: "☁️ Google Web Speech — audio sent to Google",
    color: "#ffb020",
    border: "rgba(255, 176, 32, 0.6)",
    hint: "Chrome's Web Speech API. Sends audio to Google and needs internet. Click to run BOTH side by side.",
  },
  both: {
    short: "⚖️ A/B",
    label: "Both (compare)",
    badge: "⚖️ Whisper + Web Speech side by side",
    color: "#c084fc",
    border: "rgba(192, 132, 252, 0.6)",
    hint: "Both engines on the same audio. Whisper drives the consultation; Web Speech is shown for comparison. Click to go back to Whisper only.",
  },
};

// Robust URL Sanitizer & WebSocket URL Generator
const sanitizeBackendUrl = (url) => {
  if (!url) return "http://localhost:8000";
  let clean = url.trim().replace(/\/+$/, "");
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = "https://" + clean;
  }
  return clean;
};

const buildWsUrl = (baseUrl, endpointPath) => {
  const clean = sanitizeBackendUrl(baseUrl);
  const wsProtocol = clean.startsWith("https") ? "wss" : "ws";
  const host = clean.replace(/^https?:\/\//, "");
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  return `${wsProtocol}://${host}${path}`;
};

export default function ChatPage() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState("text"); // text | audio | video
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState(null);
  const [voiceLang, setVoiceLang] = useState("bn-BD"); // bn-BD or en-US
  const [isAvatarTalking, setIsAvatarTalking] = useState(false);
  const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
  const [callStatusText, setCallStatusText] = useState("Ready to call");
  const [liveTranscript, setLiveTranscript] = useState("");

  // Colab/Local Backend Endpoint State
  const [colabUrl, setColabUrl] = useState("http://localhost:8000");
  const [colabConnected, setColabConnected] = useState(false);
  const [showColabModal, setShowColabModal] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("bn-BD-NabanitaNeural");
  const [caseSheet, setCaseSheet] = useState(null);
  const [degradedReason, setDegradedReason] = useState(null);

  // Video-call state. videoEngine is the honest answer to "what is actually
  // drawing the doctor's face": "musetalk" only when the backend confirms a
  // live lip-sync engine, "fallback" when the avatar is following the audio
  // waveform, null when no backend is connected at all.
  const [videoEngine, setVideoEngine] = useState(null);
  const [lipsyncReason, setLipsyncReason] = useState(null);
  const [selfViewStream, setSelfViewStream] = useState(null);
  const [selfViewError, setSelfViewError] = useState(null);
  const [micMuted, setMicMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isClipTalking, setIsClipTalking] = useState(false);

  // ─── Speech-to-text engine (A/B testing) ────────────────────────────
  // "whisper"   — self-hosted faster-whisper. Audio never leaves our backend.
  // "webspeech" — Chrome's Web Speech API. Audio goes to GOOGLE's servers,
  //               and it needs a live internet connection.
  // "both"      — Whisper still drives the consultation; Web Speech runs
  //               alongside purely so the two can be compared on the exact
  //               same utterance. This is the one that actually answers
  //               "which is better at Bangla?".
  const [sttEngine, setSttEngine] = useState("whisper");
  const [webSpeechTranscript, setWebSpeechTranscript] = useState("");
  const [webSpeechError, setWebSpeechError] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const mediaStreamRef = useRef(null);   // Live mic MediaStream
  const whisperWsRef = useRef(null);     // Whisper WebSocket
  const vadRef = useRef(null);           // Active VAD segmenter handle
  const streamPlayerRef = useRef(null);
  const voiceWsRef = useRef(null);
  const latestSpeechRef = useRef("");
  const lastProcessedSpeechRef = useRef({ text: "", at: 0 });
  const isProcessingRef = useRef(false);

  // Natural-conversation plumbing
  const handleTurnRef = useRef(null);        // always points at the latest handleInteractiveVoiceInput
  const activeTurnIdRef = useRef(0);         // turn-id guard: an interrupted turn's late WS messages
                                              // (audio_chunk/response_complete) are dropped once stale
  const isAvatarTalkingRef = useRef(false);  // ref-mirrors so async/event callbacks never read stale state
  const isVoiceCallActiveRef = useRef(false);
  const modeRef = useRef("text");
  const voiceLangRef = useRef("bn-BD");
  const avatarRef = useRef(null);            // imperative handle on <VideoAvatar>
  const selfViewStreamRef = useRef(null);    // patient's own camera (local preview only)
  const videoEngineRef = useRef(null);
  const webSpeechRef = useRef(null);         // active Web Speech recognizer handle
  const sttEngineRef = useRef("whisper");    // read from async callbacks, never stale

  // Conversation memory. These refs are written synchronously inside the
  // setMessages updater rather than from a useEffect: an effect-synced mirror
  // lags a render, and on rapid voice turns that dropped turns out of the
  // history we sent — which is what made the AI look like it had amnesia.
  const messagesRef = useRef(INITIAL_MESSAGES);
  const caseSheetRef = useRef(null);

  const appendMessage = (msg) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      messagesRef.current = next;
      return next;
    });
  };

  // The greeting carries no clinical information, so it never takes a slot.
  const buildHistory = () =>
    messagesRef.current
      .filter((m) => m.id !== "welcome-1")
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role, content: m.content }));

  const applyCaseSheet = (sheet) => {
    if (!sheet) return;
    caseSheetRef.current = sheet;
    setCaseSheet(sheet);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, liveTranscript]);

  // Hydrate in an effect, never in the useState initializer — sessionStorage
  // doesn't exist during SSR/prerender, and starting from INITIAL_MESSAGES
  // keeps the first paint identical to the server HTML.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (saved?.v === 1 && Array.isArray(saved.messages) && saved.messages.length) {
        messagesRef.current = saved.messages;
        setMessages(saved.messages);
        caseSheetRef.current = saved.caseSheet || null;
        setCaseSheet(saved.caseSheet || null);
      }
      // Same reasoning as above — read in the effect, not a useState
      // initializer, so the first paint still matches the server HTML.
      // Comparing two speech engines means a lot of reloads; re-picking the
      // engine on each one would be pure friction.
      const savedEngine = localStorage.getItem("amar_doctor_stt_engine");
      if (savedEngine === "whisper" || savedEngine === "webspeech" || savedEngine === "both") {
        setSttEngine(savedEngine);
        sttEngineRef.current = savedEngine;
      }
    } catch (e) {
      console.warn("Could not restore session:", e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Reference equality means nothing has been said yet, so this run is the
    // mount pass — which fires BEFORE the hydrate effect's setMessages lands.
    // Writing here would overwrite the saved transcript with a bare greeting
    // and lose the consultation on every reload.
    if (messages === INITIAL_MESSAGES) return;
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ v: 1, messages, caseSheet, updatedAt: Date.now() })
      );
    } catch (e) {
      console.warn("Could not persist session:", e);
    }
  }, [messages, caseSheet]);

  useEffect(() => { isAvatarTalkingRef.current = isAvatarTalking; }, [isAvatarTalking]);
  useEffect(() => { isVoiceCallActiveRef.current = isVoiceCallActive; }, [isVoiceCallActive]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { voiceLangRef.current = voiceLang; }, [voiceLang]);
  useEffect(() => { sttEngineRef.current = sttEngine; }, [sttEngine]);

  const checkColabConnection = useCallback(async (url) => {
    try {
      const cleanUrl = sanitizeBackendUrl(url);
      const res = await fetch(`${cleanUrl}/health`, { method: "GET" });
      const data = await res.json();
      if (data.status === "online" || data.status === "ok") {
        setColabConnected(true);
        setColabUrl(cleanUrl);
        localStorage.setItem("amar_doctor_colab_url", cleanUrl);
        // The capability handshake. Never claim GPU lip-sync on anything
        // weaker than the backend explicitly reporting a live engine.
        const engine = data.lipsync?.live ? "musetalk" : "fallback";
        setVideoEngine(engine);
        videoEngineRef.current = engine;
        setLipsyncReason(data.lipsync?.reason || null);
        return true;
      }
    } catch {
      setColabConnected(false);
      setVideoEngine(null);
      videoEngineRef.current = null;
    }
    return false;
  }, []);

  // Initialize audio stream player and test local/saved backend on mount
  useEffect(() => {
    streamPlayerRef.current = new AudioStreamPlayer();
    
    streamPlayerRef.current.onPlayStart = () => {
      setIsAvatarTalking(true);
      setCallStatusText("🔊 AI Doctor is speaking...");
      // The mic/recognizer stays fully active while the AI talks — that's
      // what makes barge-in possible (see interruptAiTurn below).
    };

    streamPlayerRef.current.onPlayEnd = () => {
      setIsAvatarTalking(false);
      isProcessingRef.current = false;
      // The per-message "Listen" button plays through this same queue.
      setSpeakingMsgId(null);
      setCallStatusText("🎧 Listening to your voice... Speak now.");
    };

    if (typeof window !== "undefined") {
      const savedUrl = localStorage.getItem("amar_doctor_colab_url") || "http://localhost:8000";
      const cleanSaved = sanitizeBackendUrl(savedUrl);
      setColabUrl(cleanSaved);
      checkColabConnection(cleanSaved);
    }

    return () => {
      if (voiceWsRef.current) voiceWsRef.current.close();
      if (whisperWsRef.current) whisperWsRef.current.close();
      if (vadRef.current) { try { vadRef.current.destroy(); } catch {} }
      // Without this the recognizer keeps its own mic capture open and keeps
      // auto-restarting itself after the page is gone.
      if (webSpeechRef.current) { try { webSpeechRef.current.destroy(); } catch {} }
      if (mediaStreamRef.current) {
        try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      }
      // A camera track left running keeps the hardware indicator lit long
      // after the page is gone.
      if (selfViewStreamRef.current) {
        try { selfViewStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      }
      if (streamPlayerRef.current) streamPlayerRef.current.stop();
    };
  }, []);

  // Call duration timer — video mode shows it, like any call client.
  // The counter is reset when a call starts, not here: resetting inside the
  // effect would be a synchronous setState on every call teardown.
  useEffect(() => {
    if (!isVoiceCallActive) return;
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isVoiceCallActive]);

  // Main interactive voice query handler — called the moment a full
  // utterance is detected (the VAD's onSpeechEnd), never from a
  // client-guessed silence timer.
  const handleInteractiveVoiceInput = useCallback(async (transcriptText) => {
    if (!transcriptText || !transcriptText.trim()) return;
    const cleanText = transcriptText.trim();

    const last = lastProcessedSpeechRef.current;
    const now = Date.now();
    // Dedupe only within a short window so a genuinely repeated utterance
    // later in the call still goes through.
    if (last.text === cleanText && now - last.at < 3000) return;
    if (isProcessingRef.current) return;

    lastProcessedSpeechRef.current = { text: cleanText, at: now };
    isProcessingRef.current = true;
    setLiveTranscript("");
    latestSpeechRef.current = "";

    const myTurn = ++activeTurnIdRef.current;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: cleanText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    appendMessage(userMsg);
    setIsTyping(true);
    setCallStatusText("🩺 AI Doctor is thinking...");

    // 1. Try WebSocket streaming if backend is connected
    if (colabConnected && colabUrl) {
      try {
        const wsUrl = buildWsUrl(colabUrl, "/ws/voice-call");

        if (!voiceWsRef.current || voiceWsRef.current.readyState !== WebSocket.OPEN) {
          voiceWsRef.current = new WebSocket(wsUrl);
        }

        const ws = voiceWsRef.current;

        const sendPayload = () => {
          ws.send(
            JSON.stringify({
              message: cleanText,
              voice: selectedVoice,
              history: buildHistory(),
              case_sheet: caseSheetRef.current,
              // Only ask for rendered video when we are in video mode AND the
              // backend confirmed a live engine — otherwise every phrase would
              // wait out a render timeout before falling back to audio.
              want_video: modeRef.current === "video" && videoEngineRef.current === "musetalk",
            })
          );
        };

        if (ws.readyState === WebSocket.OPEN) {
          sendPayload();
        } else {
          ws.onopen = sendPayload;
        }

        ws.onmessage = (event) => {
          // Drop messages belonging to a turn the user has since interrupted.
          if (activeTurnIdRef.current !== myTurn) return;
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "audio_chunk" && payload.audio_base64) {
              if (streamPlayerRef.current) {
                streamPlayerRef.current.addChunk(payload.audio_base64);
              }
            } else if (payload.type === "av_chunk" && payload.video_url) {
              // A lip-synced clip. The mp4 carries its own audio, so it does
              // NOT go through AudioStreamPlayer — two players cannot be kept
              // in sync across Chrome's separate media clocks.
              avatarRef.current?.enqueueClip({
                url: sanitizeBackendUrl(colabUrl) + payload.video_url,
                seq: payload.seq,
                phrase: payload.phrase,
                durationMs: payload.duration_ms,
              });
            } else if (payload.type === "response_complete") {
              appendMessage({
                id: `ai-${Date.now()}`,
                role: "ai",
                content: payload.full_text,
                time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              });
              applyCaseSheet(payload.case_sheet);
              setDegradedReason(payload.degraded ? payload.degraded_reason : null);
              setIsTyping(false);
            }
          } catch (e) {
            console.warn("WS message parse error:", e);
          }
        };

        ws.onerror = (err) => {
          if (activeTurnIdRef.current !== myTurn) return;
          console.warn("Voice WS error, fallback to REST API:", err);
          fallbackRestCall(cleanText);
        };

        return;
      } catch (wsErr) {
        console.warn("WS setup failed, fallback to REST:", wsErr);
      }
    }

    // 2. Fallback REST API
    await fallbackRestCall(cleanText);
    // messagesRef removes the need for `messages` here — depending on it
    // rebuilt this handler every single turn.
  }, [colabConnected, colabUrl, selectedVoice]);

  useEffect(() => { handleTurnRef.current = handleInteractiveVoiceInput; }, [handleInteractiveVoiceInput]);

  const fallbackRestCall = async (transcriptText) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: transcriptText,
          history: buildHistory(),
          case_sheet: caseSheetRef.current,
        }),
      });
      const data = await res.json();
      const aiReplyText = data.reply || "আমি আপনার লক্ষণ বুঝতে পেরেছি। পর্যাপ্ত পানি ও খাবার স্যালাইন গ্রহণ করুন।";

      const aiMsg = {
        id: `ai-${Date.now()}`,
        role: "ai",
        content: aiReplyText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      appendMessage(aiMsg);
      applyCaseSheet(data.case_sheet);
      setDegradedReason(data.degraded ? data.degraded_reason : null);
      speakMessage(aiMsg.id, aiReplyText);
    } catch {
      console.warn("Rest call failed");
    } finally {
      setIsTyping(false);
    }
  };

  // ─── Barge-in ───────────────────────────────────────────
  // Called the instant the user starts speaking again, whether the AI is
  // mid-sentence or still "thinking". Cuts AI audio immediately and bumps
  // the turn-id so any late-arriving WS messages for the interrupted turn
  // are ignored (see the activeTurnIdRef check in handleInteractiveVoiceInput).
  const interruptAiTurn = useCallback(() => {
    if (!isAvatarTalkingRef.current && !isProcessingRef.current) return;
    activeTurnIdRef.current += 1;
    if (streamPlayerRef.current) streamPlayerRef.current.stop(); // -> onPlayEnd flips isAvatarTalking false
    // In video mode the audio lives inside the mp4, so stopping the audio
    // player alone leaves the doctor talking over the patient.
    avatarRef.current?.flush();
    if (voiceWsRef.current) {
      try { voiceWsRef.current.close(); } catch {}
      voiceWsRef.current = null;
    }
    isProcessingRef.current = false;
    setIsTyping(false);
    setCallStatusText("🎧 Listening...");
  }, []);

  // ─── Whisper/VAD speech-to-text (the only STT engine — no browser Web
  // Speech API is used, so audio never leaves this app's own backend) ─────
  // Real utterance-level VAD segmentation (lib/vadSegmenter.js) replaces
  // fixed-interval slicing — the backend only ever transcribes genuine
  // speech, and speech-start/speech-end give real barge-in and turn-end
  // signals instead of a client-guessed silence timer.
  const startVadListening = useCallback(async (stream, lang) => {
    const cleanBackendUrl = sanitizeBackendUrl(colabUrl);
    const wsUrl = buildWsUrl(colabUrl, "/ws/transcribe");
    const LISTENING_STATUS = lang === "en" ? "🎤 Listening (on-device recognition)..." : "🎤 Listening (on-device Bengali recognition)...";

    if (whisperWsRef.current) {
      try { whisperWsRef.current.close(); } catch {}
    }

    // Whisper's classic silence/noise hallucination artifacts — filtered
    // client-side as a last line of defense on top of the backend's own
    // no_speech_prob/avg_logprob filtering. Shared by both the WS and HTTP
    // transcription paths below.
    const HALLUCINATION_PATTERNS = [/^ধন্যবাদ\.?$/i, /^thank you\.?$/i, /^subtitle/i, /^উপস্থাপনা/i];

    const applyTranscript = (text) => {
      const clean = (text || "").trim();
      // Whatever the outcome, this utterance's request is no longer in
      // flight — reset the status text so the UI never looks stuck on
      // "Transcribing..." forever (e.g. when the backend correctly returns
      // an empty transcript for silence/noise).
      setCallStatusText(LISTENING_STATUS);
      if (!clean || clean.length < 2) return;
      if (HALLUCINATION_PATTERNS.some((re) => re.test(clean))) return;
      latestSpeechRef.current = clean;
      setLiveTranscript(clean);
      handleTurnRef.current?.(clean);
    };

    try {
      const ws = new WebSocket(wsUrl);
      whisperWsRef.current = ws;
      ws.onopen = () => setCallStatusText("🎤 On-device recognition connected...");
      ws.onerror = () => setCallStatusText(LISTENING_STATUS);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "transcript") {
            applyTranscript(msg.text);
          } else if (msg.type === "empty") {
            setCallStatusText(LISTENING_STATUS);
          } else if (msg.type === "error") {
            console.warn("Whisper WS error message:", msg.error);
            setCallStatusText(LISTENING_STATUS);
          }
        } catch (e) {
          console.warn("Whisper msg parse error:", e);
          setCallStatusText(LISTENING_STATUS);
        }
      };
    } catch (wsInitErr) {
      console.warn("Whisper WebSocket init failed:", wsInitErr);
    }

    const { createVadSegmenter } = await import("@/lib/vadSegmenter");
    const { encodeWavBase64 } = await import("@/lib/wavEncoder");

    const sendUtterance = async (audioData, meta) => {
      let base64;
      let format;
      if (meta.format === "pcm16k") {
        if (audioData.length < 400 * 16) return; // shorter than ~400ms, ignore
        base64 = encodeWavBase64(audioData, 16000);
        format = "wav";
      } else {
        if (audioData.size < 800) return;
        base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
          reader.readAsDataURL(audioData);
        });
        format = "webm";
      }

      if (whisperWsRef.current && whisperWsRef.current.readyState === WebSocket.OPEN) {
        whisperWsRef.current.send(JSON.stringify({ audio: base64, lang, format }));
        setCallStatusText("🧠 Transcribing...");
        return;
      }

      try {
        setCallStatusText("🧠 Transcribing via HTTP...");
        const httpRes = await fetch(`${cleanBackendUrl}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_base64: base64, lang, format }),
        });
        const data = await httpRes.json();
        if (data.success) {
          applyTranscript(data.transcript);
        } else {
          console.warn("HTTP transcribe failed:", data.error);
          setCallStatusText(LISTENING_STATUS);
        }
      } catch (httpErr) {
        console.warn("HTTP Transcribe fallback error:", httpErr);
        setCallStatusText(LISTENING_STATUS);
      }
    };

    const vad = await createVadSegmenter({
      stream,
      onSpeechStart: () => {
        setLiveTranscript("");
        interruptAiTurn();
      },
      onSpeechEnd: (audioData, meta) => sendUtterance(audioData, meta),
      onError: (err) => console.warn("VAD error:", err),
    });

    vadRef.current = vad;
    setIsListening(true);
    setCallStatusText(LISTENING_STATUS + (vad.engine === "energy" ? " (basic mode)" : ""));
  }, [colabUrl, interruptAiTurn]);

  // ─── Chrome Web Speech API (the A/B alternative to Whisper) ──────────
  // Unlike the Whisper path there is no VAD and no audio upload of our own:
  // Chrome captures the mic itself, does its own endpointing, and streams
  // the audio to Google. We only consume the events.
  //
  // `drivesConversation` is what separates the two modes that use this:
  // in "webspeech" it feeds the AI turn, in "both" it is display-only so
  // Whisper stays in charge of the actual consultation.
  const startWebSpeech = useCallback(
    async (langTag, { drivesConversation }) => {
      const { createWebSpeechRecognizer, isWebSpeechSupported } = await import(
        "@/lib/webSpeechRecognizer"
      );

      if (!isWebSpeechSupported()) {
        setWebSpeechError("unsupported");
        if (drivesConversation) {
          setCallStatusText("⚠️ Web Speech needs Chrome or Edge — switch to Whisper.");
        }
        return null;
      }

      if (webSpeechRef.current) {
        try { webSpeechRef.current.destroy(); } catch {}
        webSpeechRef.current = null;
      }

      setWebSpeechError(null);
      setWebSpeechTranscript("");

      try {
        const recognizer = createWebSpeechRecognizer({
          lang: langTag,
          onSpeechStart: () => {
            // Only the engine actually running the call gets to cut the AI
            // off; in "both" mode Whisper's own VAD owns barge-in, and two
            // engines racing to interrupt would double-fire it.
            if (!drivesConversation) return;
            setLiveTranscript("");
            interruptAiTurn();
          },
          onInterim: (text) => {
            setWebSpeechTranscript(text);
            if (drivesConversation) setLiveTranscript(text);
          },
          onFinal: (text) => {
            setWebSpeechTranscript(text);
            if (!drivesConversation) return;
            setLiveTranscript(text);
            latestSpeechRef.current = text;
            handleTurnRef.current?.(text);
          },
          onError: (err) => {
            console.warn("Web Speech:", err);
            setWebSpeechError(err?.reason || "error");
            // `network` is the one worth calling out: Chrome's recognizer is
            // a cloud service, so it simply stops working offline — which is
            // exactly the situation this app is otherwise built to survive.
            if (drivesConversation && err?.reason === "network") {
              setCallStatusText("⚠️ Web Speech is offline (needs internet) — switch to Whisper.");
            }
          },
        });

        webSpeechRef.current = recognizer;
        if (drivesConversation) {
          setIsListening(true);
          setCallStatusText(`🎤 Listening via Google Web Speech (${langTag})...`);
        }
        return recognizer;
      } catch (err) {
        console.warn("Web Speech init failed:", err);
        setWebSpeechError("init_failed");
        return null;
      }
    },
    [interruptAiTurn]
  );

  const stopWebSpeech = useCallback(() => {
    if (webSpeechRef.current) {
      try { webSpeechRef.current.destroy(); } catch {}
      webSpeechRef.current = null;
    }
    setWebSpeechTranscript("");
  }, []);

  // ─── Patient self-view camera ───────────────────────────────────────
  // Acquired as its own stream, separate from the mic. The mic stream is
  // already bound into MicVAD (lib/vadSegmenter.js), and re-requesting it
  // together with video would re-prompt and restart the recognizer.
  // The feed is a LOCAL PREVIEW ONLY — it is never sent anywhere.
  const acquireCamera = useCallback(async () => {
    if (selfViewStreamRef.current) return selfViewStreamRef.current;
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      selfViewStreamRef.current = cam;
      setSelfViewStream(cam);
      setSelfViewError(null);
      return cam;
    } catch (err) {
      // A refused camera must never abort the consultation — the call keeps
      // working, it just has no self-view.
      console.warn("Camera unavailable, continuing without self-view:", err);
      setSelfViewError(err?.name || "unavailable");
      setSelfViewStream(null);
      return null;
    }
  }, []);

  const releaseCamera = useCallback(() => {
    if (selfViewStreamRef.current) {
      try { selfViewStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      selfViewStreamRef.current = null;
    }
    setSelfViewStream(null);
  }, []);

  const startVoiceCall = async () => {
    if (streamPlayerRef.current) streamPlayerRef.current.init();
    // Consume the click that got us here: generated clips play unmuted, and
    // without a used gesture the first play() is rejected silently.
    avatarRef.current?.unlockAutoplay();

    setIsVoiceCallActive(true);
    isVoiceCallActiveRef.current = true;
    setCallSeconds(0);
    setLiveTranscript("");
    latestSpeechRef.current = "";
    lastProcessedSpeechRef.current = { text: "", at: 0 };
    isProcessingRef.current = false;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // echoCancellation stays on — AI replies play out of the speakers and
        // would otherwise be re-captured, breaking barge-in. noiseSuppression
        // and autoGainControl are off on purpose: both are tuned to make
        // speech pleasant for a human listener, and both work by gating or
        // rescaling low-energy audio, which is exactly the soft word-initial
        // sounds Whisper needs. Whisper is trained on noisy audio and copes
        // with room noise far better than with the spectral artifacts a
        // denoiser leaves behind.
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
    } catch (micErr) {
      alert("Microphone permission required for voice calls: " + micErr.message);
      setIsVoiceCallActive(false);
      isVoiceCallActiveRef.current = false;
      return;
    }
    mediaStreamRef.current = stream;
    setMicMuted(false);

    if (modeRef.current === "video") {
      await acquireCamera();
    }

    const engine = sttEngineRef.current;
    const langTag = voiceLang === "en-US" ? "en-US" : "bn-BD";

    // Whisper drives the call in "whisper" and "both"; Web Speech drives it
    // only when it is the sole engine.
    if (engine === "whisper" || engine === "both") {
      setCallStatusText("🎤 Starting on-device recognition...");
      await startVadListening(stream, voiceLang === "en-US" ? "en" : "bn");
    }
    if (engine === "webspeech" || engine === "both") {
      await startWebSpeech(langTag, { drivesConversation: engine === "webspeech" });
    }
  };

  const stopVoiceCall = () => {
    setIsVoiceCallActive(false);
    isVoiceCallActiveRef.current = false;
    setIsListening(false);
    isProcessingRef.current = false;
    activeTurnIdRef.current += 1;
    setCallStatusText("Call ended");
    setLiveTranscript("");
    latestSpeechRef.current = "";
    lastProcessedSpeechRef.current = { text: "", at: 0 };

    if (vadRef.current) {
      try { vadRef.current.destroy(); } catch {}
      vadRef.current = null;
    }
    stopWebSpeech();
    if (mediaStreamRef.current) {
      try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      mediaStreamRef.current = null;
    }
    if (whisperWsRef.current) {
      try { whisperWsRef.current.close(); } catch {}
      whisperWsRef.current = null;
    }
    if (voiceWsRef.current) {
      try { voiceWsRef.current.close(); } catch {}
      voiceWsRef.current = null;
    }

    if (streamPlayerRef.current) streamPlayerRef.current.stop();
    avatarRef.current?.flush();
    releaseCamera();
    setIsAvatarTalking(false);
  };

  // Text-mode one-shot dictation — records exactly one VAD-detected
  // utterance, transcribes it via the same Whisper backend, and populates
  // the input field. Manual Send press is still required (unchanged
  // behavior); this only replaces how the input field gets filled in.
  const stopTextDictation = () => {
    setIsListening(false);
    if (vadRef.current) {
      try { vadRef.current.destroy(); } catch {}
      vadRef.current = null;
    }
    if (mediaStreamRef.current) {
      try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      mediaStreamRef.current = null;
    }
  };

  const startTextDictation = async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // echoCancellation stays on — AI replies play out of the speakers and
        // would otherwise be re-captured, breaking barge-in. noiseSuppression
        // and autoGainControl are off on purpose: both are tuned to make
        // speech pleasant for a human listener, and both work by gating or
        // rescaling low-energy audio, which is exactly the soft word-initial
        // sounds Whisper needs. Whisper is trained on noisy audio and copes
        // with room noise far better than with the spectral artifacts a
        // denoiser leaves behind.
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      alert("Microphone permission required for voice dictation: " + err.message);
      return;
    }
    mediaStreamRef.current = stream;
    setIsListening(true);

    const lang = voiceLang === "en-US" ? "en" : "bn";
    const cleanBackendUrl = sanitizeBackendUrl(colabUrl);

    const { createVadSegmenter } = await import("@/lib/vadSegmenter");
    const { encodeWavBase64 } = await import("@/lib/wavEncoder");

    const vad = await createVadSegmenter({
      stream,
      onSpeechStart: () => {},
      onSpeechEnd: async (audioData, meta) => {
        let base64;
        let format;
        if (meta.format === "pcm16k") {
          if (audioData.length < 400 * 16) { stopTextDictation(); return; }
          base64 = encodeWavBase64(audioData, 16000);
          format = "wav";
        } else {
          if (audioData.size < 800) { stopTextDictation(); return; }
          base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
            reader.readAsDataURL(audioData);
          });
          format = "webm";
        }

        try {
          const res = await fetch(`${cleanBackendUrl}/api/transcribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio_base64: base64, lang, format }),
          });
          const data = await res.json();
          if (data.success && data.transcript && data.transcript.trim()) {
            setInput(data.transcript.trim());
          }
        } catch (err) {
          console.warn("Dictation transcribe error:", err);
        } finally {
          stopTextDictation();
        }
      },
      onError: () => stopTextDictation(),
    });

    vadRef.current = vad;
  };

  const toggleListening = () => {
    if (mode !== "text") {
      if (isVoiceCallActive) {
        stopVoiceCall();
      } else {
        startVoiceCall();
      }
      return;
    }

    if (isListening) {
      stopTextDictation();
      return;
    }
    startTextDictation();
  };

  // All neural audio goes through the one AudioStreamPlayer, so it is routed
  // through the analyser and the avatar's mouth follows it. A separate
  // <audio> element here would play fine but leave the face motionless,
  // which is exactly the "it doesn't feel like a doctor" failure.
  // isAvatarTalking is set by the player's own onPlayStart/onPlayEnd.
  const playNeuralAudio = (audioBase64) => {
    if (!streamPlayerRef.current) return;
    streamPlayerRef.current.init();
    streamPlayerRef.current.addChunk(audioBase64);
  };

  const speakMessage = async (msgId, text) => {
    if (colabConnected && colabUrl) {
      try {
        setSpeakingMsgId(msgId);
        setIsAvatarTalking(true);
        const cleanUrl = sanitizeBackendUrl(colabUrl);
        const res = await fetch(`${cleanUrl}/api/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: selectedVoice }),
        });
        const data = await res.json();
        if (data.audio_base64) {
          playNeuralAudio(data.audio_base64);
          return;
        }
      } catch (err) {
        console.warn("Colab TTS failed, fallback to browser speech:", err);
      }
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      setIsAvatarTalking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.lang = voiceLang;

    utterance.onstart = () => {
      setSpeakingMsgId(msgId);
      setIsAvatarTalking(true);
    };

    utterance.onend = () => {
      setSpeakingMsgId(null);
      setIsAvatarTalking(false);
    };

    utterance.onerror = () => {
      setSpeakingMsgId(null);
      setIsAvatarTalking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    appendMessage(userMsg);
    setInput("");
    setIsTyping(true);

    try {
      let aiReplyText = "";
      let neuralAudioB64 = null;
      let nextSheet = null;
      let nextDegraded = null;

      if (colabConnected && colabUrl) {
        try {
          const cleanUrl = sanitizeBackendUrl(colabUrl);
          const colabRes = await fetch(`${cleanUrl}/api/chat-consultation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: text,
              voice: selectedVoice,
              mode: mode,
              history: buildHistory(),
              case_sheet: caseSheetRef.current,
            }),
          });
          const colabData = await colabRes.json();
          // A degraded reply is a canned string, not an answer — let it fall
          // through to the Next.js route, which may still have a working key.
          if (!colabData.degraded) {
            aiReplyText = colabData.reply;
            neuralAudioB64 = colabData.audio_base64;
            nextSheet = colabData.case_sheet;
          } else {
            console.warn("Backend degraded:", colabData.degraded_reason);
          }
        } catch (colabErr) {
          console.warn("Colab API error, fallback to Next.js API:", colabErr);
        }
      }

      if (!aiReplyText) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history: buildHistory(),
            case_sheet: caseSheetRef.current,
          }),
        });
        const data = await res.json();
        aiReplyText = data.reply || "I'm sorry, I couldn't process that. Please try again.";
        nextSheet = data.case_sheet;
        nextDegraded = data.degraded ? data.degraded_reason : null;
      }

      applyCaseSheet(nextSheet);
      setDegradedReason(nextDegraded);

      const aiMsg = {
        id: `ai-${Date.now()}`,
        role: "ai",
        content: aiReplyText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      appendMessage(aiMsg);

      if (mode === "audio" || mode === "video") {
        if (neuralAudioB64) {
          playNeuralAudio(neuralAudioB64);
        } else {
          speakMessage(aiMsg.id, aiReplyText);
        }
      }
    } catch {
      const errMsg = {
        id: `ai-err-${Date.now()}`,
        role: "ai",
        content: "Sorry, there was an error connecting to the AI service. Please check your connection.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      appendMessage(errMsg);
    } finally {
      setIsTyping(false);
    }
  };

  const startNewConsultation = () => {
    if (voiceWsRef.current) {
      try { voiceWsRef.current.close(); } catch {}
      voiceWsRef.current = null;
    }
    messagesRef.current = INITIAL_MESSAGES;
    caseSheetRef.current = null;
    setMessages(INITIAL_MESSAGES);
    setCaseSheet(null);
    setDegradedReason(null);
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <Navbar />
      <div className="chat-page" id="chat-page">
        {/* Chat Header */}
        <div className="chat-header">
          <div className="chat-header__avatar">🩺</div>
          <div className="chat-header__info">
            <div className="chat-header__name">AI Doctor — এআই ডাক্তার</div>
            <div className="chat-header__status">
              <span className="dot"></span> 24/7 Live · Bengali & English Neural Voice & Video Call
            </div>
          </div>

          {/* Colab Connection Indicator */}
          <button
            className="btn-ghost"
            onClick={() => setShowColabModal(true)}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              borderColor: colabConnected ? "#34ed7b" : "rgba(106, 228, 255, 0.4)",
              color: colabConnected ? "#34ed7b" : "var(--color-fog-gray)",
            }}
            id="colab-settings-btn"
          >
            {colabConnected ? "⚡ Backend Connected" : "🔌 Connect Backend (Colab/Local)"}
          </button>

          <button
            className="btn-ghost"
            onClick={startNewConsultation}
            style={{ padding: "4px 12px", fontSize: 11 }}
            id="new-consultation-btn"
            title="Clear this consultation and start fresh"
          >
            🔄 New
          </button>

          {/* Mode Toggle (Text / Audio Call / Video Call) */}
          <div className="chat-mode-toggle">
            <button
              className={`chat-mode-btn ${mode === "text" ? "active" : ""}`}
              onClick={() => {
                setMode("text");
                stopVoiceCall();
              }}
            >
              💬 Text
            </button>
            <button
              className={`chat-mode-btn ${mode === "audio" ? "active" : ""}`}
              onClick={() => {
                // Switching between call modes must not tear down a live
                // call — only the camera comes and goes.
                setMode("audio");
                modeRef.current = "audio";
                releaseCamera();
                avatarRef.current?.flush();
              }}
            >
              🎙️ Voice Call
            </button>
            <button
              className={`chat-mode-btn ${mode === "video" ? "active" : ""}`}
              onClick={() => {
                setMode("video");
                modeRef.current = "video";
                avatarRef.current?.unlockAutoplay();
                if (isVoiceCallActiveRef.current) acquireCamera();
              }}
            >
              📹 Video Call
            </button>
          </div>
        </div>

        {degradedReason && (
          <div
            style={{
              padding: "8px 16px",
              background: "rgba(255, 176, 32, 0.12)",
              borderBottom: "1px solid rgba(255, 176, 32, 0.4)",
              color: "#ffb020",
              fontSize: 12,
            }}
            id="degraded-banner"
          >
            {degradedReason === "no_api_key"
              ? "⚠️ Demo mode — no GROQ_API_KEY configured. Replies are canned and ignore your symptoms. Add the key to .env.local and restart both servers."
              : degradedReason === "rate_limited"
              ? "⏳ Groq rate limit reached (free tier allows 8,000 tokens/minute). Wait about a minute and try again — your consultation is not lost."
              : `⚠️ AI service unavailable (${degradedReason}) — replies are not from the AI model.`}
          </div>
        )}

        {/* Interactive Video / Audio Call Stage Area */}
        {mode !== "text" && (
          <div
            style={{
              background: "var(--color-tide-card)",
              borderBottom: "1px solid var(--color-carbon-black)",
              padding: "24px 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "32px",
              flexWrap: "wrap",
            }}
          >
            <VideoAvatar
              ref={avatarRef}
              isTalking={isAvatarTalking || isClipTalking}
              engine={videoEngine}
              mode={mode}
              playerRef={streamPlayerRef}
              selfViewStream={selfViewStream}
              selfViewError={selfViewError}
              callActive={isVoiceCallActive}
              onTalkingChange={setIsClipTalking}
            />

            <div style={{ maxWidth: 460, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {/* Says what is actually rendering the face, not what we wish were. */}
                <span
                  className="badge"
                  style={{
                    fontSize: 11,
                    background:
                      mode === "video" && videoEngine !== "musetalk"
                        ? "rgba(255, 176, 32, 0.15)"
                        : "rgba(52, 237, 123, 0.18)",
                    color: mode === "video" && videoEngine !== "musetalk" ? "#ffb020" : "#34ed7b",
                  }}
                  title={
                    mode === "video" && videoEngine !== "musetalk"
                      ? `GPU lip-sync unavailable${lipsyncReason ? ` (${lipsyncReason})` : ""} — the avatar is following the voice waveform instead.`
                      : "Rendering engine confirmed live by the backend"
                  }
                >
                  {mode === "video"
                    ? videoEngine === "musetalk"
                      ? "📹 MuseTalk Lip-Sync (local GPU)"
                      : "📹 Audio-reactive avatar"
                    : "🎙️ Edge-TTS Streaming Voice"}
                </span>
                {mode === "video" && isVoiceCallActive && (
                  <span
                    suppressHydrationWarning
                    className="badge"
                    style={{ background: "rgba(255,255,255,0.08)", color: "var(--color-bone-white)", fontSize: 10, fontVariantNumeric: "tabular-nums" }}
                  >
                    ⏱ {String(Math.floor(callSeconds / 60)).padStart(2, "0")}:
                    {String(callSeconds % 60).padStart(2, "0")}
                  </span>
                )}
                {isVoiceCallActive ? (
                  <span className="badge" style={{ background: "rgba(52, 237, 123, 0.2)", color: "#34ed7b", fontSize: 10 }}>
                    ● Call In Progress
                  </span>
                ) : (
                  <span className="badge" style={{ background: "rgba(255, 71, 87, 0.15)", color: "var(--color-sos-red)", fontSize: 10 }}>
                    ○ Call Inactive
                  </span>
                )}
                {isVoiceCallActive && (
                  <span
                    className="badge"
                    style={{
                      background: "rgba(255, 255, 255, 0.06)",
                      color: STT_ENGINE_META[sttEngine].color,
                      fontSize: 10,
                      border: `1px solid ${STT_ENGINE_META[sttEngine].border}`,
                    }}
                    title={STT_ENGINE_META[sttEngine].hint}
                  >
                    {STT_ENGINE_META[sttEngine].badge}
                  </span>
                )}
              </div>

              <h3 className="text-body-sm" style={{ fontWeight: 700, color: "var(--color-bone-white)", marginBottom: 4, fontSize: 17 }}>
                {mode === "video" ? "Live AI Doctor Video Consultation" : "Interactive Neural Voice Call"}
              </h3>
              <p className="text-caption" style={{ color: "var(--color-spectral-cyan)", fontWeight: 600, marginBottom: 12 }}>
                {callStatusText}
              </p>

              {/* Live transcript indicator when speaking into microphone */}
              {liveTranscript && (
                <div
                  style={{
                    background: "rgba(106, 228, 255, 0.08)",
                    border: "1px solid rgba(106, 228, 255, 0.3)",
                    borderRadius: "var(--radius-cards)",
                    padding: "10px 14px",
                    marginBottom: 16,
                    fontSize: 13,
                    color: "var(--color-bone-white)",
                  }}
                >
                  <span style={{ color: "var(--color-spectral-cyan)", fontWeight: 700 }}>
                    🗣️ You{sttEngine === "both" ? " (Whisper)" : ""}:{" "}
                  </span>
                  {liveTranscript}
                </div>
              )}

              {/* A/B strip: what Google heard for the same utterance. Only in
                  "both" mode — in "webspeech" mode its text already IS the
                  live transcript above, so showing it twice is just noise. */}
              {sttEngine === "both" && isVoiceCallActive && (
                <div
                  style={{
                    background: "rgba(192, 132, 252, 0.08)",
                    border: "1px solid rgba(192, 132, 252, 0.3)",
                    borderRadius: "var(--radius-cards)",
                    padding: "10px 14px",
                    marginBottom: 16,
                    fontSize: 13,
                    color: "var(--color-bone-white)",
                  }}
                  id="webspeech-compare-strip"
                >
                  <span style={{ color: "#c084fc", fontWeight: 700 }}>☁️ Google heard: </span>
                  {webSpeechError
                    ? <span style={{ color: "#ffb020" }}>
                        {webSpeechError === "unsupported"
                          ? "not supported in this browser (Chrome/Edge only)"
                          : webSpeechError === "network"
                          ? "offline — Web Speech needs internet"
                          : `error: ${webSpeechError}`}
                      </span>
                    : webSpeechTranscript || <span className="text-muted">listening…</span>}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={toggleListening}
                  className={isVoiceCallActive ? "btn-sos" : "btn-primary"}
                  style={{ padding: "12px 28px", fontSize: 15, display: "flex", alignItems: "center", gap: 10 }}
                  id="interactive-call-btn"
                >
                  {isVoiceCallActive ? "⏹️ End Call (কল শেষ করুন)" : "📞 Start Live Call (কথা বলুন)"}
                </button>

                {/* In-call controls — video mode only */}
                {mode === "video" && isVoiceCallActive && (
                  <>
                    <button
                      className="btn-ghost"
                      style={{ padding: "10px 14px", fontSize: 13 }}
                      title={selfViewStream ? "Turn camera off" : "Turn camera on"}
                      id="camera-toggle-btn"
                      onClick={() => {
                        // Releasing the track (rather than just disabling it)
                        // actually turns the camera indicator off.
                        if (selfViewStream) {
                          releaseCamera();
                        } else {
                          acquireCamera();
                        }
                      }}
                    >
                      {selfViewStream ? "📷 Camera on" : "🚫 Camera off"}
                    </button>

                    <button
                      className="btn-ghost"
                      style={{ padding: "10px 14px", fontSize: 13 }}
                      title={micMuted ? "Unmute microphone" : "Mute microphone"}
                      id="mic-mute-btn"
                      onClick={() => {
                        const next = !micMuted;
                        setMicMuted(next);
                        try {
                          mediaStreamRef.current
                            ?.getAudioTracks()
                            .forEach((t) => { t.enabled = !next; });
                        } catch {}
                        // Web Speech captures the mic itself, so disabling
                        // OUR track above does nothing to it — a "muted" call
                        // would carry on being transcribed to Google. Pause
                        // the recognizer explicitly.
                        try {
                          if (next) webSpeechRef.current?.pause();
                          else webSpeechRef.current?.resume();
                        } catch {}
                      }}
                    >
                      {micMuted ? "🔇 Muted" : "🎙️ Mic on"}
                    </button>
                  </>
                )}
              </div>

              {mode === "video" && (
                <p className="text-caption text-muted" style={{ marginTop: 10, fontSize: 11 }}>
                  Your camera is a local preview only — it is never uploaded or sent to the AI.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Messages List */}
        <div className="chat-messages" id="chat-messages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message chat-message--${msg.role === "user" ? "user" : "ai"}`}
            >
              <div className="chat-message__avatar">
                {msg.role === "user" ? "👤" : "🩺"}
              </div>
              <div>
                <div className="chat-message__bubble">
                  {msg.content.split("\n").map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                  <div suppressHydrationWarning className="chat-message__time">
                    {msg.role === "ai" ? "AI Doctor" : "You"} · {msg.time}
                  </div>
                  {msg.role === "ai" && (
                    <button
                      onClick={() => speakMessage(msg.id, msg.content)}
                      style={{
                        background: "none",
                        border: "none",
                        color: speakingMsgId === msg.id ? "var(--color-spectral-cyan)" : "var(--color-fog-gray)",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 0,
                      }}
                      title="Listen with Voice (ভয়েস শুনুন)"
                    >
                      {speakingMsgId === msg.id ? "⏹️ Stop" : "🔊 Listen"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="chat-message chat-message--ai">
              <div className="chat-message__avatar">🩺</div>
              <div className="chat-message__bubble">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          {/* Offer a drone delivery once the AI has stopped gathering and formed
              an assessment. DroneDeliveryCTA derives the kit offline from this
              same case sheet and returns null on a red flag, so a chest-pain
              consultation gets the emergency path instead of a medicine button. */}
          <DroneDeliveryCTA source="ai_chat" caseSheet={caseSheet} />

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="chat-input-bar" id="chat-input-bar">
          <button
            className="btn-ghost"
            style={{ padding: "6px 10px", fontSize: 11, borderRadius: "var(--radius-badges)" }}
            onClick={() => setVoiceLang(voiceLang === "bn-BD" ? "en-US" : "bn-BD")}
            title="Switch Speech Language"
          >
            {voiceLang === "bn-BD" ? "বাংলা" : "ENG"}
          </button>

          {/* STT engine A/B toggle. Cycles Whisper -> Web Speech -> Both. */}
          <button
            className="btn-ghost"
            style={{
              padding: "6px 10px",
              fontSize: 11,
              borderRadius: "var(--radius-badges)",
              borderColor: STT_ENGINE_META[sttEngine].border,
              color: STT_ENGINE_META[sttEngine].color,
            }}
            onClick={() => {
              const order = ["whisper", "webspeech", "both"];
              const next = order[(order.indexOf(sttEngine) + 1) % order.length];
              setSttEngine(next);
              sttEngineRef.current = next;
              try { localStorage.setItem("amar_doctor_stt_engine", next); } catch {}
              // Switching engines mid-call would leave the old one running,
              // so make the change take effect on the next call instead of
              // half-applying it now.
              if (isVoiceCallActiveRef.current) {
                stopVoiceCall();
                setCallStatusText(`Speech engine → ${STT_ENGINE_META[next].label}. Press call to restart.`);
              }
            }}
            title={STT_ENGINE_META[sttEngine].hint}
            id="stt-engine-toggle"
          >
            {STT_ENGINE_META[sttEngine].short}
          </button>

          <button
            onClick={toggleListening}
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: isListening ? "2px solid var(--color-sos-red)" : "1px solid var(--color-carbon-black)",
              background: isListening ? "rgba(255, 71, 87, 0.2)" : "var(--color-abyss-navy)",
              color: isListening ? "var(--color-sos-red)" : "var(--color-spectral-cyan)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Voice input"
            title={isListening ? "Listening... Speak now" : "Speak to Doctor (মুখে বলুন)"}
            id="mic-button"
          >
            {isListening ? "🔴" : "🎙️"}
          </button>

          <input
            ref={inputRef}
            className="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening... বলুন..." : "আপনার লক্ষণ লিখুন বা বলুন... / Describe symptoms..."}
            disabled={isTyping}
            id="chat-input"
          />

          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            aria-label="Send message"
            id="chat-send-btn"
          >
            ➤
          </button>
        </div>
      </div>

      {/* Colab/Backend Configuration Modal */}
      {showColabModal && (
        <div className="sos-modal-overlay" onClick={() => setShowColabModal(false)}>
          <div className="sos-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500, textAlign: "left" }}>
            <h2 className="text-heading-sm" style={{ marginBottom: 8 }}>
              ⚡ Connect Backend / Edge-TTS Server
            </h2>
            <p className="text-body-sm text-muted" style={{ marginBottom: 16 }}>
              Connect your local server (<code>http://localhost:8000</code>) or Google Colab (<code>https://...trycloudflare.com</code>) to enable Edge-TTS Bengali neural voices and real-time streaming.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label className="text-caption text-muted" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Backend Server URL
              </label>
              <input
                type="text"
                className="chat-input"
                style={{ width: "100%", borderRadius: "var(--radius-cards)", padding: "10px 14px" }}
                placeholder="https://...trycloudflare.com or http://localhost:8000"
                value={colabUrl}
                onChange={(e) => setColabUrl(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="text-caption text-muted" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Neural Bengali Voice Model
              </label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "var(--radius-cards)",
                  background: "var(--color-abyss-navy)",
                  border: "1px solid var(--color-carbon-black)",
                  color: "var(--color-bone-white)",
                }}
              >
                <option value="bn-BD-NabanitaNeural">Nabanita (Female — প্রমিত বাংলা)</option>
                <option value="bn-BD-PradeepNeural">Pradeep (Male — গম্ভীর বাংলা)</option>
                <option value="en-US-JennyNeural">Jenny (English US)</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn-ghost" onClick={() => setShowColabModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={async () => {
                  const clean = sanitizeBackendUrl(colabUrl);
                  const ok = await checkColabConnection(clean);
                  if (ok) {
                    alert("✓ Successfully connected to Amar Doctor AI Backend!");
                    setShowColabModal(false);
                  } else {
                    alert("Could not reach backend at that URL. Please verify server is running on Colab or local port 8000.");
                  }
                }}
              >
                ✓ Test & Save Connection
              </button>
            </div>
          </div>
        </div>
      )}

      <SOSButton />
    </>
  );
}

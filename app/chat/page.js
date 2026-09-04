"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import SOSButton from "@/components/SOSButton";
import VideoAvatar from "@/components/VideoAvatar";
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

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);   // Web Speech SpeechRecognition (bn-BD or en-US)
  const mediaStreamRef = useRef(null);   // Live mic MediaStream (Whisper/VAD fallback tier only)
  const whisperWsRef = useRef(null);     // Whisper fallback WebSocket
  const vadRef = useRef(null);           // Active VAD segmenter handle (Whisper fallback tier)
  const audioPlayerRef = useRef(null);
  const streamPlayerRef = useRef(null);
  const voiceWsRef = useRef(null);
  const latestSpeechRef = useRef("");
  const lastProcessedSpeechRef = useRef({ text: "", at: 0 });
  const isProcessingRef = useRef(false);

  // Natural-conversation plumbing
  const handleTurnRef = useRef(null);        // always points at the latest handleInteractiveVoiceInput
  const activeTurnIdRef = useRef(0);         // turn-id guard: an interrupted turn's late WS messages
                                              // (audio_chunk/response_complete) are dropped once stale
  const sttEngineRef = useRef(null);         // "webspeech" | "whisper" — decided per call session
  const finalTranscriptRef = useRef("");     // accumulated isFinal chunks for the current utterance
  const endOfTurnTimerRef = useRef(null);    // armed ONLY by isFinal results (real endpointing)
  const webSpeechRetryRef = useRef(0);       // transient "network" error retry counter
  const recognitionStartedRef = useRef(false);
  const isAvatarTalkingRef = useRef(false);  // ref-mirrors so async/event callbacks never read stale state
  const isVoiceCallActiveRef = useRef(false);
  const modeRef = useRef("text");
  const voiceLangRef = useRef("bn-BD");

  const [sttEngine, setSttEngine] = useState(null); // UI badge: which STT engine is currently live

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, liveTranscript]);

  useEffect(() => { isAvatarTalkingRef.current = isAvatarTalking; }, [isAvatarTalking]);
  useEffect(() => { isVoiceCallActiveRef.current = isVoiceCallActive; }, [isVoiceCallActive]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { voiceLangRef.current = voiceLang; }, [voiceLang]);

  const checkColabConnection = useCallback(async (url) => {
    try {
      const cleanUrl = sanitizeBackendUrl(url);
      const res = await fetch(`${cleanUrl}/health`, { method: "GET" });
      const data = await res.json();
      if (data.status === "online" || data.status === "ok") {
        setColabConnected(true);
        setColabUrl(cleanUrl);
        localStorage.setItem("amar_doctor_colab_url", cleanUrl);
        return true;
      }
    } catch {
      setColabConnected(false);
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
      if (recognitionRef.current) {
        try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch {}
      }
      if (mediaStreamRef.current) {
        try { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      }
      if (streamPlayerRef.current) streamPlayerRef.current.stop();
      if (endOfTurnTimerRef.current) clearTimeout(endOfTurnTimerRef.current);
    };
  }, []);

  // Main interactive voice query handler — called the moment a full
  // utterance is detected (Web Speech's isFinal, or the VAD's onSpeechEnd),
  // never from a client-guessed silence timer.
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
    finalTranscriptRef.current = "";

    const myTurn = ++activeTurnIdRef.current;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: cleanText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
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
              history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
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
            } else if (payload.type === "response_complete") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `ai-${Date.now()}`,
                  role: "ai",
                  content: payload.full_text,
                  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                },
              ]);
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
  }, [colabConnected, colabUrl, selectedVoice, messages]);

  useEffect(() => { handleTurnRef.current = handleInteractiveVoiceInput; }, [handleInteractiveVoiceInput]);

  const fallbackRestCall = async (transcriptText) => {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: transcriptText,
          history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
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

      setMessages((prev) => [...prev, aiMsg]);
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
    if (voiceWsRef.current) {
      try { voiceWsRef.current.close(); } catch {}
      voiceWsRef.current = null;
    }
    isProcessingRef.current = false;
    setIsTyping(false);
    setCallStatusText("🎧 Listening...");
  }, []);

  const webSpeechAvailable = () =>
    typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ─── Whisper/VAD fallback tier ───────────────────────────
  // Only used when the browser has no Web Speech API, or it fails/is
  // unsupported for the requested language (see activateWhisperFallback).
  // Real utterance-level VAD segmentation (lib/vadSegmenter.js) replaces
  // the old fixed-interval slicing — the backend only ever sees genuine
  // speech, and speech-start/speech-end give real barge-in and turn-end
  // signals instead of a client-guessed silence timer.
  const startVadListening = useCallback(async (stream) => {
    const cleanBackendUrl = sanitizeBackendUrl(colabUrl);
    const wsUrl = buildWsUrl(colabUrl, "/ws/transcribe");
    const LISTENING_STATUS = "🎤 Listening (on-device Bengali recognition)...";

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
      handleTurnRef.current?.(clean);
    };

    try {
      const ws = new WebSocket(wsUrl);
      whisperWsRef.current = ws;
      ws.onopen = () => setCallStatusText("🎤 On-device Bengali recognition connected...");
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
        whisperWsRef.current.send(JSON.stringify({ audio: base64, lang: "bn", format }));
        setCallStatusText("🧠 Transcribing...");
        return;
      }

      try {
        setCallStatusText("🧠 Transcribing via HTTP...");
        const httpRes = await fetch(`${cleanBackendUrl}/api/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_base64: base64, lang: "bn", format }),
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
    setCallStatusText(
      `🎤 Listening (on-device Bengali recognition${vad.engine === "energy" ? ", basic mode" : ""})...`
    );
  }, [colabUrl, interruptAiTurn]);

  const activateWhisperFallback = useCallback(async () => {
    if (sttEngineRef.current === "whisper") return;
    sttEngineRef.current = "whisper";
    setSttEngine("whisper");

    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setCallStatusText("🎤 Switching to on-device Bengali recognition...");

    let stream = mediaStreamRef.current;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        mediaStreamRef.current = stream;
      } catch (err) {
        console.warn("Mic re-acquire for fallback recognition failed:", err);
        setCallStatusText("Microphone unavailable.");
        return;
      }
    }
    await startVadListening(stream);
  }, [startVadListening]);

  // ─── Web Speech API tier (primary — both Bengali and English) ───────────
  // Built imperatively (never inside a useEffect keyed on fast-changing
  // state like `messages`) so a mid-call re-render can never silently
  // orphan the recognizer instance that's actually running.
  const createRecognizer = useCallback((lang) => {
    if (typeof window === "undefined") return null;
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return null;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let interim = "";
      let gotFinal = false;
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += chunk;
          gotFinal = true;
        } else {
          interim += chunk;
        }
      }

      const displayText = (finalTranscriptRef.current + " " + interim).trim();
      if (displayText) {
        latestSpeechRef.current = displayText;
        setLiveTranscript(displayText);
        if (modeRef.current === "text") setInput(displayText);
      }

      if (modeRef.current !== "text" && isVoiceCallActiveRef.current) {
        interruptAiTurn();

        if (endOfTurnTimerRef.current) clearTimeout(endOfTurnTimerRef.current);
        if (gotFinal) {
          // Short debounce purely to coalesce multiple back-to-back finals
          // the engine sometimes emits for one sentence. Armed ONLY here
          // (never by interim results or by background noise), which is
          // the fix for calls that used to never submit — the old scheme
          // re-armed on *any* transcript event, including hallucinated or
          // noise-triggered ones, so it could never actually elapse.
          endOfTurnTimerRef.current = setTimeout(() => {
            const text = finalTranscriptRef.current.trim();
            finalTranscriptRef.current = "";
            if (text.length >= 2) handleTurnRef.current?.(text);
          }, 800);
        }
      }
    };

    recognition.onspeechstart = () => {
      if (modeRef.current !== "text" && isVoiceCallActiveRef.current) interruptAiTurn();
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition notice:", event.error);
      if (event.error === "not-allowed") {
        alert("Microphone permission was denied.");
        setIsVoiceCallActive(false);
        setIsListening(false);
        return;
      }
      if (!isVoiceCallActiveRef.current) return; // one-shot text-mode dictation: no fallback plumbing

      if (["language-not-supported", "service-not-allowed", "audio-capture"].includes(event.error)) {
        activateWhisperFallback();
        return;
      }
      if (event.error === "network") {
        webSpeechRetryRef.current += 1;
        if (webSpeechRetryRef.current > 2) activateWhisperFallback();
      }
    };

    recognition.onstart = () => {
      recognitionStartedRef.current = true;
      webSpeechRetryRef.current = 0;
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      if (isVoiceCallActiveRef.current && sttEngineRef.current === "webspeech") {
        try { recognition.start(); } catch {}
      }
    };

    return recognition;
  }, [interruptAiTurn, activateWhisperFallback]);

  const startWebSpeechListening = useCallback((lang) => {
    const recognition = createRecognizer(lang);
    if (!recognition) {
      activateWhisperFallback();
      return;
    }
    recognitionRef.current = recognition;
    recognitionStartedRef.current = false;
    try {
      recognition.start();
    } catch (e) {
      console.warn("Recognition start error:", e);
    }
    // If the engine never actually starts (some devices silently refuse an
    // unsupported locale instead of erroring), fall back after a timeout.
    setTimeout(() => {
      if (!recognitionStartedRef.current && isVoiceCallActiveRef.current && sttEngineRef.current === "webspeech") {
        activateWhisperFallback();
      }
    }, 3000);
  }, [createRecognizer, activateWhisperFallback]);

  const startVoiceCall = async () => {
    if (streamPlayerRef.current) streamPlayerRef.current.init();

    setIsVoiceCallActive(true);
    isVoiceCallActiveRef.current = true;
    setLiveTranscript("");
    latestSpeechRef.current = "";
    lastProcessedSpeechRef.current = { text: "", at: 0 };
    isProcessingRef.current = false;
    finalTranscriptRef.current = "";
    webSpeechRetryRef.current = 0;

    const lang = voiceLang;
    const useWebSpeech = webSpeechAvailable();
    sttEngineRef.current = useWebSpeech ? "webspeech" : "whisper";
    setSttEngine(sttEngineRef.current);

    if (useWebSpeech) {
      setCallStatusText(lang === "bn-BD" ? "🎧 বাংলায় শুনছি... এখন বলুন" : "🎧 Listening in English... Speak now.");
      startWebSpeechListening(lang);
      return;
    }

    // No Web Speech API at all in this browser (e.g. Firefox/Safari) — go
    // straight to the on-device Whisper/VAD tier.
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (micErr) {
      alert("Microphone permission required for voice calls: " + micErr.message);
      setIsVoiceCallActive(false);
      isVoiceCallActiveRef.current = false;
      return;
    }
    mediaStreamRef.current = stream;
    setCallStatusText("🎤 Starting on-device Bengali recognition...");
    await startVadListening(stream);
  };

  const stopVoiceCall = () => {
    setIsVoiceCallActive(false);
    isVoiceCallActiveRef.current = false;
    setIsListening(false);
    isProcessingRef.current = false;
    activeTurnIdRef.current += 1;
    sttEngineRef.current = null;
    setSttEngine(null);
    setCallStatusText("Call ended");
    setLiveTranscript("");
    latestSpeechRef.current = "";
    lastProcessedSpeechRef.current = { text: "", at: 0 };
    finalTranscriptRef.current = "";

    if (endOfTurnTimerRef.current) clearTimeout(endOfTurnTimerRef.current);

    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (vadRef.current) {
      try { vadRef.current.destroy(); } catch {}
      vadRef.current = null;
    }
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
    setIsAvatarTalking(false);
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

    // Text-mode one-shot dictation (either language) — populates the input
    // field only; manual Send press is still required (unchanged behavior).
    if (isListening) {
      if (recognitionRef.current) {
        try { recognitionRef.current.onend = null; recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    const recognition = createRecognizer(voiceLang);
    if (!recognition) {
      alert("Voice dictation isn't supported in this browser. Please type your message instead.");
      return;
    }
    recognition.continuous = false;
    recognitionRef.current = recognition;
    recognitionStartedRef.current = false;
    try {
      recognition.start();
    } catch (err) {
      console.warn("Recognition start err:", err);
    }
  };

  const playNeuralAudio = (audioBase64) => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }
    const player = audioPlayerRef.current;
    player.src = audioBase64;
    player.onplay = () => setIsAvatarTalking(true);
    player.onended = () => setIsAvatarTalking(false);
    player.onerror = () => setIsAvatarTalking(false);
    player.play().catch((e) => console.warn("Audio play error:", e));
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

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      let aiReplyText = "";
      let neuralAudioB64 = null;

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
              history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
            }),
          });
          const colabData = await colabRes.json();
          aiReplyText = colabData.reply;
          neuralAudioB64 = colabData.audio_base64;
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
            history: messages.slice(-4).map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        const data = await res.json();
        aiReplyText = data.reply || "I'm sorry, I couldn't process that. Please try again.";
      }

      const aiMsg = {
        id: `ai-${Date.now()}`,
        role: "ai",
        content: aiReplyText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, aiMsg]);

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
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsTyping(false);
    }
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
              onClick={() => setMode("audio")}
            >
              🎙️ Voice Call
            </button>
            <button
              className={`chat-mode-btn ${mode === "video" ? "active" : ""}`}
              onClick={() => setMode("video")}
            >
              📹 Video Call
            </button>
          </div>
        </div>

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
              isTalking={isAvatarTalking}
              colabConnected={colabConnected}
              colabUrl={colabUrl}
              mode={mode}
            />

            <div style={{ maxWidth: 460, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span className="badge badge-cyan" style={{ fontSize: 11 }}>
                  {mode === "video" ? "📹 MuseTalk Real-time Video" : "🎙️ Edge-TTS Streaming Voice"}
                </span>
                {isVoiceCallActive ? (
                  <span className="badge" style={{ background: "rgba(52, 237, 123, 0.2)", color: "#34ed7b", fontSize: 10 }}>
                    ● Call In Progress
                  </span>
                ) : (
                  <span className="badge" style={{ background: "rgba(255, 71, 87, 0.15)", color: "var(--color-sos-red)", fontSize: 10 }}>
                    ○ Call Inactive
                  </span>
                )}
                {isVoiceCallActive && sttEngine && (
                  <span className="badge" style={{ background: "rgba(106, 228, 255, 0.15)", color: "var(--color-spectral-cyan)", fontSize: 10 }}>
                    {sttEngine === "webspeech" ? "☁️ Cloud Speech Recognition" : "🖥️ On-device Recognition"}
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
                  <span style={{ color: "var(--color-spectral-cyan)", fontWeight: 700 }}>🗣️ You: </span>
                  {liveTranscript}
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

                {isVoiceCallActive && (
                  <button
                    onClick={() => {
                      if (endOfTurnTimerRef.current) clearTimeout(endOfTurnTimerRef.current);
                      if (latestSpeechRef.current.trim()) {
                        handleInteractiveVoiceInput(latestSpeechRef.current.trim());
                      }
                    }}
                    className="btn-ghost"
                    style={{ padding: "10px 16px", fontSize: 13 }}
                    title="Send current speech immediately without waiting"
                  >
                    🚀 Send Now
                  </button>
                )}
              </div>
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

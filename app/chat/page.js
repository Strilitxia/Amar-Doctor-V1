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
  const recognitionRef = useRef(null);   // English SpeechRecognition
  const mediaRecorderRef = useRef(null); // Bengali Whisper MediaRecorder
  const whisperWsRef = useRef(null);     // Bengali Whisper WebSocket
  const audioChunksRef = useRef([]);     // Buffered audio chunks
  const audioPlayerRef = useRef(null);
  const streamPlayerRef = useRef(null);
  const voiceWsRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const latestSpeechRef = useRef("");
  const isWhisperModeRef = useRef(false); // true when using Whisper (Bengali)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, liveTranscript]);

  const checkColabConnection = useCallback(async (url) => {
    try {
      const cleanUrl = (url || "").trim().replace(/\/$/, "");
      if (!cleanUrl) return false;
      const res = await fetch(`${cleanUrl}/health`, { method: "GET" });
      const data = await res.json();
      if (data.status === "online" || data.status === "ok") {
        setColabConnected(true);
        localStorage.setItem("amar_doctor_colab_url", cleanUrl);
        return true;
      }
    } catch {
      setColabConnected(false);
    }
    return false;
  }, []);

  // Initialize audio stream player and test local backend on mount
  useEffect(() => {
    streamPlayerRef.current = new AudioStreamPlayer();
    streamPlayerRef.current.onPlayStart = () => {
      setIsAvatarTalking(true);
      setCallStatusText("🔊 AI Doctor is speaking...");
    };
    streamPlayerRef.current.onPlayEnd = () => {
      setIsAvatarTalking(false);
      setCallStatusText("🎧 Listening to your voice... Speak now.");
      // Resume listening after doctor stops speaking if in call mode
      if (isVoiceCallActive && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch {}
      }
    };

    if (typeof window !== "undefined") {
      const savedUrl = localStorage.getItem("amar_doctor_colab_url") || "http://localhost:8000";
      setColabUrl(savedUrl);
      checkColabConnection(savedUrl);
    }

    return () => {
      if (voiceWsRef.current) voiceWsRef.current.close();
      if (whisperWsRef.current) whisperWsRef.current.close();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (streamPlayerRef.current) streamPlayerRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, [checkColabConnection, isVoiceCallActive]);

  // Main interactive voice query handler
  const handleInteractiveVoiceInput = useCallback(async (transcriptText) => {
    if (!transcriptText || !transcriptText.trim()) return;
    const cleanText = transcriptText.trim();
    setLiveTranscript("");
    latestSpeechRef.current = "";

    const userMsg = {
      id: `user-${Date.now()}`,
      role: "user",
      content: cleanText,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    setCallStatusText("🩺 AI Doctor is thinking...");

    // Pause recognition while preparing answer
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setIsListening(false);
      } catch {}
    }

    // 1. Try WebSocket streaming if backend is connected
    if (colabConnected && colabUrl) {
      try {
        const wsProtocol = colabUrl.startsWith("https") ? "wss" : "ws";
        const cleanWsUrl = colabUrl.replace(/^https?:\/\//, "");
        const wsUrl = `${wsProtocol}://${cleanWsUrl}/ws/voice-call`;

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

        let accumulatedResponse = "";

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "audio_chunk" && payload.audio_base64) {
              if (streamPlayerRef.current) {
                streamPlayerRef.current.addChunk(payload.audio_base64);
              }
            } else if (payload.type === "response_complete") {
              accumulatedResponse = payload.full_text;
              setMessages((prev) => [
                ...prev,
                {
                  id: `ai-${Date.now()}`,
                  role: "ai",
                  content: accumulatedResponse,
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

  // ─── English: Web SpeechRecognition (browser-native, good for English) ────────
  useEffect(() => {
    if (typeof window === "undefined" || voiceLang !== "en-US") return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += chunk;
        else interim += chunk;
      }
      const spoken = final || interim;
      if (spoken) {
        latestSpeechRef.current = spoken;
        setLiveTranscript(spoken);
        if (mode === "text") setInput(spoken);

        if (mode !== "text" && isVoiceCallActive) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (latestSpeechRef.current.trim().length >= 2) {
              handleInteractiveVoiceInput(latestSpeechRef.current.trim());
            }
          }, 1200);
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition notice:", event.error);
      if (event.error === "not-allowed") {
        alert("Microphone permission was denied. Please allow microphone access in your browser settings.");
        setIsVoiceCallActive(false);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (isVoiceCallActive && !isAvatarTalking && !isTyping && voiceLang === "en-US") {
        try { recognition.start(); setIsListening(true); } catch {}
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
  }, [voiceLang, mode, isVoiceCallActive, isAvatarTalking, isTyping, handleInteractiveVoiceInput]);

  // ─── Bengali: Whisper STT via MediaRecorder + backend WebSocket ──────────────
  const startWhisperListening = useCallback(async (stream) => {
    const activeUrl = colabUrl || "http://localhost:8000";
    const wsProtocol = activeUrl.startsWith("https") ? "wss" : "ws";
    const cleanWsUrl = activeUrl.replace(/^https?:\/\//, "");
    const wsUrl = `${wsProtocol}://${cleanWsUrl}/ws/transcribe`;

    if (whisperWsRef.current) {
      try { whisperWsRef.current.close(); } catch {}
    }

    const ws = new WebSocket(wsUrl);
    whisperWsRef.current = ws;

    ws.onopen = () => {
      console.log("Whisper STT WebSocket connected.");
      setCallStatusText("🎤 Whisper connected. Speak now in Bengali...");
    };
    ws.onerror = (e) => {
      console.warn("Whisper WS error:", e);
      setCallStatusText("⚠️ Backend WebSocket connection error");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "transcript" && msg.text) {
          const text = msg.text.trim();
          latestSpeechRef.current = text;
          setLiveTranscript(text);

          if (mode === "text") {
            setInput(text);
          } else if (isVoiceCallActive) {
            handleInteractiveVoiceInput(text);
          }
        }
      } catch (e) {
        console.warn("Whisper msg parse error:", e);
      }
    };

    let mimeType = "";
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mimeType = "audio/webm;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/webm")) mimeType = "audio/webm";
      else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) mimeType = "audio/ogg;codecs=opus";
      else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeType = "audio/mp4";
    }

    const options = mimeType ? { mimeType } : undefined;
    const recorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 100) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result;
          if (result && typeof result === "string") {
            const base64 = result.split(",")[1];
            if (whisperWsRef.current && whisperWsRef.current.readyState === WebSocket.OPEN) {
              whisperWsRef.current.send(JSON.stringify({ audio: base64, lang: "bn" }));
              setCallStatusText("🧠 Whisper transcribing Bengali...");
            }
          }
        };
        reader.readAsDataURL(e.data);
      }
    };

    recorder.start(2500);
    setIsListening(true);
  }, [colabUrl, mode, isVoiceCallActive, handleInteractiveVoiceInput]);

  const startVoiceCall = async () => {
    // Unlock browser audio playback on user gesture
    if (streamPlayerRef.current) streamPlayerRef.current.init();

    // Request microphone access
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (micErr) {
      alert("Microphone permission required for voice calls: " + micErr.message);
      return;
    }

    setIsVoiceCallActive(true);
    setLiveTranscript("");
    latestSpeechRef.current = "";

    const isBengali = voiceLang === "bn-BD";
    isWhisperModeRef.current = isBengali;

    if (isBengali) {
      // ── Bengali mode: Whisper STT via MediaRecorder ──
      setCallStatusText("🎤 Whisper is listening in Bengali...");
      await startWhisperListening(stream);
    } else {
      // ── English mode: native SpeechRecognition ──
      setCallStatusText("🎧 Listening in English... Speak now.");
      if (recognitionRef.current) {
        try {
          recognitionRef.current.lang = "en-US";
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          console.warn("English STT start error:", e);
        }
      }
    }
  };

  const stopVoiceCall = () => {
    setIsVoiceCallActive(false);
    setIsListening(false);
    setCallStatusText("Call ended");
    setLiveTranscript("");
    latestSpeechRef.current = "";

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Stop English STT
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    // Stop Bengali Whisper STT
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (whisperWsRef.current) {
      try { whisperWsRef.current.close(); } catch {}
      whisperWsRef.current = null;
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

    // Text mode: use SpeechRecognition for English inline dictation
    if (!recognitionRef.current) {
      alert("Switch to English (ENG) for inline text dictation, or use Voice Call mode for Bengali.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.lang = "en-US";
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn("Recognition start err:", err);
      }
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
        const res = await fetch(`${colabUrl}/api/tts`, {
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
          const colabRes = await fetch(`${colabUrl}/api/chat-consultation`, {
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
            {colabConnected ? "⚡ Backend Connected" : "🔌 Connect Backend (Local/Colab)"}
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
                placeholder="http://localhost:8000"
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
                  const ok = await checkColabConnection(colabUrl);
                  if (ok) {
                    alert("✓ Successfully connected to Amar Doctor AI Backend!");
                    setShowColabModal(false);
                  } else {
                    alert("Could not reach backend at that URL. Please verify server is running on port 8000 or Cloudflare tunnel.");
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

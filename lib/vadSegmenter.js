// vadSegmenter.js
// Utterance-level voice-activity segmentation for this app's self-hosted
// Whisper speech-to-text — the only STT engine used (no browser Web Speech
// API is used anywhere, so audio never leaves this app's own backend).
//
// Replaces fixed-length audio slicing with real speech-start/speech-end
// detection so: (1) the backend only ever transcribes actual utterances,
// never silence/background noise (a fixed-interval approach causes Whisper
// to hallucinate short transcripts from noise, which can make turn
// detection never fire), and (2) speech-start is a genuine signal for
// barge-in.
//
// Primary engine: Silero VAD via @ricky0123/vad-web (ONNX/WASM), lazy
// loaded on first use. All model/wasm assets are served locally from
// /public/vad/ (see baseAssetPath / onnxWASMBasePath below) rather than
// fetched from a CDN, consistent with this project's low/unreliable-
// connectivity design goal.
//
// Fallback engine: a small RMS energy-threshold VAD using the Web Audio
// AnalyserNode, used only if the Silero engine fails to load (dynamic
// import error, asset fetch failure, WASM instantiation failure, etc.) so
// this tier never becomes fully non-functional.

const VAD_ASSET_PATH = "/vad/";

async function createSileroSegmenter({ stream, onSpeechStart, onSpeechEnd, onError }) {
  const { MicVAD } = await import("@ricky0123/vad-web");

  const vad = await MicVAD.new({
    // @ricky0123/vad-web does NOT accept a plain `stream` option — passing
    // one is silently ignored, and its default `getStream`/`resumeStream`
    // call navigator.mediaDevices.getUserMedia() *themselves*, opening a
    // second, completely uncoordinated capture of the microphone alongside
    // the one already acquired in startVoiceCall/activateWhisperFallback
    // (whose lifecycle we manage ourselves and stop in stopVoiceCall).
    // Overriding all three explicitly is required to actually use the
    // stream we were given instead of a rogue duplicate one.
    getStream: async () => stream,
    pauseStream: async () => {}, // we own this stream's lifecycle, not MicVAD — never stop its tracks here
    resumeStream: async () => stream,
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: VAD_ASSET_PATH,
    ortConfig: (ort) => {
      ort.env.logLevel = "error";
      // Single-threaded: avoids requiring cross-origin-isolation
      // (SharedArrayBuffer) headers for the threaded wasm build, which
      // this app doesn't set. VAD inference is cheap enough that this
      // costs no perceptible latency.
      ort.env.wasm.numThreads = 1;
    },
    positiveSpeechThreshold: 0.6,
    negativeSpeechThreshold: 0.35,
    minSpeechMs: 250, // ~drops coughs/clicks (option is *Ms, not *Frames)
    redemptionMs: 800, // ~800ms of trailing silence = end of turn
    preSpeechPadMs: 300,
    onSpeechStart: () => onSpeechStart?.(),
    onSpeechEnd: (audio) => onSpeechEnd?.(audio, { format: "pcm16k" }),
    onVADMisfire: () => {},
  });

  vad.start();

  return {
    engine: "silero",
    pause: () => { try { vad.pause(); } catch {} },
    resume: () => { try { vad.start(); } catch {} },
    destroy: () => { try { vad.destroy(); } catch {} },
  };
}

function createEnergySegmenter({ stream, onSpeechStart, onSpeechEnd, onError }) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  const SAMPLE_RATE = audioCtx.sampleRate;
  const ENERGY_THRESHOLD = 0.02;
  const MIN_SPEECH_MS = 250;
  const SILENCE_END_MS = 800;

  let speaking = false;
  let speechStartedAt = 0;
  let lastVoiceAt = 0;
  let recorder = null;
  let chunks = [];
  let rafId = null;
  let paused = false;

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";

  const rms = () => {
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSquares += v * v;
    }
    return Math.sqrt(sumSquares / data.length);
  };

  const tick = () => {
    rafId = requestAnimationFrame(tick);
    if (paused) return;
    const level = rms();
    const now = performance.now();

    if (level > ENERGY_THRESHOLD) {
      lastVoiceAt = now;
      if (!speaking) {
        speaking = true;
        speechStartedAt = now;
        chunks = [];
        try {
          recorder = new MediaRecorder(stream, { mimeType });
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.start();
        } catch (err) {
          onError?.(err);
        }
        onSpeechStart?.();
      }
    } else if (speaking && now - lastVoiceAt > SILENCE_END_MS) {
      const duration = now - speechStartedAt;
      speaking = false;
      const finishedRecorder = recorder;
      recorder = null;
      if (finishedRecorder && finishedRecorder.state !== "inactive") {
        finishedRecorder.onstop = () => {
          if (duration >= MIN_SPEECH_MS && chunks.length > 0) {
            const blob = new Blob(chunks, { type: mimeType });
            // Energy-fallback segments stay WebM (no WAV encoder without
            // decoded PCM); the backend's existing WebM decode path handles it.
            onSpeechEnd?.(blob, { format: "webm" });
          }
          chunks = [];
        };
        try { finishedRecorder.stop(); } catch {}
      }
    }
  };

  rafId = requestAnimationFrame(tick);

  return {
    engine: "energy",
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    destroy: () => {
      if (rafId) cancelAnimationFrame(rafId);
      try { source.disconnect(); } catch {}
      try { audioCtx.close(); } catch {}
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch {}
      }
    },
  };
}

export async function createVadSegmenter({ stream, onSpeechStart, onSpeechEnd, onError }) {
  try {
    return await createSileroSegmenter({ stream, onSpeechStart, onSpeechEnd, onError });
  } catch (err) {
    console.warn("Silero VAD unavailable, using energy-threshold fallback:", err);
    onError?.(err);
    return createEnergySegmenter({ stream, onSpeechStart, onSpeechEnd, onError });
  }
}

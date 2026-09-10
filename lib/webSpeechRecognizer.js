// webSpeechRecognizer.js
// Thin wrapper around the browser's SpeechRecognition (Chrome's Web Speech
// API), shaped to plug into the same call flow as lib/vadSegmenter.js so the
// two speech engines are interchangeable behind a toggle.
//
// ── Read this before enabling it in production ────────────────────────────
// This is NOT on-device recognition. Chrome streams the microphone audio to
// Google's servers and returns text. That is the opposite of the Whisper
// path, which keeps audio inside this project's own backend — see
// backend/README.md. For a medical app taking patient symptom descriptions,
// that difference is a real one, so the UI labels it explicitly rather than
// quietly swapping engines. It is here for accuracy comparison.
//
// It also needs a live internet connection (it fails with `network` when
// offline), which matters for an app whose whole premise is rural
// connectivity.

export function isWebSpeechSupported() {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Start continuous recognition.
 *
 * @param {object}   opts
 * @param {string}   opts.lang          BCP-47 tag, e.g. "bn-BD" / "en-US".
 * @param {function} opts.onSpeechStart Fired when the user starts talking (barge-in).
 * @param {function} opts.onInterim     Partial text, updated as they speak.
 * @param {function} opts.onFinal       A finished utterance.
 * @param {function} opts.onError       Non-routine failures, with a `.reason` string.
 * @returns {{engine: string, pause: function, resume: function, destroy: function}}
 */
export function createWebSpeechRecognizer({
  lang = "bn-BD",
  onSpeechStart,
  onInterim,
  onFinal,
  onError,
} = {}) {
  const Ctor =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!Ctor) {
    throw new Error(
      "Web Speech API not available in this browser (Chrome/Edge only)."
    );
  }

  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let destroyed = false;
  let paused = false;
  let running = false;
  let restartTimer = null;
  // Set when the failure is one that retrying cannot fix. Without this the
  // onend handler below cheerfully restarts every 250ms forever against a
  // permission the user has permanently denied.
  let fatal = false;
  // Normal silence-restart is near-instant; bumped on recoverable errors.
  let retryDelay = 250;

  const safeStart = () => {
    if (destroyed || paused || running || fatal) return;
    try {
      rec.start();
    } catch (err) {
      // InvalidStateError just means it was already started — the `running`
      // flag is set in onstart, so a fast stop/start pair can race past it.
      if (err && err.name !== "InvalidStateError") {
        onError?.(Object.assign(err, { reason: "start_failed" }));
      }
    }
  };

  const scheduleRestart = (delay = 250) => {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(safeStart, delay);
  };

  rec.onstart = () => {
    running = true;
  };

  rec.onspeechstart = () => {
    if (!destroyed && !paused) onSpeechStart?.();
  };

  rec.onresult = (event) => {
    if (destroyed || paused) return;
    // A result round-tripped, so whatever we backed off from has cleared.
    retryDelay = 250;
    let interim = "";
    // resultIndex is where *new* results begin; everything before it has
    // already been dispatched on an earlier event.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0]?.transcript ?? "";
      if (result.isFinal) {
        const clean = text.trim();
        if (clean) onFinal?.(clean, result[0]?.confidence);
      } else {
        interim += text;
      }
    }
    const cleanInterim = interim.trim();
    if (cleanInterim) onInterim?.(cleanInterim);
  };

  // Retrying these never helps: the user denied the permission, the policy
  // blocks it, or there is no capture device. Restarting on a 250ms loop
  // against any of them just spins forever and buries the real cause.
  const FATAL_REASONS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

  rec.onerror = (event) => {
    const reason = event?.error || "unknown";
    // no-speech fires constantly during natural pauses and aborted fires
    // whenever we stop it ourselves — neither is worth surfacing to a
    // patient mid-consultation. Everything else is.
    if (reason === "no-speech" || reason === "aborted") return;
    if (FATAL_REASONS.has(reason)) fatal = true;
    // `network` is recoverable (the connection may come back) but retrying
    // it four times a second is pointless — back off so an offline session
    // isn't spamming Google's endpoint.
    retryDelay = reason === "network" ? 3000 : 250;
    onError?.(Object.assign(new Error(`Web Speech error: ${reason}`), { reason }));
  };

  rec.onend = () => {
    running = false;
    if (destroyed || paused || fatal) return;
    // Chrome ends the session on its own after a stretch of silence even
    // with continuous = true, so a call that should still be listening goes
    // deaf unless it is restarted here.
    scheduleRestart(retryDelay);
  };

  safeStart();

  return {
    engine: "webspeech",
    lang,

    /** Stop listening without tearing the recognizer down (mic mute). */
    pause() {
      paused = true;
      clearTimeout(restartTimer);
      try {
        rec.abort();
      } catch {}
    },

    resume() {
      if (destroyed) return;
      paused = false;
      scheduleRestart(0);
    },

    destroy() {
      destroyed = true;
      clearTimeout(restartTimer);
      // abort(), not stop(): stop() still delivers a trailing final result,
      // which would arrive after the call is over and fire a stale turn.
      try {
        rec.abort();
      } catch {}
      rec.onstart = rec.onresult = rec.onerror = rec.onend = rec.onspeechstart = null;
    },
  };
}

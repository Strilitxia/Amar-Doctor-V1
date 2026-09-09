// AudioStreamPlayer.js
// Ultra-reliable streaming audio player for real-time voice chat
// Uses Web Audio API with automatic HTML5 Audio fallback for 100% browser compatibility

export class AudioStreamPlayer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.timeData = null;
    this.freqData = null;
    // One MediaElementSourceNode per <audio> element, kept so it can be
    // disconnected when the chunk ends. createMediaElementSource throws
    // InvalidStateError if called twice on the same element, and the nodes
    // leak for the whole call if they are never disconnected.
    this.currentSourceNode = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.currentAudio = null;
    this.onPlayStart = null;
    this.onPlayEnd = null;
    this.onChunkStart = null;
  }

  init() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx && !this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }
      if (this.audioContext && !this.analyser) {
        this.analyser = this.audioContext.createAnalyser();
        // 1024 is enough resolution for an amplitude envelope and small
        // enough that reading it every animation frame is free.
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.6;
        this.timeData = new Uint8Array(this.analyser.fftSize);
        this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.connect(this.audioContext.destination);
      }
    } catch (e) {
      console.warn("AudioContext init error:", e);
    }
  }

  addChunk(base64Audio) {
    if (!base64Audio) return;
    this.init();

    // Ensure proper data URI
    const src = base64Audio.startsWith("data:")
      ? base64Audio
      : `data:audio/mp3;base64,${base64Audio}`;

    this.audioQueue.push(src);

    if (!this.isPlaying) {
      this.playNext();
    }
  }

  // Route this chunk through the analyser so the avatar's mouth can be driven
  // by the real waveform. Only when the context is actually running: an
  // element routed into a suspended graph plays SILENTLY, so on a blocked
  // context we leave the element on the default output and the avatar falls
  // back to its idle animation rather than the user losing all audio.
  _attachAnalyser(audio) {
    if (!this.audioContext || !this.analyser) return;
    const ctx = this.audioContext;

    const attach = () => {
      // The chunk may have finished while resume() was in flight; attaching
      // to a dead element would leave a stale node connected.
      if (ctx.state !== "running" || this.currentAudio !== audio) return;
      try {
        const node = ctx.createMediaElementSource(audio);
        node.connect(this.analyser);
        this.currentSourceNode = node;
      } catch (e) {
        // Already-connected element, or a browser that refuses the node —
        // harmless, the element still plays on the default output.
        console.warn("Analyser attach skipped:", e);
        this.currentSourceNode = null;
      }
    };

    if (ctx.state === "running") {
      attach();
      return;
    }
    // resume() is async, so checking state immediately after calling it in
    // init() always saw "suspended" and silently skipped the analyser — the
    // audio played but the avatar's mouth never moved.
    ctx.resume().then(attach).catch(() => {});
  }

  _detachAnalyser() {
    if (this.currentSourceNode) {
      try { this.currentSourceNode.disconnect(); } catch {}
      this.currentSourceNode = null;
    }
  }

  // Smoothed RMS amplitude of what is playing right now, 0..1.
  // Returns 0 when silent or when no analyser is attached, so callers can
  // treat "no signal" and "not talking" identically.
  getLevel() {
    if (!this.analyser || !this.timeData) return 0;
    this.analyser.getByteTimeDomainData(this.timeData);
    let sumSquares = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / this.timeData.length);
    // Speech RMS sits well below 1.0; scale so normal speech reaches ~0.6-0.9.
    return Math.min(1, rms * 3.2);
  }

  // Coarse frequency buckets (0..1 each) for the visualizer bars.
  getSpectrum(bars = 5) {
    const out = new Array(bars).fill(0);
    if (!this.analyser || !this.freqData) return out;
    this.analyser.getByteFrequencyData(this.freqData);
    // Only the lower half carries speech energy worth showing.
    const usable = Math.floor(this.freqData.length * 0.5);
    const per = Math.max(1, Math.floor(usable / bars));
    for (let b = 0; b < bars; b++) {
      let sum = 0;
      for (let i = b * per; i < (b + 1) * per; i++) sum += this.freqData[i];
      out[b] = Math.min(1, sum / per / 255);
    }
    return out;
  }

  playNext() {
    if (this.audioQueue.length === 0) {
      this._detachAnalyser();
      this.isPlaying = false;
      this.currentAudio = null;
      if (this.onPlayEnd) this.onPlayEnd();
      return;
    }

    if (!this.isPlaying) {
      this.isPlaying = true;
      if (this.onPlayStart) this.onPlayStart();
    }

    const nextSrc = this.audioQueue.shift();

    try {
      this._detachAnalyser();
      const audio = new Audio(nextSrc);
      this.currentAudio = audio;
      this._attachAnalyser(audio);

      audio.onplay = () => {
        if (this.onChunkStart) this.onChunkStart();
      };

      audio.onended = () => {
        this._detachAnalyser();
        this.playNext();
      };

      audio.onerror = (err) => {
        console.warn("Audio chunk error, playing next:", err);
        this._detachAnalyser();
        this.playNext();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Audio playback blocked, trying fallback:", err);
          this._detachAnalyser();
          this.playNext();
        });
      }
    } catch (err) {
      console.warn("Error creating Audio element:", err);
      this.playNext();
    }
  }

  stop() {
    this.audioQueue = [];
    this._detachAnalyser();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }
    this.isPlaying = false;
    if (this.onPlayEnd) this.onPlayEnd();
  }
}

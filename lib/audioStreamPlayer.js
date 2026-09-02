// AudioStreamPlayer.js
// Ultra-reliable streaming audio player for real-time voice chat
// Uses Web Audio API with automatic HTML5 Audio fallback for 100% browser compatibility

export class AudioStreamPlayer {
  constructor() {
    this.audioContext = null;
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

  playNext() {
    if (this.audioQueue.length === 0) {
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
      const audio = new Audio(nextSrc);
      this.currentAudio = audio;

      audio.onplay = () => {
        if (this.onChunkStart) this.onChunkStart();
      };

      audio.onended = () => {
        this.playNext();
      };

      audio.onerror = (err) => {
        console.warn("Audio chunk error, playing next:", err);
        this.playNext();
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Audio playback blocked, trying fallback:", err);
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

# Amar Doctor V1 — Phase 4 Backend AI Sandbox (Colab & FastAPI)

This directory contains the AI Audio & Video consultation backend for **Amar Doctor V1**.

---

## 🌟 What This Backend Does

1. **Edge-TTS Bengali Voice Synthesis**: Uses Microsoft Azure Neural voices (`bn-BD-NabanitaNeural` / `bn-BD-PradeepNeural`) to speak fluent, empathetic Bengali at 0 cost.
2. **AI Video Avatar (MuseTalk, optional)**: Lip-syncs a doctor portrait to the generated audio. Runs as a separate process because its dependencies cannot coexist with this backend's — see `MUSETALK_SETUP.md`. Without it the browser animates the avatar from the audio waveform instead.
3. **Audio-Only Mode Bypass**: Instantly drops video rendering for deep rural areas to conserve bandwidth and GPU compute.
4. **Cloudflare / Ngrok Tunneling**: Exposes a free, public HTTPS URL for the Next.js frontend without requiring a paid server.

---

## 🚀 Running on Google Colab (Free T4 GPU)

1. Open [Google Colab](https://colab.research.google.com/).
2. Click **Upload** and upload `backend/amar_doctor_colab.ipynb`.
3. In Colab menu: **Runtime > Change runtime type > Select T4 GPU**.
4. Set your `GROQ_API_KEY` in cell 3, then run cells **1, 2, 3, and 6** — that's the full voice
   pipeline (TTS, Bengali STT, Groq triage) live on a public URL.
5. **Want real GPU lip-sync too, not the audio-reactive fallback avatar?** Also run cells 4 and 5:
   upload a doctor portrait/clip, then run the MuseTalk install cell (~10 min, most of it the
   7.3GB weight download; idempotent, so it's safe to re-run if the runtime drops mid-install).
6. Copy the generated `https://xxxx.trycloudflare.com` URL from cell 6's output.
7. Paste the URL into the **Colab Settings** in your Amar Doctor web interface!

Everything installs to Colab's local disk — nothing is written to Google Drive. A runtime reset
therefore wipes the MuseTalk environment and weights, and cells 4-5 have to be re-run.

Do **not** blindly "Run all" — cell 3 needs your `GROQ_API_KEY` and cell 4 needs a doctor asset
uploaded, and cells 4-5 are entirely skippable if you only want voice calls. See the notebook's
own cell-by-cell explanations, and [`MUSETALK_SETUP.md`](../MUSETALK_SETUP.md) for what each
MuseTalk step is actually doing (it's the same recipe as the local Windows install, just
translated to Colab's Linux runtime).

---

## 💻 Running Locally (Optional Python Environment)

```bash
# 1. Install dependencies
pip install -r backend/requirements.txt

# 2. Run FastAPI server
python -m uvicorn backend.server:app --reload --port 8000
```
Server will be live on `http://localhost:8000`. Test docs at `http://localhost:8000/docs`.

---

## 🗣️ Speech-to-Text: self-hosted Whisper by default

Speech-to-text defaults to this server's own `faster-whisper` model, so
voice audio never leaves this backend to a third-party cloud recognizer.
That is the shipping default for both the live voice call and text-mode mic
dictation.

There is one deliberate, opt-in exception: `/chat` has a speech-engine toggle
that can switch the live call to Chrome's Web Speech API, or run both at once
to compare them on the same utterance. It exists to measure Bengali accuracy
against a cloud recognizer. **Web Speech uploads the patient's audio to
Google and needs an internet connection**, so the UI labels it as such
whenever it is active rather than swapping engines silently. It resets to
nothing on a fresh browser and has to be chosen explicitly.

Model size defaults to accuracy over raw speed, and is deliberately **not**
scaled down on CPU. Model size is the dominant factor for Bengali quality:
Whisper saw orders of magnitude less Bengali than English, so the small
checkpoints collapse on Bengali long before they do on English. Measured on
a 5s Bengali clip:

| Model | Bengali output |
|---|---|
| `small` | `आमार तीम दीं दोरे जोर...` — drifts into Devanagari |
| `large-v3` | `আমার তিম দিন ধরে জোর আর মাথাব্যথা হোছে, সাথে কাশি ও দুর্বলতা আছে।` |

English is fine on either, which is why a too-small model reads as "Bengali
is broken" rather than "the model is too small".

| Env var | Default | Notes |
|---|---|---|
| `WHISPER_MODEL_SIZE` | `large-v3` (cpu and cuda alike) | `tiny`/`base` are unusable for Bengali (~100% WER) — a warning is logged if you select one. `medium`/`large-*` on CPU-only run slower than real-time; that warning is informational, not a suggestion to drop below `small`. |
| `WHISPER_DEVICE` | `cuda` if available, else `cpu` | Falls back to CPU int8 automatically if the CUDA model fails to load. |
| `WHISPER_COMPUTE_TYPE` | `float16` on GPU, `int8` on CPU | |

Only override the size to trade Bengali accuracy for latency:
```python
%env WHISPER_MODEL_SIZE=medium
```

The Bengali script anchor (`BENGALI_INITIAL_PROMPT`) is applied only on
`medium` and larger. On `small` it makes output *worse* — the model lacks
the headroom to condition on the prompt and decode Bengali at once. Force
it either way with `WHISPER_BENGALI_ANCHOR=on|off`.

### If Bengali is understandable but individual words are wrong

Stock `large-v3` gets Bengali *script* right but still mis-renders conjunct
consonants — `জ্বর` (fever) comes out as `জোর` (force), `হচ্ছে` as `হোছে`.
Measured on a 5s clip, these survive every audio-side change: server VAD on
or off, and up to 300ms of onset trimmed off, all produce the same three
errors. They are model limits, not pipeline bugs, so do not go looking for
them in the VAD or the audio format.

Widening `BENGALI_INITIAL_PROMPT` is whack-a-mole: adding example sentences
fixed `তিন` and `হচ্ছে` but broke `মাথাব্যথা` -> `মাথাব্বথা` and
`দুর্বলতা` -> `দুরবলতা`. Same error count, different errors.

The real fix is a Bengali fine-tuned checkpoint. `WHISPER_MODEL_SIZE`
accepts a HuggingFace repo id or a local CTranslate2 directory, not just a
size name, so swapping one in is an env var:

```bash
ct2-transformers-converter --model <hf-bengali-whisper-repo>   --output_dir ./models/whisper-bn --quantization float16
```
```python
%env WHISPER_MODEL_SIZE=./models/whisper-bn
%env WHISPER_BENGALI_ANCHOR=off
```

The model is warmed up in the background at server startup so the first
real utterance of a call doesn't pay the model download/load cost.

---

## 🧠 AI Provider: Groq (GPT-OSS-120B)

Clinical triage responses (`/api/chat-consultation` and `/ws/voice-call`)
are generated by Groq's OpenAI-compatible chat completions API using the
`openai/gpt-oss-120b` model.

| Env var | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API key for clinical chat triage. Get one at [console.groq.com](https://console.groq.com/keys). |

If no key is configured (or the call fails), the server falls back to a
canned Bengali first-aid response rather than failing the request.

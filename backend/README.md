# Amar Doctor V1 — Phase 4 Backend AI Sandbox (Colab & FastAPI)

This directory contains the AI Audio & Video consultation backend for **Amar Doctor V1**.

---

## 🌟 What This Backend Does

1. **Edge-TTS Bengali Voice Synthesis**: Uses Microsoft Azure Neural voices (`bn-BD-NabanitaNeural` / `bn-BD-PradeepNeural`) to speak fluent, empathetic Bengali at 0 cost.
2. **AI Video Avatar (SadTalker / LivePortrait)**: Synchronizes facial movements and lips to generated audio frames on GPU.
3. **Audio-Only Mode Bypass**: Instantly drops video rendering for deep rural areas to conserve bandwidth and GPU compute.
4. **Cloudflare / Ngrok Tunneling**: Exposes a free, public HTTPS URL for the Next.js frontend without requiring a paid server.

---

## 🚀 Running on Google Colab (Free T4 GPU)

1. Open [Google Colab](https://colab.research.google.com/).
2. Click **Upload** and upload `backend/amar_doctor_colab.ipynb`.
3. In Colab menu: **Runtime > Change runtime type > Select T4 GPU**.
4. Run all cells (`Ctrl + F9` or `Cmd + F9`).
5. Copy the generated `https://xxxx.trycloudflare.com` URL.
6. Paste the URL into the **Colab Settings** in your Amar Doctor web interface!

---

## 💻 Running Locally (Optional Python Environment)

```bash
# 1. Install dependencies
pip install -r backend/requirements.txt

# 2. Run FastAPI server
python -m uvicorn backend.server:app --reload --port 8000
```
Server will be live on `http://localhost:8000`. Test docs at `http://localhost:8000/docs`.

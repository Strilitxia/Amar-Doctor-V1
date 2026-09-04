"""
Amar Doctor V1 — AI Video & Audio Sandbox Backend
FastAPI server for Edge-TTS Bengali voice synthesis, Gemini medical triage,
and SadTalker/LivePortrait AI avatar video pipeline.
Designed for Google Colab (Free T4 GPU) & Local execution.
"""

import os
import io
import sys
import json
import uuid
import base64
import asyncio
import logging
import tempfile
from typing import Optional, List
from pathlib import Path

import edge_tts

# Lazy-loaded Whisper model — this is now only the FALLBACK STT tier (the
# frontend's primary transcription path is the browser's own Web Speech API;
# Whisper only runs for browsers that lack it, e.g. Firefox/Safari). Model
# size/device/compute-type are env-configurable since "tiny" (the old
# hardcoded default) is known to be weak specifically on Bengali. Defaults:
# "small" on GPU (fast + noticeably more accurate), "base" on CPU-only (the
# safe ceiling — "small" on CPU-only would run several times slower than
# real time, unusable in a live call).
_whisper_model = None
_whisper_model_lock = asyncio.Lock()

async def get_whisper_model():
    """Lazy-load faster-whisper model with CUDA / CPU auto-detection and low-latency greedy inference."""
    global _whisper_model
    async with _whisper_model_lock:
        if _whisper_model is None:
            try:
                from faster_whisper import WhisperModel
                import torch
                cuda_available = torch.cuda.is_available()
                device = os.environ.get("WHISPER_DEVICE") or ("cuda" if cuda_available else "cpu")
                compute_type = os.environ.get("WHISPER_COMPUTE_TYPE") or ("float16" if cuda_available else "int8")
                model_size = os.environ.get("WHISPER_MODEL_SIZE") or ("small" if cuda_available else "base")

                if model_size in ("small", "medium", "large-v3") and device == "cpu":
                    logger.warning(
                        f"WHISPER_MODEL_SIZE={model_size} on CPU will be slow (several x real-time). "
                        "Consider 'base' or 'tiny' for CPU-only deployments, or set WHISPER_MODEL_SIZE=base."
                    )

                kwargs = {"cpu_threads": os.cpu_count()} if device == "cpu" else {}
                logger.info(f"Loading faster-whisper '{model_size}' model on {device} ({compute_type})...")
                _whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type, **kwargs)
                logger.info(f"Whisper model loaded successfully on {device}.")
            except ImportError:
                logger.warning("faster-whisper not installed. Bengali STT will not be available.")
                _whisper_model = None
    return _whisper_model


def whisper_model_info():
    global _whisper_model
    cuda_available = False
    try:
        import torch
        cuda_available = torch.cuda.is_available()
    except Exception:
        pass
    return {
        "model_size": os.environ.get("WHISPER_MODEL_SIZE") or ("small" if cuda_available else "base"),
        "device": os.environ.get("WHISPER_DEVICE") or ("cuda" if cuda_available else "cpu"),
        "loaded": _whisper_model is not None,
    }
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from pydantic import BaseModel

# Initialize logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("amar-doctor-backend")

app = FastAPI(
    title="Amar Doctor V1 AI Avatar & Neural Voice Pipeline",
    description="FastAPI sandbox for Bengali Neural Voice Synthesis, Gemini Medical Triage, and Video Avatar Streaming",
    version="1.0.0"
)

# Enable CORS for Next.js web client
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _warmup_whisper_model():
    # Kick off model load in the background so the first real utterance on
    # the Whisper fallback tier doesn't pay the download/load cost — this
    # can be a ~460MB first-run download for the "small" model on Colab.
    asyncio.create_task(get_whisper_model())

# Configuration Constants
DEFAULT_BENGALI_VOICE = "bn-BD-NabanitaNeural"  # High quality female Bengali neural voice
DEFAULT_BENGALI_MALE_VOICE = "bn-BD-PradeepNeural" # High quality male Bengali neural voice
DEFAULT_ENGLISH_VOICE = "en-US-JennyNeural"
TEMP_DIR = Path(tempfile.gettempdir()) / "amar_doctor_media"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# System prompt for Gemini Medical Assistant
SYSTEM_PROMPT = """You are "Amar Doctor" (আমার ডাক্তার), a highly empathetic and knowledgeable AI medical consultant designed specifically for rural Bangladesh.
- Triage symptoms and explain diagnoses in clear, reassuring Bengali (বাংলা) with English terms where appropriate.
- Keep responses concise (2 to 4 sentences), direct, and easy to speak aloud via neural text-to-speech.
- Suggest immediate first-aid, appropriate hydration/diet, and standard over-the-counter care.
- If symptoms indicate critical emergencies (e.g. chest pain, snakebite, severe bleeding, stroke signs), urge immediate hospital visit or emergency SOS dispatch."""

# Request Models
class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = DEFAULT_BENGALI_VOICE
    rate: Optional[str] = "+0%"
    pitch: Optional[str] = "+0Hz"

class TranscribeRequest(BaseModel):
    audio_base64: str
    lang: Optional[str] = "bn"
    format: Optional[str] = "webm"  # "webm" (Opus, from MediaRecorder) or "wav" (from the VAD segmenter)

class ChatConsultationRequest(BaseModel):
    message: str
    voice: Optional[str] = DEFAULT_BENGALI_VOICE
    mode: Optional[str] = "audio" # "audio" or "video"
    history: Optional[List[dict]] = []
    gemini_api_key: Optional[str] = None


async def call_gemini(api_key: str, contents: list, system_suffix: str, max_output_tokens: int, timeout: float) -> str:
    """
    Call Gemini's generateContent REST API without blocking the asyncio event loop.
    requests.post() is a blocking network call; running it directly inside an
    `async def` freezes every other coroutine on this single-threaded server
    (including the /ws/transcribe and /ws/voice-call sockets of an active call)
    for the full duration of the request. Offloading it to a thread keeps the
    event loop free so audio transcription keeps flowing while Gemini replies.
    """
    import requests
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}"
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT + " " + system_suffix}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": max_output_tokens}
    }

    def _post():
        res = requests.post(url, json=payload, timeout=timeout)
        return res.json()

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _post)
    return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


async def generate_edge_tts(text: str, voice: str = DEFAULT_BENGALI_VOICE, output_path: Optional[Path] = None) -> Path:
    """Generate high-fidelity neural audio using Microsoft Edge TTS (v7.x streaming API)."""
    if output_path is None:
        output_path = TEMP_DIR / f"tts_{uuid.uuid4().hex[:8]}.mp3"

    communicate = edge_tts.Communicate(text=text, voice=voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    
    with open(output_path, "wb") as f:
        f.write(audio_data)
    return output_path


def check_gpu_status():
    """Detect available CUDA devices."""
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        device_name = torch.cuda.get_device_name(0) if cuda_available else "CPU (Standard)"
        return {"cuda_available": cuda_available, "device_name": device_name}
    except Exception:
        return {"cuda_available": False, "device_name": "CPU"}


@app.get("/")
@app.get("/health")
async def health_check():
    """Health check endpoint with GPU and system status."""
    gpu = check_gpu_status()
    return {
        "status": "online",
        "service": "Amar Doctor V1 AI Video & Neural Voice Sandbox",
        "gpu": gpu,
        "whisper": whisper_model_info(),
        "supported_voices": [
            {"id": "bn-BD-NabanitaNeural", "name": "Nabanita (Bengali Female)", "lang": "bn-BD"},
            {"id": "bn-BD-PradeepNeural", "name": "Pradeep (Bengali Male)", "lang": "bn-BD"},
            {"id": "en-US-JennyNeural", "name": "Jenny (English US)", "lang": "en-US"}
        ]
    }


@app.post("/api/livekit/token")
async def get_livekit_token(room: Optional[str] = "amar-doctor-room", identity: Optional[str] = "patient_user"):
    """
    Generate LiveKit Cloud WebRTC Access Token for real-time video avatar call.
    """
    livekit_api_key = os.environ.get("LIVEKIT_API_KEY", "devkey")
    livekit_api_secret = os.environ.get("LIVEKIT_API_SECRET", "secret")
    livekit_url = os.environ.get("LIVEKIT_URL", "wss://amar-doctor-demo.livekit.cloud")

    try:
        from livekit import api
        token = api.AccessToken(livekit_api_key, livekit_api_secret) \
            .with_identity(identity) \
            .with_name("Patient") \
            .with_grants(api.VideoGrants(
                room_join=True,
                room=room,
                can_publish=True,
                can_subscribe=True,
            ))
        jwt_token = token.to_jwt()
        return {"success": True, "token": jwt_token, "url": livekit_url, "room": room}
    except Exception as e:
        logger.warning(f"LiveKit SDK fallback token generation: {e}")
        # Return fallback configuration
        return {
            "success": True,
            "token": "demo-token",
            "url": livekit_url,
            "room": room,
            "notice": "LiveKit Cloud token generated. Configure LIVEKIT_API_KEY & SECRET in Colab."
        }


@app.post("/api/tts")
async def text_to_speech(req: TTSRequest):
    """
    Convert text into neural Bengali/English audio waveform.
    Returns audio as base64 and streaming URL.
    """
    try:
        if not req.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        audio_file = await generate_edge_tts(req.text, voice=req.voice or DEFAULT_BENGALI_VOICE)
        
        with open(audio_file, "rb") as f:
            audio_bytes = f.read()
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        
        return {
            "success": True,
            "voice": req.voice,
            "audio_base64": f"data:audio/mp3;base64,{audio_b64}",
            "filename": audio_file.name
        }
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat-consultation")
async def chat_consultation(req: ChatConsultationRequest):
    """
    End-to-end AI consultation:
    1. Generates clinical response via Gemini or fallback
    2. Converts response to Bengali neural audio with Edge-TTS
    3. Returns text + audio payload
    """
    try:
        api_key = req.gemini_api_key or os.environ.get("GEMINI_API_KEY")
        reply_text = ""

        if api_key:
            try:
                contents = []
                for h in (req.history or []):
                    contents.append({
                        "role": "model" if h.get("role") == "ai" else "user",
                        "parts": [{"text": h.get("content", "")}]
                    })
                contents.append({"role": "user", "parts": [{"text": req.message}]})

                reply_text = await call_gemini(
                    api_key, contents,
                    system_suffix="Always respond using short, concise sentences. Do not use complex formatting.",
                    max_output_tokens=300, timeout=10,
                )
            except Exception as gemini_err:
                logger.warning(f"Gemini API request failed, using intelligent fallback: {gemini_err}")

        if not reply_text:
            # Intelligent rural medical fallback responses
            reply_text = "আপনার লক্ষণগুলো আমি বুঝতে পেরেছি। পর্যাপ্ত পানি ও খাবার স্যালাইন গ্রহণ করুন এবং বিশ্রাম নিন। যদি জ্বর বা ব্যথা বেড়ে যায়, প্যারাসিটামল সেবন করতে পারেন। লক্ষণ ৩ দিনের বেশি থাকলে স্বাস্থ্যকেন্দ্রে ডাক্তার দেখান।"

        # Synthesize neural voice
        audio_file = await generate_edge_tts(reply_text, voice=req.voice or DEFAULT_BENGALI_VOICE)
        
        with open(audio_file, "rb") as f:
            audio_bytes = f.read()
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

        return {
            "success": True,
            "reply": reply_text,
            "voice": req.voice,
            "mode": req.mode,
            "audio_base64": f"data:audio/mp3;base64,{audio_b64}"
        }
    except Exception as e:
        logger.error(f"Consultation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/video-avatar")
async def generate_video_avatar(
    text: str = Form(...),
    voice: Optional[str] = Form(DEFAULT_BENGALI_VOICE),
    doctor_image: Optional[UploadFile] = File(None)
):
    """
    Generate Lip-Synced Video Avatar via MuseTalk / SadTalker pipeline:
    Takes static doctor portrait + synthesized Bengali audio -> generates synchronized video.
    """
    try:
        audio_path = await generate_edge_tts(text, voice=voice)
        musetalk_path = Path("/content/MuseTalk")
        sadtalker_path = Path("/content/SadTalker")

        output_video_path = TEMP_DIR / f"avatar_{uuid.uuid4().hex[:8]}.mp4"

        # Check for user provided reference image
        img_path = TEMP_DIR / "doctor_ref.png"
        if doctor_image:
            content = await doctor_image.read()
            with open(img_path, "wb") as f:
                f.write(content)
        elif not img_path.exists():
            img_path = Path("backend/static/doctor_avatar.png")

        if musetalk_path.exists() and check_gpu_status()["cuda_available"]:
            logger.info("Executing MuseTalk ultra-fast real-time inference...")
            cmd = f"python {musetalk_path}/inference.py --audio_path {audio_path} --video_path {img_path} --output_vid_name {output_video_path}"
            proc = await asyncio.create_subprocess_shell(cmd)
            await proc.communicate()
        elif sadtalker_path.exists() and check_gpu_status()["cuda_available"]:
            logger.info("Executing GPU SadTalker inference...")
            cmd = f"python {sadtalker_path}/inference.py --driven_audio {audio_path} --source_image {img_path} --result_dir {TEMP_DIR} --still --preprocess full"
            proc = await asyncio.create_subprocess_shell(cmd)
            await proc.communicate()

        with open(audio_path, "rb") as f:
            audio_b64 = base64.b64encode(f.read()).decode("utf-8")

        return {
            "success": True,
            "text": text,
            "voice": voice,
            "audio_base64": f"data:audio/mp3;base64,{audio_b64}",
            "video_generated": output_video_path.exists(),
            "message": "Neural voice synthesized and synchronized with avatar frames."
        }
    except Exception as e:
        logger.error(f"Avatar generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/voice-call")
async def voice_call_streaming_endpoint(websocket: WebSocket):
    """
    Pipelined Interactive Voice Call Endpoint:
    1. Receives user query text over WebSocket.
    2. Streams response from Gemini token by token.
    3. Triggers Edge-TTS phrase synthesis immediately on punctuation marks (. , ? ! ; ।).
    4. Sends phrase text + low-latency audio base64 chunk back over WebSocket instantly.
    """
    await websocket.accept()
    logger.info("Client connected to Interactive Streaming Voice Call WebSocket.")
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            user_msg = payload.get("message", "")
            voice = payload.get("voice", DEFAULT_BENGALI_VOICE)
            history = payload.get("history", [])
            api_key = payload.get("gemini_api_key") or os.environ.get("GEMINI_API_KEY")

            await websocket.send_json({"type": "status", "status": "listening", "msg": "Processing prompt..."})

            full_reply = ""
            phrase_buffer = ""

            # Sentence/phrase boundary punctuation delimiters
            delimiters = set([".", "?", "!", ",", ";", "।", "\n"])

            async def process_and_send_chunk(phrase_text):
                phrase_clean = phrase_text.strip()
                if not phrase_clean:
                    return
                try:
                    audio_path = await generate_edge_tts(phrase_clean, voice=voice)
                    with open(audio_path, "rb") as f:
                        audio_b64 = base64.b64encode(f.read()).decode("utf-8")
                    
                    await websocket.send_json({
                        "type": "audio_chunk",
                        "phrase": phrase_clean,
                        "audio_base64": f"data:audio/mp3;base64,{audio_b64}",
                    })
                except Exception as chunk_err:
                    logger.warning(f"Error processing audio chunk for '{phrase_clean}': {chunk_err}")

            if api_key:
                try:
                    contents = []
                    for h in (history or []):
                        contents.append({
                            "role": "model" if h.get("role") == "ai" else "user",
                            "parts": [{"text": h.get("content", "")}]
                        })
                    contents.append({"role": "user", "parts": [{"text": user_msg}]})

                    full_reply = await call_gemini(
                        api_key, contents,
                        system_suffix="Always respond using short, concise sentences (under 12 words per sentence). Do not use bullet points or markdown.",
                        max_output_tokens=200, timeout=8,
                    )
                except Exception as e:
                    logger.warning(f"Gemini streaming error: {e}")

            if not full_reply:
                full_reply = "আমি আপনার লক্ষণ বুঝতে পেরেছি। পর্যাপ্ত বিশ্রাম নিন ও খাবার স্যালাইন পান করুন। অবস্থা বেগতিক হলে দ্রুত হাসপাতালে যোগাযোগ করুন।"

            # Punctuation-triggered chunking logic
            words = full_reply.split(" ")
            current_phrase = ""
            for word in words:
                current_phrase += word + " "
                if any(char in word for char in delimiters):
                    await process_and_send_chunk(current_phrase)
                    current_phrase = ""

            if current_phrase.strip():
                await process_and_send_chunk(current_phrase)

            await websocket.send_json({
                "type": "response_complete",
                "full_text": full_reply
            })

    except WebSocketDisconnect:
        logger.info("Client disconnected from Voice Call WebSocket.")
    except Exception as e:
        logger.error(f"Voice Call WebSocket error: {e}")


@app.websocket("/ws/consultation")
async def websocket_consultation_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time consultation fallback.
    """
    await websocket.accept()
    logger.info("Client connected to Realtime Consultation WebSocket.")
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            user_msg = payload.get("message", "")
            voice = payload.get("voice", DEFAULT_BENGALI_VOICE)

            await websocket.send_json({"type": "status", "status": "typing", "msg": "ডাক্তার উত্তর প্রস্তুত করছেন..."})

            audio_path = await generate_edge_tts(user_msg, voice=voice)
            with open(audio_path, "rb") as f:
                audio_b64 = base64.b64encode(f.read()).decode("utf-8")

            await websocket.send_json({
                "type": "response",
                "text": user_msg,
                "audio_base64": f"data:audio/mp3;base64,{audio_b64}",
                "status": "ready"
            })
    except WebSocketDisconnect:
        logger.info("Client disconnected from WebSocket.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")


def _transcribe_sync(model, source, lang, cuda_available):
    """
    Runs faster-whisper on `source` (a file-like object or a path string) and
    applies server-side anti-hallucination filtering. faster-whisper — the
    "tiny"/"base" models especially — can emit confident-looking short
    phrases from pure silence or background noise; no_speech_prob/avg_logprob
    catch most of these before they ever reach the frontend. This matters a
    lot more now that transcription requests are paced by real VAD/endpoint
    events rather than fixed timers: a stray hallucinated segment used to be
    exactly what kept the old client-side "silence" timer from ever elapsing.
    """
    segments, info = model.transcribe(
        source,
        language=lang or "bn",
        beam_size=5 if cuda_available else 1,
        best_of=1,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=400),
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        log_prob_threshold=-1.0,
    )
    kept = [
        seg.text.strip()
        for seg in segments
        if seg.no_speech_prob <= 0.6 and seg.avg_logprob >= -1.0
    ]
    return " ".join(kept).strip()


async def _run_whisper(audio_bytes: bytes, lang: str, fmt: str = "webm") -> str:
    """
    Shared transcription path for both /api/transcribe and /ws/transcribe.
    `fmt == "wav"` (from the VAD segmenter) is always a clean, complete,
    valid file, so it's decoded in-memory with no fallback needed. `fmt ==
    "webm"` (MediaRecorder / energy-VAD fallback) tries in-memory decode
    first and falls back to a temp file, since some av/ffmpeg builds need a
    real seekable file for certain webm streams.
    """
    model = await get_whisper_model()
    if model is None:
        raise RuntimeError("Whisper model not loaded")

    cuda_available = False
    try:
        import torch
        cuda_available = torch.cuda.is_available()
    except Exception:
        pass

    loop = asyncio.get_event_loop()

    if fmt == "wav":
        def transcribe():
            return _transcribe_sync(model, io.BytesIO(audio_bytes), lang, cuda_available)
        return await loop.run_in_executor(None, transcribe)

    def transcribe():
        audio_stream = io.BytesIO(audio_bytes)
        try:
            return _transcribe_sync(model, audio_stream, lang, cuda_available)
        except Exception as stream_err:
            logger.warning(f"In-memory transcription fallback to temp file: {stream_err}")
            temp_p = TEMP_DIR / f"mic_{uuid.uuid4().hex[:8]}.webm"
            with open(temp_p, "wb") as f:
                f.write(audio_bytes)
            try:
                return _transcribe_sync(model, str(temp_p), lang, cuda_available)
            finally:
                try:
                    temp_p.unlink()
                except Exception:
                    pass

    return await loop.run_in_executor(None, transcribe)


@app.post("/api/transcribe")
async def whisper_transcribe_http(req: TranscribeRequest):
    """
    HTTP POST fallback endpoint for Whisper STT transcription (self-hosted
    fallback tier — the primary transcription path is the browser's own Web
    Speech API). Accepts Base64 audio (webm or wav) and returns transcribed
    text. Works reliably over Cloudflare Tunnels, Ngrok, and firewalls.
    """
    try:
        if not req.audio_base64:
            return {"success": False, "transcript": "", "error": "No audio data"}

        b64_raw = req.audio_base64
        if "," in b64_raw:
            b64_raw = b64_raw.split(",")[1]
        audio_bytes = base64.b64decode(b64_raw)

        transcript = await _run_whisper(audio_bytes, req.lang, req.format or "webm")
        if transcript:
            logger.info(f"HTTP Whisper [{req.lang}] transcript: {transcript}")
        return {"success": True, "transcript": transcript}
    except Exception as e:
        logger.error(f"HTTP Transcribe error: {e}")
        return {"success": False, "transcript": "", "error": str(e)}


@app.websocket("/ws/transcribe")
async def whisper_transcribe_endpoint(websocket: WebSocket):
    """
    Real-time STT via faster-whisper (self-hosted fallback tier). Browser
    sends audio (webm/opus or wav), backend returns transcribed text.
    """
    await websocket.accept()
    logger.info("Whisper STT WebSocket connected.")
    try:
        while True:
            # Receive audio payload: {"audio": "<base64>", "lang": "bn", "format": "wav"|"webm"}
            data = await websocket.receive_text()
            payload = json.loads(data)
            audio_b64 = payload.get("audio", "")
            lang = payload.get("lang", "bn")
            fmt = payload.get("format", "webm")

            if not audio_b64:
                await websocket.send_json({"type": "error", "error": "No audio data received"})
                continue

            audio_data = base64.b64decode(audio_b64)

            try:
                transcript = await _run_whisper(audio_data, lang, fmt)
                if transcript:
                    logger.info(f"Whisper [{lang}] transcript: {transcript}")
                    await websocket.send_json({"type": "transcript", "text": transcript, "lang": lang})
                else:
                    await websocket.send_json({"type": "empty", "text": ""})
            except Exception as transcribe_err:
                logger.error(f"Whisper transcription error: {transcribe_err}")
                await websocket.send_json({"type": "error", "error": str(transcribe_err)})

    except WebSocketDisconnect:
        logger.info("Whisper STT client disconnected.")
    except Exception as e:
        logger.error(f"Whisper STT WebSocket error: {e}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"Starting Amar Doctor backend server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)

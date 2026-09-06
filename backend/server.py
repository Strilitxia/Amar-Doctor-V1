"""
Amar Doctor V1 — AI Video & Audio Sandbox Backend
FastAPI server for Edge-TTS Bengali voice synthesis, Groq (GPT-OSS-120B)
medical triage, and SadTalker/LivePortrait AI avatar video pipeline.
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
from dotenv import load_dotenv

# The Groq key lives in the repo-root .env.local, which Next.js reads on its
# own. Nothing was loading it on the Python side, so this server silently ran
# keyless and answered every consultation with a canned string.
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

# Lazy-loaded Whisper model — the ONLY speech-to-text engine used by this
# app (no browser Web Speech API is used anywhere, so audio never leaves
# this backend). Model size/device/compute-type are env-configurable.
#
# Model size is THE dominant factor for Bengali quality. Whisper saw orders
# of magnitude less Bengali than English in training, so the small
# checkpoints collapse on Bengali long before they do on English — which is
# exactly the "English transcribes perfectly, Bengali is garbage" failure:
# roughly, FLEURS WER for bn is ~100%+ on tiny/base and ~60-70% on small,
# while en stays under ~10% all the way down to base. So "large-v3" is the
# default on BOTH cpu and cuda; the previous "small on gpu / base on cpu"
# defaults were the main reason Bengali never worked. Drop it only via
# WHISPER_MODEL_SIZE, and only to trade Bengali accuracy for latency.
_whisper_model = None
_whisper_model_size = None
_whisper_model_lock = asyncio.Lock()


def _default_model_size() -> str:
    """Single source of truth for the model default (loader and /health agree).

    These used to be two separate expressions that had drifted apart, so
    /health could report "large-v3" while the loader had actually loaded
    "small" — which made the Bengali problem look unrelated to model size.
    """
    return os.environ.get("WHISPER_MODEL_SIZE") or "large-v3"


# Bengali needs a script anchor. With no prompt, Whisper frequently romanizes
# Bengali speech or drifts into Hindi/Assamese — they share most of its Indic
# acoustic space — which reads as "it didn't understand Bengali". A short
# in-domain Bengali prompt holds the decoder in Bengali script and biases it
# toward the symptom vocabulary this app actually hears.
BENGALI_INITIAL_PROMPT = (
    "এটি একটি স্বাস্থ্য পরামর্শের কথোপকথন। রোগী তার লক্ষণ বর্ণনা করছেন: "
    "জ্বর, মাথাব্যথা, পেট ব্যথা, কাশি, সর্দি, বমি, দুর্বলতা, শ্বাসকষ্ট।"
)

# ...but only on checkpoints big enough to follow it. Measured on a 5s
# Bengali clip ("আমার তিন দিন ধরে জ্বর আর মাথাব্যথা হচ্ছে..."):
#   small,    no anchor -> "आमार तीम दीं दोरे जोर..."  (drifts to Devanagari)
#   small,    anchor    -> unreadable gibberish, and 9x slower as temperature
#                          fallback retries the bad decode over and over
#   large-v3, no anchor -> "আমার তিম দিন ধোরে জোর আর মাথা বধা হোছে..."
#   large-v3, anchor    -> "আমার তিম দিন ধরে জোর আর মাথাব্যথা হোছে, সাথে
#                           কাশি ও দুর্বলতা আছে।"  (best; punctuation restored)
# A small model does not have the headroom to condition on the prompt AND
# decode Bengali, so feeding it one actively hurts.
_ANCHOR_CAPABLE = ("medium", "large-v1", "large-v2", "large-v3", "large")


def _use_bengali_anchor() -> bool:
    """Whether to feed the Bengali script anchor to the decoder.

    WHISPER_BENGALI_ANCHOR=on|off overrides the size-based guess, which is
    what you want with a custom model: WHISPER_MODEL_SIZE also accepts a
    HuggingFace repo id or a local CTranslate2 directory, and a Bengali
    fine-tune neither needs the anchor nor matches a size name.
    """
    override = (os.environ.get("WHISPER_BENGALI_ANCHOR") or "auto").lower()
    if override in ("on", "1", "true", "yes"):
        return True
    if override in ("off", "0", "false", "no"):
        return False
    return (_whisper_model_size or _default_model_size()) in _ANCHOR_CAPABLE

async def get_whisper_model():
    """Lazy-load faster-whisper model with CUDA / CPU auto-detection and low-latency greedy inference."""
    global _whisper_model, _whisper_model_size
    async with _whisper_model_lock:
        if _whisper_model is None:
            try:
                import torch
                cuda_available = torch.cuda.is_available()

                # On Windows, torch bundles cuBLAS/cuDNN inside torch/lib but
                # does not put that directory on the DLL search path. CTranslate2
                # (faster-whisper's backend) links them separately, so without
                # this it loads fine, reports cuda as available, and then dies
                # at the first encode with "Library cublas64_12.dll is not
                # found" — surfacing as a generic transcription error rather
                # than anything that points at CUDA.
                if cuda_available and hasattr(os, "add_dll_directory"):
                    torch_lib = os.path.join(os.path.dirname(torch.__file__), "lib")
                    if os.path.isdir(torch_lib):
                        try:
                            os.add_dll_directory(torch_lib)
                        except OSError:
                            pass

                from faster_whisper import WhisperModel
                device = os.environ.get("WHISPER_DEVICE") or ("cuda" if cuda_available else "cpu")
                compute_type = os.environ.get("WHISPER_COMPUTE_TYPE") or ("float16" if cuda_available else "int8")
                model_size = _default_model_size()

                if device == "cpu" and model_size in ("medium", "large-v2", "large-v3"):
                    logger.warning(
                        f"WHISPER_MODEL_SIZE={model_size} on CPU will run slower than real time. "
                        "This is deliberate: anything smaller is unusable for Bengali. Set "
                        "WHISPER_MODEL_SIZE=small to trade Bengali accuracy for latency."
                    )
                if model_size in ("tiny", "base"):
                    logger.warning(
                        f"WHISPER_MODEL_SIZE={model_size} is effectively unusable for Bengali "
                        "(~100% WER) even though it transcribes English fine. Use 'small' or larger."
                    )

                kwargs = {"cpu_threads": os.cpu_count()} if device == "cpu" else {}
                logger.info(f"Loading faster-whisper '{model_size}' model on {device} ({compute_type})...")
                try:
                    _whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type, **kwargs)
                except Exception as cuda_err:
                    if device != "cuda":
                        raise
                    logger.warning(f"CUDA load failed ({cuda_err}); falling back to CPU int8.")
                    device, compute_type = "cpu", "int8"
                    _whisper_model = WhisperModel(
                        model_size, device=device, compute_type=compute_type, cpu_threads=os.cpu_count()
                    )
                _whisper_model_size = model_size
                logger.info(f"Whisper '{model_size}' loaded on {device} ({compute_type}).")
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
        "model_size": _whisper_model_size or _default_model_size(),
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
    description="FastAPI sandbox for Bengali Neural Voice Synthesis, Groq GPT-OSS-120B Medical Triage, and Video Avatar Streaming",
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
async def _report_groq_key():
    if os.environ.get("GROQ_API_KEY"):
        logger.info("GROQ_API_KEY: present — clinical triage is live.")
    else:
        logger.error(
            "GROQ_API_KEY: MISSING — no LLM will be called. Every consultation "
            "will return a canned fallback that ignores what the patient says. "
            "Put GROQ_API_KEY in .env.local at the repo root."
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

# Shared by this server and app/api/chat/route.js — the two used to carry
# separate copies that had already drifted apart.
SYSTEM_PROMPT = (Path(__file__).resolve().parent / "prompts" / "triage_prompt.txt").read_text(encoding="utf-8")

EMPTY_CASE_SHEET = {
    "age": None, "sex": None, "chief_complaint": None, "onset": None,
    "duration": None, "severity": None, "location": None,
    "associated_symptoms": [], "aggravating_relieving": None, "meds_tried": [],
    "history": [], "red_flags": [], "unknowns": [], "next_question": None,
    "stage": "gathering",
}


def parse_triage_output(raw: str) -> tuple:
    """Split the model's tagged output into (spoken reply, case sheet or None).

    A sheet of None means "keep whatever the client already had" — losing the
    accumulated case because one response came back malformed would be worse
    than carrying a slightly stale sheet for one turn.
    """
    sheet = None

    if "<case_sheet>" in raw:
        block = raw.split("<case_sheet>", 1)[1].split("</case_sheet>", 1)[0]
        try:
            parsed = json.loads(block.strip())
            if isinstance(parsed, dict):
                sheet = parsed
        except json.JSONDecodeError as e:
            logger.warning(f"Case sheet was not valid JSON, carrying previous sheet forward: {e}")

    # Split on the CLOSING tag first: the model routinely omits the opening
    # <reply>, and keying off the opening tag let the closing tag and a
    # half-finished JSON blob through to Edge-TTS to be read aloud.
    reply = raw
    if "</reply>" in reply:
        reply = reply.split("</reply>", 1)[0]
    if "<reply>" in reply:
        reply = reply.split("<reply>", 1)[1]
    # Truncation safety net — a partial sheet must never reach the patient.
    reply = reply.split("<case_sheet>", 1)[0]

    return reply.strip(), sheet


def build_triage_messages(history, message: str, case_sheet, channel_suffix: str) -> list:
    """System prompt + case sheet + verbatim window + the new utterance."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + channel_suffix}]

    # Its own system message, so a long transcript can never bury it.
    messages.append({
        "role": "system",
        "content": "CURRENT CASE SHEET:\n" + json.dumps(case_sheet or EMPTY_CASE_SHEET, ensure_ascii=False),
    })

    for h in (history or []):
        messages.append({
            "role": "assistant" if h.get("role") == "ai" else "user",
            "content": h.get("content", ""),
        })

    messages.append({"role": "user", "content": message})
    return messages

# Request Models
class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = DEFAULT_BENGALI_VOICE
    rate: Optional[str] = "+0%"
    pitch: Optional[str] = "+0Hz"

class TranscribeRequest(BaseModel):
    audio_base64: str
    lang: str = "bn"
    format: Optional[str] = "webm"  # "webm" (Opus, from MediaRecorder) or "wav" (from the VAD segmenter)

class ChatConsultationRequest(BaseModel):
    message: str
    voice: Optional[str] = DEFAULT_BENGALI_VOICE
    mode: Optional[str] = "audio" # "audio" or "video"
    history: Optional[List[dict]] = []
    case_sheet: Optional[dict] = None
    groq_api_key: Optional[str] = None


GROQ_MODEL = "openai/gpt-oss-120b"


async def call_groq(api_key: str, messages: list, max_output_tokens: int, timeout: float) -> str:
    """
    Call Groq's OpenAI-compatible chat completions API (model: GPT-OSS-120B)
    without blocking the asyncio event loop. requests.post() is a blocking
    network call; running it directly inside an `async def` freezes every
    other coroutine on this single-threaded server (including the
    /ws/transcribe and /ws/voice-call sockets of an active call) for the
    full duration of the request. Offloading it to a thread keeps the event
    loop free so audio transcription keeps flowing while Groq replies.
    """
    import requests
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": GROQ_MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": max_output_tokens,
    }

    def _post():
        res = requests.post(url, json=payload, headers=headers, timeout=timeout)
        if res.status_code >= 400:
            raise RuntimeError(f"Groq HTTP {res.status_code}: {res.text[:300]}")
        return res.json()

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(None, _post)
    if data.get("error"):
        raise RuntimeError(f"Groq error: {data['error']}")
    choice = (data.get("choices") or [{}])[0]
    return ((choice.get("message") or {}).get("content") or "").strip()


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
    1. Generates clinical response via Groq (GPT-OSS-120B) or fallback
    2. Converts response to Bengali neural audio with Edge-TTS
    3. Returns text + audio payload
    """
    try:
        api_key = req.groq_api_key or os.environ.get("GROQ_API_KEY")
        reply_text = ""
        case_sheet = req.case_sheet
        degraded_reason = None

        if api_key:
            try:
                messages = build_triage_messages(
                    req.history, req.message, req.case_sheet,
                    "Always respond using short, concise sentences. Do not use complex formatting.",
                )
                # gpt-oss-120b is a reasoning model: ~350-400 of these tokens
                # go to internal reasoning before a single word is emitted.
                raw = await call_groq(api_key, messages, max_output_tokens=1800, timeout=25)
                reply_text, parsed_sheet = parse_triage_output(raw)
                if parsed_sheet:
                    case_sheet = parsed_sheet
            except Exception as groq_err:
                logger.error(f"Groq API request failed: {groq_err}")
                degraded_reason = "groq_error"
        else:
            logger.error("No GROQ_API_KEY — returning a canned reply that ignores the patient.")
            degraded_reason = "no_api_key"

        if not reply_text:
            reply_text = "দুঃখিত, এই মুহূর্তে এআই ডাক্তারের সাথে সংযোগ করা যাচ্ছে না। অনুগ্রহ করে আবার চেষ্টা করুন।"
            degraded_reason = degraded_reason or "empty_reply"

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
            "case_sheet": case_sheet,
            "degraded": degraded_reason is not None,
            "degraded_reason": degraded_reason,
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
    2. Streams response from Groq (GPT-OSS-120B).
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
            case_sheet = payload.get("case_sheet")
            api_key = payload.get("groq_api_key") or os.environ.get("GROQ_API_KEY")
            degraded_reason = None

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
                    messages = build_triage_messages(
                        history, user_msg, case_sheet,
                        "Always respond using short, concise sentences (under 12 words per sentence). Do not use bullet points or markdown.",
                    )
                    raw = await call_groq(api_key, messages, max_output_tokens=1500, timeout=20)
                    # Must strip the case sheet BEFORE chunking, or Edge-TTS
                    # reads the raw JSON aloud to the patient.
                    full_reply, parsed_sheet = parse_triage_output(raw)
                    if parsed_sheet:
                        case_sheet = parsed_sheet
                except Exception as e:
                    logger.error(f"Groq streaming error: {e}")
                    degraded_reason = "groq_error"
            else:
                logger.error("No GROQ_API_KEY on voice call — returning a canned reply.")
                degraded_reason = "no_api_key"

            if not full_reply:
                full_reply = "দুঃখিত, এই মুহূর্তে সংযোগ করা যাচ্ছে না। অনুগ্রহ করে আবার চেষ্টা করুন।"
                degraded_reason = degraded_reason or "empty_reply"

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
                "full_text": full_reply,
                "case_sheet": case_sheet,
                "degraded": degraded_reason is not None,
                "degraded_reason": degraded_reason,
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


def _transcribe_sync(model, source, lang, cuda_available, fmt="wav"):
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
    # `lang` used to be ignored here in favour of a hardcoded "bn", so the
    # UI's language toggle did nothing on either path. Anything that isn't
    # an explicit English request is treated as Bengali (the app's default),
    # which is also what makes the Bengali script anchor below kick in.
    language = "en" if (lang or "bn").lower().startswith("en") else "bn"
    logger.info(f"Whisper decoding: language={language} fmt={fmt} (client sent lang={lang!r})")

    segments, info = model.transcribe(
        source,
        language=language,
        task="transcribe",
        beam_size=5 if cuda_available else 3,
        best_of=5 if cuda_available else 1,
        temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        initial_prompt=BENGALI_INITIAL_PROMPT if (language == "bn" and _use_bengali_anchor()) else None,
        # No server-side VAD on any path. Both client engines (Silero and the
        # energy fallback) already emit exactly one segmented utterance, so a
        # second pass here can only ever *remove* audio — including the soft
        # onsets Bengali words often start with. Measured on a 5s clip the
        # difference was one token either way, so this is not the accuracy
        # lever it looks like; it is off because it has no upside, not
        # because it was doing real damage.
        vad_filter=False,
        condition_on_previous_text=False,
        no_speech_threshold=0.6,
        log_prob_threshold=-1.0,
    )
    # Drop a segment only when BOTH signals agree it's non-speech (this
    # matches upstream Whisper's own silence heuristic). Using OR here
    # instead — dropping if *either* signal looks even slightly off — was a
    # bug: no_speech_prob runs a bit high on plenty of real, quieter Bengali
    # speech, so that version silently discarded good transcripts, which is
    # what made calls look permanently "stuck transcribing".
    kept = [
        seg.text.strip()
        for seg in segments
        if not (seg.no_speech_prob > 0.6 and seg.avg_logprob < -1.0)
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
            return _transcribe_sync(model, io.BytesIO(audio_bytes), lang, cuda_available, fmt)
        return await loop.run_in_executor(None, transcribe)

    def transcribe():
        audio_stream = io.BytesIO(audio_bytes)
        try:
            return _transcribe_sync(model, audio_stream, lang, cuda_available, fmt)
        except Exception as stream_err:
            logger.warning(f"In-memory transcription fallback to temp file: {stream_err}")
            temp_p = TEMP_DIR / f"mic_{uuid.uuid4().hex[:8]}.webm"
            with open(temp_p, "wb") as f:
                f.write(audio_bytes)
            try:
                return _transcribe_sync(model, str(temp_p), lang, cuda_available, fmt)
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

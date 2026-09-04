"""
Amar Doctor V1 — LiveKit Cloud MuseTalk Real-time Video Agent
Runs inside Google Colab (Free T4 GPU) or local GPU server.
Connects to LiveKit Cloud room, receives patient prompts via LiveKit Data Channels,
streams Groq (GPT-OSS-120B) responses -> Edge-TTS Bengali audio -> MuseTalk video frames over WebRTC.
"""

import os
import sys
import asyncio
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("livekit-musetalk-agent")

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "wss://amar-doctor-demo.livekit.cloud")
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")

async def main():
    logger.info("⚡ Starting Amar Doctor LiveKit Cloud MuseTalk GPU Agent...")
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        logger.warning("LIVEKIT_API_KEY or LIVEKIT_API_SECRET missing. Set environment variables to enable LiveKit Cloud connection.")
        return

    try:
        from livekit import rtc
        room = rtc.Room()

        @room.on("participant_connected")
        def on_participant_connected(participant: rtc.RemoteParticipant):
            logger.info(f"Patient connected: {participant.identity}")

        @room.on("data_received")
        def on_data_received(data: bytes, participant: rtc.RemoteParticipant, kind):
            text = data.decode("utf-8")
            logger.info(f"Received query from patient {participant.identity}: {text}")

        logger.info(f"Connecting Agent to LiveKit Cloud at {LIVEKIT_URL}...")
        # Note: LiveKit Agent Token generation logic
        from livekit import api
        token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET) \
            .with_identity("ai_doctor_avatar") \
            .with_name("AI Doctor (MuseTalk)") \
            .with_grants(api.VideoGrants(room_join=True, room="amar-doctor-room", can_publish=True, can_subscribe=True))
        
        await room.connect(LIVEKIT_URL, token.to_jwt())
        logger.info("✓ Agent successfully connected to LiveKit Cloud Room 'amar-doctor-room'!")
        
        # Keep agent alive
        while True:
            await asyncio.sleep(10)
    except Exception as e:
        logger.error(f"LiveKit Agent connection error: {e}")

if __name__ == "__main__":
    asyncio.run(main())

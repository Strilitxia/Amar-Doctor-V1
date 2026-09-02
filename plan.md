# Comprehensive Project Plan: AI-Powered Telemedicine Platform for Rural Bangladesh
**Project Name:**Amar Doctor V1
**Target Deployment:** Progressive Web App (PWA) optimized for low-bandwidth networks

---

## 1. Executive Summary
**Problem Statement:** Rural populations in Bangladesh face severe shortages of accessible medical professionals. Patients often lack immediate consultations, misinterpret prescriptions, and have no reliable system for emergency medical response or finding nearby physical healthcare facilities.

**Solution:** A highly accessible, 100% free-to-operate AI telemedicine platform designed specifically for rural constraints. The system combines an offline-capable web application with an advanced agentic AI backend. To build trust and simulate real human interaction, the platform features a real-time AI video and audio avatar speaking in natural Bengali and English, alongside an integrated geographical map to locate nearby medical help.

---

## 2. Core Features

*   **Real-Time AI Video & Audio Consultations:** A live call interface where users interact with a human-like AI doctor. 
    *   **Video Mode:** Powered by a static portrait animated in real-time, lipsyncing to highly realistic, empathetic Edge-TTS neural voices (supporting native Bengali like `bn-BD-NabanitaNeural`).
    *   **Audio-Only Mode (Low Bandwidth):** A toggle to disable the video feed, relying entirely on the natural AI voice. This is crucial for extremely poor network connections in remote areas, utilizing the same WebRTC peer connection but dropping the video track to save bandwidth.
*   **Doctor & Hospital Map:** An interactive map module that uses the user's current GPS location to find and display the nearest hospitals, clinics, and doctors, complete with routing distance.
*   **Agentic AI Medical Assistant:** A multi-agent system powered by Gemini to triage symptoms, provide preliminary medical suggestions, and converse with patients.
*   **Prescription Analysis (OCR):** Users can upload photos of handwritten or printed prescriptions. The system will utilize the Gemini Vision API to intelligently process the image and extract comprehensive details, including:
    *   **Medication Identification:** Understands the exact name and dosage of each prescribed medicine.
    *   **Timing & Schedule:** Explains clearly when to take the medication (e.g., morning/night, before or after meals).
    *   **Purpose & Indication:** Details exactly which medicine works for what specific condition or symptom.
    *   **Side Effects:** Outlines potential warnings and precautions in simple language.
*   **Emergency SOS / Ambulance Routing:** A one-tap emergency alert that captures geolocation and pushes a high-priority alert to an admin dashboard for ambulance dispatch.
*   **Offline Medical Assistant (PWA):** Users can select symptoms from a pre-downloaded database to find potential diseases and immediate first-aid steps, even when the internet is completely disconnected.

---

## 3. Technology Stack (100% Free-Tier Architecture)

The stack is designed to minimize server costs to zero during the development and initial rollout phases, utilizing powerful free tiers and open-source models.

### Frontend
*   **Framework:** Next.js (App Router)
*   **Styling:** Tailwind CSS
*   **Mapping UI:** `@googlemaps/js-api-loader` for rendering the map inside Next.js client components.
*   **Offline Capabilities:** `next-pwa` (Service Workers and IndexedDB for offline symptom caching)

### Backend, Database & Geolocation
*   **Infrastructure:** Supabase (Free Tier)
*   **Database:** PostgreSQL. This allows for complex SQL query logic to handle relationships between users, medical logs, and emergency requests.
*   **Authentication:** Supabase Auth (Phone number / OTP preferred for rural accessibility)
*   **Storage:** Supabase Storage (for uploading prescription images securely)
*   **Real-time:** Supabase Realtime (for chat messaging and instant SOS dashboard updates)
*   **Geolocation API:** Google Maps Places API (Nearby Search). Google provides a $200 recurring monthly credit, which makes searching for `type=hospital` completely free for development and low-volume production.

### AI & Media Pipeline
*   **LLM Brain & OCR:** Google Gemini API (Free tier handles 15 RPM for both text generation and image analysis).
*   **Voice Synthesis:** Edge-TTS (Free, open-source access to Azure Neural voices for zero-latency, natural-sounding Bengali/English).
*   **Video Avatar:** LivePortrait or SadTalker (Open-source AI face animation).
*   **Compute:** Google Colab (Free T4 GPU tier) to run the heavy AI video rendering.
*   **Streaming:** WebSockets / WebRTC over Cloudflare tunnels to stream video frames and audio from Colab to the Next.js frontend. WebRTC handles both audio and video streams simultaneously over the same connection.

---

## 4. Implementation Phases

### Phase 1: Foundation & Database Modeling
1.  Initialize Next.js project with Tailwind CSS.
2.  Integrate `next-pwa` to ensure offline caching is built in from day one.
3.  Set up the Supabase project and define the SQL schema for:
    *   `users` (id, phone, location, demographics)
    *   `chat_sessions` (id, user_id, timestamps)
    *   `messages` (id, session_id, sender, content)
    *   `prescriptions` (id, user_id, image_url, extracted_text)
    *   `emergencies` (id, user_id, lat, lng, status)
4.  Implement Supabase Auth.

### Phase 2: Core Web, Map & AI Features
1.  Build the Next.js UI components (Dashboard, Chat Interface, Map View).
2.  **Doctor Map Implementation:** Use `@googlemaps/js-api-loader` to initialize the map. Capture user coordinates via the browser's Geolocation API. Query the Google Places API (Nearby Search) for `types: ['hospital']` to drop pins on nearby medical facilities.
3.  Connect the Next.js API routes to the Gemini API.
4.  Implement the text-based Medical Assistant chat.
5.  Build the Prescription Upload flow: Image uploads to Supabase Storage -> Triggers Next.js API -> Gemini Vision analyzes the image to extract dosage, timing, and purpose -> Saves formatted text to the database and displays it to the user.

### Phase 3: Offline Functionality & SOS Real-time
1.  Create a JSON payload of common symptoms and corresponding first-aid/disease info.
2.  Configure IndexedDB to store this data locally on the user's device upon first load.
3.  Implement the offline Symptom Checker UI that queries the local IndexedDB.
4.  Build the SOS feature using Supabase Realtime so that inserting a row into `emergencies` immediately triggers a notification on a separate Admin View component.

### Phase 4: The AI Video & Audio Pipeline (The Sandbox)
*Note: This phase utilizes high-performance local hardware or Google Colab for AI execution.*
1.  Set up a Google Colab notebook with a FastAPI server.
2.  Integrate `edge-tts` to convert Gemini's text responses into natural Bengali audio waveforms.
3.  Load the `LivePortrait` or `SadTalker` model into the Colab environment.
4.  Write a script that takes the audio file and a static doctor image, generating synchronized video frames. *Note: If the user selects 'Audio Only', bypass the video rendering entirely to save GPU compute and immediately return the audio payload.*
5.  Expose the Colab FastAPI server to the public web using `ngrok` or `cloudflared`.

### Phase 5: Integration & Streaming (Audio & Video)
1.  Connect the Next.js frontend to the Colab WebSocket URL.
2.  Capture the user's microphone/text input on the frontend and send it to the backend pipeline.
3.  Implement a UI toggle for "Video Call" vs "Audio Call". 
4.  Receive the generated media from Colab. 
5.  Render the media: 
    *   If Video: Render frames dynamically onto an HTML5 `<canvas>` or `<video>` element, playing synced audio.
    *   If Audio: Play the high-quality TTS audio file without attempting to fetch or render video frames.

---

## 5. Risk Mitigation & Next Steps
*   **Bandwidth Constraints:** The addition of the Audio-Only toggle directly solves bandwidth issues in deep rural areas. WebRTC natively supports dynamic bandwidth adjustment and allows dropping the video track completely to maintain call stability.
*   **Map API Costs:** The Google Maps Platform offers a $200 recurring monthly credit, which is more than enough to cover testing and initial usage. Monitor API limits in the Google Cloud Console to ensure you do not exceed the free tier.
*   **Colab Disconnections:** Colab's free tier will disconnect after inactivity. For production or final university presentations, the FastAPI pipeline can be migrated to a dedicated GPU instance (e.g., RunPod) or run locally on a high-performance PC using Steam Link for remote demonstrations.
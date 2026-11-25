# NexovAI Voice Agent: Doctor Appointment Booking

A voice AI receptionist for a clinic. A caller speaks to the agent in the browser, and it can check doctor availability, book an appointment and cancel one. A React dashboard shows the call and the doctors' slots updating live.

Built for the NexovAI SDE Intern Round 1 assignment.

## How it works

```
Browser mic -> WebRTC -> Silero VAD -> ElevenLabs STT -> Gemini (LLM + tools) -> ElevenLabs TTS -> Browser speaker
                                                              |
                                                       SQLite database
                                                              |
                                          FastAPI -> React dashboard (polls every ~1.5s)
```

| Stage | What it does |
|---|---|
| Pipecat + SmallWebRTCTransport | Runs the real-time audio pipeline on localhost |
| Silero VAD | Detects when the caller starts and stops speaking |
| ElevenLabs STT | Speech to text |
| Gemini (Google AI Studio free tier) | Decides the reply and calls tools |
| ElevenLabs TTS (`eleven_flash_v2_5`) | Text to speech |
| SQLite | Stores doctors, slots and appointments |
| FastAPI (`api.py`) | Exposes the same database to the dashboard |
| React + Vite (`dashboard/`) | Call screen, live transcript and doctor slot grid |

## Agent tools

- `check_doctor_availability`: lists open slots, filtered by doctor, speciality or date
- `book_appointment`: books a slot for a phone number
- `cancel_appointment`: cancels the caller's booked appointment

**Caller identification:** the caller is identified only by the phone number they say out loud. The agent reads the number back digit by digit and waits for a clear "yes" before booking or cancelling.

## Database

Three tables in `clinic.db`, created automatically on first run with 3 sample doctors and slots for the next 4 days:

- `doctors(id, name, speciality)`
- `slots(id, doctor_id, start, booked)`
- `appointments(id, slot_id, phone, patient_name, status, created_at)`

## Setup

Requirements: Python 3.10 to 3.12, Node.js 18+, a microphone (use headphones to avoid echo).

```bash
# 1. Python environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Mac/Linux
pip install "pipecat-ai[webrtc,silero,elevenlabs,google,runner]" fastapi uvicorn python-dotenv

# 2. API keys
copy .env.example .env          # Windows (use cp on Mac/Linux)
# then open .env and fill in your keys

# 3. Dashboard
cd dashboard
npm install
```

`.env` needs:

```
GOOGLE_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

Keys: Gemini from aistudio.google.com, ElevenLabs from elevenlabs.io (the key needs Speech to Text and Text to Speech access).

## Run

Open three terminals in the project root (activate the venv in the first two).

```bash
# Terminal 1: voice bot (port 7860)
python bot.py

# Terminal 2: dashboard API (port 8001)
python -m uvicorn api:app --port 8001

# Terminal 3: dashboard (port 5173)
cd dashboard
npm run dev
```

Open http://localhost:5173, allow the microphone and press the call button.

## Try it

1. Press call and let the greeting play.
2. Ask for a doctor or speciality, for example "a cardiologist tomorrow".
3. Pick a slot and give your name.
4. Say a 10-digit phone number. The agent reads it back, so say "yes" to confirm.
5. Watch the slot turn orange on the dashboard.
6. Call again with the same number and say "cancel my appointment" to free the slot.

## Project structure

```
bot.py          Pipecat pipeline and system prompt
tools.py        The 3 agent tools and their schemas
db.py           SQLite setup and sample data
api.py          FastAPI endpoints for the dashboard (/doctors, /appointments)
dashboard/      React + Vite frontend
test_stt.py     Standalone check of the ElevenLabs STT key
test_llm.py     Standalone check of the Gemini key
test_tts.py     Standalone check of the ElevenLabs TTS key
```

## Notes and limitations

- Runs locally. Gemini free tier has rate limits and ElevenLabs free credits are limited, so keep test calls short.
- Use headphones. Without them the bot's own voice can leak into the mic and be transcribed as the caller.
- The phone-number confirmation is enforced through the system prompt. A stricter version would also check a "confirmed" flag inside the tools.
- Not handled yet: authentication, echo cancellation and simultaneous bookings of the same slot.

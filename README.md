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
p

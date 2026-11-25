import os, io, wave, math, struct, requests
from dotenv import load_dotenv
load_dotenv(override=True)

buf = io.BytesIO()
w = wave.open(buf, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
w.writeframes(b"".join(struct.pack("<h", int(8000*math.sin(i/10))) for i in range(32000)))
w.close(); buf.seek(0)

r = requests.post(
    "https://api.elevenlabs.io/v1/speech-to-text",
    headers={"xi-api-key": os.getenv("ELEVENLABS_API_KEY")},
    data={"model_id": "scribe_v1"},
    files={"file": ("t.wav", buf, "audio/wav")},
    timeout=60,
)
print(r.status_code, r.text[:300])
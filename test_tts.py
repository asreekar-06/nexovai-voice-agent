import os, requests
from dotenv import load_dotenv
load_dotenv(override=True)

key = os.getenv("ELEVENLABS_API_KEY")
vid = os.getenv("ELEVENLABS_VOICE_ID")
H = {"xi-api-key": key}

print("key length:", len(key or ""), "| voice:", vid)

# 1) try the current voice
r = requests.post(
    f"https://api.elevenlabs.io/v1/text-to-speech/{vid}",
    headers={**H, "Content-Type": "application/json"},
    json={"text": "Hello, this is a test.", "model_id": "eleven_flash_v2_5"},
    timeout=30,
)
print("TTS status:", r.status_code, "| bytes:", len(r.content))
if r.status_code != 200:
    print("TTS error:", r.text[:300])

# 2) list voices this account can use
v = requests.get("https://api.elevenlabs.io/v1/voices", headers=H, timeout=30)
print("voices status:", v.status_code)
if v.status_code == 200:
    for x in v.json().get("voices", []):
        print(x["voice_id"], "|", x["name"], "|", x.get("category"))
else:
    print(v.text[:300])
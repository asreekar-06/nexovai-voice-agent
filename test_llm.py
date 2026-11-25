import os, time
from dotenv import load_dotenv
from google import genai
load_dotenv(override=True)

c = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"), http_options={"timeout": 15000})
for m in ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-4-hydrogen"]:
    t = time.time()
    try:
        r = c.models.generate_content(model=m, contents="Say hi in 3 words")
        print(m, "OK", round(time.time() - t, 1), "s:", r.text)
    except Exception as e:
        print(m, "FAIL", round(time.time() - t, 1), "s:", str(e)[:150])
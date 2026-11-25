from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import db
db.init()
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/doctors")
def doctors():
    c = db.conn()
    out = []
    for d in c.execute("SELECT * FROM doctors"):
        slots = [dict(s) for s in c.execute("SELECT id,start,booked FROM slots WHERE doctor_id=? ORDER BY start", (d["id"],))]
        out.append({**dict(d), "slots": slots})
    return out

@app.get("/appointments")
def appointments():
    return [dict(r) for r in db.conn().execute(
        "SELECT a.id,a.phone,a.patient_name,a.status,a.created_at,s.start,d.name doctor "
        "FROM appointments a JOIN slots s ON s.id=a.slot_id JOIN doctors d ON d.id=s.doctor_id ORDER BY a.id DESC")]
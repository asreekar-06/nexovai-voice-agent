import re
from db import conn
from pipecat.adapters.llm.schemas.function_schema import FunctionSchema
from pipecat.adapters.llm.schemas.tools_schema import ToolsSchema
from pipecat.services.llm_service import FunctionCallParams

def _phone(p: str) -> str:
    return re.sub(r"\D", "", p or "")[-10:]

async def check_doctor_availability(params: FunctionCallParams):
    a = params.arguments
    q = "SELECT s.id slot_id, d.name doctor, d.speciality, s.start FROM slots s JOIN doctors d ON d.id=s.doctor_id WHERE s.booked=0"
    args = []
    if a.get("doctor"):
        q += " AND (d.name LIKE ? OR d.speciality LIKE ?)"
        args += [f"%{a['doctor']}%"] * 2
    if a.get("date"):
        q += " AND s.start LIKE ?"; args.append(f"{a['date']}%")
    q += " ORDER BY s.start LIMIT 8"
    rows = [dict(r) for r in conn().execute(q, args)]
    await params.result_callback({"slots": rows} if rows else {"slots": [], "note": "no matching slots"})

async def book_appointment(params: FunctionCallParams):
    a = params.arguments
    phone = _phone(a.get("phone"))
    if len(phone) != 10:
        return await params.result_callback({"error": "phone must be 10 digits, ask caller again"})
    c = conn()
    slot = c.execute("SELECT * FROM slots WHERE id=? AND booked=0", (a.get("slot_id"),)).fetchone()
    if not slot:
        return await params.result_callback({"error": "slot taken or invalid, offer other slots"})
    c.execute("UPDATE slots SET booked=1 WHERE id=?", (slot["id"],))
    c.execute("INSERT INTO appointments(slot_id,phone,patient_name) VALUES(?,?,?)",
              (slot["id"], phone, a.get("patient_name", "")))
    c.commit()
    await params.result_callback({"status": "booked", "slot_id": slot["id"], "time": slot["start"]})

async def cancel_appointment(params: FunctionCallParams):
    phone = _phone(params.arguments.get("phone"))
    c = conn()
    ap = c.execute("SELECT * FROM appointments WHERE phone=? AND status='booked' ORDER BY id DESC", (phone,)).fetchone()
    if not ap:
        return await params.result_callback({"error": "no active appointment for this number"})
    c.execute("UPDATE appointments SET status='cancelled' WHERE id=?", (ap["id"],))
    c.execute("UPDATE slots SET booked=0 WHERE id=?", (ap["slot_id"],))
    c.commit()
    await params.result_callback({"status": "cancelled"})

tools = ToolsSchema(standard_tools=[
    FunctionSchema(name="check_doctor_availability",
        description="List open slots. Filter by doctor name/speciality and/or date.",
        properties={"doctor": {"type": "string"}, "date": {"type": "string", "description": "YYYY-MM-DD"}},
        required=[]),
    FunctionSchema(name="book_appointment",
        description="Book a slot. Only call after the caller confirmed their phone number.",
        properties={"slot_id": {"type": "integer"}, "phone": {"type": "string"}, "patient_name": {"type": "string"}},
        required=["slot_id", "phone"]),
    FunctionSchema(name="cancel_appointment",
        description="Cancel the caller's appointment. Only call after phone number is confirmed.",
        properties={"phone": {"type": "string"}}, required=["phone"]),
])
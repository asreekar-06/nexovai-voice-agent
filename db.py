import sqlite3
from datetime import date, timedelta

DB = "clinic.db"

def conn():
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    return c

def init():
    c = conn()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS doctors(id INTEGER PRIMARY KEY, name TEXT, speciality TEXT);
    CREATE TABLE IF NOT EXISTS slots(id INTEGER PRIMARY KEY, doctor_id INT, start TEXT, booked INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS appointments(
        id INTEGER PRIMARY KEY, slot_id INT, phone TEXT, patient_name TEXT,
        status TEXT DEFAULT 'booked', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    """)
    if not c.execute("SELECT 1 FROM doctors").fetchone():
        docs = [("Dr. Anjali Rao", "General Physician"),
                ("Dr. Karthik Reddy", "Cardiologist"),
                ("Dr. Meera Iyer", "Dermatologist")]
        c.executemany("INSERT INTO doctors(name,speciality) VALUES(?,?)", docs)
        for doc_id in (1, 2, 3):
            for d in range(1, 5):
                day = (date.today() + timedelta(days=d)).isoformat()
                for t in ("10:00", "11:00", "12:00", "15:00", "16:00"):
                    c.execute("INSERT INTO slots(doctor_id,start) VALUES(?,?)", (doc_id, f"{day} {t}"))
    c.commit(); c.close()
import { useEffect, useRef, useState } from "react";
import { PipecatClient } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import "./App.css";

const API = "http://localhost:8001";
const BOT = "http://localhost:7860/start";
const TIMES = ["10:00", "11:00", "12:00", "15:00", "16:00"];

type Slot = { id: number; start: string; booked: number };
type Doctor = { id: number; name: string; speciality: string; slots: Slot[] };
type Appt = { id: number; phone: string; patient_name: string; status: string; start: string; doctor: string };
type Line = { who: "you" | "agent"; text: string };
type CallState = "idle" | "ringing" | "live" | "ended";
type Toast = { kind: "booked" | "cancelled"; doctor: string; start: string };

const dayLabel = (d: string) => new Date(d + "T00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
const longDay = (s: string) =>
  new Date(s.replace(" ", "T")).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const mmss = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const spaced = (p: string) => p.replace(/(\d{5})(\d{5})/, "$1 $2");

export default function App() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [call, setCall] = useState<CallState>("idle");
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [secs, setSecs] = useState(0);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [freshSlots, setFreshSlots] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const [online, setOnline] = useState(false);
  const [openAppts, setOpenAppts] = useState(false);
  const [openDocs, setOpenDocs] = useState<Set<number>>(new Set());
  const toggleDoc = (id: number) =>
  setOpenDocs((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const client = useRef<PipecatClient | null>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const seen = useRef<Set<string> | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const botAn = useRef<AnalyserNode | null>(null);
  const userAn = useRef<AnalyserNode | null>(null);
  const liveRef = useRef(false);
  const ringTimer = useRef<number>(0);

  /* sounds */
  const tone = (freqs: number[], dur: number, vol = 0.04) => {
    const c = ctxRef.current;
    if (!c) return;
    freqs.forEach((f) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur);
    });
  };
  const startRing = () => {
    tone([440, 480], 0.9);
    ringTimer.current = window.setInterval(() => tone([440, 480], 0.9), 2000);
  };
  const stopRing = () => clearInterval(ringTimer.current);
  const endTone = () => {
    tone([480], 0.18);
    setTimeout(() => tone([350], 0.3), 200);
  };

  /* data polling */
  useEffect(() => {
    const tick = async () => {
      try {
        const [d, a]: [Doctor[], Appt[]] = await Promise.all([
          fetch(`${API}/doctors`).then((r) => r.json()),
          fetch(`${API}/appointments`).then((r) => r.json()),
        ]);
        setOnline(true);
        setDoctors(d);
        setAppts(a);
        const keys = new Set(a.map((x) => `${x.id}:${x.status}`));
        if (seen.current) {
          const added = a.filter((x) => !seen.current!.has(`${x.id}:${x.status}`));
          if (added.length) {
            setOpenAppts(true);
            const ids = d.filter((x) => added.some((y) => y.doctor === x.name)).map((x) => x.id);
            setOpenDocs((s) => new Set([...s, ...ids]));
            setFresh(new Set(added.map((x) => `${x.id}:${x.status}`)));
            setFreshSlots(new Set(added.map((x) => `${x.doctor}|${x.start}`)));
            const last = added[0];
            setToast({ kind: last.status === "cancelled" ? "cancelled" : "booked", doctor: last.doctor, start: last.start });
            setTimeout(() => { setFresh(new Set()); setFreshSlots(new Set()); }, 2600);
            setTimeout(() => setToast(null), 8000);
          }
        }
        seen.current = keys;
      } catch {
        setOnline(false);
      }
    };
    tick();
    const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, []);

  /* timer / scroll */
  useEffect(() => {
    liveRef.current = call === "live";
    if (call !== "live") return;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [call]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, toast]);

  /* waveform */
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext("2d")!;
    const N = 40;
    const vals = new Array(N).fill(0);
    const buf = new Uint8Array(64);
    let raf = 0;
    const level = (an: AnalyserNode | null) => {
      if (!an) return 0;
      an.getByteFrequencyData(buf);
      let s = 0;
      for (let i = 2; i < 30; i++) s += buf[i];
      return Math.min(1, (s / 28 / 255) * 2.2);
    };
    const loop = (t: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const b = level(botAn.current), u = level(userAn.current);
      const lv = liveRef.current ? Math.max(b, u) : 0;
      const col = b >= u ? "#e8501f" : "#1b1a17";
      const gap = w / N;
      for (let i = 0; i < N; i++) {
        const wob = 0.45 + 0.55 * Math.abs(Math.sin(i * 0.55 + t / 170));
        const target = 2 + lv * wob * h * 0.95;
        vals[i] += (target - vals[i]) * 0.28;
        g.fillStyle = lv > 0.02 ? col : "rgba(27,26,23,.16)";
        const bw = Math.max(2, gap * 0.4);
        g.beginPath();
        g.roundRect(i * gap + (gap - bw) / 2, h / 2 - vals[i] / 2, bw, vals[i], bw / 2);
        g.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* call control */
  const add = (who: Line["who"], text: string) => {
    const t = text.trim();
    if (!t) return;
    setLines((l) => (l.slice(-4).some((x) => x.who === who && x.text === t) ? l : [...l, { who, text: t }]));
  };

  const hook = (track: MediaStreamTrack, local: boolean) => {
    try {
      const c = ctxRef.current;
      if (!c || track.kind !== "audio") return;
      const an = c.createAnalyser();
      an.fftSize = 128;
      c.createMediaStreamSource(new MediaStream([track])).connect(an);
      if (local) userAn.current = an;
      else botAn.current = an;
    } catch (e) {
      console.error("hook failed", e);
    }
  };

  const finish = () => {
    stopRing();
    if (liveRef.current) endTone();
    liveRef.current = false;
    setSpeaking(false);
    setCall("ended");
  };

  async function start() {
    setLines([]);
    setMuted(false);
    setToast(null);
    setCall("ringing");
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    await ctxRef.current.resume();
    startRing();

    const c = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      callbacks: {
        onBotReady: () => { stopRing(); tone([880], 0.12); setCall("live"); },
        onDisconnected: () => finish(),
        onUserTranscript: (d: any) => d.final && add("you", d.text),
        onBotOutput: (d: any) => d.text && add("agent", d.text),
        onBotStartedSpeaking: () => setSpeaking(true),
        onBotStoppedSpeaking: () => setSpeaking(false),
        onTrackStarted: (track: MediaStreamTrack, p: any) => {
          hook(track, !!p?.local);
          if (!p?.local && track.kind === "audio" && audioEl.current)
            audioEl.current.srcObject = new MediaStream([track]);
        },
        onError: (m: any) => console.error("pipecat error", JSON.stringify(m)),
      },
    });
    client.current = c;
    try {
      await c.startBotAndConnect({
        endpoint: BOT,
        requestData: { createDailyRoom: false, enableDefaultIceServers: true, transport: "webrtc" },
      } as any);
    } catch (e) {
      console.error("connect failed", e);
      stopRing();
      setCall("idle");
    }
  }

  async function end() {
    await client.current?.disconnect();
    finish();
  }

  function toggleMute() {
    client.current?.enableMic(muted);
    setMuted(!muted);
  }

  const live = call === "live";
  const status =
    call === "ringing" ? "Ringing" : call === "ended" ? "Ended" : call === "idle" ? "Ready" : speaking ? "Speaking" : "Listening";

  return (
    <div className="page">
      <audio ref={audioEl} autoPlay />
      <header>
        <h1>Clinic line</h1>
        <span className={`dot mono ${online ? "on" : ""}`}>{online ? "online" : "offline"}</span>
      </header>

      <main>
        <section className="phone-wrap">
          <div className={`phone ${call}`}>
            <div className="who">
              <div className="avatar">R</div>
              {call !== "idle" && (
              <div className="state mono">
                <i className={`pip ${call}`} />
                {status}
                {live && <span> · {mmss(secs)}</span>}
              </div>
            )}
            </div>

            <canvas ref={canvas} className="wave" />

            <div className="screen">
              {lines.length === 0 && <p className="hint">{call === "ringing" ? "Connecting" : "Press call to book an appointment"}</p>}
              {lines.map((l, i) => (
                <p key={i} className={`bubble ${l.who}`}>{l.text}</p>
              ))}
              {toast && (
                <div className={`confirm ${toast.kind}`}>
                  <span className="mono">{toast.kind === "booked" ? "Confirmed" : "Cancelled"}</span>
                  <b>{toast.doctor}</b>
                  <span>{longDay(toast.start)} · {toast.start.split(" ")[1]}</span>
                </div>
              )}
              <div ref={logEnd} />
            </div>

            <div className="dock">
              {live || call === "ringing" ? (
                <>
                  <button className={`round ghost ${muted ? "on" : ""}`} onClick={toggleMute} disabled={!live} aria-label="Mute">
                    <svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2Z" />{muted && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />}</svg>
                  </button>
                  <button className="round end" onClick={end} aria-label="End call">
                    <svg viewBox="0 0 24 24" style={{ transform: "rotate(135deg)" }}><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1Z" /></svg>
                  </button>
                </>
              ) : (
                <button className="callbtn" onClick={start}>
                  <svg viewBox="0 0 24 24"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11 11 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.6 3.6a1 1 0 0 1-.25 1Z" /></svg>
                  {call === "ended" ? "Again" : "Call"}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="data">
  <button className="head" onClick={() => setOpenAppts(!openAppts)} aria-expanded={openAppts}>
    <h2>Appointments</h2>
    <span className="mono">{appts.filter((a) => a.status === "booked").length}</span>
    <svg className={`chev ${openAppts ? "open" : ""}`} viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" /></svg>
  </button>
  {openAppts && (
    <div className="appts">
      {appts.length === 0 && <p className="empty">None yet</p>}
      {appts.map((a) => (
        <div key={a.id} className={`row ${a.status} ${fresh.has(`${a.id}:${a.status}`) ? "flash" : ""}`}>
          <div>
            <b>{a.patient_name || "Caller"}</b>
            <span className="mono">{spaced(a.phone)}</span>
          </div>
          <div>{a.doctor}</div>
          <div className="mono">{longDay(a.start)} · {a.start.split(" ")[1]}</div>
          <div className="tag">{a.status}</div>
        </div>
      ))}
    </div>
  )}

  <h2 className="sec">Doctors</h2>
  {doctors.map((d) => {
    const days = [...new Set(d.slots.map((s) => s.start.split(" ")[0]))];
    const open = openDocs.has(d.id);
    const free = d.slots.filter((s) => !s.booked).length;
    return (
      <div className="doc" key={d.id}>
        <button className="dochead" onClick={() => toggleDoc(d.id)} aria-expanded={open}>
          <span className="docname">
            <span>{d.name}</span>
            <span className="mono">{d.speciality}</span>
          </span>
          <span className="mono">{free} open</span>
          <svg className={`chev ${open ? "open" : ""}`} viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" /></svg>
        </button>
        {open && (
          <div className="grid" style={{ gridTemplateColumns: `42px repeat(${days.length}, 1fr)` }}>
            <span />
            {days.map((dt) => <span key={dt} className="mono h">{dayLabel(dt)}</span>)}
            {TIMES.map((t) => (
              <div className="contents" key={t}>
                <span className="mono t">{t}</span>
                {days.map((dt) => {
                  const s = d.slots.find((x) => x.start === `${dt} ${t}`);
                  const hot = freshSlots.has(`${d.name}|${dt} ${t}`);
                  return <span key={dt + t} className={`cell ${!s ? "none" : s.booked ? "taken" : ""} ${hot ? "hot" : ""}`} />;
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  })}
</section>
      </main>
    </div>
  );
}
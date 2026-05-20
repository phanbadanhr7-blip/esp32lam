import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAKR90UMhbD5ScOYEFMEQxqh60JjTa_4fo",
  authDomain: "esp32-f210f.firebaseapp.com",
  databaseURL: "https://esp32-f210f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "esp32-f210f",
  storageBucket: "esp32-f210f.firebasestorage.app",
  messagingSenderId: "908437122792",
  appId: "1:908437122792:web:0d95511540df4e7e4e635d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

interface Device {
  id: string;
  label: string;
  icon: string;
}

const DEVICES: Device[] = [
  { id: "den_phong_khach", label: "Den Phong Khach", icon: "💡" },
  { id: "quat_tran",       label: "Quat Tran",       icon: "🌬️" },
  { id: "dieu_hoa",        label: "Dieu Hoa",        icon: "❄️" },
  { id: "den_san_vuon",    label: "Den San Vuon",    icon: "🌳" },
];

type LogType = "info" | "success" | "warn" | "error" | "toggle";

interface LogConfigValue {
  color: string;
  bg: string;
  icon: string;
}

const LOG_CFG: Record<LogType, LogConfigValue> = {
  info:    { color: "#58a6ff", bg: "rgba(88,166,255,0.10)",  icon: "ℹ" },
  success: { color: "#3fb950", bg: "rgba(63,185,80,0.10)",   icon: "✓" },
  warn:    { color: "#d29922", bg: "rgba(210,153,34,0.10)",  icon: "⚠" },
  error:   { color: "#f85149", bg: "rgba(248,81,73,0.10)",   icon: "✕" },
  toggle:  { color: "#00d4a0", bg: "rgba(0,212,160,0.10)",   icon: "⚡" },
};

interface LogEntry {
  id: number;
  type: LogType;
  msg: string;
  time: string;
}

// ── Firebase Realtime connection hook ─────────────────────
function useFirebase(addLog: (type: LogType, msg: string) => void) {
  const [states, setStates]           = useState<Record<string, boolean>>(() => Object.fromEntries(DEVICES.map(d => [d.id, false])));
  const [connected, setConnected]     = useState(false);
  const [esp32Online, setEsp32Online] = useState(false);
  const addLogRef = useRef(addLog);
  useEffect(() => { addLogRef.current = addLog; }, [addLog]);

  useEffect(() => {
    addLogRef.current("info", "Bat dau dang ky lang nghe Firebase qua WebSocket SDK...");

    // Listen to Firebase Realtime Database connection status
    const connectedRef = ref(db, ".info/connected");
    const unsubConnection = onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      setConnected(isConnected);
      if (isConnected) {
        addLogRef.current("success", "Firebase ket noi OK (WebSocket)");
      } else {
        addLogRef.current("error", "Mat ket noi toi Firebase");
      }
    });

    // Listen to device statuses
    const devicesRef = ref(db, "devices");
    const unsubDevices = onValue(devicesRef, (snap) => {
      const data = snap.val();
      if (data && typeof data === "object") {
        setStates(prev => ({ ...prev, ...data }));
      }
    }, (err) => {
      addLogRef.current("error", `Loi load thiet bi: ${err.message}`);
    });

    // Listen to ESP32 online heartbeat
    const statusOnlineRef = ref(db, "status/online");
    const unsubStatus = onValue(statusOnlineRef, (snap) => {
      const online = snap.val();
      setEsp32Online(online === true);
    }, (err) => {
      addLogRef.current("error", `Loi status: ${err.message}`);
    });

    return () => {
      unsubConnection();
      unsubDevices();
      unsubStatus();
    };
  }, []);

  const toggle = async (id: string) => {
    const next = !states[id];
    const dev  = DEVICES.find(d => d.id === id);
    setStates(prev => ({ ...prev, [id]: next }));
    addLogRef.current("toggle", `${dev?.label}: ${next ? "BAT" : "TAT"}`);
    try {
      const deviceRef = ref(db, `devices/${id}`);
      await set(deviceRef, next);
      addLogRef.current("success", `Ghi OK: ${dev?.label}`);
    } catch (e: any) {
      setStates(prev => ({ ...prev, [id]: !next }));
      addLogRef.current("error", `Ghi loi: ${e.message}`);
    }
  };

  return { states, connected, esp32Online, toggle };
}

// ── Stars ─────────────────────────────────────────────────────
function Stars() {
  const stars = useRef(
    Array.from({ length: 55 }, (_, i) => ({
      id: i, x: Math.random()*100, y: Math.random()*100,
      r: Math.random()*1.3+0.3, op: Math.random()*0.4+0.1,
      dur: Math.random()*3+2,   delay: Math.random()*5,
    }))
  ).current;
  return (
    <svg style={{ position:"fixed",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0 }}>
      {stars.map(s => (
        <circle key={s.id} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="white">
          <animate attributeName="opacity" values={`${s.op};${s.op*0.1};${s.op}`}
            dur={`${s.dur}s`} repeatCount="indefinite" begin={`${s.delay}s`} />
        </circle>
      ))}
    </svg>
  );
}

// ── Device Card ───────────────────────────────────────────────
interface DeviceCardProps {
  key?: string;
  label: string;
  icon: string;
  on: boolean;
  onToggle: () => void;
}

function DeviceCard({ label, icon, on, onToggle }: DeviceCardProps) {
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:15 }}>
      <button onClick={onToggle} style={{
        position:"relative",width:"100%",aspectRatio:"0.65",
        borderRadius:28,cursor:"pointer",
        overflow:"hidden",outline:"none",padding:0,
        background: on
          ? "linear-gradient(160deg,#0d2e28 0%,#0a4438 30%,#00c896 100%)"
          : "linear-gradient(160deg,#12161f 0%,#171d2c 60%,#1a2238 100%)",
        border: on ? "1px solid rgba(0, 212, 160, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: on
          ? "0 0 40px rgba(0, 212, 160, 0.25)"
          : "0 10px 30px rgba(0,0,0,0.4)",
        transition:"all .5s cubic-bezier(.4,0,.2,1)",
      }}>
        {on && <div style={{
          position:"absolute",top:-1,left:"10%",right:"10%",height:2,
          background:"linear-gradient(90deg,transparent,#5fffda,transparent)",
          boxShadow:"0 0 16px 3px #5fffda77",
        }}/>}
        <div style={{
          position:"absolute",inset:0,borderRadius:28,pointerEvents:"none",
          border: on ? "1px solid rgba(0,212,160,0.4)" : "1px solid rgba(255,255,255,0.08)",
          transition:"border-color .5s",
        }}/>
        {on && <div style={{
          position:"absolute",bottom:0,left:0,right:0,height:"50%",pointerEvents:"none",
          background:"linear-gradient(to top,rgba(0,210,145,.22),transparent)",
        }}/>}
        <div style={{
          position:"absolute",top:"45%",left:"50%",
          transform:"translate(-50%,-50%)",
          fontSize:32,opacity: on ? 1 : 0.2,
          transition:"opacity .4s, filter .4s",
          filter: on ? "drop-shadow(0 0 8px rgba(0,255,180,.6))" : "none",
        }}>{icon}</div>
        <div style={{
          position:"absolute",bottom:20,left:"30%",
          width: "40%",height:4,borderRadius:4,
          background: on ? "#ffd700" : "rgba(255, 255, 255, 0.1)",
          boxShadow: on ? "0 0 12px #ffd700" : "none",
          transition:"all .4s",
        }}/>
      </button>
      <span style={{
        fontSize:11,fontWeight:700,color:"rgba(255,255,255,.4)",
        letterSpacing:"1.5px",textAlign:"center",textTransform:"uppercase",
      }}>{label}</span>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────
interface BadgeProps {
  label: string;
  online: boolean;
}

function Badge({ label, online }: BadgeProps) {
  return (
    <div style={{
      display:"flex",alignItems:"center",gap:8,padding:"6px 16px",borderRadius:20,
      fontSize:11,fontWeight:700,letterSpacing:"1px",
      border:"1px solid rgba(255, 255, 255, 0.1)",
      background:"rgba(255, 255, 255, 0.03)",
      color:"#fff",
      textTransform:"uppercase",
    }}>
      <div style={{
        width:8,height:8,borderRadius:"50%",
        background: online ? "#00d4a0" : "#f85149",
        boxShadow: online ? "0 0 10px #00d4a0" : "none",
        transition:"all .4s",
      }}/>
      <span>{label} {online ? (label === "ESP32-C3" ? "ONLINE" : "CONNECTED") : "OFFLINE"}</span>
    </div>
  );
}

// ── Activity Log ──────────────────────────────────────────────
interface ActivityLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

function ActivityLog({ logs, onClear }: ActivityLogProps) {
  const ref_ = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref_.current) ref_.current.scrollTop = ref_.current.scrollHeight;
  }, [logs]);
  return (
    <div style={{
      position:"relative",zIndex:10,margin:"20px auto 40px",
      maxWidth:660,width:"calc(100% - 28px)",
      background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:20,overflow:"hidden",display:"flex",flexDirection:"column",
    }}>
      <div style={{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)",
        background:"rgba(0,0,0,0.2)",
      }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <div style={{
            width:8,height:8,borderRadius:"50%",background:"#00d4a0",
            boxShadow:"0 0 10px #00d4a0",animation:"blinkDot 1.4s ease-in-out infinite",
          }}/>
          <span style={{ fontSize:10,fontWeight:800,letterSpacing:"2px",color:"rgba(255,255,255,0.3)",textTransform:"uppercase" }}>
            SYSTEM ACTIVITY LOG
          </span>
          <span style={{
            fontSize:9,padding:"1px 7px",borderRadius:10,fontWeight:700,
            background:"rgba(0,212,160,0.12)",color:"#00d4a0",
          }}>{logs.length}</span>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:12 }}>
          <span style={{ color: "#00d4a0", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>LIVE UPDATE</span>
          <button onClick={onClear} style={{
            fontSize:9,color:"rgba(255,255,255,0.2)",background:"none",
            border:"1px solid rgba(255,255,255,0.07)",borderRadius:5,
            padding:"2px 8px",cursor:"pointer",letterSpacing:1,
          }}>XOA</button>
        </div>
      </div>
      <div ref={ref_} style={{
        height:190,overflowY:"auto",padding:"15px 20px",
        scrollbarWidth:"thin",scrollbarColor:"rgba(255,255,255,0.08) transparent",
      }}>
        {logs.length === 0
          ? <div style={{ textAlign:"center",padding:"36px 0",fontSize:11,color:"rgba(255,255,255,0.1)" }}>
              Chua co hoat dong...
            </div>
          : logs.map(log => {
            const t = LOG_CFG[log.type] || LOG_CFG.info;
            return (
              <div key={log.id} style={{
                display:"flex",alignItems:"flex-start",gap:12,
                padding:"5px 0 5px 12px",borderLeft:`2px solid ${t.color}`,margin:"4px 0",
              }}>
                <span style={{ fontSize:12,minWidth:70,color:"rgba(255,255,255,0.2)",
                  fontFamily:"'Courier New', monospace",marginTop:1,flexShrink:0 }}>{log.time}</span>
                <span style={{
                  width:16,height:16,borderRadius:4,flexShrink:0,
                  background:t.bg,color:t.color,fontSize:9,fontWeight:700,
                  display:"flex",alignItems:"center",justifyContent:"center",marginTop:1,
                }}>{t.icon}</span>
                <span style={{ fontSize:12,color:"rgba(255,255,255,0.7)",lineHeight:1.4, flex: 1 }}>
                  {log.msg}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const addLog = (type: LogType, msg: string) => {
    const time = new Date().toLocaleTimeString("vi-VN", { hour12:false });
    setLogs(prev => [...prev.slice(-99), { id: logId.current++, type, msg, time }]);
  };

  const { states, connected, esp32Online, toggle } = useFirebase(addLog);

  const prevConn  = useRef<boolean | null>(null);
  const prevEsp32 = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevConn.current !== null && prevConn.current !== connected)
      addLog(connected ? "success" : "error", connected ? "Firebase: DA KET NOI" : "Firebase: MAT KET NOI");
    prevConn.current = connected;
  }, [connected]);
  useEffect(() => {
    if (prevEsp32.current !== null && prevEsp32.current !== esp32Online)
      addLog(esp32Online ? "success" : "warn", esp32Online ? "ESP32-C3: ONLINE" : "ESP32-C3: OFFLINE");
    prevEsp32.current = esp32Online;
  }, [esp32Online]);

  return (
    <div style={{
      minHeight:"100vh",
      background:"#040609",
      fontFamily:"'Helvetica Neue', Arial, sans-serif",
      color:"#fff",position:"relative",overflow:"hidden",
      display:"flex",flexDirection:"column",paddingBottom:28,
    }}>
      <Stars/>
      <div style={{ position:"relative",zIndex:10,padding:"40px 18px 20px",display:"flex",flexDirection:"column",alignItems:"center" }}>
        <h1 style={{ margin:"0 0 20px 0",fontSize:24,fontWeight:700,letterSpacing:2,textTransform:"uppercase",textAlign:"center",color:"#fff" }}>
          Smart Home OS V4.0
        </h1>
        <div style={{ display:"flex",justifyContent:"center",gap:12 }}>
          <Badge label="FIREBASE" online={connected}/>
          <Badge label="ESP32-C3" online={esp32Online}/>
        </div>
      </div>

      <div style={{
        position:"relative",zIndex:10,
        display:"grid",gridTemplateColumns:"repeat(4,1fr)",
        gap:20,padding:"20px 14px",
        maxWidth:660,margin:"0 auto",width:"100%",boxSizing:"border-box",
      }}>
        {DEVICES.map(dev => (
          <DeviceCard key={dev.id} label={dev.label} icon={dev.icon}
            on={states[dev.id] || false} onToggle={() => toggle(dev.id)}/>
        ))}
      </div>

      <ActivityLog logs={logs} onClear={() => setLogs([])}/>

      <style>{`
        @keyframes blinkDot{0%,100%{opacity:1}50%{opacity:.2}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        button{transition:transform .15s}
        button:active{transform:scale(.95)}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}
      `}</style>
    </div>
  );
}

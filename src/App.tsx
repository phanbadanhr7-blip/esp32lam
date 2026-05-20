import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";
import { Pencil, Mic, MicOff } from "lucide-react";

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
function useFirebase(addLog: (type: LogType, msg: string) => void, deviceLabels: Record<string, string>) {
  const [states, setStates]           = useState<Record<string, boolean>>(() => Object.fromEntries(DEVICES.map(d => [d.id, false])));
  const [connected, setConnected]     = useState(false);
  const [esp32Online, setEsp32Online] = useState(false);
  const [esp32Ssid, setEsp32Ssid]     = useState("");
  const [esp32Ip, setEsp32Ip]         = useState("");
  const [esp32BootPressed, setEsp32BootPressed] = useState(false);
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

    // Listen to ESP32 connected Wi-Fi SSID
    const ssidRef = ref(db, "status/ssid");
    const unsubSsid = onValue(ssidRef, (snap) => {
      setEsp32Ssid(snap.val() || "");
    }, (err) => {
      console.warn("Loi load SSID:", err.message);
    });

    // Listen to ESP32 local IP
    const ipRef = ref(db, "status/ip");
    const unsubIp = onValue(ipRef, (snap) => {
      setEsp32Ip(snap.val() || "");
    }, (err) => {
      console.warn("Loi load IP:", err.message);
    });

    // Listen to real-time status of physical Boot Button (GPIO 9)
    const bootPressedRef = ref(db, "status/boot_pressed");
    const unsubBootPressed = onValue(bootPressedRef, (snap) => {
      setEsp32BootPressed(snap.val() === true);
    }, (err) => {
      console.warn("Loi load boot_pressed status:", err.message);
    });

    return () => {
      unsubConnection();
      unsubDevices();
      unsubStatus();
      unsubSsid();
      unsubIp();
      unsubBootPressed();
    };
  }, []);

  const toggle = async (id: string, forceState?: boolean) => {
    const current = states[id] || false;
    const next = forceState !== undefined ? forceState : !current;
    const dev  = DEVICES.find(d => d.id === id);
    const label = deviceLabels[id] || dev?.label || id;
    setStates(prev => ({ ...prev, [id]: next }));
    addLogRef.current("toggle", `${label}: ${next ? "BAT" : "TAT"}`);
    try {
      const deviceRef = ref(db, `devices/${id}`);
      await set(deviceRef, next);
      addLogRef.current("success", `Ghi OK: ${label}`);
    } catch (e: any) {
      setStates(prev => ({ ...prev, [id]: current }));
      addLogRef.current("error", `Ghi loi: ${e.message}`);
    }
  };

  const triggerWifiReset = async () => {
    addLogRef.current("warn", "Đang gửi yêu cầu xóa cấu hình Wi-Fi & Reset thiết bị...");
    try {
      const resetRef = ref(db, "devices/reset_wifi");
      await set(resetRef, true);
      addLogRef.current("success", "Đã gửi lệnh xoá Wi-Fi thành công! Chờ thiết bị phản hồi...");
    } catch (e: any) {
      addLogRef.current("error", `Lỗi gửi lệnh reset: ${e.message}`);
    }
  };

  return { states, connected, esp32Online, esp32Ssid, esp32Ip, esp32BootPressed, toggle, triggerWifiReset };
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
  onRename: (newLabel: string) => void;
}

function DeviceCard({ label, icon, on, onToggle, onRename }: DeviceCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(label);

  // Synchronize internal state when label prop changes from outside
  useEffect(() => {
    setEditVal(label);
  }, [label]);

  const handleSave = () => {
    const trimmed = editVal.trim();
    if (trimmed && trimmed !== label) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditVal(label);
      setIsEditing(false);
    }
  };

  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:12, width: "100%" }}>
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

      {isEditing ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          width: "100%",
          justifyContent: "center"
        }}>
          <input
            type="text"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            autoFocus
            style={{
              width: "100%",
              maxWidth: 120,
              background: "rgba(0,0,0,0.6)",
              border: "1px solid #00d4a0",
              borderRadius: 6,
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "4px 6px",
              textAlign: "center",
              outline: "none"
            }}
          />
        </div>
      ) : (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          justifyContent: "center",
          width: "100%",
          cursor: "pointer"
        }}
        onClick={() => setIsEditing(true)}
        title="Nhấp để đổi tên công tắc"
        >
          <span style={{
            fontSize:11,
            fontWeight:700,
            color:"rgba(255,255,255,.4)",
            letterSpacing:"1px",
            textAlign:"center",
            textTransform:"uppercase",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
            maxWidth: 110,
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#00d4a0";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "rgba(255,255,255,.4)";
          }}
          >
            {label}
          </span>
          <Pencil size={9} style={{
            color: "rgba(255,255,255,0.25)",
            cursor: "pointer",
            flexShrink: 0
          }}/>
        </div>
      )}
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

const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove Vietnamese accents
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
};

interface VoicePanelProps {
  toggle: (id: string, forceState?: boolean) => Promise<void>;
  deviceLabels: Record<string, string>;
  addLog: (type: LogType, msg: string) => void;
}

function VoicePanel({ toggle, deviceLabels, addLog }: VoicePanelProps) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [feedback, setFeedback] = useState("Nhấn nút Micro và nói lệnh để điều khiển");
  const [feedbackType, setFeedbackType] = useState<"info" | "success" | "error" | "warn">("info");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechLib = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechLib) {
      setSupported(false);
      return;
    }

    const rec = new SpeechLib();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "vi-VN";

    rec.onstart = () => {
      setListening(true);
      setTranscript("");
      setFeedback("Đang lắng nghe giọng nói...");
      setFeedbackType("info");
    };

    rec.onerror = (e: any) => {
      console.warn("Speech recognition error", e.error);
      setListening(false);
      if (e.error === "no-speech") {
        setFeedback("Không nghe rõ giọng nói. Hãy nhấn nút và thử lại.");
        setFeedbackType("warn");
      } else if (e.error === "not-allowed") {
        setFeedback("Lỗi: Trình duyệt chưa được cấp phép dùng Micro.");
        setFeedbackType("error");
      } else {
        setFeedback(`Lỗi nhận diện: ${e.error}`);
        setFeedbackType("error");
      }
    };

    rec.onend = () => {
      setListening(false);
    };

    rec.onresult = (event: any) => {
      const resultIndex = event.resultIndex;
      const rawText = event.results[resultIndex][0].transcript;
      setTranscript(rawText);
      
      const result = handleVoiceCommand(rawText);
      if (result.success) {
        setFeedback(result.message);
        setFeedbackType("success");
        addLog("success", `🎙️ Lệnh giọng nói: "${rawText}" -> ${result.message}`);
      } else {
        setFeedback(`Không thể xử lý lệnh: "${rawText}".`);
        setFeedbackType("warn");
        addLog("warn", `🎙️ Lệnh chưa rõ: "${rawText}"`);
      }
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [deviceLabels, toggle]);

  const toggleListening = () => {
    if (!supported) return;
    if (listening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.error("Failed to start speech recognition", err);
      }
    }
  };

  const handleVoiceCommand = (rawText: string) => {
    const norm = normalizeText(rawText);
    
    const turnOnKeywords = ["bat", "mo", "kich hoat", "on", "chay", "turn on", "enable"];
    const turnOffKeywords = ["tat", "dong", "ngat", "off", "turn off", "disable", "stop", "dung"];
    const allKeywords = ["tat ca", "het", "toan bo", "sach", "cac thiet bi", "all"];

    const hasOn = turnOnKeywords.some(kw => norm.includes(kw));
    const hasOff = turnOffKeywords.some(kw => norm.includes(kw));
    const hasAll = allKeywords.some(kw => norm.includes(kw));

    if (hasOn && hasAll) {
      DEVICES.forEach(dev => void toggle(dev.id, true));
      return { success: true, message: "Đã bật tất cả thiết bị" };
    }

    if (hasOff && hasAll) {
      DEVICES.forEach(dev => void toggle(dev.id, false));
      return { success: true, message: "Đã tắt tất cả thiết bị" };
    }

    // Exact matching inside device custom name / original name / ID keyword
    for (const dev of DEVICES) {
      const customLabel = deviceLabels[dev.id] || dev.label;
      const normCustom = normalizeText(customLabel);
      const normDefault = normalizeText(dev.label);
      const normId = dev.id.replace(/_/g, " ");

      if (norm.includes(normCustom) || norm.includes(normDefault) || norm.includes(normId)) {
        const targetState = hasOn ? true : hasOff ? false : undefined;
        if (targetState !== undefined) {
          toggle(dev.id, targetState);
          return { success: true, message: `Thực hiện ${targetState ? "Bật" : "Tắt"} "${customLabel}"` };
        } else {
          toggle(dev.id);
          return { success: true, message: `Thực hiện Chuyển đổi "${customLabel}"` };
        }
      }
    }

    // Partial/fuzz matching inside words of name
    for (const dev of DEVICES) {
      const customLabel = deviceLabels[dev.id] || dev.label;
      const normLabel = normalizeText(customLabel);
      const labelWords = normLabel.split(" ").filter(w => w.length > 2);

      const isSubWordMatch = labelWords.some(w => norm.includes(w));
      if (isSubWordMatch) {
        const targetState = hasOn ? true : hasOff ? false : undefined;
        if (targetState !== undefined) {
          toggle(dev.id, targetState);
          return { success: true, message: `Khớp gần đúng: ${targetState ? "Bật" : "Tắt"} "${customLabel}"` };
        } else {
          toggle(dev.id);
          return { success: true, message: `Khớp gần đúng: Chuyển đổi "${customLabel}"` };
        }
      }
    }

    return { success: false, message: "Hãy nói rõ hơn 'bật [thiết bị]' hoặc 'tắt [thiết bị]'." };
  };

  return (
    <div style={{
      position: "relative", zIndex: 10, margin: "0 auto 20px",
      maxWidth: 660, width: "calc(100% - 28px)",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 24, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16,
      backdropFilter: "blur(8px)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
            ĐIỀU KHIỂN GIỌNG NÓI AI
          </span>
          {supported && (
            <span style={{
              fontSize: 9, padding: "2px 8px", borderRadius: 12, fontWeight: 700,
              background: listening ? "rgba(248, 81, 73, 0.15)" : "rgba(0, 212, 160, 0.12)",
              color: listening ? "#ff5858" : "#00d4a0",
              letterSpacing: 1,
            }}>
              {listening ? "LISTENING" : "READY"}
            </span>
          )}
        </div>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", fontWeight: 600, letterSpacing: 0.5 }}>VIETNAMESE (VI-VN)</span>
      </div>

      {!supported ? (
        <div style={{ textAlign: "center", padding: "10px 0", color: "#f85149", fontSize: 12, fontWeight: 500 }}>
          ⚠️ Trình duyệt không hỗ trợ Web Speech API trực tiếp. Hãy đổi sang dùng Google Chrome hoặc Edge để sử dụng!
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={toggleListening}
              style={{
                width: 58, height: 58, borderRadius: "50%",
                background: listening
                  ? "linear-gradient(135deg, #f85149 0%, #aa2116 100%)"
                  : "linear-gradient(135deg, #161b22 0%, #0d1117 100%)",
                border: listening ? "1px solid rgba(248,81,73,0.5)" : "1px solid rgba(255,255,255,0.08)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: listening ? "0 0 20px rgba(248,81,73,0.5)" : "0 4px 12px rgba(0,0,0,0.4)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                outline: "none"
              }}
              title={listening ? "Nhấn để dừng nhận" : "Bắt đầu thu giọng nói"}
            >
              {listening ? <Mic color="#fff" size={22} /> : <Mic color="#00d4a0" size={22} />}
            </button>
            
            {listening && (
              <>
                <div style={{
                  position: "absolute", inset: -6, borderRadius: "50%",
                  border: "2px solid rgba(248,81,73,0.3)",
                  animation: "pulseWave 1.2s infinite ease-out",
                  pointerEvents: "none"
                }}/>
                <div style={{
                  position: "absolute", inset: -12, borderRadius: "50%",
                  border: "1px solid rgba(248,81,73,0.15)",
                  animation: "pulseWave 1.2s infinite ease-out",
                  animationDelay: "0.4s",
                  pointerEvents: "none"
                }}/>
              </>
            )}
          </div>

          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: feedbackType === "success" ? "#00d4a0" : feedbackType === "error" ? "#f85149" : feedbackType === "warn" ? "#d29922" : "#ffffff",
              transition: "all 0.2s"
            }}>
              {feedback}
            </div>
            
            {transcript && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                Nghe thấy: <span style={{ color: "#ffffff", fontWeight: 600 }}>"{transcript}"</span>
              </div>
            )}

            {listening ? (
              <div style={{ display: "flex", alignItems: "center", gap: 3, height: 14, marginTop: 4 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(num => (
                  <div key={num} style={{
                    width: 2,
                    background: "#f85149",
                    borderRadius: 1,
                    height: "100%",
                    animation: `voiceBar 0.8s ease-in-out infinite alternate`,
                    animationDelay: `${num * 0.05}s`
                  }}/>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                🗣️ Thử nói: <strong>"Bật {deviceLabels.den_phong_khach || "Đèn phòng khách"}"</strong> hoặc <strong>"Tắt tất cả"</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Remote Boot Button (GPIO 9) ──────────────────────────────
interface RemoteBootButtonProps {
  onTrigger: () => void;
  esp32Online: boolean;
  esp32BootPressed: boolean;
}

function RemoteBootButton({ onTrigger, esp32Online, esp32BootPressed }: RemoteBootButtonProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<any>(null);
  const progressIntervalRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setHolding(true);
    setProgress(0);
    const totalTime = 3000; // 3 seconds hold
    const step = 50;
    let elapsed = 0;

    progressIntervalRef.current = setInterval(() => {
      elapsed += step;
      const pct = Math.min((elapsed / totalTime) * 100, 100);
      setProgress(pct);
    }, step);

    timerRef.current = setTimeout(() => {
      onTrigger();
      setHolding(false);
      setProgress(0);
      clearInterval(progressIntervalRef.current);
    }, totalTime);
  };

  const handleEnd = () => {
    setHolding(false);
    setProgress(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
  };

  const buttonActive = holding || esp32BootPressed;

  return (
    <div style={{
      position: "relative", zIndex: 10, margin: "0 auto 20px",
      maxWidth: 660, width: "calc(100% - 28px)",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 24, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16,
      backdropFilter: "blur(8px)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
          Nút Bấm BOOT Chân 9 (Tương Tác Thực Tế)
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Physical Button Status Indicator */}
          <span style={{
            fontSize: 9, padding: "2px 8px", borderRadius: 12, fontWeight: 700,
            background: esp32BootPressed ? "rgba(235, 87, 87, 0.2)" : "rgba(39, 174, 96, 0.15)",
            color: esp32BootPressed ? "#ff4d4d" : "#22c55e",
            border: esp32BootPressed ? "1px solid rgba(235, 87, 87, 0.3)" : "1px solid rgba(39, 174, 96, 0.2)",
            display: "inline-flex", alignItems: "center", gap: 4,
            transition: "all 0.2s"
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              backgroundColor: esp32BootPressed ? "#ff4d4d" : "#22c55e",
              animation: esp32BootPressed ? "blinkDot 1s infinite" : "none"
            }} />
            {esp32BootPressed ? "NÚT VẬT LÝ ĐANG ĐƯỢC NHẤN" : "NÚT VẬT LÝ ĐANG NHẢ"}
          </span>

          <span style={{
            fontSize: 9, padding: "2px 8px", borderRadius: 12, fontWeight: 700,
            background: holding ? "rgba(248, 81, 73, 0.15)" : "rgba(255,255,255,0.05)",
            color: holding ? "#ff5858" : "rgba(255,255,255,0.4)",
            letterSpacing: 1,
          }}>
            {holding ? "DASHBOARD ĐANG GIỮ LỆNH" : "CHỜ NHẤN TRÊN WEB"}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        
        <div style={{ position: "relative", flexShrink: 0, width: 68, height: 68, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Ring progress bar overlay */}
          <svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
            <circle
              cx="34"
              cy="34"
              r="30"
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="3"
            />
            <circle
              cx="34"
              cy="34"
              r="30"
              fill="none"
              stroke={buttonActive ? "#ff5858" : "rgba(248, 81, 73, 0.2)"}
              strokeWidth="3"
              strokeDasharray="188.4"
              strokeDashoffset={188.4 - (188.4 * progress) / 100}
              style={{ transition: holding ? "none" : "stroke-dashoffset 0.15s ease-out" }}
            />
          </svg>

          <button
            onMouseDown={handleStart}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchEnd={handleEnd}
            style={{
              zIndex: 1,
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: buttonActive 
                ? "radial-gradient(circle, #2d1012 0%, #1a0607 100%)" 
                : "radial-gradient(circle, #1c2128 0%, #0d1117 100%)",
              border: buttonActive ? "2px solid #ff5858" : "2px solid rgba(255,255,255,0.12)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: buttonActive 
                ? "0 0 20px rgba(248,81,73,0.5), inset 0 2px 8px rgba(0,0,0,0.6)" 
                : "0 4px 12px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.05)",
              color: buttonActive ? "#ff5858" : "rgba(255,255,255,0.7)",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.5px",
              userSelect: "none",
              outline: "none",
              transform: buttonActive ? "scale(0.96)" : "scale(1)",
              transition: "all 0.1s"
            }}
            title="Nhấn và giữ 3 giây để kích hoạt BOOT"
          >
            {holding ? `${Math.round(progress)}%` : "BOOT 9"}
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: buttonActive ? "#ff5858" : "#ffffff",
            transition: "all 0.2s"
          }}>
            {esp32BootPressed 
              ? "🟢 PHÁT HIỆN: NÚT BOOT VẬT LÝ TRÊN ESP32-C3 ĐANG ĐƯỢC ĐỀ ĐÈ!"
              : holding 
                ? "⚠️ CẢNH BÁO: ĐANG GIỮ LỆNH BOOT REMOTE!" 
                : "Xoá Wi-Fi & Reset từ xa qua Cloud"}
          </div>
          
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: "1.5" }}>
            {esp32BootPressed ? (
              <span>Có ai đó đang <strong style={{ color: "#ff4d4d" }}>nhấn phím vật lý BOOT trên bo mạch ESP32-C3</strong> (hoặc chân GPIO 9 đang được kéo xuống GND). Trạng thái nhận diện trực tiếp qua Cloud trong thời gian thực.</span>
            ) : (
              <span>Nút bấm này ánh xạ đến chân <strong style={{ color: "#fff" }}>BOOT 9 (GPIO 9) thực tế</strong> của chip ESP32-C3. Nhấn giữ nút tròn bên trái 3 giây trên Web để gửi lệnh xóa thông tin Wi-Fi và khởi động lại bo mạch từ xa mà không cần nhấn nút nhựa trên thiết bị.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────
export default function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showFirmware, setShowFirmware] = useState(false);
  const [activeTab, setActiveTab] = useState<"control" | "config">("control");
  const logId = useRef(0);
  const addLog = (type: LogType, msg: string) => {
    const time = new Date().toLocaleTimeString("vi-VN", { hour12:false });
    setLogs(prev => [...prev.slice(-99), { id: logId.current++, type, msg, time }]);
  };

  const [deviceLabels, setDeviceLabels] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem("smart_home_device_labels");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      den_phong_khach: "Đèn Phòng Khách",
      quat_tran: "Quạt Trần",
      dieu_hoa: "Điều Hòa",
      den_san_vuon: "Đèn Sân Vườn"
    };
  });

  const saveLabel = (id: string, newLabel: string) => {
    const updated = { ...deviceLabels, [id]: newLabel };
    setDeviceLabels(updated);
    localStorage.setItem("smart_home_device_labels", JSON.stringify(updated));
    addLog("info", `Đã đổi tên công tắc sang: "${newLabel}"`);
  };

  const { states, connected, esp32Online, esp32Ssid, esp32Ip, esp32BootPressed, toggle, triggerWifiReset } = useFirebase(addLog, deviceLabels);

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
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: 12,
          padding: "8px 16px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20,
          backdropFilter: "blur(4px)",
          boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
        }}>
          <Badge label="FIREBASE" online={connected}/>
          <Badge label="ESP32-C3" online={esp32Online}/>

          {esp32Online && (esp32Ssid || esp32Ip) && (
            <>
              <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 11 }}>|</span>
              {esp32Ssid && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  <span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "#00d4a0" }} />
                  <span>Wi-Fi:</span>
                  <strong style={{ color: "#fff", fontWeight: 600 }}>{esp32Ssid}</strong>
                </span>
              )}
              {esp32Ssid && esp32Ip && (
                <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 11 }}>•</span>
              )}
              {esp32Ip && (
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  <span>IP:</span>
                  <strong style={{ color: "#fff", fontWeight: 600, fontFamily: "monospace" }}>{esp32Ip}</strong>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Tab Selector ────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: 12,
        padding: "0 18px 24px",
        position: "relative",
        zIndex: 10
      }}>
        <button
          onClick={() => setActiveTab("control")}
          style={{
            padding: "8px 20px",
            borderRadius: 14,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            letterSpacing: "1px",
            background: activeTab === "control" ? "rgba(0, 212, 160, 0.12)" : "rgba(255, 255, 255, 0.02)",
            border: activeTab === "control" ? "1.5px solid #00d4a0" : "1.5px solid rgba(255, 255, 255, 0.08)",
            color: activeTab === "control" ? "#00d4a0" : "rgba(255, 255, 255, 0.45)",
            boxShadow: activeTab === "control" ? "0 4px 12px rgba(0, 212, 160, 0.15)" : "none",
            transition: "all 0.25s ease",
            textTransform: "uppercase",
            outline: "none"
          }}
        >
          🎛️ Bảng Điều Khiển
        </button>
        <button
          onClick={() => setActiveTab("config")}
          style={{
            padding: "8px 20px",
            borderRadius: 14,
            fontSize: 11,
            fontWeight: 800,
            cursor: "pointer",
            letterSpacing: "1px",
            background: activeTab === "config" ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.02)",
            border: activeTab === "config" ? "1.5px solid rgba(255, 255, 255, 0.7)" : "1.5px solid rgba(255, 255, 255, 0.08)",
            color: activeTab === "config" ? "#ffffff" : "rgba(255, 255, 255, 0.45)",
            boxShadow: activeTab === "config" ? "0 4px 12px rgba(255, 255, 255, 0.08)" : "none",
            transition: "all 0.25s ease",
            textTransform: "uppercase",
            outline: "none"
          }}
        >
          ⚙️ Cấu Hình WiFi
        </button>
      </div>

      {activeTab === "control" ? (
        <>
          <div style={{
            position:"relative",zIndex:10,
            display:"grid",gridTemplateColumns:"repeat(4,1fr)",
            gap:20,padding:"20px 14px",
            maxWidth:660,margin:"0 auto",width:"100%",boxSizing:"border-box",
          }}>
            {DEVICES.map(dev => (
              <DeviceCard key={dev.id} label={deviceLabels[dev.id] || dev.label} icon={dev.icon}
                on={states[dev.id] || false} onToggle={() => toggle(dev.id)}
                onRename={(newLabel) => saveLabel(dev.id, newLabel)}/>
            ))}
          </div>

          <VoicePanel toggle={toggle} deviceLabels={deviceLabels} addLog={addLog} />
        </>
      ) : (
        <RemoteBootButton onTrigger={triggerWifiReset} esp32Online={esp32Online} esp32BootPressed={esp32BootPressed} />
      )}

      <ActivityLog logs={logs} onClear={() => setLogs([])}/>

      <div style={{
        position:"relative",
        zIndex:10,
        margin:"16px auto 0",
        maxWidth:660,
        width:"calc(100% - 28px)",
        textAlign:"center"
      }}>
        <button
          onClick={() => {
            const url = "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json";
            setShowFirmware(true);
          }}
          style={{
            background: "rgba(0, 212, 160, 0.1)",
            border: "1px solid rgba(0, 212, 160, 0.3)",
            borderRadius: 12,
            color: "#00d4a0",
            fontSize: 11,
            fontWeight: 700,
            padding: "10px 20px",
            cursor: "pointer",
            letterSpacing: 1,
            textTransform: "uppercase",
            transition: "all 0.3s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 212, 160, 0.2)";
            e.currentTarget.style.boxShadow = "0 0 15px rgba(0, 212, 160, 0.15)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0, 212, 160, 0.1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          📄 Xem Firmware ESP32-C3 & Hướng Dẫn Nạp
        </button>
      </div>

      {showFirmware && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(4, 6, 9, 0.85)",
          backdropFilter: "blur(12px)",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20
        }}>
          <div style={{
            background: "#0d1117",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 24,
            maxWidth: 800,
            width: "100%",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.6)",
            overflow: "hidden"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 24px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(0,0,0,0.2)"
            }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: 1, color: "#fff", textTransform: "uppercase" }}>
                FIRMWARE ESP32-C3 SMART HOME
              </h2>
              <button
                onClick={() => setShowFirmware(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 24,
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            <div style={{
              overflowY: "auto",
              padding: 24,
              fontSize: 13,
              color: "rgba(255, 255, 255, 0.8)",
              lineHeight: 1.6
            }}>
              <h3 style={{ marginTop: 0, color: "#00d4a0", fontSize: 14 }}>1. Sơ đồ kết nối phần cứng (GPIO)</h3>
              <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
                <li><strong>GPIO 1:</strong> Đèn Phòng Khách (den_phong_khach)</li>
                <li><strong>GPIO 2:</strong> Quạt Trần (quat_tran)</li>
                <li><strong>GPIO 3:</strong> Điều Hòa (dieu_hoa)</li>
                <li><strong>GPIO 4:</strong> Đèn Sân Vườn (den_san_vuon)</li>
                <li><strong>GPIO 9:</strong> Nút BOOT thiết bị (Ghi đè/Reset WiFi)</li>
              </ul>
              <p style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.5)", margin: "4px 0" }}>
                * Chế độ hoạt động Relay kích LOW (Active LOW: LOW = BẬT, HIGH = TẮT).
              </p>

              <h3 style={{ marginTop: 20, color: "#00d4a0", fontSize: 14 }}>2. Source Code Arduino (.ino)</h3>
              <p style={{ margin: "4px 0" }}>Bạn đã lưu tệp này thành công tại mục <code>/firmware/ESP32_SmartHome.ino</code> và <code>README.md</code>. Bạn có thể xem kỹ bản copy nhanh dưới đây:</p>
              
              <pre style={{
                background: "#161b22",
                padding: 16,
                borderRadius: 12,
                overflowX: "auto",
                fontFamily: "monospace",
                fontSize: 11,
                border: "1px solid rgba(255,255,255,0.05)",
                color: "#c9d1d9",
                whiteSpace: "pre",
                maxHeight: 250,
                marginTop: 10
              }}>
{`#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <Firebase_ESP_Client.h>

#define DATABASE_URL "https://esp32-f210f-default-rtdb.asia-southeast1.firebasedatabase.app"
#define DATABASE_API_KEY "AIzaSyAKR90UMhbD5ScOYEFMEQxqh60JjTa_4fo"

void initFirebase() {
  config.database_url = DATABASE_URL;
  config.api_key = DATABASE_API_KEY;

  Serial.println("[FB-CONNECT] Dang khoi tao Firebase...");

  // Đăng ký/Đăng nhập anonymous để lấy Token hợp lệ tự động từ Firebase API
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("[FB-AUTH] Dang nhap anonymous thanh cong");
    fbReady = true;
  } else {
    Serial.printf("[FB-AUTH] Loi dang nhap: %s\\n", config.signer.signupError.message.c_str());
    fbReady = false;
    return;
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  delay(2000);
  if (Firebase.RTDB.beginStream(&fbStream, "/devices")) {
    Firebase.RTDB.setStreamCallback(&fbStream, streamCallback, streamTimeoutCallback);
    streamActive = true;
    fbReady = true;
    Serial.println("[STREAM] Bat dau dong bo /devices THANH CONG");
  } else {
    fbReady = false;
    streamActive = false;
    Serial.printf("[STREAM] Loi beginStream: %s\\n", fbStream.errorReason().c_str());
  }
}`}
              </pre>

              <h3 style={{ marginTop: 20, color: "#00d4a0", fontSize: 14 }}>3. Cách nạp Code &amp; Kết nối</h3>
              <ol style={{ paddingLeft: 20, margin: "8px 0" }}>
                <li>Cài đặt thư viện <strong>Firebase ESP Client</strong>, <strong>WiFiManager</strong>, và <strong>ArduinoJson</strong> trên Arduino IDE.</li>
                <li>Chọn đúng board <strong>ESP32C3 Dev Module</strong> và kích hoạt cấu hình <code>USB CDC On Boot: Enabled</code>.</li>
                <li>Nạp code và khởi chạy thiết bị. Thiết bị sẽ phát ra một điểm WiFi tên là <strong>ESP32_SmartHome</strong> (Mật khẩu: <code>12345678</code>). Kết nối và truy cập <code>192.168.4.1</code> để liên kết mạng WiFi gia đình của bạn.</li>
                <li><strong>Tự động khôi phục / Không cần Token:</strong> Mã nguồn mới đã được thiết lập tính năng tự động chuyển đổi sang chế độ Công khai (Public Mode/Guest) nếu không khởi tạo được Token. Bạn chỉ cần đảm bảo Database Rules đang mở ở chế độ phát triển (read/write: true) hoặc đã bật Anonymous Authentication.</li>
              </ol>
            </div>

            <div style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "16px 24px",
              borderTop: "1px solid rgba(255, 255, 255, 0.08)",
              background: "rgba(0,0,0,0.1)"
            }}>
              <button
                onClick={() => setShowFirmware(false)}
                style={{
                  background: "#00d4a0",
                  border: "none",
                  borderRadius: 10,
                  color: "#040609",
                  padding: "8px 20px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 12,
                  textTransform: "uppercase"
                }}
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blinkDot{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes pulseWave {
          0% { transform: scale(0.9); opacity: 1; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes voiceBar {
          0% { height: 2px; }
          100% { height: 14px; }
        }
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        button{transition:transform .15s}
        button:active{transform:scale(.95)}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.08);border-radius:2px}
      `}</style>
    </div>
  );
}

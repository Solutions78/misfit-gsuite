import { useState, useEffect, useRef } from "react";
import { getLog, clearLog } from "@/lib/debugLog";

export default function DebugOverlay() {
  const [lines, setLines] = useState<string[]>([]);
  const [visible, setVisible] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const raw = getLog();
      const all = raw.split("\n").filter(Boolean);
      setLines(all.slice(-40));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [lines]);

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: "fixed", bottom: 8, right: 8, zIndex: 9999,
          background: "#f97316", color: "#fff", border: "none",
          borderRadius: 6, padding: "2px 8px", fontSize: 11, cursor: "pointer",
        }}
      >
        DBG
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.88)", color: "#f97316",
      fontFamily: "monospace", fontSize: 11,
      height: 220,
      display: "flex", flexDirection: "column",
      borderTop: "2px solid #f97316",
    }}>
      {/* Fixed header — always visible */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", borderBottom: "1px solid #333", flexShrink: 0, gap: 8 }}>
        <span style={{ color: "#fff", fontWeight: "bold" }}>DEBUG LOG</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { clearLog(); setLines([]); }}
            style={{ background: "#dc2626", border: "none", color: "#fff", cursor: "pointer", fontSize: 11, borderRadius: 4, padding: "2px 10px" }}
          >
            clear
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(getLog())}
            style={{ background: "#f97316", border: "none", color: "#fff", cursor: "pointer", fontSize: 11, borderRadius: 4, padding: "2px 10px" }}
          >
            copy all
          </button>
          <button
            onClick={() => setVisible(false)}
            style={{ background: "none", border: "none", color: "#f97316", cursor: "pointer", fontSize: 12 }}
          >
            hide
          </button>
        </div>
      </div>
      {/* Scrollable log area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{l}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

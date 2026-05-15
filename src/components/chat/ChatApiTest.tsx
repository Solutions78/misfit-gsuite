import { useState } from "react";
import { listSpaces, listChatMessages, sendChatMessage } from "@/lib/tauri";
import type { Space } from "@/types";

export default function ChatApiTest() {
  const [log, setLog] = useState<{ label: string; ok: boolean; data: unknown }[]>([]);
  const [running, setRunning] = useState(false);
  const [testSpaceName, setTestSpaceName] = useState("");
  const [testMsg, setTestMsg] = useState("Hello from Misfit GSuite test");

  function append(label: string, ok: boolean, data: unknown) {
    setLog((prev) => [...prev, { label, ok, data }]);
  }

  async function runTests() {
    setLog([]);
    setRunning(true);

    // Test 1: list_spaces
    let spaces: Space[] = [];
    try {
      spaces = await listSpaces();
      append("list_spaces", true, spaces);
    } catch (e) {
      append("list_spaces", false, String(e));
    }

    // Test 2: list_chat_messages — use first space found, or the manual override
    const spaceName = testSpaceName || spaces[0]?.name;
    if (spaceName) {
      try {
        const msgs = await listChatMessages(spaceName, undefined, 10);
        append(`list_chat_messages (${spaceName})`, true, msgs);
      } catch (e) {
        append(`list_chat_messages (${spaceName})`, false, String(e));
      }
    } else {
      append("list_chat_messages", false, "No spaces found — enter a space name manually below");
    }

    setRunning(false);
  }

  async function runSend() {
    const spaceName = testSpaceName;
    if (!spaceName) return;
    try {
      const result = await sendChatMessage(spaceName, testMsg);
      append(`send_chat_message (${spaceName})`, true, result);
    } catch (e) {
      append(`send_chat_message (${spaceName})`, false, String(e));
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 13, maxWidth: 900 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Chat API Test</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button
          onClick={runTests}
          disabled={running}
          style={{ padding: "6px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          {running ? "Running…" : "Run list_spaces + list_chat_messages"}
        </button>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={testSpaceName}
          onChange={(e) => setTestSpaceName(e.target.value)}
          placeholder="Space name (e.g. spaces/XXXXXXX)"
          style={{ padding: "5px 10px", border: "1px solid #d1d5db", borderRadius: 6, width: 280, fontSize: 12 }}
        />
        <input
          value={testMsg}
          onChange={(e) => setTestMsg(e.target.value)}
          placeholder="Message text"
          style={{ padding: "5px 10px", border: "1px solid #d1d5db", borderRadius: 6, width: 220, fontSize: 12 }}
        />
        <button
          onClick={runSend}
          disabled={!testSpaceName}
          style={{ padding: "6px 14px", background: "#059669", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          send_chat_message
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {log.length === 0 && !running && (
          <p style={{ color: "#6b7280" }}>No results yet — click Run above.</p>
        )}
        {log.map((entry, i) => (
          <div key={i} style={{ background: entry.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${entry.ok ? "#86efac" : "#fca5a5"}`, borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: entry.ok ? "#15803d" : "#b91c1c" }}>
              {entry.ok ? "✓" : "✗"} {entry.label}
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 11, color: "#1f2937" }}>
              {JSON.stringify(entry.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

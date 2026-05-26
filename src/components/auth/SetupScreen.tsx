import { useState } from "react";
import { KeyRound, ExternalLink, ChevronRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { saveAppCredentials } from "@/lib/tauri";
import TitleBar from "@/components/layout/TitleBar";

interface Props {
  onComplete: () => void;
}

export default function SetupScreen({ onComplete }: Props) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = clientId.trim().endsWith(".apps.googleusercontent.com") && clientSecret.trim().length > 10;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveAppCredentials(clientId.trim(), clientSecret.trim());
      onComplete();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="h-screen flex items-center justify-center"
      style={{ background: "var(--mm-bg)" }}
    >
      <TitleBar />
      <div
        className="w-[520px] rounded-[28px] border p-8 flex flex-col gap-6"
        style={{
          background: "var(--mm-surface)",
          borderColor: "var(--mm-border)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}
          >
            <KeyRound className="w-5 h-5" style={{ color: "#818cf8" }} />
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-widest" style={{ color: "var(--mm-text-primary)" }}>
              First-Run Setup
            </h1>
            <p className="text-xs" style={{ color: "var(--mm-text-muted)" }}>
              Connect your Google Cloud project
            </p>
          </div>
        </div>

        {/* Explanation */}
        <p className="text-xs leading-relaxed" style={{ color: "var(--mm-text-secondary)" }}>
          Misfit GSuite is open source and requires your own Google OAuth2 credentials.
          This is a one-time setup — credentials are stored securely in the macOS Keychain
          and never leave your machine.
        </p>

        {/* Steps */}
        <div
          className="rounded-2xl p-4 flex flex-col gap-2.5"
          style={{ background: "var(--mm-bg)", border: "1px solid var(--mm-border)" }}
        >
          <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--mm-text-muted)" }}>
            How to get your credentials
          </p>
          {[
            "Go to console.cloud.google.com and create a project",
            "Enable: Gmail, Calendar, Drive, Chat, Generative Language APIs",
            'OAuth consent screen → Internal → add your domain',
            'Credentials → Create OAuth client ID → Desktop app',
            "Copy the Client ID and Client Secret below",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 mt-0.5"
                style={{ background: "rgba(99,102,241,0.2)", color: "#818cf8" }}
              >
                {i + 1}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: "var(--mm-text-secondary)" }}>
                {step}
              </span>
            </div>
          ))}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 mt-1 text-[11px] font-semibold transition-opacity hover:opacity-70"
            style={{ color: "#818cf8" }}
          >
            <ExternalLink className="w-3 h-3" />
            Open Google Cloud Console
          </a>
        </div>

        {/* Inputs */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--mm-text-muted)" }}>
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxxx.apps.googleusercontent.com"
              className="w-full h-10 px-3 rounded-2xl text-xs font-mono focus:outline-none border transition-colors"
              style={{
                background: "var(--mm-bg)",
                borderColor: clientId && !clientId.trim().endsWith(".apps.googleusercontent.com")
                  ? "rgba(239,68,68,0.5)"
                  : "var(--mm-border)",
                color: "var(--mm-text-primary)",
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--mm-text-muted)" }}>
              Client Secret
            </label>
            <div className="relative">
              <input
                type={showSecret ? "text" : "password"}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-..."
                className="w-full h-10 px-3 pr-10 rounded-2xl text-xs font-mono focus:outline-none border"
                style={{
                  background: "var(--mm-bg)",
                  borderColor: "var(--mm-border)",
                  color: "var(--mm-text-primary)",
                }}
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70"
                style={{ color: "var(--mm-text-muted)" }}
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-xs rounded-xl px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", color: "rgb(239,68,68)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </p>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="h-10 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: canSave ? "rgba(99,102,241,0.85)" : "var(--mm-surface)",
            color: canSave ? "#fff" : "var(--mm-text-muted)",
            boxShadow: canSave ? "0 0 20px rgba(99,102,241,0.3)" : "none",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
        >
          {saving ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : canSave ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
          {saving ? "Saving to Keychain…" : "Save & Continue"}
        </button>

        <p className="text-[10px] text-center" style={{ color: "var(--mm-text-muted)" }}>
          Credentials are stored in the macOS Keychain, not on disk or in any config file.
        </p>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mic2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  deleteFirefliesApiKey,
  getFirefliesApiKeyStatus,
  getCurrentAccount,
  listCalendars,
  listGeminiModels,
  listSharedDrives,
  listSpaces,
  setFirefliesApiKey,
  setKgTier,
  startOAuthFlow,
} from "@/lib/tauri";
import {
  getGeminiTier,
  getSelectedGeminiModel,
  setGeminiTier,
  setSelectedGeminiModel,
} from "@/lib/appSettings";
import type { GeminiTier } from "@/lib/appSettings";
import type { GeminiModel } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

function modelLabel(model: GeminiModel) {
  return model.displayName || model.name.replace(/^models\//, "");
}

// ── API Health checks ─────────────────────────────────────────────────────

type HealthStatus = "checking" | "ok" | "error";

interface ApiCheck {
  name: string;
  status: HealthStatus;
  detail?: string;
}

function StatusDot({ status }: { status: HealthStatus }) {
  if (status === "checking") return <Loader2 size={13} className="animate-spin text-gray-500" />;
  if (status === "ok") return <CheckCircle2 size={13} className="text-emerald-400" />;
  return <XCircle size={13} className="text-red-400" />;
}

function ApiHealthSection({ open }: { open: boolean }) {
  const [checks, setChecks] = useState<ApiCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const qc = useQueryClient();

  const runChecks = async () => {
    setRunning(true);
    const initial: ApiCheck[] = [
      { name: "Google Account", status: "checking" },
      { name: "Gmail / Drive", status: "checking" },
      { name: "Calendar", status: "checking" },
      { name: "Google Chat", status: "checking" },
      { name: "Gemini AI", status: "checking" },
      { name: "Fireflies", status: "checking" },
    ];
    setChecks([...initial]);

    const update = (name: string, status: HealthStatus, detail?: string) => {
      setChecks((prev) =>
        prev.map((c) => (c.name === name ? { ...c, status, detail } : c))
      );
    };

    // Google Account
    try {
      const acct = await getCurrentAccount();
      update("Google Account", acct ? "ok" : "error", acct?.email ?? "No account");
    } catch (e) {
      update("Google Account", "error", String(e));
    }

    // Gmail / Drive (use listSharedDrives as a lightweight probe)
    try {
      await listSharedDrives();
      update("Gmail / Drive", "ok", "Connected");
    } catch (e) {
      update("Gmail / Drive", "error", String(e));
    }

    // Calendar
    try {
      await listCalendars();
      update("Calendar", "ok", "Connected");
    } catch (e) {
      update("Calendar", "error", String(e));
    }

    // Google Chat
    try {
      await listSpaces();
      update("Google Chat", "ok", "Connected");
    } catch (e) {
      update("Google Chat", "error", String(e));
    }

    // Gemini
    try {
      const models = await listGeminiModels();
      update("Gemini AI", models.length > 0 ? "ok" : "error",
        models.length > 0 ? `${models.length} models available` : "No models returned");
    } catch (e) {
      update("Gemini AI", "error", String(e));
    }

    // Fireflies
    try {
      const hasKey = await getFirefliesApiKeyStatus();
      update("Fireflies", hasKey ? "ok" : "error",
        hasKey ? "API key configured" : "No API key — set one above");
    } catch (e) {
      update("Fireflies", "error", String(e));
    }

    setRunning(false);
  };

  // Run checks automatically when modal opens
  useEffect(() => {
    if (open) void runChecks();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReauth = async () => {
    setReauthing(true);
    try {
      await startOAuthFlow();
      await qc.invalidateQueries();
      await runChecks();
    } catch (e) {
      console.error("Re-auth failed:", e);
    } finally {
      setReauthing(false);
    }
  };

  const hasErrors = checks.some((c) => c.status === "error");

  return (
    <section className="rounded-[24px] border p-5" style={{ borderColor: "var(--mm-border)", background: "var(--mm-surface)" }}>
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-5 h-5 text-blue-400" />
        <div className="flex-1">
          <h3 className="text-xs font-black uppercase tracking-widest">API Health</h3>
          <p className="text-[11px] font-medium leading-relaxed" style={{ color: "var(--mm-text-muted)" }}>
            Live connectivity check for all integrated services
          </p>
        </div>
        <button
          onClick={() => void runChecks()}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[10px] font-black uppercase tracking-widest
                     bg-gray-900 border border-white/5 text-gray-300 hover:text-white transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={running ? "animate-spin" : ""} />
          {running ? "Checking…" : "Recheck"}
        </button>
      </div>

      <div className="space-y-2">
        {checks.map((check) => (
          <div
            key={check.name}
            className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-gray-900/50 border border-white/5"
          >
            <StatusDot status={check.status} />
            <span className="text-[11px] font-black uppercase tracking-widest text-white flex-1">
              {check.name}
            </span>
            {check.detail && (
              <span className="text-[10px] font-mono text-gray-500 truncate max-w-[200px]" title={check.detail}>
                {check.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      {hasErrors && !running && (
        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
          <p className="text-[11px] text-red-400 font-bold">
            One or more services failed. Try re-authenticating with Google to refresh your OAuth token.
          </p>
          <button
            onClick={() => void handleReauth()}
            disabled={reauthing}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest
                       bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            {reauthing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {reauthing ? "Re-authenticating…" : "Re-authenticate with Google"}
          </button>
          <p className="text-[10px] text-gray-600">
            For Fireflies errors, update your API key in the Fireflies section above.
          </p>
        </div>
      )}
    </section>
  );
}

export default function IntegrationsSettings({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<GeminiTier>("ultra");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const firefliesStatus = useQuery({
    queryKey: ["fireflies-api-key-status"],
    queryFn: getFirefliesApiKeyStatus,
    enabled: open,
  });

  const geminiModels = useQuery({
    queryKey: ["gemini-models"],
    queryFn: listGeminiModels,
    enabled: open,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedModel(getSelectedGeminiModel() || "");
    setSelectedTier(getGeminiTier());
    setMessage(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open || selectedModel || !geminiModels.data?.length) return;
    const firstModel = geminiModels.data[0].name;
    setSelectedModel(firstModel);
    setSelectedGeminiModel(firstModel);
  }, [open, selectedModel, geminiModels.data]);

  const availableModel = useMemo(() => {
    if (!selectedModel || !geminiModels.data?.length) return true;
    return geminiModels.data.some((model) => model.name === selectedModel);
  }, [selectedModel, geminiModels.data]);

  const saveFireflies = useMutation({
    mutationFn: setFirefliesApiKey,
    onSuccess: async () => {
      setApiKey("");
      setMessage("Fireflies API key saved securely in Keychain.");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["fireflies-api-key-status"] });
      await queryClient.invalidateQueries({ queryKey: ["fireflies-meetings"] });
      await queryClient.invalidateQueries({ queryKey: ["fireflies-channels"] });
    },
    onError: (err) => {
      setMessage(null);
      setError(String(err));
    },
  });

  const removeFireflies = useMutation({
    mutationFn: deleteFirefliesApiKey,
    onSuccess: async () => {
      setApiKey("");
      setMessage("Fireflies API key removed.");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["fireflies-api-key-status"] });
      await queryClient.invalidateQueries({ queryKey: ["fireflies-meetings"] });
      await queryClient.invalidateQueries({ queryKey: ["fireflies-channels"] });
    },
    onError: (err) => {
      setMessage(null);
      setError(String(err));
    },
  });

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setSelectedGeminiModel(model);
    setMessage(`Gemini model set to ${model.replace(/^models\//, "")}.`);
    setError(null);
  };

  const handleTierChange = (tier: GeminiTier) => {
    setSelectedTier(tier);
    setGeminiTier(tier);
    void setKgTier(tier).catch((e) => console.error("set_kg_tier failed:", e));
    const labels: Record<GeminiTier, string> = {
      free: "Free (~15 RPM)",
      pro: "Pro (~60 RPM)",
      ultra: "Ultra (~250 RPM)",
    };
    setMessage(`Enrichment tier set to ${labels[tier]}.`);
    setError(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-[560px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-hidden rounded-[28px] border shadow-2xl"
        style={{ background: "var(--mm-bg)", borderColor: "var(--mm-border)", color: "var(--mm-text-primary)" }}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b" style={{ borderColor: "var(--mm-border)" }}>
          <div className="w-10 h-10 rounded-2xl bg-gray-900 border border-white/10 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black uppercase tracking-widest">Integrations</h2>
            <p className="text-xs" style={{ color: "var(--mm-text-muted)" }}>
              API keys and model selection
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar max-h-[calc(100vh-140px)]">
          <section className="rounded-[24px] border p-5" style={{ borderColor: "var(--mm-border)", background: "var(--mm-surface)" }}>
            <div className="flex items-start gap-3 mb-4">
              <Mic2 className="w-5 h-5 text-blue-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-black uppercase tracking-widest">Fireflies</h3>
                <p className="text-[11px] font-medium leading-relaxed" style={{ color: "var(--mm-text-muted)" }}>
                  Fireflies uses a personal API key, not OAuth. The key is stored in macOS Keychain and never shown again.
                </p>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-gray-900 text-white">
                {firefliesStatus.isLoading ? "Checking" : firefliesStatus.data ? "Configured" : "Not set"}
              </span>
            </div>

            <label className="block text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--mm-text-muted)" }}>
              Fireflies API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste Fireflies API key"
                className="flex-1 h-10 rounded-2xl px-4 text-xs font-bold outline-none border"
                style={{ background: "var(--mm-bg)", borderColor: "var(--mm-border)", color: "var(--mm-text-primary)" }}
              />
              <button
                onClick={() => saveFireflies.mutate(apiKey)}
                disabled={!apiKey.trim() || saveFireflies.isPending}
                className="h-10 px-4 rounded-2xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
              >
                {saveFireflies.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                onClick={() => removeFireflies.mutate()}
                disabled={removeFireflies.isPending || !firefliesStatus.data}
                className="h-10 px-3 rounded-2xl bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
                title="Remove Fireflies API key"
              >
                {removeFireflies.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </section>

          <section className="rounded-[24px] border p-5" style={{ borderColor: "var(--mm-border)", background: "var(--mm-surface)" }}>
            <div className="flex items-start gap-3 mb-4">
              <Sparkles className="w-5 h-5 text-blue-400 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-black uppercase tracking-widest">Gemini</h3>
                <p className="text-[11px] font-medium leading-relaxed" style={{ color: "var(--mm-text-muted)" }}>
                  Models are queried from the Gemini API at runtime. Pick from models that explicitly support generateContent.
                </p>
              </div>
              {geminiModels.isFetching && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
            </div>

            <label className="block text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--mm-text-muted)" }}>
              Chat Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={geminiModels.isLoading || !!geminiModels.error || !geminiModels.data?.length}
              className="w-full h-10 rounded-2xl px-4 text-xs font-bold outline-none border"
              style={{ background: "var(--mm-bg)", borderColor: "var(--mm-border)", color: "var(--mm-text-primary)" }}
            >
              {!selectedModel && <option value="">Auto-select available model</option>}
              {geminiModels.data?.map((model) => (
                <option key={model.name} value={model.name}>
                  {modelLabel(model)} — {model.name}
                </option>
              ))}
            </select>
            {!availableModel && (
              <p className="mt-2 text-[11px] font-bold text-amber-400">
                Saved model is not in the latest model list. Choose another model to avoid 404s.
              </p>
            )}
            {geminiModels.error && (
              <p className="mt-2 text-[11px] font-bold" style={{ color: "var(--mm-error)" }}>
                Could not load Gemini models: {String(geminiModels.error)}
              </p>
            )}

            {/* Enrichment Tier */}
            <div className="mt-5">
              <label className="block text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--mm-text-muted)" }}>
                Knowledge Graph Enrichment Tier
              </label>
              <p className="text-[11px] font-medium mb-3" style={{ color: "var(--mm-text-muted)" }}>
                Controls how fast the KG enricher calls Gemini. Match this to your API quota.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { tier: "free" as GeminiTier, label: "FREE", rpm: "~15 RPM", time: "~74 hrs for 66k files" },
                    { tier: "pro" as GeminiTier, label: "PRO", rpm: "~60 RPM", time: "~18 hrs for 66k files" },
                    { tier: "ultra" as GeminiTier, label: "ULTRA", rpm: "~250 RPM", time: "~4.4 hrs for 66k files" },
                  ] as const
                ).map(({ tier, label, rpm, time }) => {
                  const active = selectedTier === tier;
                  return (
                    <button
                      key={tier}
                      onClick={() => handleTierChange(tier)}
                      className={[
                        "flex flex-col items-center gap-1 px-3 py-3 rounded-2xl border text-center transition-all",
                        active
                          ? "bg-gray-900 border-white/5 shadow-[0_0_20px_rgba(255,255,255,0.12)]"
                          : "bg-transparent border-white/5 opacity-60 hover:opacity-80",
                      ].join(" ")}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest text-white">{label}</span>
                      <span className="text-[10px] font-bold text-blue-400">{rpm}</span>
                      <span className="text-[9px] font-medium text-gray-500">{time}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {(message || error) && (
            <div
              className="rounded-2xl px-4 py-3 text-[11px] font-bold border"
              style={{
                borderColor: error ? "var(--mm-error)" : "var(--mm-border)",
                color: error ? "var(--mm-error)" : "var(--mm-text-primary)",
                background: "var(--mm-surface)",
              }}
            >
              {error ?? message}
            </div>
          )}

          {/* API Health */}
          <ApiHealthSection open={open} />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, type ReactElement } from "react";
import { listen } from "@tauri-apps/api/event";
import { startOAuthFlow } from "@/lib/tauri";
import { LogIn, AlertTriangle } from "lucide-react";

// ─── Internal countdown display ────────────────────────────────────────────────

function Countdown({ targetMs }: { targetMs: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, targetMs - Date.now()));

  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1000)), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);

  return (
    <span className="font-mono font-black text-yellow-400">
      {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
    </span>
  );
}

// ─── Glow-Pill button (shared internal style) ─────────────────────────────────

interface GlowPillProps {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function GlowPill({ onClick, icon, children, className = "" }: GlowPillProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center justify-center gap-2 px-5 py-3",
        "bg-gray-900 text-white rounded-2xl",
        "text-[10px] font-black uppercase tracking-widest",
        "shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5",
        "transition-all duration-200 active:scale-95",
        className,
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function SessionTimer(): ReactElement {
  const [warnVisible, setWarnVisible] = useState(false);
  const [softLocked, setSoftLocked] = useState(false);
  const [expiresAtMs, setExpiresAtMs] = useState<number>(0);

  const warnTimerId = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTimerId = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear all pending timers
  const clearTimers = () => {
    if (warnTimerId.current !== null) {
      clearTimeout(warnTimerId.current);
      warnTimerId.current = null;
    }
    if (lockTimerId.current !== null) {
      clearTimeout(lockTimerId.current);
      lockTimerId.current = null;
    }
  };

  // Schedule warn + lock from an expiry timestamp (unix ms)
  const scheduleSession = (expiresAt: number) => {
    clearTimers();
    setWarnVisible(false);
    setSoftLocked(false);
    setExpiresAtMs(expiresAt);

    const now = Date.now();
    const warnDelay = expiresAt - now - 5 * 60 * 1000;
    const lockDelay = expiresAt - now;

    if (warnDelay <= 0) {
      setWarnVisible(true);
    } else {
      warnTimerId.current = setTimeout(() => {
        setWarnVisible(true);
      }, warnDelay);
    }

    if (lockDelay <= 0) {
      setSoftLocked(true);
    } else {
      lockTimerId.current = setTimeout(() => {
        setSoftLocked(true);
      }, lockDelay);
    }
  };

  // Kick off OAuth; on success reset warning (lock timer stays until next session_started)
  const handleReauth = async () => {
    try {
      await startOAuthFlow();
      // Re-auth clears warn state; a new auth::session_started event should follow
      setWarnVisible(false);
      setSoftLocked(false);
      clearTimers();
    } catch {
      // Silently ignore — user may have cancelled
    }
  };

  useEffect(() => {
    let unlistenSessionStarted: (() => void) | undefined;
    let unlistenAuthComplete: (() => void) | undefined;
    let unlistenSignedOut: (() => void) | undefined;

    const setup = async () => {
      unlistenSessionStarted = await listen<{ email: string; expiresAt: number }>(
        "auth::session_started",
        (event) => {
          scheduleSession(event.payload.expiresAt);
        }
      );

      unlistenAuthComplete = await listen("auth::complete", () => {
        // Re-auth succeeded — clear timers and hide UI
        clearTimers();
        setWarnVisible(false);
        setSoftLocked(false);
      });

      unlistenSignedOut = await listen("auth::signed_out", () => {
        clearTimers();
        setWarnVisible(false);
        setSoftLocked(false);
        setExpiresAtMs(0);
      });
    };

    setup();

    return () => {
      clearTimers();
      unlistenSessionStarted?.();
      unlistenAuthComplete?.();
      unlistenSignedOut?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Soft lock overlay (blocks all interaction) ───────────────────────────────
  if (softLocked) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-50">
        <img src="/app-icon.png" className="w-16 h-16 mb-6 rounded-2xl" alt="App icon" />

        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-400 mb-2">
          SESSION EXPIRED
        </p>

        <p className="text-sm font-bold text-gray-300 mb-8">
          Your Google authorization has expired.
        </p>

        <GlowPill
          onClick={handleReauth}
          icon={<LogIn className="w-3.5 h-3.5 text-blue-400" />}
        >
          SIGN IN AGAIN
        </GlowPill>

        <p className="text-[9px] text-gray-600 uppercase tracking-widest mt-4">
          YOUR DATA AND SETTINGS ARE PRESERVED
        </p>
      </div>
    );
  }

  // ── Warning banner (dismissable, non-blocking) ───────────────────────────────
  if (warnVisible) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-5 bg-gray-900 border-t border-yellow-500/30 h-12">
        {/* Left: icon + text + countdown */}
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-yellow-300">
            YOUR SESSION EXPIRES IN 5 MINUTES
          </span>
          <Countdown targetMs={expiresAtMs} />
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-4">
          <GlowPill onClick={handleReauth}>
            REAUTHORIZE NOW
          </GlowPill>

          <button
            onClick={() => setWarnVisible(false)}
            className="text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-300 transition-colors"
          >
            DISMISS
          </button>
        </div>
      </div>
    );
  }

  // ── Idle: render nothing ─────────────────────────────────────────────────────
  return <></>;
}

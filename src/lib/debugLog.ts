// Debug log — writes to sessionStorage so it persists across React re-renders
// but resets on every hard refresh (sessionStorage is tab-scoped).
// Remove this file and all importers when the bug is fixed.

const SESSION_KEY = "mm_debug_log";

// Clear on fresh load
sessionStorage.setItem(SESSION_KEY, "");

// Buffer lines and flush to sessionStorage in a batch every 100ms
// so we don't block the render thread with synchronous storage writes.
const buffer: string[] = [];
let flushPending = false;

function scheduleFlush() {
  if (flushPending) return;
  flushPending = true;
  setTimeout(() => {
    flushPending = false;
    if (buffer.length === 0) return;
    const existing = sessionStorage.getItem(SESSION_KEY) ?? "";
    sessionStorage.setItem(SESSION_KEY, existing + buffer.join("\n") + "\n");
    buffer.length = 0;
  }, 100);
}

export function dbg(tag: string, ...args: unknown[]) {
  const line = `[${new Date().toISOString().slice(11, 23)}] [${tag}] ${
    args.map(a => {
      if (a instanceof Error) return a.stack ?? a.message;
      if (typeof a === "object" && a !== null) {
        try { return JSON.stringify(a); } catch { return String(a); }
      }
      return String(a);
    }).join(" ")
  }`;
  buffer.push(line);
  scheduleFlush();
  console.log(`%c${line}`, "color:#f97316;font-weight:bold");
}

export function dbgRender(name: string, props: Record<string, unknown>) {
  const storeKey = `__prev_${name}`;
  const store = dbgRender as unknown as Record<string, unknown>;
  const prev = store[storeKey] as Record<string, unknown> | undefined;
  const changed: string[] = [];
  if (prev) {
    for (const k of Object.keys(props)) {
      if (prev[k] !== props[k]) {
        changed.push(`${k}: ${JSON.stringify(prev[k])} → ${JSON.stringify(props[k])}`);
      }
    }
  }
  store[storeKey] = { ...props };
  if (changed.length) dbg(name, "RE-RENDER →", changed.join(", "));
}

export function getLog(): string {
  const stored = sessionStorage.getItem(SESSION_KEY) ?? "";
  return buffer.length ? stored + buffer.join("\n") + "\n" : stored;
}

export function clearLog(): void {
  buffer.length = 0;
  sessionStorage.setItem(SESSION_KEY, "");
}

const w = window as unknown as Record<string, unknown>;
w.dumpDebugLog = () => console.log(getLog());
w.copyDebugLog = () => navigator.clipboard.writeText(getLog()).then(() => console.log("copied"));

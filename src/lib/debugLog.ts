// Simplified debug log — logs only to browser console in dev mode.

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

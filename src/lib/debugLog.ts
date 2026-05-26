import { invoke } from "@tauri-apps/api/core";

const IS_DEV = import.meta.env.DEV;
const REDACTED = "[REDACTED]";
const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key|clientSecret|authorization|credential)/i;

export function dbg(tag: string, ...args: unknown[]) {
  const line = `[${new Date().toISOString().slice(11, 23)}] [${tag}] ${
    args.map(formatLogArg).join(" ")
  }`;
  if (IS_DEV) {
    console.log(`%c${line}`, "color:#f97316;font-weight:bold");
  }

  // Persist frontend/Tauri bridge diagnostics in packaged builds too. Use raw
  // invoke here to avoid feeding this command back through loggedInvoke().
  void invoke("write_frontend_log", {
    level: "debug",
    target: tag,
    message: line,
  }).catch(() => {
    // Logging must never break the app.
  });
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

function formatLogArg(value: unknown): string {
  if (value instanceof Error) return truncate(value.stack ?? value.message);
  if (typeof value === "string") return truncate(redactString(value));
  if (typeof value === "object" && value !== null) {
    try {
      return truncate(JSON.stringify(sanitize(value)));
    } catch {
      return truncate(String(value));
    }
  }
  return truncate(String(value));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[MaxDepth]";
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((item) => sanitize(item, depth + 1));
    if (value.length > 20) items.push(`[${value.length - 20} more items]`);
    return items;
  }
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input)) {
      output[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : sanitize(val, depth + 1);
    }
    return output;
  }
  if (typeof value === "string") return redactString(value);
  return value;
}

function redactString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/(access_token|refresh_token|client_secret|api_key)=([^&\s]+)/gi, `$1=${REDACTED}`);
}

function truncate(value: string, max = 4_000): string {
  return value.length <= max ? value : `${value.slice(0, max)}… [truncated]`;
}

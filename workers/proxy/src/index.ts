export interface Env {
  FIREFLIES_API_KEY: string;
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
  APP_TOKEN: string;
}

const ALLOWED_ORIGINS = ["tauri://localhost", "http://localhost:1420"];

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    headers.set(k, v);
  }
  return new Response(response.body, { status: response.status, headers });
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
    origin
  );
}

function unauthorized(origin: string | null): Response {
  return json({ error: "Unauthorized" }, 401, origin);
}

function notFound(origin: string | null): Response {
  return json({ error: "Not found" }, 404, origin);
}

function authenticate(request: Request, env: Env): boolean {
  const token = request.headers.get("X-App-Token");
  return token === env.APP_TOKEN;
}

// ── Console proxy experiment ──────────────────────────────────────────────
// Strips X-Frame-Options and CSP frame-ancestors so GCP/Admin can load in a webview.
// Rewrites absolute URLs in Location redirects and HTML to route back through the proxy.
const CONSOLE_TARGETS: Record<string, string> = {
  "/gcpconsole": "https://console.cloud.google.com",
  "/adminconsole": "https://admin.google.com",
};

async function handleConsoleProxy(request: Request, path: string, origin: string | null): Promise<Response> {
  // Find which console prefix matched
  const prefix = Object.keys(CONSOLE_TARGETS).find((p) => path.startsWith(p));
  if (!prefix) return new Response("Not found", { status: 404 });

  const upstream = CONSOLE_TARGETS[prefix];
  const subpath = path.slice(prefix.length) || "/";
  const originalUrl = new URL(request.url);
  const targetUrl = `${upstream}${subpath}${originalUrl.search}`;

  // Forward all headers from the client except Host
  const upstreamHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (k.toLowerCase() !== "host" && k.toLowerCase() !== "origin") {
      upstreamHeaders.set(k, v);
    }
  }
  // Forward cookies so authenticated sessions work
  const cookie = request.headers.get("cookie");
  if (cookie) upstreamHeaders.set("cookie", cookie);

  const upstreamResp = await fetch(targetUrl, {
    method: request.method,
    headers: upstreamHeaders,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual",
  });

  const respHeaders = new Headers();
  for (const [k, v] of upstreamResp.headers.entries()) {
    const lower = k.toLowerCase();
    // Strip framing-blocker headers
    if (lower === "x-frame-options") continue;
    if (lower === "content-security-policy") {
      // Remove frame-ancestors directive only; keep the rest
      const stripped = v.split(";")
        .map((d) => d.trim())
        .filter((d) => !d.startsWith("frame-ancestors"))
        .join("; ");
      if (stripped) respHeaders.append("content-security-policy", stripped);
      continue;
    }
    // Rewrite Location headers so redirects stay inside the proxy
    if (lower === "location") {
      let loc = v;
      for (const [p, t] of Object.entries(CONSOLE_TARGETS)) {
        if (loc.startsWith(t)) {
          loc = `${originalUrl.origin}${p}${loc.slice(t.length)}`;
          break;
        }
      }
      respHeaders.set("location", loc);
      continue;
    }
    // Forward set-cookie but strip Secure/SameSite so the proxied cookie works
    if (lower === "set-cookie") {
      const rewritten = v
        .replace(/;\s*secure/gi, "")
        .replace(/;\s*samesite=[^;]*/gi, "")
        .replace(/;\s*domain=[^;]*/gi, "");
      respHeaders.append("set-cookie", rewritten);
      continue;
    }
    respHeaders.append(k, v);
  }

  // Add CORS so the Tauri webview can load it
  const corsOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  respHeaders.set("Access-Control-Allow-Origin", corsOrigin);
  respHeaders.set("Access-Control-Allow-Credentials", "true");

  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    headers: respHeaders,
  });
}

async function handleFireflies(request: Request, env: Env, origin: string | null): Promise<Response> {
  const body = await request.text();
  const upstream = await fetch("https://api.fireflies.ai/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.FIREFLIES_API_KEY}`,
    },
    body,
  });
  return withCors(upstream, origin);
}

async function handleSlackOAuth(request: Request, env: Env, origin: string | null): Promise<Response> {
  const { code, redirect_uri } = await request.json<{ code: string; redirect_uri: string }>();

  const params = new URLSearchParams({
    code,
    redirect_uri,
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
  });

  const upstream = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  return withCors(upstream, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const path = url.pathname;

    if (path === "/health") {
      return json({ ok: true }, 200, origin);
    }

    if (!authenticate(request, env)) {
      return unauthorized(origin);
    }

    if (path === "/fireflies/graphql" && request.method === "POST") {
      return handleFireflies(request, env, origin);
    }

    if (path === "/slack/oauth" && request.method === "POST") {
      return handleSlackOAuth(request, env, origin);
    }

    // Console proxy — requires X-App-Token authentication (enforced by authenticate() above)
    if (path.startsWith("/gcpconsole") || path.startsWith("/adminconsole")) {
      return handleConsoleProxy(request, path, origin);
    }

    return notFound(origin);
  },
};

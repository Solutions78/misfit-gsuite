# Misfit GSuite

A macOS-native Google Workspace desktop client built with Tauri 2.0 — no Electron, no browser tabs, no context switching. Misfit GSuite bundles Gmail, Google Calendar, Google Drive, Google Docs (native word processor powered by Tiptap), Google Chat, Slack, Fireflies meeting intelligence, and a Gemini AI assistant into a single native application. Designed for organizations running Google Workspace Business Starter or higher. Licensed MIT — fork it, rebrand it, and ship it to your team.

---

> Screenshots coming soon

---

## Architecture Overview

- **Tauri 2.0 / Rust backend** — all Google API calls, OAuth token management, background sync, and database I/O run in Rust; the frontend never touches credentials directly
- **React 19 + TypeScript frontend** — component tree under `src/components/`, client state via Zustand stores, server state via TanStack Query v5
- **SQLite local cache** — inbox threads, message metadata, and chat history cached locally at `~/Library/Application Support/com.modularmisfits.gsuite/cache.db`
- **macOS Keychain** — OAuth tokens stored in the system Keychain via the `keyring` crate; never written to disk in plaintext
- **Cloudflare Worker credential proxy** — Slack and Fireflies secrets live server-side in the Worker; the binary holds only a shared `APP_TOKEN` to authenticate against the proxy, never the raw API keys
- **Google OAuth2 PKCE** — desktop OAuth flow runs a local HTTP server on port 9004 to receive the authorization code callback; PKCE (S256) prevents code interception
- **Short-poll for Chat and Slack** — Google Chat spaces poll every 10 seconds; Slack channels use a similar pull model (no public webhook endpoint required)
- **Gmail push via Cloud Pub/Sub pull** — the app polls a Pub/Sub pull subscription rather than requiring an HTTPS endpoint; Gmail watch is renewed every 6 days

---

## Prerequisites

Before you begin, make sure you have all of the following:

- **macOS 13 Ventura or later**
- **Xcode Command Line Tools** — run `xcode-select --install` if not already installed
- **Node.js 20+** — [nodejs.org](https://nodejs.org) or via `brew install node`
- **Rust (stable)** — install via [rustup.rs](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **A Google Workspace account** — Business Starter or higher (required for Internal OAuth consent screen and Pub/Sub)
- **A Cloudflare account** — the free tier is sufficient for the credential proxy Worker
- **Optional: Slack workspace admin access** — needed only if you want to connect a Slack workspace
- **Optional: Fireflies account** — needed only if you want meeting transcripts and AI summaries

---

## Part A — Google Cloud Setup

These steps configure the OAuth2 credentials and APIs that the app uses to talk to Google Workspace.

### 1. Create a GCP project

Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project. Name it something like `your-org-gsuite`. Note the Project ID — you will need it for Pub/Sub.

### 2. Enable APIs

In the project, go to **APIs & Services → Library** and enable each of the following:

- Gmail API
- Google Calendar API
- Google Chat API
- Cloud Pub/Sub API
- Google Docs API
- Google Drive API
- Generative Language API (for Gemini)

### 3. Configure the OAuth consent screen

Go to **APIs & Services → OAuth consent screen**.

- **User type:** Internal *(this restricts login to accounts in your Google Workspace organization — do not use External unless you intend to publish to the public)*
- **App name:** whatever you want users to see (e.g. "Misfit GSuite")
- **Authorized domain:** your organization's domain (e.g. `yourcompany.com`)
- Fill in support email and developer contact, then save.

### 4. Create an OAuth 2.0 Client ID

Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.

- **Application type:** Desktop app
- **Name:** anything descriptive (e.g. "Misfit GSuite Desktop")
- Click **Create**
- Copy the **Client ID** and **Client Secret** — you will add these to `.env` shortly

### 5. Set up Cloud Pub/Sub for Gmail push

Gmail push notifications use Pub/Sub pull so you do not need a public HTTPS endpoint.

```bash
# Create the topic
gcloud pubsub topics create gmail-notifications --project=YOUR_PROJECT_ID

# Grant Gmail service account permission to publish
gcloud pubsub topics add-iam-policy-binding gmail-notifications \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher \
  --project=YOUR_PROJECT_ID

# Create the pull subscription
gcloud pubsub subscriptions create gmail-notifications-pull \
  --topic=gmail-notifications \
  --project=YOUR_PROJECT_ID
```

Or do the equivalent through the Cloud Console UI under **Pub/Sub → Topics**.

### 6. Create your `.env` file

```bash
cp .env.example .env
```

Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the Pub/Sub fields:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
PUBSUB_PROJECT_ID=your-project-id
PUBSUB_SUBSCRIPTION_ID=gmail-notifications-pull
PUBSUB_TOPIC=projects/your-project-id/topics/gmail-notifications
```

---

## Part B — Cloudflare Worker Proxy Setup

The credential proxy exists for a specific reason: Slack and Fireflies API secrets must never be embedded in the app binary. The Worker holds those secrets server-side and exposes authenticated endpoints that the app calls using a shared `APP_TOKEN`. If someone extracts and inspects your built binary, they find only the `APP_TOKEN` — which can be rotated — not the raw Slack or Fireflies credentials.

### 1. Install Wrangler

```bash
npm install -g wrangler
```

### 2. Log in to Cloudflare

```bash
wrangler login
```

This opens a browser window. Authenticate with your Cloudflare account.

### 3. Install Worker dependencies and deploy

```bash
cd workers/proxy
npm install
wrangler deploy
```

Wrangler will print the deployed Worker URL, which looks like:

```
https://misfit-hub-proxy.YOUR-SUBDOMAIN.workers.dev
```

### 4. Set Worker secrets

Run each of these commands and paste the value when prompted (or pipe it in as shown):

```bash
# Fireflies API key — get this in Part D below
echo "your-fireflies-api-key" | wrangler secret put FIREFLIES_API_KEY

# Slack credentials — get these in Part C below
echo "your-slack-client-id" | wrangler secret put SLACK_CLIENT_ID
echo "your-slack-client-secret" | wrangler secret put SLACK_CLIENT_SECRET

# Shared token the app uses to authenticate against the proxy — generate a random value
uuidgen | wrangler secret put APP_TOKEN
```

For `APP_TOKEN`, run `uuidgen` on your Mac to get a UUID, save that value — you need it in the next step. Or use any strong random string.

### 5. Add the Worker URL and token to `.env`

```
PROXY_BASE_URL=https://misfit-hub-proxy.YOUR-SUBDOMAIN.workers.dev
PROXY_APP_TOKEN=the-same-value-you-set-as-APP_TOKEN-above
```

You can verify the Worker is healthy at any time:

```bash
curl https://misfit-hub-proxy.YOUR-SUBDOMAIN.workers.dev/health
# → {"ok":true}
```

---

## Part C — Slack App Setup

Skip this section if you do not need Slack integration.

### 1. Create the Slack app

Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From an app manifest**.

Select your workspace, then paste this YAML manifest:

```yaml
display_information:
  name: Misfit GSuite
  description: Google Workspace desktop client for your team
features:
  bot_user:
    display_name: Misfit GSuite
    always_online: false
oauth_config:
  redirect_urls:
    - http://localhost:9005/slack/oauth2callback
  scopes:
    user:
      - channels:history
      - channels:read
      - channels:write
      - chat:write
      - groups:history
      - groups:read
      - im:history
      - im:read
      - im:write
      - mpim:history
      - mpim:read
      - mpim:write
      - users:read
      - files:read
      - search:read
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

### 2. Get your credentials

After creating the app, go to **Basic Information** and copy:

- **Client ID** → `SLACK_CLIENT_ID` in `.env` and as the `SLACK_CLIENT_ID` Worker secret
- **Client Secret** → set as the `SLACK_CLIENT_SECRET` Worker secret (do not put this in `.env`)
- **Signing Secret** → `SLACK_SIGNING_SECRET` in `.env`
- **App ID** → `SLACK_APP_ID` in `.env`

### 3. Verify the redirect URI

Under **OAuth & Permissions**, confirm `http://localhost:9005/slack/oauth2callback` is listed under **Redirect URLs**. The app runs a local HTTP server on port 9005 to handle the Slack OAuth callback.

---

## Part D — Fireflies Setup

Skip this section if you do not need meeting transcript integration.

### 1. Generate your Fireflies API key

Go to [app.fireflies.ai](https://app.fireflies.ai) → **Integrations** → **API** → **Generate API Key**.

### 2. Add it to the Worker secret

```bash
echo "your-fireflies-api-key" | wrangler secret put FIREFLIES_API_KEY
```

The Fireflies API key lives exclusively in the Cloudflare Worker. Do not add it to `.env`. All Fireflies requests from the app go through `POST /fireflies/graphql` on the proxy, which injects the key server-side.

---

## Running in Development

Once all credentials are configured:

```bash
# Install frontend dependencies (first time only)
npm install

# Start the app with hot reload
npm run tauri dev
```

The Vite dev server starts on port 1420, and the Tauri shell wraps it in a native window. Changes to `src/` are reflected immediately without restarting. Changes to `src-tauri/src/` trigger a Rust recompile.

On first run the app will open your browser to complete Google OAuth. After signing in, tokens are stored in the macOS Keychain and the app will not ask again until the refresh token is revoked.

---

## Building for Distribution

```bash
npm run tauri build
```

Output is written to `src-tauri/target/release/bundle/macos/`. You will find a `.app` bundle and a `.dmg` installer.

**No credentials needed at build time.** The app reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the other `.env` variables at runtime via `dotenvy` — not during the Rust compile step. The `.env` file just needs to be present in the working directory when the app launches.

**A note on Apple Gatekeeper:** Apps distributed outside the Mac App Store must be code-signed and notarized by Apple, otherwise macOS will block them with a "damaged or cannot be opened" error. To notarize:

1. Enroll in the Apple Developer Program ($99/year)
2. Create a Developer ID Application certificate in Xcode or Keychain Access
3. Configure `tauri.conf.json` with your team ID and signing identity under `bundle.macOS`
4. Run `npm run tauri build` — Tauri's bundler will sign and submit for notarization automatically if credentials are present in your environment

For internal/team distribution without notarization, recipients can right-click the `.app` and choose **Open** to bypass Gatekeeper on first launch.

---

## Rebranding Guide

Misfit GSuite is designed to be white-labeled. Follow the steps below to make it your own.

### Prep steps (do these manually first)

1. Replace the icons in `src-tauri/icons/` with your own. The source should be a 1024×1024 PNG. You can generate all required sizes using Tauri's icon generator:
   ```bash
   npm run tauri icon path/to/your-icon-1024.png
   ```
2. Have the following ready before running the AI prompt below:
   - Organization name (e.g. "Acme Corp")
   - App name (e.g. "Acme Workspace")
   - Domain (e.g. `acmecorp.com`)
   - Primary brand color hex (e.g. `#3B82F6`)
   - Cloudflare Worker name (will become `your-worker-name.subdomain.workers.dev`)
   - Tauri app identifier in reverse-DNS format (e.g. `com.acmecorp.workspace`)

### CLI AI assistant prompt

Copy the entire block below and paste it into Claude Code, Cursor, or any AI coding assistant in the project root:

```
I want to rebrand the Misfit GSuite application for my organization. Here are my details:

- Organization name: [YOUR ORG NAME]
- App name: [YOUR APP NAME]
- Domain: [YOUR DOMAIN]
- Primary brand color (hex): [e.g. #3B82F6]
- Cloudflare Worker name: [YOUR WORKER NAME]
- Tauri app identifier: [e.g. com.yourorg.gsuite]

Please make these changes:
1. Update tauri.conf.json: productName, identifier, and window title
2. Update src-tauri/Cargo.toml: package name and description
3. Update index.html: <title> tag
4. Find all hardcoded "Misfit" / "modularmisfits" / "misfit-gsuite" / "com.modularmisfits" strings in src/ and src-tauri/src/ and replace with my org equivalents
5. Update workers/proxy/wrangler.toml: worker name
6. Update the PROXY_BASE_URL in .env to reflect the new worker URL
7. In src/components/layout/TopNav.tsx, update the "Hub" brand label to my app name
8. Update the OAuth consent screen name references in src-tauri/src/auth/oauth.rs
9. If I provided a primary brand color, update the theme CSS variables in src/index.css or equivalent theme file to use my color as the accent
10. Run: npx tsc --noEmit && cargo check --manifest-path src-tauri/Cargo.toml
11. Report every file changed with a one-line summary of what changed

Do not change any API logic, OAuth scopes, or database schema. Only rename/rebrand.
```

---

## Environment Variables Reference

All variables live in `.env` at the project root (copied from `.env.example`). Variables marked **Required** will cause the app to fail or not function correctly if absent.

| Variable | Purpose | Where to get it | Required |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth2 client identifier | GCP Console → Credentials → OAuth 2.0 Client IDs | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret | GCP Console → Credentials → OAuth 2.0 Client IDs | Yes |
| `PUBSUB_PROJECT_ID` | GCP project ID for Pub/Sub | GCP Console → project selector | Yes |
| `PUBSUB_SUBSCRIPTION_ID` | Pub/Sub pull subscription name | GCP Console → Pub/Sub → Subscriptions | Yes |
| `PUBSUB_TOPIC` | Full Pub/Sub topic path | GCP Console → Pub/Sub → Topics | Yes |
| `GEMINI_API_KEY` | Gemini API key (alternative to OAuth-scoped access) | [aistudio.google.com](https://aistudio.google.com) → API keys | No |
| `PROXY_BASE_URL` | Deployed Cloudflare Worker URL | Wrangler deploy output | No (Slack/Fireflies only) |
| `PROXY_APP_TOKEN` | Shared secret to authenticate against the Worker | Value you set via `wrangler secret put APP_TOKEN` | No (Slack/Fireflies only) |
| `SLACK_APP_ID` | Slack app identifier | api.slack.com → Your App → Basic Information | No (Slack only) |
| `SLACK_CLIENT_ID` | Slack OAuth client ID | api.slack.com → Your App → Basic Information | No (Slack only) |
| `SLACK_SIGNING_SECRET` | Validates Slack request signatures | api.slack.com → Your App → Basic Information | No (Slack only) |
| `SLACK_REDIRECT_URI` | OAuth callback for Slack flow | Fixed: `http://localhost:9005/slack/oauth2callback` | No (Slack only) |

`SLACK_CLIENT_SECRET` and `FIREFLIES_API_KEY` are intentionally absent from `.env` — they live exclusively in the Cloudflare Worker as secrets and are never exposed in the client binary. Set them via `wrangler secret put SLACK_CLIENT_SECRET` and `wrangler secret put FIREFLIES_API_KEY`.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Tauri | 2.0 |
| UI framework | React | 19 |
| Language (frontend) | TypeScript | ~5.8 |
| Styling | TailwindCSS | 4 |
| Component primitives | Radix UI | — |
| Rich text editor | Tiptap | 3 |
| Client state | Zustand | 5 |
| Server state / caching | TanStack Query | 5 |
| Virtualized lists | TanStack Virtual | 3 |
| Animations | Framer Motion | 12 |
| Language (backend) | Rust | stable |
| Local database | rusqlite (SQLite, bundled) | 0.31 |
| HTTP client (Rust) | reqwest | 0.12 |
| Local OAuth callback server | axum | 0.7 |
| Keychain storage | keyring | 3 |
| Credential proxy | Cloudflare Workers | — |

---

## Security

The following controls are in place:

- **XSS prevention** — all email HTML is sanitized through DOMPurify before rendering; forbidden tags (`script`, `object`, `embed`, `form`, `meta`, `base`) and event handler attributes are stripped
- **Plain-text email escaping** — plain-text email bodies are HTML-escaped before wrapping in `<pre>` tags to prevent injection via message content
- **URL scheme validation** — `open_drive_file` and similar commands that open URLs in the system browser reject anything that is not `http://` or `https://`
- **GraphQL injection prevention** — all Fireflies GraphQL queries use named operations with typed variables; no user input is interpolated into query strings
- **Token revocation handling** — if Google rejects a refresh token (400/401), the app clears the Keychain entry, removes the token from memory, and emits `auth::token_revoked` to the frontend to show the login screen immediately
- **No plaintext secrets** — OAuth tokens are stored in the macOS Keychain only; `SLACK_CLIENT_SECRET` and `FIREFLIES_API_KEY` live in Cloudflare Worker secrets only; the binary holds only the `PROXY_APP_TOKEN` which can be rotated independently
- **Cloudflare Worker authentication** — every route on the proxy Worker requires a valid `X-App-Token` header; unauthenticated requests receive 401
- **Stack traces in production** — `ErrorBoundary` only renders Rust/JS stack traces when `import.meta.env.DEV` is true; production error screens show the message only
- **Dependency audit** — `cargo audit` and `npm audit` are clean (0 vulnerabilities); see `.cargo/audit.toml` for documented suppressions of Linux-only GTK transitive warnings that do not affect the macOS build

---

## Contributing

1. Fork the repository and create a feature branch from `main`
2. Make your changes — the `CLAUDE.md` file at the repo root contains architecture notes useful for AI-assisted development in Claude Code or Cursor
3. Run `npx tsc --noEmit` and `cargo check --manifest-path src-tauri/Cargo.toml` before opening a PR
4. Open a pull request with a clear description of what changed and why

Bug reports and feature requests are welcome as GitHub Issues.

---

## License

MIT — see [LICENSE](LICENSE) for the full text.

Copyright (c) 2026 Modular Misfits

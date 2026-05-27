# Misfit GSuite

A macOS-native Google Workspace desktop client built with Tauri 2.0 — no Electron, no browser tabs, no context switching. Misfit GSuite bundles Gmail, Google Calendar, Google Drive, Google Docs (native word processor powered by Tiptap), Google Chat, Slack, Fireflies meeting intelligence, and a Gemini AI assistant into a single native application. Designed for organizations running Google Workspace Business Starter or higher. Licensed MIT — fork it, rebrand it, and ship it to your team.

---

> Screenshots coming soon

---

## Architecture Overview

- **Tauri 2.0 / Rust backend** — all Google API calls, OAuth token management, background sync, and database I/O run in Rust; the frontend never touches credentials directly.
- **React 19 + TypeScript frontend** — component tree under `src/components/`, client state via Zustand stores, server state via TanStack Query v5.
- **3D Knowledge Graph** — A high-fidelity, interactive map of your organization's Workspace entities powered by a custom Rust crawl engine and Gemini-driven semantic analysis.
- **Headless Worker Mode** — A CLI-driven enrichment engine that runs synthesis in the background without requiring the UI to be open.
- **SQLite local cache** — inbox threads, message metadata, and knowledge graph nodes/edges cached locally at `~/Library/Application Support/com.modularmisfits.gsuite/cache.db`.
- **macOS Keychain** — OAuth tokens stored in the system Keychain via the `keyring` crate; never written to disk in plaintext.
- **Cloudflare Worker credential proxy** — Slack and Fireflies secrets live server-side in the Worker; the binary holds only a shared `APP_TOKEN` to authenticate against the proxy.
- **Google OAuth2 PKCE** — desktop OAuth flow runs a local HTTP server on port 9004 to receive the authorization code callback; PKCE (S256) prevents code interception.

---

## Key Features

### 🧠 Semantic Knowledge Graph
Misfit GSuite builds a local "digital brain" of your Workspace data:
- **Structural Mapping**: Mirrors your Drive hierarchy, including Shared Drives and nested folders.
- **High-Value Filtering**: Automatically excludes binary junk (e.g., `.pyc`, `.class`, `.octet-stream`) and hidden files (`.git`, `.vscode`) to focus exclusively on Documents, Spreadsheets, Slides, Code, and Media.
- **Gemini Enrichment**: Automatically summarizes documents, extracts semantic topics, identifies Project/Person/Client entities, and calculates importance scores (1-10) for 3D visualization.
- **Resilient Crawling**: Implements persistent checkpointing. If you close the app during a massive 28,000-file crawl, it resumes exactly where it left off on the next launch.

### 🤖 Gemini AI Sidekick
- **Context-Aware Assistance**: Gemini is integrated directly into the 4-pane hub. It automatically reads your current email thread, Slack channel, or document content to provide relevant insights.
- **Expert Synthesis**: Ask Gemini to "Summarize operational traffic from today" or "Synthesize a mission report for this week" based on your actual Knowledge Graph data.

### 🛠️ Headless Synthesis Worker
For large organizations with 10k+ documents, synthesis can take several hours. You can run the enrichment engine in headless mode:
```bash
# Run the enrichment engine in the background without the UI
./Misfit-GSuite --worker
```

---

## Prerequisites

Before you begin, make sure you have all of the following:

- **macOS 13 Ventura or later**
- **Xcode Command Line Tools** — run `xcode-select --install` if not already installed
- **Node.js 20+** — [nodejs.org](https://nodejs.org) or via `brew install node`
- **Rust (stable)** — install via [rustup.rs](https://rustup.rs)
- **A Google Workspace account** — Business Starter or higher (required for Internal OAuth and Pub/Sub)
- **A Cloudflare account** — the free tier is sufficient for the credential proxy Worker

---

## Part A — Google Cloud Setup

These steps configure the OAuth2 credentials and APIs that the app uses to talk to Google Workspace.

### 1. Create a GCP project
Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project. Note the Project ID — you will need it for Pub/Sub.

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
- **User type:** Internal (restricts login to accounts in your Google Workspace organization)
- **App name:** e.g., "Misfit GSuite"
- **Authorized domain:** e.g., `yourcompany.com`

### 4. Create an OAuth 2.0 Client ID
Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
- **Application type:** Desktop app
- Copy the **Client ID** and **Client Secret** — you will add these to `.env` shortly.

### 5. Set up Cloud Pub/Sub for Gmail push
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

### 6. Create your `.env` file
```bash
cp .env.example .env
```
Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the Pub/Sub fields.

---

## Part B — Cloudflare Worker Proxy Setup

The credential proxy ensures Slack and Fireflies secrets never live in the binary.

### 1. Deploy the Worker
```bash
cd workers/proxy
npm install
wrangler deploy
```

### 2. Set Worker secrets
```bash
# Fireflies API key
echo "your-fireflies-api-key" | wrangler secret put FIREFLIES_API_KEY

# Slack credentials
echo "your-slack-client-id" | wrangler secret put SLACK_CLIENT_ID
echo "your-slack-client-secret" | wrangler secret put SLACK_CLIENT_SECRET

# Shared token
uuidgen | wrangler secret put APP_TOKEN
```

---

## Running in Development

```bash
# Install frontend dependencies (first time only)
npm install

# Start the app with hot reload
npm run tauri dev
```

---

## Environment Variables Reference

| Variable | Purpose | Required |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth2 client identifier | Yes |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret | Yes |
| `PUBSUB_PROJECT_ID` | GCP project ID for Pub/Sub | Yes |
| `PUBSUB_SUBSCRIPTION_ID` | Pub/Sub pull subscription name | Yes |
| `PUBSUB_TOPIC` | Full Pub/Sub topic path | Yes |
| `GEMINI_API_KEY` | Gemini API key (optional fallback) | No |
| `PROXY_BASE_URL` | Deployed Cloudflare Worker URL | No |
| `PROXY_APP_TOKEN` | Shared secret for Worker auth | No |

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Tauri | 2.0 |
| UI framework | React | 19 |
| Styling | TailwindCSS | 4 |
| 3D Visualization | Three.js / react-force-graph-3d | — |
| Rich text editor | Tiptap | 3 |
| Client state | Zustand | 5 |
| Server state | TanStack Query | 5 |
| Language (backend) | Rust | stable |
| Database | rusqlite (SQLite) | 0.31 |

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `npx tsc --noEmit` and `cargo check --manifest-path src-tauri/Cargo.toml` before opening a PR.
3. Ensure all changes strictly adhere to the "Professional Dark" aesthetic defined in `mm-themes.css`.

---

## License

MIT — Copyright (c) 2026 Modular Misfits

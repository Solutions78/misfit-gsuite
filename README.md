# Misfit GSuite

Misfit GSuite is a high-performance, unified desktop hub for Google Workspace. Designed with a professional dark aesthetic ("Modular Misfits" style), it integrates all your essential productivity tools into a single native application powered by **Tauri**, **React**, and **Rust**.

## 🚀 The Hub Experience

### 💎 Unified Command Center
- **Global Navigation**: A fixed top navigation bar for instant switching between 8 integrated Workspace modules.
- **High-Contrast Dark Aesthetic**: A signature "Tone of Black" UI with high-fidelity glowing selection states.
- **Contextual Search**: A global search engine that dynamically retargets its queries based on your active application.

### 📧 Gmail & 📅 Calendar
- **Native Performance**: Fluid, desktop-optimized interfaces for mail and scheduling.
- **Real-time Sync**: Google Cloud Pub/Sub integration for instant push notifications.
- **Advanced Management**: High-density message lists and a MacOS Finder-inspired event management system.

### 📂 Google Drive & Editors
- **Finder-style Explorer**: A professional MacOS Finder-inspired file explorer with high-density list and grid views.
- **Embedded Productivity**: Seamlessly edit **Google Docs, Sheets, and Slides** directly within the app using secure native webviews.
- **Full Parity**: Maintain 100% feature parity with Google's native web editors while keeping your native sidebar and assistant active.

### ☁️ Cloud & Admin Consoles
- **IT Command Center**: Built-in access to the **Google Cloud Platform** and **Workspace Admin** consoles.
- **Role-Based Visibility**: Automatic detection of administrator status to surface enterprise tools.

### 🤖 Gemini AI
- **Omnipresent Assistant**: A dedicated Gemini drawer for interactive help, content analysis, and automation.
- **Active Intelligence**: Smart email generation, inbox organization, and Cost/Resource optimization tips for Cloud Console.

## 🛠 Tech Stack

- **Backend**: Rust, Tauri v2, Tokio, SQLite (Local Cache), Mailparse.
- **Frontend**: React 19, TypeScript, Tailwind CSS, TanStack Query, Zustand.
- **Security**: OAuth2 with PKCE, Secure macOS Keychain storage via Entitlements.

## ⚙️ Google Cloud Console Setup Guide

To run Misfit GSuite, you must configure a Google Cloud Project with the appropriate permissions.

### 1. Create a Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named `Misfit GSuite`.

### 2. Enable APIs
Enable the following APIs in the **API & Services > Library** section:
- Gmail API
- Google Calendar API
- Google Drive API
- Google Docs API
- Google Sheets API
- Google Slides API
- Google Chat API
- Admin SDK API (for Admin Console access)
- Cloud Resource Manager API (for Cloud Console integration)
- Generative Language API (for Gemini)

### 3. Configure OAuth Consent Screen
1. Go to **APIs & Services > OAuth consent screen**.
2. Select **Internal** (if using a Workspace domain) or **External**.
3. Add the following scopes:
   - `.../auth/gmail.modify`, `.../auth/calendar`, `.../auth/drive`, `.../auth/cloud-platform`, `.../auth/admin.directory.user.readonly`, `openid`, `email`, `profile`.

### 4. Create OAuth 2.0 Credentials
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials > OAuth client ID**.
3. Select **Desktop app** as the application type.
4. Download the JSON file or copy the **Client ID** and **Client Secret**.

### 5. (Optional) Pub/Sub for Push Notifications
1. Go to **Pub/Sub > Topics** and create a topic named `gmail-notifications`.
2. Create a subscription named `gmail-notifications-pull` for that topic.
3. Grant the Gmail service account (`gmail-api-push@system.gserviceaccount.com`) permission to publish to your topic.

## 📦 Installation

1. **Environment Variables**: Create a `.env` file in the root directory (use `.env.example` as a template).
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run Development**:
   ```bash
   npm run tauri dev
   ```

---
*Misfit GSuite is an independent project and is not affiliated with Google.*

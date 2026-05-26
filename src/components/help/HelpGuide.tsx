import { useState } from "react";
import {
  X,
  Mail,
  Calendar,
  HardDrive,
  MessageCircle,
  Mic2,
  Sparkles,
  Network,
  Settings,
  Shield,
  LogIn,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Section definitions ───────────────────────────────────────────────────

const SECTIONS = [
  { id: "getting-started", label: "Getting Started", icon: LogIn },
  { id: "mail",            label: "Mail",             icon: Mail },
  { id: "calendar",        label: "Calendar",         icon: Calendar },
  { id: "drive",           label: "Drive & Docs",     icon: HardDrive },
  { id: "chat",            label: "Google Chat",      icon: MessageCircle },
  { id: "slack",           label: "Slack",            icon: MessageCircle },
  { id: "fireflies",       label: "Fireflies",        icon: Mic2 },
  { id: "gemini",          label: "Gemini AI",        icon: Sparkles },
  { id: "knowledge",       label: "Knowledge Graph",  icon: Network },
  { id: "settings",        label: "Settings",         icon: Settings },
  { id: "privacy",         label: "Privacy & Security", icon: Shield },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// ── Shared sub-components ─────────────────────────────────────────────────

function SectionHeading({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "purple" | "emerald" | "amber" | "red" }) {
  const borderColors: Record<string, string> = {
    blue:    "border-blue-500",
    purple:  "border-purple-500",
    emerald: "border-emerald-500",
    amber:   "border-amber-500",
    red:     "border-red-500",
  };
  return (
    <h3 className={cn("text-sm font-black uppercase tracking-widest text-white border-l-2 pl-3 mb-3", borderColors[color])}>
      {children}
    </h3>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-300 leading-relaxed mb-3">{children}</p>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-4 py-3 mb-4">
      <span className="text-blue-400 text-xs font-black uppercase tracking-widest flex-shrink-0 pt-0.5">Tip</span>
      <p className="text-sm text-blue-200 leading-relaxed">{children}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 mb-4">
      <span className="text-amber-400 text-xs font-black uppercase tracking-widest flex-shrink-0 pt-0.5">Note</span>
      <p className="text-sm text-amber-100 leading-relaxed">{children}</p>
    </div>
  );
}

function KbRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-1">
        {keys.map((k) => (
          <kbd key={k} className="px-2 py-0.5 bg-gray-900 border border-white/10 rounded-lg text-[10px] font-black text-gray-300 uppercase tracking-widest">
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-sm text-gray-400">{action}</span>
    </div>
  );
}

// ── Section content ───────────────────────────────────────────────────────

function GettingStarted() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="blue">Signing In</SectionHeading>
        <Para>
          When you first launch Misfit Hub, click <strong className="text-white">Connect Google Account</strong> to begin the OAuth 2.0 PKCE flow. A browser window opens to google.com — sign in there and grant the requested permissions. The app never sees your Google password.
        </Para>
        <Para>
          Once authorized, your OAuth token is stored securely in the <strong className="text-white">macOS Keychain</strong>. The token is automatically refreshed whenever it is within five minutes of expiry, so you stay signed in without re-authenticating.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Permissions Requested</SectionHeading>
        <Para>The app requests the following Google API scopes:</Para>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Gmail", "Read, send, and modify messages and labels"],
            ["Google Calendar", "View and manage your calendar events and calendars"],
            ["Google Drive", "Browse files and shared drives, open documents"],
            ["Google Docs API", "Read and write document content"],
            ["Google Chat", "List spaces and send messages in Chat"],
            ["Gemini (Generative Language API)", "Run AI chat, reply generation, and inbox organization"],
          ].map(([scope, desc]) => (
            <div key={scope} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest w-44 flex-shrink-0 pt-0.5">{scope}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
        <Note>None of your data is uploaded to Misfit servers. All API calls go directly from your Mac to Google's servers using your own OAuth credentials.</Note>
      </div>

      <div>
        <SectionHeading color="blue">Switching Accounts</SectionHeading>
        <Para>
          Click your <strong className="text-white">avatar</strong> in the top-right corner to open the account menu. It shows your current Google account's name, email, and profile picture. Use <strong className="text-white">Sign out</strong> to disconnect the current account, then sign in with a different one.
        </Para>
        <Para>
          From the account menu you can also jump to <strong className="text-white">Manage your Google Account</strong>, <strong className="text-white">Security</strong>, and <strong className="text-white">Data & privacy</strong> — these open in your default browser.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Navigating the App</SectionHeading>
        <Para>
          The <strong className="text-white">top navigation pill</strong> switches between the main views: Mail, Calendar, Drive, Docs, Sheets, Slides, Slack, Fireflies, and Knowledge. The <strong className="text-white">left sidebar</strong> updates contextually for each view — showing mail labels, calendar actions, Slack channels, Fireflies folders, or the Knowledge Graph crawl status.
        </Para>
        <Para>
          The sidebar and the right-side Google Chat panel are both resizable by dragging their divider edges. Chat panel visibility is toggled from Settings or the <strong className="text-white">Messaging</strong> button at the bottom of the sidebar.
        </Para>
      </div>
    </div>
  );
}

function MailSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="blue">Reading Mail</SectionHeading>
        <Para>
          The Mail view has two layout modes. <strong className="text-white">Split</strong> (default) shows the thread list on the left and the open thread on the right. <strong className="text-white">Stacked</strong> puts the list on top and the thread below. Toggle the layout from the Settings menu or the <strong className="text-white">Split/Stacked</strong> button at the bottom of the sidebar.
        </Para>
        <Para>
          Click any thread in the list to open it. The detail pane renders the full HTML body of each message in the thread, with inline images and attachments. Threads are loaded from a local SQLite cache; pull-to-sync (the refresh button in the list header) fetches any new messages from Gmail.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Sidebar Labels</SectionHeading>
        <Para>The sidebar shows five system mailboxes — <strong className="text-white">Inbox</strong>, <strong className="text-white">Starred</strong>, <strong className="text-white">Sent</strong>, <strong className="text-white">Drafts</strong>, and <strong className="text-white">Trash</strong> — with unread counts where applicable. Below those, any custom Gmail labels you have created appear in a <strong className="text-white">Labels</strong> section, each with a color-coded dot. Click a label to filter the thread list to that label only.</Para>
      </div>

      <div>
        <SectionHeading color="blue">Composing & Replying</SectionHeading>
        <Para>
          Click <strong className="text-white">Compose</strong> at the top of the sidebar to open a new-message modal. Fill in To, Subject, and body, then hit <strong className="text-white">Send</strong> or save a draft. When you're reading a thread, use the <strong className="text-white">Reply</strong> button inside the message detail to open a reply composer pre-filled with the thread metadata.
        </Para>
        <Tip>Use the Gemini <strong>Reply</strong> tab to generate an AI draft reply based on the selected thread before composing.</Tip>
      </div>

      <div>
        <SectionHeading color="blue">Message Actions</SectionHeading>
        <Para>Actions available on messages in the thread detail view:</Para>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Star / Unstar", "Adds or removes the STARRED label"],
            ["Archive", "Removes the INBOX label — message stays in All Mail"],
            ["Trash", "Moves the message to Trash"],
            ["Mark as Read / Unread", "Toggles the UNREAD label"],
            ["Move to Label", "Opens a label picker to apply a custom label"],
          ].map(([action, desc]) => (
            <div key={action} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest w-40 flex-shrink-0 pt-0.5">{action}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="blue">Search</SectionHeading>
        <Para>
          Type in the search bar (top-right of the window) to search messages. The placeholder updates to reflect the active view — "Search messages..." when in Mail. Results are fetched live from Gmail's search API using the same query syntax as Gmail's web search (e.g., <code className="text-blue-300 bg-gray-900 px-1.5 py-0.5 rounded-lg text-xs">from:alice subject:report</code>).
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Attachments</SectionHeading>
        <Para>Attachments are shown as clickable chips below the message body. Clicking downloads the attachment data via the Gmail API and opens it using the macOS default handler for that file type.</Para>
      </div>

      <div>
        <SectionHeading color="blue">Keyboard Shortcuts</SectionHeading>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 px-4 py-2">
          <KbRow keys={["Cmd", "N"]} action="New compose window" />
          <KbRow keys={["Enter"]} action="Open selected thread" />
          <KbRow keys={["E"]} action="Archive selected thread" />
          <KbRow keys={["#"]} action="Trash selected thread" />
          <KbRow keys={["S"]} action="Star / unstar selected message" />
          <KbRow keys={["Cmd", "Z"]} action="Undo last action (pending operations queue)" />
        </div>
      </div>
    </div>
  );
}

function CalendarSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="emerald">Views</SectionHeading>
        <Para>
          The Calendar view opens in <strong className="text-white">Week</strong> mode by default. Use the view switcher in the toolbar to toggle between <strong className="text-white">Month</strong>, <strong className="text-white">Week</strong>, and <strong className="text-white">Day</strong>. Navigate backward and forward with the arrow buttons, or jump back to the current period with the <strong className="text-white">Today</strong> button.
        </Para>
        <Para>Events are fetched for the time range visible in the current view. Switching view modes or navigating automatically refetches the relevant date window — up to 500 events per calendar per visible period.</Para>
      </div>

      <div>
        <SectionHeading color="emerald">Creating Events</SectionHeading>
        <Para>
          Click <strong className="text-white">New Event</strong> in the sidebar, or click directly on any day cell (Month view) or time slot (Week/Day view) to open the event creation modal pre-filled with that date and time. Fill in the event title, description, start/end time, and any additional calendars, then save.
        </Para>
        <Tip>You can also create a New Task from the sidebar — this opens the same event modal with a task-oriented default configuration.</Tip>
      </div>

      <div>
        <SectionHeading color="emerald">Viewing & Editing Events</SectionHeading>
        <Para>Click any event on the calendar to open the event detail modal. From there you can edit the title, times, description, and other fields, or delete the event. Changes are sent immediately to the Google Calendar API.</Para>
      </div>

      <div>
        <SectionHeading color="emerald">RSVP</SectionHeading>
        <Para>
          When you open an event that you were invited to, the event modal offers RSVP options: <strong className="text-white">Accept</strong>, <strong className="text-white">Decline</strong>, or <strong className="text-white">Maybe</strong>. Your response is sent to Google Calendar and updates the attendee list on the event.
        </Para>
      </div>

      <div>
        <SectionHeading color="emerald">Multiple Calendars</SectionHeading>
        <Para>
          The sidebar shows <strong className="text-white">My Calendars</strong> and a <strong className="text-white">Subscriptions</strong> toggle. All calendars visible in your Google account are loaded via the Calendar API. Events from the primary calendar are shown by default; you can layer on additional calendars by selecting them.
        </Para>
      </div>
    </div>
  );
}

function DriveSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="amber">Browsing Files</SectionHeading>
        <Para>
          The Drive view is split into three panes: the sidebar (left), a folder tree (center-left), and a file list (main). The <strong className="text-white">folder tree</strong> shows your My Drive root folders plus any Shared Drives. Click a folder to expand its contents in the file list.
        </Para>
        <Para>
          Switch between <strong className="text-white">List</strong> view (shows name, size, modified date) and <strong className="text-white">Grid</strong> view (icon tiles) using the toggle buttons in the file list header. Files load in pages of 50 — scroll to the bottom to fetch the next page.
        </Para>
      </div>

      <div>
        <SectionHeading color="amber">Sidebar Categories</SectionHeading>
        <Para>The sidebar Exploration section gives quick access to filtered views:</Para>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["All Files", "Browses the current folder normally"],
            ["Starred", "Shows all starred items across Drive"],
            ["Recent", "Files ordered by when you last viewed them"],
            ["Shared with me", "Files others have shared with you"],
            ["Shortcuts", "Drive shortcuts in your account"],
          ].map(([cat, desc]) => (
            <div key={cat} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest w-40 flex-shrink-0 pt-0.5">{cat}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="amber">Shared Drives</SectionHeading>
        <Para>
          Shared Drives appear below My Drive in the folder tree, each with a <strong className="text-white">database</strong> icon. Clicking a Shared Drive sets it as the active drive context, and the folder tree re-roots to that drive's top level. An emerald <strong className="text-white">Shared Drive</strong> badge appears in the breadcrumb.
        </Para>
      </div>

      <div>
        <SectionHeading color="amber">Opening Files</SectionHeading>
        <Para>
          <strong className="text-white">Google Docs</strong> open inside the app in the Docs view (an inline viewer). All other file types — Sheets, Slides, PDFs, images — open in your default browser using the file's Google Drive web view link.
        </Para>
        <Para>
          The <strong className="text-white">Docs</strong>, <strong className="text-white">Sheets</strong>, and <strong className="text-white">Slides</strong> views in the top nav are filtered versions of Drive that show only files of that type. In these views, selecting a root or Shared Drive performs a <strong className="text-white">Global Scan</strong> (no parent-folder filter), while selecting a specific subfolder performs a <strong className="text-white">Deep Scan</strong> (recursive search within that folder only).
        </Para>
      </div>

      <div>
        <SectionHeading color="amber">Drive Search</SectionHeading>
        <Para>Use the search input inside the Drive file list header to filter the current directory listing by filename. This is a client-side filter over the loaded page of files.</Para>
      </div>
    </div>
  );
}

function ChatSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="blue">The Chat Panel</SectionHeading>
        <Para>
          Google Chat lives in the <strong className="text-white">right panel</strong> of the app, which slides in alongside any main view. Toggle it from <strong className="text-white">Settings → Messaging panel</strong> or click <strong className="text-white">Messaging</strong> at the bottom of the sidebar. The panel width is resizable by dragging its left edge.
        </Para>
        <Para>
          The panel lists all your Google Chat <strong className="text-white">Spaces</strong> (both DMs and group spaces). Click a space to open its message thread. Messages update every 10 seconds via short-polling — no webhook or public URL is required.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Sending Messages</SectionHeading>
        <Para>Type a message in the input at the bottom of the chat panel and press <kbd className="px-2 py-0.5 bg-gray-900 border border-white/10 rounded-lg text-xs text-gray-300">Enter</kbd> or click the send button. File attachments can be included by using the attachment button, which uploads the file to the Chat API and includes it in the message.</Para>
      </div>

      <div>
        <SectionHeading color="blue">Spaces</SectionHeading>
        <Para>Spaces include both direct messages (1:1) and group rooms. Each space shows its name and recent message preview in the space list. You can view member lists and create new spaces via the space management controls in the panel header.</Para>
      </div>

      <Note>Google Chat in Misfit Hub is distinct from Slack. Chat is the built-in Google Workspace messaging layer; Slack is a separately connected third-party service. Both are available simultaneously.</Note>
    </div>
  );
}

function SlackSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="purple">Connecting Slack</SectionHeading>
        <Para>
          Navigate to the <strong className="text-white">Slack</strong> view from the top nav. If no workspace is connected, you'll see a Connect Slack screen. Click <strong className="text-white">Connect Slack</strong> — a browser window opens to Slack's OAuth authorization page. Complete authorization there, then return to the app; it detects the callback automatically.
        </Para>
        <Para>
          The OAuth flow requests the following Slack user scopes: <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">channels:history</code>, <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">channels:read</code>, <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">chat:write</code>, <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">files:read</code>, <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">groups:history</code>, <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">im:history</code>, <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">mpim:history</code>, and <code className="text-purple-300 text-xs bg-gray-900 px-1.5 py-0.5 rounded-lg">users:read</code>.
        </Para>
        <Para>To disconnect, click the <strong className="text-white">logout icon</strong> next to the Slack heading at the top of the sidebar.</Para>
      </div>

      <div>
        <SectionHeading color="purple">Channels & DMs</SectionHeading>
        <Para>
          Once connected, the sidebar lists all channels and DMs you're a member of. <strong className="text-white">Public channels</strong> show a # icon; <strong className="text-white">Private channels</strong> show a lock icon; <strong className="text-white">Direct Messages</strong> show a person icon with the real display name resolved from the Slack Users API.
        </Para>
        <Para>The workspace name badge appears at the bottom of the sidebar to confirm which workspace is active.</Para>
      </div>

      <div>
        <SectionHeading color="purple">Reading Messages</SectionHeading>
        <Para>
          Click a channel or DM to open it. Messages load with display names, timestamps, emoji reactions, and file attachments. Slack mrkdwn entities — <code className="text-xs text-gray-300 bg-gray-900 px-1.5 py-0.5 rounded-lg">@mentions</code>, <code className="text-xs text-gray-300 bg-gray-900 px-1.5 py-0.5 rounded-lg">#channels</code>, <code className="text-xs text-gray-300 bg-gray-900 px-1.5 py-0.5 rounded-lg">@here</code> / <code className="text-xs text-gray-300 bg-gray-900 px-1.5 py-0.5 rounded-lg">@channel</code>, and hyperlinks — are rendered inline. Emoji shortcodes are resolved to Unicode characters.
        </Para>
        <Para>Channel history refreshes every <strong className="text-white">10 seconds</strong> automatically while a channel is open.</Para>
      </div>

      <div>
        <SectionHeading color="purple">Sending Messages</SectionHeading>
        <Para>
          Type in the message input at the bottom of the view. Press <kbd className="px-2 py-0.5 bg-gray-900 border border-white/10 rounded-lg text-xs text-gray-300">Cmd</kbd> + <kbd className="px-2 py-0.5 bg-gray-900 border border-white/10 rounded-lg text-xs text-gray-300">Enter</kbd> or click the send button to post. The message is sent via the Slack API using your authorized user token.
        </Para>
      </div>

      <div>
        <SectionHeading color="purple">File Previews</SectionHeading>
        <Para>
          Images attached to messages are rendered inline — click an image to open it in a full-screen preview modal. PDFs are fetched through the Rust backend (which handles Slack's authenticated download URLs) and displayed in an in-app iframe viewer with a download option. Other file types open in Slack's web permalink.
        </Para>
      </div>

      <div>
        <SectionHeading color="purple">Gemini Context</SectionHeading>
        <Para>When a Slack channel is active, the last 20 messages are automatically passed as context to Gemini AI. Open the Gemini panel while in Slack to ask questions about the conversation.</Para>
      </div>
    </div>
  );
}

function FirefliesSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="blue">Adding Your API Key</SectionHeading>
        <Para>
          Fireflies uses a personal API key rather than OAuth. Go to <strong className="text-white">Settings → Integrations</strong> (gear icon in the top nav), find the <strong className="text-white">Fireflies</strong> section, paste your API key, and click <strong className="text-white">Save</strong>. The key is stored in the macOS Keychain and is never displayed again. Once saved, the status badge changes from "Not set" to "Configured."
        </Para>
        <Para>You can delete the saved key at any time by clicking the trash icon in the Integrations settings.</Para>
        <Note>If you don't have a Fireflies account, sign up at fireflies.ai. Your API key is found in the Fireflies web app under your profile settings.</Note>
      </div>

      <div>
        <SectionHeading color="blue">Browsing Meetings</SectionHeading>
        <Para>
          Once your API key is configured, the Fireflies view loads up to 50 of your most recent meeting transcripts in the left pane. Click any meeting to open it in the detail panel.
        </Para>
        <Para>
          The sidebar shows <strong className="text-white">All Meetings</strong> at the top. Below that, any Fireflies <strong className="text-white">Folders</strong> (also called channels) you have in your Fireflies account appear as filter options — click a folder to show only the meetings in that folder.
        </Para>
        <Tip>Folders are managed in the Fireflies web app. Use the external link button at the top of the sidebar to open fireflies.ai directly.</Tip>
      </div>

      <div>
        <SectionHeading color="blue">Meeting Detail Tabs</SectionHeading>
        <Para>Each meeting has three tabs:</Para>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Summary", "AI-generated overview, short summary, outline, and keyword extraction from Fireflies"],
            ["Transcript", "Full verbatim transcript with speaker names and timestamps (e.g. 1:23) for each sentence"],
            ["Action Items", "Extracted action items from the meeting, as generated by Fireflies AI"],
          ].map(([tab, desc]) => (
            <div key={tab} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest w-28 flex-shrink-0 pt-0.5">{tab}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="blue">Moving Meetings to Folders</SectionHeading>
        <Para>
          Hover over any meeting in the left pane to reveal a <strong className="text-white">folder icon</strong> on the right side. Click it to open a menu of your Fireflies folders. Select a folder to move that meeting there. The move is applied immediately via the Fireflies API and the meeting list refreshes.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Gemini Context</SectionHeading>
        <Para>When a meeting is open, its title, participants, summary overview, and action items are automatically passed as context to Gemini AI. Open the Gemini panel to ask questions about the meeting — for example, "Draft a follow-up email based on the action items."</Para>
      </div>
    </div>
  );
}

function GeminiSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="blue">Opening Gemini</SectionHeading>
        <Para>
          A floating <strong className="text-white">Sparkles button</strong> appears in the bottom-right corner of the Mail, Calendar, and other views. Click it to open the Gemini panel — a 400×600px floating drawer that sits above the main content. Press <strong className="text-white">X</strong> to close it.
        </Para>
        <Para>
          In Drive, Docs, Sheets, Slides, Slack, Fireflies, and Knowledge views, Gemini is instead embedded in the <strong className="text-white">right panel</strong> (the same panel that shows Google Chat in other views). This gives you persistent AI access alongside the content you're browsing.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Chat Tab</SectionHeading>
        <Para>
          The Chat tab is a persistent conversation with Gemini. Type a question or request and press <kbd className="px-2 py-0.5 bg-gray-900 border border-white/10 rounded-lg text-xs text-gray-300">Enter</kbd> or click Send. The full conversation history is maintained in-session. Starter suggestions appear when the chat is empty:
        </Para>
        <ul className="list-disc list-inside text-sm text-gray-400 mb-4 space-y-1 pl-2">
          <li>"Summarize operational traffic from today"</li>
          <li>"Which threads require immediate attention?"</li>
          <li>"Synthesize a mission report for this week"</li>
          <li>"Audit my shared resources for security risks"</li>
        </ul>
      </div>

      <div>
        <SectionHeading color="blue">Reply Tab (Mail only)</SectionHeading>
        <Para>
          Available only while in the Mail view. Select an email thread in the message list first, then click <strong className="text-white">Generate Expert Draft</strong>. Gemini reads the full thread content and generates a contextual reply draft. The draft appears in the panel — copy it into the compose window or use it as a starting point.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Organize Tab (Mail only)</SectionHeading>
        <Para>
          Click <strong className="text-white">Organize</strong> to run Gemini's inbox organization analysis. Gemini reviews your inbox and returns recommendations for prioritization, labeling, and follow-up — as a conversational response in the panel.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Drive Connected Badge</SectionHeading>
        <Para>
          When you're in a Drive-family view (Drive, Docs, Sheets, Slides), the Gemini header shows a <strong className="text-white">Drive Connected</strong> badge. This means Gemini uses a tool-calling path that can search your Drive files in real time — it can look up documents, list folder contents, and return clickable file chips alongside its text response.
        </Para>
        <Para>Gemini passes the active view type, current folder ID, and active Shared Drive ID as context, allowing it to answer questions like "What files are in the Marketing folder?" with live Drive API data.</Para>
      </div>

      <div>
        <SectionHeading color="blue">Model Selection</SectionHeading>
        <Para>
          The Gemini model used for all AI features is selected in <strong className="text-white">Settings → Integrations → Gemini</strong>. The available model list is fetched live from the Gemini API at startup. Pick any model that supports <code className="text-xs text-blue-300 bg-gray-900 px-1.5 py-0.5 rounded-lg">generateContent</code>. Your selection is saved locally and persists across sessions.
        </Para>
        <Note>If your saved model is no longer available in the API's model list, an amber warning appears in Integrations. Select a different model to avoid errors.</Note>
      </div>
    </div>
  );
}

function KnowledgeSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="purple">What the Knowledge Graph Is</SectionHeading>
        <Para>
          The Knowledge Graph is a 3D interactive visualization of your Google Drive files and the relationships between them. Every file becomes a <strong className="text-white">node</strong>; relationships between files (folder structure, Gemini-detected references, and shared entities) become <strong className="text-white">edges</strong>. Node size reflects each file's importance score as assigned by Gemini.
        </Para>
      </div>

      <div>
        <SectionHeading color="purple">Starting a Crawl</SectionHeading>
        <Para>
          Click <strong className="text-white">Start Crawl</strong> in the sidebar or the header button in the Knowledge view. The crawler indexes all files in your Drive (including Shared Drives) and sends each file's metadata to Gemini for enrichment. Progress is shown in real time in the header: <em className="text-gray-300">Crawling N / M</em>, then <em className="text-gray-300">N indexed · M enriched</em>.
        </Para>
        <Para>After a crawl completes, click <strong className="text-white">Re-Crawl</strong> to re-index (delta sync — processes files changed since the last crawl).</Para>
        <Note>The first crawl may take several minutes depending on the number of files in your Drive. Enrichment continues in the background after the initial crawl finishes.</Note>
      </div>

      <div>
        <SectionHeading color="purple">What Gemini Enriches</SectionHeading>
        <Para>For each file, Gemini adds:</Para>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Topic Tags", "Category labels that color-code nodes in the 3D graph"],
            ["Importance Score", "1–10 score that scales the node's sphere size"],
            ["Summary", "Short human-readable description shown on hover"],
            ["Named Entities", "People, projects, clients, and products extracted from the document — become separate entity nodes"],
            ["References", "Documents that this file refers to — become gemini_reference edges between nodes"],
          ].map(([field, desc]) => (
            <div key={field} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest w-40 flex-shrink-0 pt-0.5">{field}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="purple">3D Navigation Controls</SectionHeading>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Left-drag", "Orbit — rotate the graph in 3D space"],
            ["Scroll wheel / Pinch", "Zoom in and out"],
            ["Right-drag", "Pan the camera"],
            ["Click a node", "Open the file in your browser (if it has a Drive web link)"],
            ["Hover a node", "Show a tooltip with the file name, Gemini summary, and topic tags"],
            ["Drag a node", "Move that individual node — useful for untangling clusters"],
          ].map(([control, desc]) => (
            <div key={control} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest w-40 flex-shrink-0 pt-0.5">{control}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="purple">Edge Types</SectionHeading>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Folder Hierarchy", "Gray, thin edges — parent/child folder relationships"],
            ["Gemini References", "Blue, thicker edges — one document references another, as detected by Gemini"],
            ["Entity Links", "Purple, thicker edges — two files share a common named entity (person, project, etc.)"],
          ].map(([type, desc]) => (
            <div key={type} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest w-44 flex-shrink-0 pt-0.5">{type}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="purple">Filters</SectionHeading>
        <Para>A filter bar appears above the graph once a crawl has completed:</Para>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Search", "Filters nodes by filename — only matching nodes and their connecting edges are shown"],
            ["Topic", "Dropdown of all unique Gemini topic tags — select one to isolate that topic cluster"],
            ["Drive", "Dropdown of all Shared Drives present in the graph — select one to see only that drive's files"],
            ["Folders toggle", "Show/hide folder hierarchy edges"],
            ["References toggle", "Show/hide Gemini-detected reference edges"],
            ["Entities toggle", "Show/hide entity link edges"],
          ].map(([filter, desc]) => (
            <div key={filter} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest w-40 flex-shrink-0 pt-0.5">{filter}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsSection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="blue">Appearance</SectionHeading>
        <Para>
          Open the Appearance panel from <strong className="text-white">Settings → Appearance</strong> (gear icon in the top nav) or the <strong className="text-white">Appearance</strong> button at the bottom of the sidebar. From there you can switch themes (light, dark, high-contrast, and any custom theme you've configured) and adjust the font scale (<strong className="text-white">SM</strong>, <strong className="text-white">MD</strong>, <strong className="text-white">LG</strong>, <strong className="text-white">XL</strong>).
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Mail Layout</SectionHeading>
        <Para>
          Toggle between <strong className="text-white">Split</strong> (thread list on the left, detail on the right) and <strong className="text-white">Stacked</strong> (list on top, detail below) from Settings or the layout button at the bottom of the sidebar. Both panels are resizable by dragging the divider.
        </Para>
      </div>

      <div>
        <SectionHeading color="blue">Integrations</SectionHeading>
        <Para>Open <strong className="text-white">Settings → Integrations</strong> to manage:</Para>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Fireflies API Key", "Paste your Fireflies API key here. Stored in macOS Keychain. Use the trash icon to remove it."],
            ["Gemini Model", "Select which Gemini model powers all AI features. Models are loaded live from the Gemini API."],
          ].map(([setting, desc]) => (
            <div key={setting} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest w-48 flex-shrink-0 pt-0.5">{setting}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="blue">API Health Checker</SectionHeading>
        <Para>
          The bottom of the Integrations panel runs a live connectivity check against all six integrated services: <strong className="text-white">Google Account</strong>, <strong className="text-white">Gmail / Drive</strong>, <strong className="text-white">Calendar</strong>, <strong className="text-white">Google Chat</strong>, <strong className="text-white">Gemini AI</strong>, and <strong className="text-white">Fireflies</strong>. Each service shows a green checkmark (OK), red X (error), or spinning loader (checking).
        </Para>
        <Para>
          If any service shows an error, a <strong className="text-white">Re-authenticate with Google</strong> button appears. Clicking it restarts the OAuth flow to refresh your token and re-runs all checks automatically.
        </Para>
        <Tip>Run the health checker any time the app feels unresponsive or API errors appear — it pinpoints exactly which service is failing.</Tip>
      </div>

      <div>
        <SectionHeading color="blue">Re-authentication</SectionHeading>
        <Para>
          OAuth tokens expire after a set period. The app auto-refreshes them before expiry, but if a token becomes invalid (e.g., your Google account password changed, or you revoked access), use <strong className="text-white">Settings → Integrations → Re-authenticate with Google</strong> to trigger a fresh OAuth flow.
        </Para>
      </div>
    </div>
  );
}

function PrivacySection() {
  return (
    <div className="space-y-8">
      <div>
        <SectionHeading color="emerald">What Stays on Your Mac</SectionHeading>
        <Para>
          Misfit Hub stores a local cache of your Gmail threads and messages in a <strong className="text-white">SQLite database</strong> on your Mac. This cache is used for fast search and offline access — it is never uploaded anywhere. The Knowledge Graph data (node metadata, enrichment results, edge lists) is also stored locally in SQLite.
        </Para>
        <Para>All app preferences, theme settings, font scale, and Gemini model selection are stored locally in the app's data directory.</Para>
      </div>

      <div>
        <SectionHeading color="emerald">OAuth Token Storage</SectionHeading>
        <Para>
          Your Google OAuth access token and refresh token are stored exclusively in the <strong className="text-white">macOS Keychain</strong> — the same secure, encrypted storage that Safari and other Apple apps use. The tokens are never written to disk in plaintext, never logged, and never transmitted to any server other than Google's OAuth endpoints.
        </Para>
        <Para>The Fireflies API key is also stored in the macOS Keychain using the same mechanism.</Para>
      </div>

      <div>
        <SectionHeading color="emerald">What Goes to External APIs</SectionHeading>
        <div className="rounded-2xl border border-white/5 bg-gray-900/40 divide-y divide-white/5 mb-4">
          {[
            ["Google APIs", "All Gmail, Calendar, Drive, Docs, and Chat API calls go directly from your Mac to Google servers using your OAuth token."],
            ["Gemini API", "When you use AI features, message content and document snippets are sent to Google's Gemini API under your account's API key. This is governed by Google's Gemini API terms."],
            ["Fireflies API", "Meeting metadata and transcripts are fetched from Fireflies servers using your personal API key. No data is sent to Fireflies — only read requests are made."],
            ["Slack API", "Channel history and messages are fetched from Slack using your OAuth user token. Sent messages are posted through the Slack API."],
          ].map(([service, desc]) => (
            <div key={service} className="px-4 py-3 flex gap-4">
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest w-36 flex-shrink-0 pt-0.5">{service}</span>
              <span className="text-sm text-gray-400">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading color="emerald">No Misfit Servers</SectionHeading>
        <Para>
          Misfit Hub does not have a backend server. There is no Misfit account, no telemetry, no crash reporting, and no analytics collection. Every network request made by the app goes directly to Google, Slack, or Fireflies — never to a Misfit-operated endpoint. Your data is your data.
        </Para>
        <Tip>You can verify this by running the app with a network monitoring tool — all outbound connections will be to googleapis.com, slack.com, and api.fireflies.ai domains only.</Tip>
      </div>

      <div>
        <SectionHeading color="emerald">Revoking Access</SectionHeading>
        <Para>
          To revoke Misfit Hub's access to your Google account, go to <strong className="text-white">myaccount.google.com/permissions</strong> and remove the Misfit GSuite app. For Slack, revoke the app in your Slack workspace's App Management settings. For Fireflies, delete the API key from Integrations settings and rotate it in the Fireflies web app.
        </Para>
      </div>
    </div>
  );
}

const SECTION_CONTENT: Record<SectionId, React.ReactNode> = {
  "getting-started": <GettingStarted />,
  "mail":            <MailSection />,
  "calendar":        <CalendarSection />,
  "drive":           <DriveSection />,
  "chat":            <ChatSection />,
  "slack":           <SlackSection />,
  "fireflies":       <FirefliesSection />,
  "gemini":          <GeminiSection />,
  "knowledge":       <KnowledgeSection />,
  "settings":        <SettingsSection />,
  "privacy":         <PrivacySection />,
};

// ── Main HelpGuide component ──────────────────────────────────────────────

export default function HelpGuide({ open, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("getting-started");

  if (!open) return null;

  const currentSection = SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="flex overflow-hidden rounded-[28px] border border-white/5 shadow-2xl"
        style={{
          width: "760px",
          maxWidth: "calc(100vw - 32px)",
          height: "calc(100vh - 32px)",
          maxHeight: "780px",
          background: "#030712",
          color: "var(--mm-text-primary, #fff)",
        }}
      >
        {/* Left nav */}
        <div
          className="w-52 flex-shrink-0 flex flex-col border-r border-white/5 overflow-hidden"
          style={{ background: "#0a0f1a" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/5">
            <div className="w-8 h-8 rounded-xl bg-gray-900 border border-white/10 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] font-black text-white uppercase tracking-widest">Help Guide</p>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Misfit Hub</p>
            </div>
          </div>

          {/* Nav items */}
          <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 custom-scrollbar">
            {SECTIONS.map(({ id, label, icon: Icon }) => {
              const isActive = activeSection === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group text-left",
                    isActive
                      ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                      : "text-gray-500 hover:bg-gray-900/40 hover:text-gray-300"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-3.5 h-3.5 flex-shrink-0 transition-transform",
                      isActive ? "text-blue-400 scale-110" : "text-gray-600 group-hover:scale-110"
                    )}
                  />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer version note */}
          <div className="px-4 py-4 border-t border-white/5">
            <p className="text-[9px] text-gray-700 font-bold uppercase tracking-widest leading-relaxed">
              Tauri 2.0 · Rust + React
            </p>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Content header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 flex-shrink-0" style={{ background: "#0a0f1a" }}>
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = currentSection.icon;
                return (
                  <div className="w-9 h-9 rounded-xl bg-gray-900 border border-white/10 flex items-center justify-center">
                    <Icon className="w-4.5 h-4.5 text-blue-400" />
                  </div>
                );
              })()}
              <h2 className="text-sm font-black uppercase tracking-widest text-white">
                {currentSection.label}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
              aria-label="Close help guide"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar" style={{ background: "#030712" }}>
            {SECTION_CONTENT[activeSection]}
          </div>
        </div>
      </div>
    </div>
  );
}

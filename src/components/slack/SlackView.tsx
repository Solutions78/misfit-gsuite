import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Hash, Lock, User, Loader2, Sparkles, ExternalLink, FileText, Image } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import {
  slackGetToken,
  startSlackOAuthFlow,
  listSlackChannels,
  getSlackHistory,
  sendSlackMessage,
  openDriveFile,
} from "@/lib/tauri";
import { setGeminiContext, clearGeminiContext } from "@/lib/geminiContextBridge";
import { useSlackUsers } from "@/hooks/useSlackUsers";
import type { SlackMessage, SlackTokenInfo } from "@/types";

const SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID ?? "";
const SLACK_REDIRECT_URI = "http://localhost:9005/slack/oauth2callback";
const SLACK_USER_SCOPES = [
  "channels:history",
  "channels:read",
  "channels:write",
  "chat:write",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "im:write",
  "mpim:history",
  "mpim:read",
  "users:read",
].join(",");

function buildOAuthUrl() {
  if (!SLACK_CLIENT_ID) {
    console.error("VITE_SLACK_CLIENT_ID environment variable is not set");
    return "";
  }
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    user_scope: SLACK_USER_SCOPES,
    redirect_uri: SLACK_REDIRECT_URI,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

function formatTs(ts: string): string {
  const date = new Date(parseFloat(ts) * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function avatarColor(seed: string): string {
  const palette = [
    "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981",
    "#f59e0b", "#ef4444", "#ec4899", "#6366f1",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

// ── Connect screen ─────────────────────────────────────────────────────────

function ConnectSlack({ onConnected }: { onConnected: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      // Start the Rust callback listener FIRST, then open the browser.
      // startSlackOAuthFlow() blocks until the redirect arrives on port 9005.
      const flowPromise = startSlackOAuthFlow();
      await openDriveFile(buildOAuthUrl());
      await flowPromise;
      onConnected();
    } catch (e) {
      setError(String(e));
      setConnecting(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="bg-gray-900 rounded-[28px] border border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.4)] p-10 flex flex-col items-center gap-6 max-w-sm w-full">
        <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-white/5 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.05)]">
          <MessageCircle className="w-8 h-8 text-blue-400" />
        </div>
        <div className="text-center">
          <h2 className="text-[13px] font-black text-white uppercase tracking-widest mb-2">Connect Slack</h2>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-relaxed">
            Authorize your Slack workspace to view channels and send messages directly from Misfit Hub.
          </p>
        </div>
        {error && (
          <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider text-center">{error}</p>
        )}
        <button
          onClick={() => void handleConnect()}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5 transition-all active:scale-95 hover:shadow-[0_0_30px_rgba(255,255,255,0.18)] group disabled:opacity-50"
        >
          {connecting
            ? <><Loader2 className="w-4 h-4 animate-spin text-blue-400" />Waiting for authorization…</>
            : <><MessageCircle className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />Connect Slack</>
          }
        </button>
        <p className="text-[9px] text-gray-600 uppercase tracking-widest text-center font-bold">
          A browser window will open — complete authorization there
        </p>
      </div>
    </div>
  );
}

// ── Message bubble ─────────────────────────────────────────────────────────

// Map common Slack emoji names to actual Unicode characters
const EMOJI_MAP: Record<string, string> = {
  // Thumbs — most common Slack reactions
  thumbsup: "👍", "+1": "👍",
  thumbsdown: "👎", "-1": "👎",
  // Faces
  joy: "😂", "rolling_on_the_floor_laughing": "🤣", rofl: "🤣",
  heart_eyes: "😍", smile: "😊", laughing: "😆", grinning: "😀",
  sweat_smile: "😅", slightly_smiling_face: "🙂", slightly_frowning_face: "🙁",
  sob: "😭", cry: "😢", disappointed: "😞", confused: "😕",
  neutral_face: "😐", expressionless: "😑", hushed: "😯",
  open_mouth: "😮", scream: "😱", flushed: "😳", thinking_face: "🤔",
  face_with_rolling_eyes: "🙄", unamused: "😒", rage: "😡",
  partying_face: "🥳", sunglasses: "😎", wink: "😉", blush: "😊",
  stuck_out_tongue: "😛", stuck_out_tongue_winking_eye: "😜",
  kissing_heart: "😘", heart: "❤️", broken_heart: "💔",
  // Hands & gestures
  clap: "👏", pray: "🙏", muscle: "💪", wave: "👋",
  ok_hand: "👌", raised_hands: "🙌", point_up: "☝️", v: "✌️",
  handshake: "🤝", open_hands: "👐", crossed_fingers: "🤞",
  // Objects & symbols
  fire: "🔥", rocket: "🚀", eyes: "👀", star: "⭐", star2: "🌟",
  sparkles: "✨", zap: "⚡", bulb: "💡", "100": "💯", tada: "🎉",
  check: "✅", white_check_mark: "✅", x: "❌", warning: "⚠️",
  speech_balloon: "💬", thought_balloon: "💭", mega: "📣", loudspeaker: "📢",
  rotating_light: "🚨", bell: "🔔", calendar: "📅", computer: "💻",
  memo: "📝", pencil: "✏️", book: "📖", books: "📚", link: "🔗",
  trophy: "🏆", medal: "🥇", dart: "🎯", gem: "💎", money_with_wings: "💸",
  moneybag: "💰", chart_with_upwards_trend: "📈", chart_with_downwards_trend: "📉",
  clock1: "🕐", hourglass: "⏳", alarm_clock: "⏰",
  phone: "📱", email: "📧", mailbox: "📬", inbox_tray: "📥",
  white_circle: "⚪", black_circle: "⚫", red_circle: "🔴", large_green_circle: "🟢",
  large_yellow_circle: "🟡", large_blue_circle: "🔵",
};

// Replace :emoji_name: tokens in Slack message body text
function renderMessageText(text: string): string {
  return text.replace(/:([a-zA-Z0-9_\-+]+):/g, (match, name) => {
    const resolved = resolveEmoji(name);
    return resolved !== name ? resolved : match;
  });
}

function resolveEmoji(name: string): string {
  // Normalize: trim whitespace, strip any surrounding colons Slack may include
  const normalized = name.trim().replace(/^:+|:+$/g, "");
  // Direct lookup
  const direct = EMOJI_MAP[normalized];
  if (direct) return direct;
  // Strip skin-tone suffixes: Slack uses "::" or ":" as separator
  // e.g. "+1::skin-tone-2" or "thumbsup:skin-tone-3"
  const base = normalized.split(/::?/)[0];
  const baseEmoji = EMOJI_MAP[base];
  if (baseEmoji) return baseEmoji;
  // Show raw name (readable fallback, no surrounding colons)
  return normalized;
}

function FileAttachment({ file }: { file: { id: string; name?: string; title?: string; mimetype?: string; permalink?: string; urlPrivate?: string } }) {
  const isImage = file.mimetype?.startsWith("image/");
  const name = file.title || file.name || "Attachment";
  const href = file.permalink || file.urlPrivate;
  const Icon = isImage ? Image : FileText;

  return (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-all group max-w-xs"
      onClick={(e) => { if (!href) e.preventDefault(); }}
    >
      <Icon className="w-4 h-4 text-blue-400 flex-shrink-0" />
      <span className="text-[12px] font-semibold text-gray-200 truncate">{name}</span>
      {href && (
        <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-gray-300 flex-shrink-0 transition-colors" />
      )}
    </a>
  );
}

function MessageBubble({ msg, username }: { msg: SlackMessage; username: string }) {
  const displayName = username || msg.username || msg.user || "Unknown";
  const text = msg.text ?? "";

  return (
    <div className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.03] transition-colors group">
      <div
        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-[11px] font-black shadow-md"
        style={{ background: avatarColor(displayName) }}
      >
        {getInitials(displayName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2.5 mb-1.5">
          <span className="text-[13px] font-black text-white tracking-tight">{displayName}</span>
          <span className="text-[11px] font-semibold text-gray-400">{formatTs(msg.ts)}</span>
        </div>
        {text && (
          <p className="text-[14px] text-gray-100 leading-relaxed whitespace-pre-wrap break-words font-normal">{renderMessageText(text)}</p>
        )}
        {/* File attachments */}
        {msg.files && msg.files.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {msg.files.map((f) => (
              <FileAttachment key={f.id} file={f} />
            ))}
          </div>
        )}
        {/* Reactions */}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {msg.reactions.map((r) => (
              <span
                key={r.name}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.06] border border-white/10 rounded-full text-[12px] font-semibold text-gray-200 hover:bg-white/[0.1] hover:border-white/20 transition-all cursor-default select-none"
              >
                <span>{resolveEmoji(r.name)}</span>
                <span className="text-gray-400 text-[11px]">{r.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main SlackView ─────────────────────────────────────────────────────────

export default function SlackView() {
  const slackChannelId = useUIStore((s) => s.slackChannelId);
  const queryClient = useQueryClient();

  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check for token
  const { data: tokenInfo, isLoading: tokenLoading, refetch: refetchToken } = useQuery<SlackTokenInfo | null>({
    queryKey: ["slack-token"],
    queryFn: slackGetToken,
    staleTime: 30_000,
    retry: false,
  });

  const isConnected = !!tokenInfo;

  // Fetch channels (needed to resolve active channel metadata)
  const { data: channelData } = useQuery({
    queryKey: ["slack-channels"],
    queryFn: () => listSlackChannels(),
    enabled: isConnected,
    staleTime: 60_000,
  });

  const channels = channelData?.channels ?? [];

  // Fetch message history for active channel
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["slack-history", slackChannelId],
    queryFn: () => getSlackHistory(slackChannelId!, undefined, undefined),
    enabled: isConnected && !!slackChannelId,
    staleTime: 10_000,
  });

  const messages = (historyData?.messages ?? []).slice().reverse();

  // Resolve user IDs → display names
  const messageUserIds = [...new Set(messages.map((m) => m.user).filter(Boolean) as string[])];
  const resolveUser = useSlackUsers(messageUserIds, isConnected);

  // Update Gemini context when messages change
  useEffect(() => {
    if (slackChannelId && messages.length > 0) {
      const last20 = messages.slice(-20);
      const ctx = `[SLACK CONTEXT]\nChannel: ${slackChannelId}\n\n` +
        last20.map((m) => `${m.user ? resolveUser(m.user) : (m.username ?? "Unknown")} [${formatTs(m.ts)}]: ${m.text ?? ""}`).join("\n");
      setGeminiContext(ctx, "[SLACK CONTEXT]");
    } else {
      clearGeminiContext();
    }
    return () => clearGeminiContext();
  }, [slackChannelId, messages]);

  // Poll for new messages every 10 seconds
  useEffect(() => {
    if (!isConnected || !slackChannelId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["slack-history", slackChannelId] });
    }, 10_000);
    return () => clearInterval(interval);
  }, [isConnected, slackChannelId, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: ({ channelId, text }: { channelId: string; text: string }) =>
      sendSlackMessage(channelId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slack-history", slackChannelId] });
    },
  });

  const handleSend = useCallback(() => {
    if (!messageInput.trim() || !slackChannelId) return;
    sendMutation.mutate({ channelId: slackChannelId, text: messageInput.trim() });
    setMessageInput("");
  }, [messageInput, slackChannelId, sendMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const activeChannel = channels.find((c) => c.id === slackChannelId);

  if (tokenLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: "var(--c-bg)" }}>
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: "var(--c-bg)" }}>
        <ConnectSlack onConnected={() => void refetchToken()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--c-surface)" }}>
      {!slackChannelId ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-10 grayscale">
          <MessageCircle className="w-24 h-24 mb-8 text-blue-400" />
          <p className="text-xl font-black text-white uppercase tracking-[0.5em]">Select a Channel</p>
        </div>
      ) : (
        <>
          {/* Channel header */}
          <div className="px-8 py-5 border-b border-white/5 flex items-center gap-4 flex-shrink-0">
            <div className="w-10 h-10 rounded-2xl bg-gray-900 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/5">
              {activeChannel?.isIm ? (
                <User className="w-5 h-5 text-blue-400" />
              ) : activeChannel?.isPrivate ? (
                <Lock className="w-5 h-5 text-blue-400" />
              ) : (
                <Hash className="w-5 h-5 text-blue-400" />
              )}
            </div>
            <div>
              <h2 className="text-[13px] font-black text-white uppercase tracking-tight">
                {activeChannel?.name ?? slackChannelId}
              </h2>
              {activeChannel?.topic?.value && (
                <p className="text-[10px] text-gray-500 font-bold truncate max-w-lg">
                  {activeChannel.topic.value}
                </p>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
            {historyLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 opacity-20">
                <Sparkles className="w-12 h-12 text-blue-400 mb-4" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">No messages yet</p>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.ts}
                    msg={msg}
                    username={msg.user ? resolveUser(msg.user) : (msg.username ?? "Unknown")}
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Message input */}
          <div className="border-t border-white/5 p-4 flex-shrink-0 bg-transparent">
            <div className="flex gap-2 bg-gray-900 p-1.5 rounded-2xl border border-white/10 shadow-2xl focus-within:ring-4 focus-within:ring-blue-500/5 transition-all">
              <textarea
                rows={1}
                placeholder="Message channel... (Cmd+Enter to send)"
                className="flex-1 resize-none text-sm px-3 py-2 outline-none text-white bg-transparent placeholder:text-gray-500 placeholder:font-medium min-h-[36px] max-h-32 custom-scrollbar"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                onClick={handleSend}
                disabled={!messageInput.trim() || sendMutation.isPending}
                className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all active:scale-95 self-end"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

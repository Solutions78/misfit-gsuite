import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send, Hash, Lock, User, Loader2, Sparkles, FileText, Image, ExternalLink, Download } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import {
  slackGetToken,
  startSlackOAuthFlow,
  listSlackChannels,
  getSlackHistory,
  getSlackFileDataUrl,
  sendSlackMessage,
  openDriveFile,
} from "@/lib/tauri";
import { setGeminiContext, clearGeminiContext } from "@/lib/geminiContextBridge";
import { useSlackUsers } from "@/hooks/useSlackUsers";
import type { SlackFile, SlackMessage, SlackTokenInfo } from "@/types";

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
  "files:read",
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

function extractMentionUserIds(text?: string): string[] {
  if (!text) return [];
  return [...text.matchAll(/<@([A-Z0-9]+)(?:\|[^>]+)?>/g)].map((match) => match[1]);
}

// ── Connect screen ─────────────────────────────────────────────────────────

function ConnectSlack({ onConnected }: { onConnected: () => void }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
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

const EMOJI_MAP: Record<string, string> = {
  thumbsup: "👍", "+1": "👍",
  thumbsdown: "👎", "-1": "👎",
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
  clap: "👏", pray: "🙏", muscle: "💪", wave: "👋",
  ok_hand: "👌", raised_hands: "🙌", point_up: "☝️", v: "✌️",
  handshake: "🤝", open_hands: "👐", crossed_fingers: "🤞",
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

function resolveEmoji(name: string): string {
  const normalized = name.trim().replace(/^:+|:+$/g, "");
  const direct = EMOJI_MAP[normalized];
  if (direct) return direct;
  const base = normalized.split(/::?/)[0];
  const baseEmoji = EMOJI_MAP[base];
  if (baseEmoji) return baseEmoji;
  return normalized;
}

function openExternalUrl(url: string) {
  void openDriveFile(url);
}

function renderSlackEntity(raw: string, resolveUser: (id: string) => string): ReactNode {
  if (raw.startsWith("@")) {
    const [userId, label] = raw.slice(1).split("|");
    return (
      <span className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 font-bold text-blue-300">
        @{label || resolveUser(userId) || userId}
      </span>
    );
  }

  if (raw.startsWith("#")) {
    const [channelId, label] = raw.slice(1).split("|");
    return (
      <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 font-bold text-gray-200">
        #{label || channelId}
      </span>
    );
  }

  if (raw.startsWith("!")) {
    const [special, label] = raw.slice(1).split("|");
    const normalized = special === "channel" || special === "here" || special === "everyone"
      ? `@${special}`
      : label || `@${special}`;
    return (
      <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 font-bold text-amber-300">
        {normalized}
      </span>
    );
  }

  const [url, label] = raw.split("|");
  if (/^(https?:\/\/|mailto:)/i.test(url)) {
    const display = label || url.replace(/^mailto:/i, "");
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-blue-300 underline decoration-blue-400/40 underline-offset-4 hover:text-blue-200"
        onClick={(e) => {
          e.preventDefault();
          openExternalUrl(url);
        }}
      >
        {display}
      </a>
    );
  }

  return `<${raw}>`;
}

function SlackMessageText({ text, resolveUser }: { text: string; resolveUser: (id: string) => string }) {
  const nodes: ReactNode[] = [];
  const tokenPattern = /(<[^>\n]+>|:[a-zA-Z0-9_\-+]+:)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("<") && token.endsWith(">")) {
      nodes.push(renderSlackEntity(token.slice(1, -1), resolveUser));
    } else if (token.startsWith(":") && token.endsWith(":")) {
      const emojiName = token.slice(1, -1);
      const resolved = resolveEmoji(emojiName);
      nodes.push(resolved !== emojiName ? resolved : token);
    } else {
      nodes.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return (
    <p className="text-[14px] text-gray-100 leading-relaxed whitespace-pre-wrap break-words font-normal">
      {nodes.map((node, index) => (
        <span key={index}>{node}</span>
      ))}
    </p>
  );
}

function FileAttachment({ file }: { file: SlackFile }) {
  const mimetype = file.mimetype || "";
  const isImage = mimetype.startsWith("image/");
  const isPdf = mimetype === "application/pdf";
  const name = file.title || file.name || "Attachment";

  const imageFetchUrl =
    file.thumb1024 ||
    file.thumb960 ||
    file.thumb720 ||
    file.thumb480 ||
    file.thumb360 ||
    file.urlPrivateDownload ||
    file.urlPrivate;

  const fileFetchUrl = file.urlPrivateDownload || file.urlPrivate || imageFetchUrl;
  const Icon = isImage ? Image : FileText;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setImageSrc(null);
    setImageError(null);

    if (!isImage) return;
    if (!imageFetchUrl) {
      setImageError("No Slack image URL returned.");
      return;
    }

    getSlackFileDataUrl(imageFetchUrl)
      .then((dataUrl) => {
        if (alive) setImageSrc(dataUrl);
      })
      .catch((error) => {
        if (alive) {
          console.error("Slack image load error:", error);
          setImageError(String(error));
        }
      });

    return () => {
      alive = false;
    };
  }, [imageFetchUrl, isImage]);

  if (isImage) {
    return (
      <div className="max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition-all hover:border-white/20">
        {imageSrc ? (
          <div className="relative group cursor-zoom-in" onClick={() => setPreviewDataUrl(imageSrc)}>
            <img
              src={imageSrc}
              alt={name}
              className="max-h-[420px] max-w-full object-contain block"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="bg-gray-900/80 backdrop-blur-md rounded-xl p-2 border border-white/10">
                <ExternalLink className="w-5 h-5 text-white" />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-44 w-72 flex-col items-center justify-center gap-3 bg-white/[0.03] p-4 text-center text-gray-500">
            {imageError ? <Image className="h-8 w-8 opacity-40 text-red-400" /> : <Loader2 className="h-6 w-6 animate-spin text-blue-400" />}
            {imageError && (
              <p className="max-w-64 text-[10px] font-black uppercase tracking-widest text-red-300/60 leading-tight break-words">
                {imageError.includes("401") || imageError.includes("403") || imageError.includes("missing_scope")
                  ? "Authentication Required for Asset"
                  : `Packet Transfer Failed: ${imageError}`}
              </p>
            )}
          </div>
        )}
        <div className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2 text-left text-[11px] font-black uppercase tracking-widest text-gray-400">
          <Image className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
          <span className="min-w-0 flex-1 truncate">{name}</span>
        </div>
        {previewDataUrl && <FilePreviewModal name={name} dataUrl={previewDataUrl} onClose={() => setPreviewDataUrl(null)} />}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-all group max-w-xs shadow-lg active:scale-95"
        disabled={!fileFetchUrl || previewLoading}
        onClick={() => {
          if (!fileFetchUrl) return;
          if (isPdf) {
            setPreviewLoading(true);
            getSlackFileDataUrl(fileFetchUrl)
              .then((dataUrl) => setPreviewDataUrl(dataUrl))
              .finally(() => setPreviewLoading(false));
          } else {
             // For other files, opening in browser is safer than iframe data URLs
             if (file.permalink) openExternalUrl(file.permalink);
             else if (fileFetchUrl) openExternalUrl(fileFetchUrl);
          }
        }}
      >
        {previewLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
        ) : (
          <Icon className="w-4 h-4 text-blue-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
        )}
        <div className="flex flex-col items-start min-w-0">
          <span className="text-[12px] font-bold text-gray-100 truncate w-full">{name}</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">
            {isPdf ? "Preview PDF" : "Open in Slack"}
          </span>
        </div>
      </button>
      {previewDataUrl && <FilePreviewModal name={name} dataUrl={previewDataUrl} onClose={() => setPreviewDataUrl(null)} />}
    </>
  );
}

function FilePreviewModal({ name, dataUrl, onClose }: { name: string; dataUrl: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-8" onClick={onClose}>
      <div
        className="flex h-full max-h-[90%] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-gray-900 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 px-8 py-5">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-gray-800 border border-white/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-400" />
             </div>
             <span className="truncate text-[13px] font-black text-white uppercase tracking-widest">{name}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
                type="button"
                onClick={() => {
                  const link = document.createElement("a");
                  link.href = dataUrl;
                  link.download = name;
                  link.click();
                }}
                className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-gray-300 hover:bg-white/10 hover:text-white transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all"
              >
                Close
              </button>
          </div>
        </div>
        <div className="flex-1 bg-white relative">
          <iframe
            src={dataUrl}
            title={name}
            className="h-full w-full border-0 block"
          />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  username,
  resolveUser,
}: {
  msg: SlackMessage;
  username: string;
  resolveUser: (id: string) => string;
}) {
  const displayName = username || msg.username || msg.user || "Unknown";
  const text = msg.text ?? "";

  return (
    <div className="flex items-start gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors group">
      <div
        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-[11px] font-black shadow-lg ring-1 ring-white/5"
        style={{ background: avatarColor(displayName) }}
      >
        {getInitials(displayName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2.5 mb-1.5">
          <span className="text-[13px] font-black text-white tracking-tight">{displayName}</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{formatTs(msg.ts)}</span>
        </div>
        {text && (
          <SlackMessageText text={text} resolveUser={resolveUser} />
        )}
        {msg.files && msg.files.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-3">
            {msg.files.map((f) => (
              <FileAttachment key={f.id} file={f} />
            ))}
          </div>
        )}
        {msg.reactions && msg.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {msg.reactions.map((r) => (
              <span
                key={r.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 border border-white/5 rounded-full text-[12px] font-semibold text-gray-300 hover:border-white/20 transition-all cursor-default select-none shadow-sm"
              >
                <span className="text-sm">{resolveEmoji(r.name)}</span>
                <span className="text-gray-500 text-[10px] font-black">{r.count}</span>
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

  const { data: tokenInfo, isLoading: tokenLoading, refetch: refetchToken } = useQuery<SlackTokenInfo | null>({
    queryKey: ["slack-token"],
    queryFn: slackGetToken,
    staleTime: 30_000,
    retry: false,
  });

  const isConnected = !!tokenInfo;

  const { data: channelData } = useQuery({
    queryKey: ["slack-channels"],
    queryFn: () => listSlackChannels(),
    enabled: isConnected,
    staleTime: 60_000,
  });

  const channels = channelData?.channels ?? [];

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["slack-history", slackChannelId],
    queryFn: () => getSlackHistory(slackChannelId!, undefined, undefined),
    enabled: isConnected && !!slackChannelId,
    staleTime: 10_000,
  });

  const messages = (historyData?.messages ?? []).slice().reverse();

  const messageUserIds = [
    ...new Set([
      ...(messages.map((m) => m.user).filter(Boolean) as string[]),
      ...messages.flatMap((m) => extractMentionUserIds(m.text)),
    ]),
  ];
  const resolveUser = useSlackUsers(messageUserIds, isConnected);

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

  useEffect(() => {
    if (!isConnected || !slackChannelId) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["slack-history", slackChannelId] });
    }, 10_000);
    return () => clearInterval(interval);
  }, [isConnected, slackChannelId, queryClient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
      <div className="flex h-full items-center justify-center bg-gray-950">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <ConnectSlack onConnected={() => void refetchToken()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-950">
      {!slackChannelId ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-10 grayscale bg-gray-950">
          <MessageCircle className="w-24 h-24 mb-8 text-blue-400" />
          <p className="text-xl font-black text-white uppercase tracking-[0.5em]">Select a Channel</p>
        </div>
      ) : (
        <>
          {/* Channel header */}
          <div className="px-8 py-6 border-b border-white/5 flex items-center gap-5 flex-shrink-0 bg-gray-950/50 backdrop-blur-md">
            <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center shadow-2xl border border-white/5 ring-1 ring-white/5">
              {activeChannel?.isIm ? (
                <User className="w-6 h-6 text-blue-400" />
              ) : activeChannel?.isPrivate ? (
                <Lock className="w-6 h-6 text-blue-400" />
              ) : (
                <Hash className="w-6 h-6 text-blue-400" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-black text-white uppercase tracking-tight truncate mb-1">
                {activeChannel?.name ?? slackChannelId}
              </h2>
              {activeChannel?.topic?.value ? (
                <p className="text-[10px] text-gray-500 font-bold truncate max-w-2xl uppercase tracking-widest">
                  {activeChannel.topic.value}
                </p>
              ) : (
                <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Encrypted Stream Active</p>
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-6">
            {historyLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 opacity-20">
                <Sparkles className="w-16 h-16 text-blue-400 mb-6 animate-pulse" />
                <p className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Neural Link Established. Awaiting Input.</p>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.ts}
                    msg={msg}
                    username={msg.user ? resolveUser(msg.user) : (msg.username ?? "Unknown")}
                    resolveUser={resolveUser}
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Message input */}
          <div className="border-t border-white/5 p-6 flex-shrink-0 bg-transparent">
            <div className="flex gap-3 bg-gray-900 p-2 rounded-[24px] border border-white/10 shadow-2xl focus-within:ring-4 focus-within:ring-blue-500/5 transition-all ring-1 ring-white/5">
              <textarea
                rows={1}
                placeholder="Initialize communication... (Cmd+Enter)"
                className="flex-1 resize-none text-[14px] px-4 py-3 outline-none text-white bg-transparent placeholder:text-gray-600 placeholder:font-black placeholder:uppercase placeholder:tracking-widest min-h-[48px] max-h-48 custom-scrollbar"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                onClick={handleSend}
                disabled={!messageInput.trim() || sendMutation.isPending}
                className="w-12 h-12 flex items-center justify-center bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/20 disabled:opacity-50 transition-all active:scale-95 self-end group"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 group-hover:scale-110 transition-transform" />
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getThread, archiveMessage, trashMessage, starMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { useGeminiStore } from "@/store/geminiStore";
import { extractHeader, extractBodyHtml, type GmailMessage } from "@/types";
import { Archive, Trash2, Star, Reply, ReplyAll, Forward, Sparkles, ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import EmailBody from "./EmailBody";

export default function MessageDetail({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const setSelectedThread = useUIStore((s) => s.setSelectedThread);
  const openCompose       = useUIStore((s) => s.openCompose);
  const setGeminiOpen     = useUIStore((s) => s.setGeminiOpen);
  const setGeminiTab      = useUIStore((s) => s.setGeminiTab);
  const { setEmailContext } = useGeminiStore();

  const { data: thread, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getThread(threadId),
  });

  const archiveMutation = useMutation({
    mutationFn: (msgId: string) => archiveMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setSelectedThread(null);
    },
  });

  const trashMutation = useMutation({
    mutationFn: (msgId: string) => trashMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      setSelectedThread(null);
    },
  });

  const firstMsg = thread?.messages?.[0];
  const lastMsg = thread?.messages?.[thread.messages.length - 1];
  const firstMsgId = firstMsg?.id;

  const handleGeminiReply = () => {
    if (thread?.messages) {
      const context = thread.messages
        .map((m) => {
          const from = extractHeader(m, "From");
          const subject = extractHeader(m, "Subject");
          const body = extractBodyHtml(m).slice(0, 1000);
          return `From: ${from}\nSubject: ${subject}\n${body}`;
        })
        .join("\n---\n");
      setEmailContext(context);
    }
    setGeminiTab("reply");
    setGeminiOpen(true);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!thread?.messages?.length) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Could not load thread.
      </div>
    );
  }

  const subject = extractHeader(thread.messages[0], "Subject") || "(no subject)";
  const lastFrom = lastMsg ? extractHeader(lastMsg, "From") : "";
  const lastMsgId = lastMsg?.id ?? "";
  const allRecipients = [
    extractHeader(lastMsg ?? firstMsg!, "From"),
    extractHeader(lastMsg ?? firstMsg!, "To"),
    extractHeader(lastMsg ?? firstMsg!, "Cc"),
  ].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col h-full bg-white" style={{ minWidth: 0, width: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0" style={{ paddingTop: "calc(28px + 8px)" }}>
        <button
          onClick={() => setSelectedThread(null)}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors mr-1"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>

        <div className="flex items-center gap-1.5 flex-1">
          <ActionButton
            icon={Archive}
            label="Archive"
            onClick={() => firstMsgId && archiveMutation.mutate(firstMsgId)}
          />
          <ActionButton
            icon={Trash2}
            label="Delete"
            onClick={() => firstMsgId && trashMutation.mutate(firstMsgId)}
          />
          <ActionButton
            icon={Star}
            label="Star"
            onClick={() => firstMsgId && starMessage(firstMsgId, true)}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => openCompose({
              mode: "reply",
              to: lastFrom,
              subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
              threadId,
            })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Reply className="w-3.5 h-3.5" />
            Reply
          </button>
          <button
            onClick={() => openCompose({
              mode: "reply",
              to: allRecipients,
              subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
              threadId,
            })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ReplyAll className="w-3.5 h-3.5" />
            Reply All
          </button>
          <button
            onClick={() => {
              const bodyHtml = lastMsg ? extractBodyHtml(lastMsg) : "";
              openCompose({
                mode: "forward",
                subject: subject.startsWith("Fwd:") ? subject : `Fwd: ${subject}`,
                body: `<br/><hr/><p>---------- Forwarded message ----------</p>${bodyHtml}`,
              });
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Forward className="w-3.5 h-3.5" />
            Forward
          </button>
          <button
            onClick={handleGeminiReply}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg transition-opacity hover:opacity-90"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Reply
          </button>
        </div>
      </div>

      {/* Subject */}
      <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">{subject}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-6" style={{ minWidth: 0, width: "100%", maxWidth: "100%", contain: "layout" }}>
        {thread.messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: GmailMessage }) {
  const from = extractHeader(msg, "From");
  const date = extractHeader(msg, "Date");
  const bodyHtml = extractBodyHtml(msg);
  const isUnread = msg.labelIds?.includes("UNREAD");

  return (
    <div className={cn("animate-fade-in", isUnread && "ring-1 ring-blue-200 rounded-xl p-4 -mx-2")}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-blue-700">
              {(from[0] ?? "?").toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{from}</p>
            <p className="text-xs text-gray-500">{date}</p>
          </div>
        </div>
        {isUnread && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            New
          </span>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden", contain: "layout" }}>
        <EmailBody
          html={bodyHtml || `<p>${msg.snippet ?? ""}</p>`}
          msg={msg}
          className="email-body"
        />
      </div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

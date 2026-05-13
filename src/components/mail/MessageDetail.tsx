import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getThread, archiveMessage, trashMessage, starMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { useGeminiStore } from "@/store/geminiStore";
import { extractHeader, extractBodyHtml, type GmailMessage } from "@/types";
import { Archive, Trash2, Star, Reply, Forward, Sparkles, ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function MessageDetail({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const { setSelectedThread, openCompose, setGeminiOpen, setGeminiTab } = useUIStore();
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

  const firstMsgId = thread?.messages?.[0]?.id;

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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
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
            onClick={() => openCompose({ mode: "reply", subject: `Re: ${subject}`, threadId })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Reply className="w-3.5 h-3.5" />
            Reply
          </button>
          <button
            onClick={handleGeminiReply}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg transition-opacity hover:opacity-90"
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
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
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

      <div
        className="email-body"
        dangerouslySetInnerHTML={{ __html: bodyHtml || `<p>${msg.snippet ?? ""}</p>` }}
      />
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

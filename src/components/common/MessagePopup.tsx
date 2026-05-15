import { useEffect } from "react";
import { Mail, MessageCircle, Paperclip, X } from "lucide-react";
import type { ChatMessage, EmailView } from "@/types";
import EmailBody from "@/components/mail/EmailBody";

export type MessagePopupContent =
  | { type: "email"; message: EmailView; title?: string }
  | { type: "email-thread"; messages: EmailView[]; title?: string }
  | { type: "chat"; message: ChatMessage; title?: string; subtitle?: string };

export default function MessagePopup({
  content,
  onClose,
}: {
  content: MessagePopupContent;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const title = getPopupTitle(content);
  const subtitle = getPopupSubtitle(content);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border bg-white shadow-2xl"
        style={{ borderColor: "var(--mm-border)" }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--mm-border)" }}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-700">
              {content.type === "chat" ? <MessageCircle className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-black text-gray-900">{title}</h2>
              {subtitle && <p className="truncate text-xs font-medium text-gray-500">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/70 p-6 custom-scrollbar">
          {content.type === "chat" ? (
            <ChatPopupBody message={content.message} />
          ) : content.type === "email" ? (
            <EmailPopupCard message={content.message} />
          ) : (
            <div className="space-y-5">
              {content.messages.map((message) => (
                <EmailPopupCard key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailPopupCard({ message }: { message: EmailView }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-100 bg-white px-6 py-4">
        <h3 className="mb-3 text-xl font-black tracking-tight text-gray-900">{message.subject || "(No Subject)"}</h3>
        <div className="grid gap-1 text-xs text-gray-500 sm:grid-cols-[auto_1fr] sm:gap-x-3">
          <span className="font-black uppercase tracking-widest text-gray-400">From</span>
          <span className="break-words font-semibold text-gray-700">{message.from || "Unknown"}</span>
          <span className="font-black uppercase tracking-widest text-gray-400">To</span>
          <span className="break-words">{message.to || "Me"}</span>
          <span className="font-black uppercase tracking-widest text-gray-400">Date</span>
          <span>{message.date}</span>
        </div>
      </header>

      <div className="px-7 py-6">
        <EmailBody view={message} className="email-body text-[15px] leading-relaxed text-gray-800" />

        {message.attachments.length > 0 && (
          <div className="mt-8 border-t border-gray-100 pt-5">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gray-400">
              <Paperclip className="h-4 w-4" />
              {message.attachments.length} attachment{message.attachments.length === 1 ? "" : "s"}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {message.attachments.map((attachment, index) => (
                <div key={`${attachment.filename}-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="truncate text-sm font-bold text-gray-800">{attachment.filename}</p>
                  <p className="text-[10px] font-black uppercase text-gray-400">{(attachment.size / 1024).toFixed(1)} KB</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function ChatPopupBody({ message }: { message: ChatMessage }) {
  const sender = getUserLabel(message.sender);
  const time = message.createTime ? new Date(message.createTime).toLocaleString() : "";

  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-4 border-b border-gray-100 pb-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-sm font-black uppercase text-blue-600">
          {sender[0] ?? "?"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-black text-gray-900">{sender}</p>
          {time && <p className="text-xs font-medium text-gray-500">{time}</p>}
        </div>
      </div>

      <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-800">
        {message.deleteTime ? "Message deleted" : message.text || "(No text)"}
      </div>

      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-gray-400">
            <Paperclip className="h-4 w-4" />
            Attachments
          </div>
          <div className="space-y-2">
            {message.attachments.map((attachment, index) => (
              <div key={`${attachment.contentName ?? attachment.name}-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="truncate text-sm font-bold text-gray-800">{attachment.contentName ?? attachment.name ?? "Attachment"}</p>
                {attachment.contentType && <p className="text-[10px] font-black uppercase text-gray-400">{attachment.contentType}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function getPopupTitle(content: MessagePopupContent) {
  if (content.title) return content.title;
  if (content.type === "chat") return "Chat Message";
  if (content.type === "email") return content.message.subject || "Email Message";
  return content.messages[0]?.subject || "Email Conversation";
}

function getPopupSubtitle(content: MessagePopupContent) {
  if (content.type === "chat") return content.subtitle;
  if (content.type === "email") return content.message.from;
  const count = content.messages.length;
  return `${count} email${count === 1 ? "" : "s"} in conversation`;
}

function getUserLabel(user?: { displayName?: string; name?: string }) {
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName;
  return user?.name?.split("/").pop() ?? "Unknown";
}

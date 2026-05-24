import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getThreadView, archiveMessage, trashMessage, starMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { useGeminiStore } from "@/store/geminiStore";
import type { EmailView } from "@/types";
import { Archive, Trash2, Star, Reply, Forward, Sparkles, ChevronLeft, Loader2, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import EmailBody from "./EmailBody";
import MessagePopup from "@/components/common/MessagePopup";

export default function MessageDetail({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const setSelectedThread = useUIStore((s) => s.setSelectedThread);
  const openCompose       = useUIStore((s) => s.openCompose);
  const setGeminiOpen     = useUIStore((s) => s.setGeminiOpen);
  const setGeminiTab      = useUIStore((s) => s.setGeminiTab);
  const { setEmailContext } = useGeminiStore();
  const [popupMessage, setPopupMessage] = useState<EmailView | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getThreadView(threadId),
  });

  const archiveMutation = useMutation({
    mutationFn: (msgId: string) => archiveMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
      setSelectedThread(null);
    },
  });

  const trashMutation = useMutation({
    mutationFn: (msgId: string) => trashMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
      setSelectedThread(null);
    },
  });

  const firstMsg = messages?.[0];
  const lastMsg = messages?.[messages.length - 1];

  const handleGeminiReply = () => {
    if (messages) {
      const context = messages
        .map((m) => `From: ${m.from}\nSubject: ${m.subject}\n${m.bodyHtml.slice(0, 1000)}`)
        .join("\n---\n");
      setEmailContext(context);
    }
    setGeminiTab("reply");
    setGeminiOpen(true);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500/50" />
      </div>
    );
  }

  if (!messages?.length || !firstMsg || !lastMsg) return null;

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-hidden relative">
      {/* High-Fidelity Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 h-20 border-b border-white/5 bg-transparent z-10" style={{ paddingTop: "28px" }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedThread(null)}
            className="p-3 bg-gray-900 text-white rounded-2xl shadow-lg border border-white/5 active:scale-90 transition-all group"
          >
            <ChevronLeft className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
          </button>
          
          <div className="flex items-center bg-gray-900/50 p-1 rounded-2xl border border-white/5">
            <ToolbarButton
              icon={Archive}
              onClick={() => archiveMutation.mutate(firstMsg.id)}
              disabled={archiveMutation.isPending}
              title="Archive"
            />
            <ToolbarButton
              icon={Trash2}
              onClick={() => trashMutation.mutate(firstMsg.id)}
              disabled={trashMutation.isPending}
              title="Delete"
              variant="danger"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGeminiReply}
            className="flex items-center gap-2.5 px-6 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/10 transition-all active:scale-95 group"
          >
            <Sparkles className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
            <span>Consult Gemini</span>
          </button>
          
          <button
            onClick={() => openCompose({ mode: "reply", to: lastMsg.from, threadId, subject: `Re: ${firstMsg.subject}` })}
            className="p-3 bg-gray-900 text-white rounded-2xl shadow-lg border border-white/5 active:scale-95 transition-all group"
          >
            <Reply className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </div>

      {/* Conversation Architecture */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-32 pt-10">
        <div className="max-w-4xl mx-auto px-8">
          <div className="mb-12 pl-6 border-l-4 border-blue-500 shadow-[inset:10px_0_15px_-10px_rgba(59,130,246,0.2)]">
            <h1 className="text-[28px] font-black text-white tracking-tight leading-tight uppercase mb-4">
              {firstMsg.subject || "(No Subject)"}
            </h1>
            <div className="flex flex-wrap gap-2">
              {firstMsg.labelIds
                .filter((l: string) => !l.startsWith("Label_") && l !== "INBOX" && l !== "SENT")
                .map((l: string) => (
                  <span key={l} className="px-3 py-1 bg-gray-900 border border-white/5 text-[9px] font-black text-gray-500 rounded-lg uppercase tracking-widest shadow-sm">
                    {l}
                  </span>
                ))}
            </div>
          </div>

          <div className="space-y-6">
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={cn(
                "group bg-gray-900/40 rounded-[32px] border border-white/5 shadow-xl overflow-hidden transition-all duration-500 hover:bg-gray-900 hover:border-white/10",
                idx === messages.length - 1 ? "ring-2 ring-blue-500/20" : ""
              )}>
                <div className="px-8 py-6 flex items-center justify-between border-b border-white/5 bg-transparent">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-gray-900 border border-white/10 flex items-center justify-center text-blue-400 text-lg font-black shadow-2xl group-hover:scale-105 transition-transform">
                      {msg.from.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-black text-white truncate leading-none mb-2 uppercase tracking-tight">{msg.from}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Inbound Route</span>
                        <span className="w-1 h-1 rounded-full bg-gray-700" />
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{msg.date}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => starMessage(msg.id, !msg.labelIds.includes("STARRED"))}
                    className={cn(
                      "p-2.5 rounded-xl transition-all active:scale-90",
                      msg.labelIds.includes("STARRED") 
                        ? "text-amber-400 bg-amber-400/10 shadow-[0_0_15px_rgba(251,191,36,0.2)]" 
                        : "text-gray-600 hover:text-amber-400 hover:bg-amber-400/5"
                    )}
                  >
                    <Star className={cn("w-5 h-5", msg.labelIds.includes("STARRED") && "fill-current")} />
                  </button>
                </div>
                
                <div className="px-10 py-10">
                  <EmailBody view={msg} className="email-body text-[14px] leading-relaxed text-gray-300" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-20 flex items-center justify-center gap-6">
            <button
              onClick={() => openCompose({ mode: "reply", to: lastMsg.from, threadId, subject: `Re: ${firstMsg.subject}` })}
              className="flex items-center gap-3 px-12 py-5 bg-gray-900 text-white rounded-[28px] text-[11px] font-black uppercase tracking-widest shadow-[0_0_40px_rgba(0,0,0,0.4)] border border-white/10 transition-all hover:bg-black hover:shadow-[0_0_30px_rgba(255,255,255,0.05)] active:scale-95"
            >
              <Reply className="w-5 h-5 text-blue-400" />
              <span>Initiate Response</span>
            </button>
            <button
              onClick={() => openCompose({ mode: "forward", threadId, subject: `Fwd: ${firstMsg.subject}` })}
              className="flex items-center gap-3 px-12 py-5 bg-transparent text-gray-500 border border-white/10 rounded-[28px] text-[11px] font-black uppercase tracking-widest transition-all hover:bg-gray-900 hover:text-white active:scale-95"
            >
              <Forward className="w-5 h-5" />
              <span>Reroute Packet</span>
            </button>
          </div>
        </div>
      </div>

      {popupMessage && (
        <MessagePopup
          content={{ type: "email", message: popupMessage, title: popupMessage.subject || "Email Message" }}
          onClose={() => setPopupMessage(null)}
        />
      )}
    </div>
  );
}

function ToolbarButton({ 
  icon: Icon, 
  onClick, 
  disabled, 
  title, 
  variant = "default" 
}: { 
  icon: any; 
  onClick: () => void; 
  disabled?: boolean; 
  title: string;
  variant?: "default" | "danger" 
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-3 rounded-xl transition-all active:scale-90 disabled:opacity-30",
        variant === "danger" 
          ? "text-gray-600 hover:text-red-500 hover:bg-red-500/10" 
          : "text-gray-500 hover:text-blue-400 hover:bg-white/5"
      )}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

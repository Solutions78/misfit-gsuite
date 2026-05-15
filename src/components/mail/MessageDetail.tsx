import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getThreadView, archiveMessage, trashMessage, starMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { useGeminiStore } from "@/store/geminiStore";
import type { EmailView } from "@/types";
import { Archive, Trash2, Star, Reply, ReplyAll, Forward, Sparkles, ChevronLeft, Loader2, MoreVertical, Paperclip } from "lucide-react";
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
      <div className="h-full flex items-center justify-center bg-gray-50/20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 opacity-50" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Loading Conversation</span>
        </div>
      </div>
    );
  }

  if (!messages?.length || !firstMsg || !lastMsg) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 bg-gray-50/20">
        <Archive className="w-8 h-8 opacity-20" />
        <p className="text-sm font-medium">Thread not found or unavailable.</p>
        <button 
          onClick={() => setSelectedThread(null)}
          className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 shadow-sm hover:bg-gray-50"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Professional Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 h-16 border-b border-gray-100 bg-white/80 backdrop-blur-md z-10" style={{ paddingTop: "28px" }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedThread(null)}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-all active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="h-6 w-px bg-gray-100 mx-1" />
          
          <div className="flex items-center gap-1">
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

        <div className="flex items-center gap-2">
          <button
            onClick={handleGeminiReply}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider shadow-lg shadow-blue-500/20 transition-all active:scale-95 group"
          >
            <Sparkles className="w-3.5 h-3.5 group-hover:animate-pulse" />
            <span>AI Assist</span>
          </button>
          
          <div className="h-6 w-px bg-gray-100 mx-2" />
          
          <ToolbarButton
            icon={Reply}
            onClick={() => openCompose({ mode: "reply", to: lastMsg.from, threadId, subject: `Re: ${firstMsg.subject}` })}
            title="Reply"
          />
        </div>
      </div>

      {/* Main Conversation Area */}
      <div className="flex-1 overflow-y-auto bg-gray-50/40 custom-scrollbar pb-20">
        <div className="max-w-5xl mx-auto px-6 py-10">
          {/* Conversation Header */}
          <div className="mb-10 pl-2 border-l-4 border-blue-600">
            <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-tight">
              {firstMsg.subject || "(No Subject)"}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2">
              {firstMsg.labelIds
                .filter((l: string) => !l.startsWith("Label_") && l !== "INBOX" && l !== "SENT")
                .map((l: string) => (
                  <span key={l} className="px-2.5 py-1 bg-white border border-gray-200 text-[10px] font-black text-gray-500 rounded-lg uppercase tracking-widest shadow-sm">
                    {l}
                  </span>
                ))}
            </div>
          </div>

          {/* Messages Stack */}
          <div className="space-y-8">
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                onDoubleClick={() => setPopupMessage(msg)}
                title="Double-click to open in a popup"
                className={cn(
                "group bg-white rounded-[24px] border border-gray-100 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-gray-200",
                idx === messages.length - 1 ? "ring-4 ring-blue-500/5 border-blue-100/50" : ""
              )}>
                {/* Message Header */}
                <div className="px-8 py-5 flex items-center justify-between border-b border-gray-50 bg-gray-50/20">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-blue-600 text-lg font-black shadow-sm group-hover:scale-105 transition-transform">
                      {msg.from.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[15px] font-black text-gray-900 truncate leading-none mb-1.5">{msg.from}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">To Me</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{msg.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onDoubleClick={(event) => event.stopPropagation()}>
                    <button
                      onClick={() => starMessage(msg.id, !msg.labelIds.includes("STARRED"))}
                      className={cn(
                        "p-2.5 rounded-xl transition-all active:scale-90",
                        msg.labelIds.includes("STARRED") 
                          ? "text-amber-400 bg-amber-50" 
                          : "text-gray-300 hover:text-amber-400 hover:bg-amber-50"
                      )}
                    >
                      <Star className={cn("w-5 h-5", msg.labelIds.includes("STARRED") && "fill-current")} />
                    </button>
                    <button className="p-2.5 rounded-xl text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all">
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                {/* Email Content */}
                <div className="px-10 py-8">
                  <EmailBody view={msg} className="email-body text-[15px] leading-relaxed text-gray-700" />
                  
                  {/* Attachments Section */}
                  {msg.attachments.length > 0 && (
                    <div className="mt-10 pt-8 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-4">
                        <Paperclip className="w-4 h-4 text-gray-400" />
                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                          {msg.attachments.length} ATTACHMENT{msg.attachments.length > 1 ? "S" : ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {msg.attachments.map((att: import("@/types").EmailAttachment, i: number) => (
                          <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 hover:bg-blue-50/50 border border-gray-100 rounded-2xl transition-all cursor-pointer group/att hover:border-blue-200">
                            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm text-blue-600 group-hover/att:scale-110 transition-transform border border-gray-100">
                              <Archive className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-bold text-gray-800 truncate">{att.filename}</p>
                              <p className="text-[10px] text-gray-400 font-black uppercase">{(att.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Large Action Center */}
          <div className="mt-16 flex items-center justify-center gap-4">
            <button
              onClick={() => openCompose({ mode: "reply", to: lastMsg.from, threadId, subject: `Re: ${firstMsg.subject}` })}
              className="flex items-center gap-3 px-10 py-4 bg-gray-900 text-white rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-2xl shadow-gray-400 transition-all hover:bg-black hover:-translate-y-0.5 active:scale-95"
            >
              <Reply className="w-5 h-5" />
              <span>Reply to conversation</span>
            </button>
            <button
              onClick={() => openCompose({ mode: "forward", threadId, subject: `Fwd: ${firstMsg.subject}` })}
              className="flex items-center gap-3 px-10 py-4 bg-white text-gray-900 border border-gray-200 rounded-2xl text-[13px] font-black uppercase tracking-widest shadow-sm transition-all hover:bg-gray-50 hover:border-gray-300 active:scale-95"
            >
              <Forward className="w-5 h-5" />
              <span>Forward</span>
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
        "p-2.5 rounded-xl transition-all active:scale-90 disabled:opacity-30",
        variant === "danger" 
          ? "text-gray-400 hover:text-red-600 hover:bg-red-50" 
          : "text-gray-500 hover:text-blue-600 hover:bg-white"
      )}
    >
      <Icon className="w-5 h-5" />
    </button>
  );
}

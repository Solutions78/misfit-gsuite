import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Sparkles, Send, Loader2, RefreshCw, Inbox, FileText, Table2, Layers, ExternalLink, FolderOpen, File } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { useGeminiStore } from "@/store/geminiStore";
import { geminiChat, generateEmailReply, organizeInbox, generateDailyReport, geminiDriveChat, openDriveFile } from "@/lib/tauri";
import type { GeminiDriveResponse } from "@/lib/tauri";
import { getGeminiContext, getDriveContext } from "@/lib/geminiContextBridge";
import { getSelectedGeminiModel } from "@/lib/appSettings";
import { cn } from "@/lib/utils";
import type { GeminiMessage } from "@/types";

interface Props {
  isIntegrated?: boolean;
}

export default function GeminiDrawer({ isIntegrated }: Props) {
  const setGeminiOpen    = useUIStore((s) => s.setGeminiOpen);
  const geminiTab        = useUIStore((s) => s.geminiTab);
  const setGeminiTab     = useUIStore((s) => s.setGeminiTab);
  const chatPanelOpen    = useUIStore((s) => s.chatPanelOpen);
  const selectedThreadId = useUIStore((s) => s.selectedThreadId);
  const activeView       = useUIStore((s) => s.activeView);
  
  const { chatHistory, addMessage, setLoading, isLoading, selectedEmailContext, setLastResponse } = useGeminiStore();
  const [input, setInput] = useState("");
  const [driveFileResults, setDriveFileResults] = useState<GeminiDriveResponse["fileResults"]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory.length]);

  const handleChatSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: GeminiMessage = { role: "user", text: input.trim() };
    addMessage(userMsg);
    setInput("");
    setLoading(true);
    setDriveFileResults([]);
    try {
      const isDriveView = ["drive", "docs", "sheets", "slides"].includes(activeView);

      if (isDriveView) {
        // Use Drive-aware tool-calling path
        const driveCtx = getDriveContext();
        const viewContext = {
          activeView,
          openDocId: driveCtx?.openDocId ?? null,
          openDocMimeType: driveCtx?.openDocMimeType ?? null,
          currentFolderId: driveCtx?.currentFolderId,
          driveId: driveCtx?.driveId,
        };
        const response = await geminiDriveChat(
          [...chatHistory, userMsg],
          viewContext,
          getSelectedGeminiModel(),
        );
        addMessage({ role: "model", text: response.text });
        if (response.fileResults.length > 0) {
          setDriveFileResults(response.fileResults);
        }
      } else {
        // Legacy path for mail/calendar/slack/fireflies
        const externalCtx = (activeView === "slack" || activeView === "fireflies")
          ? getGeminiContext()
          : undefined;
        const context = externalCtx ?? selectedEmailContext ?? undefined;
        const response = await geminiChat({
          messages: [...chatHistory, userMsg],
          context,
          model: getSelectedGeminiModel(),
        });
        addMessage({ role: "model", text: response });
      }
    } catch (e) {
      addMessage({ role: "model", text: `Error: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReply = async () => {
    if (!selectedThreadId || isLoading) return;
    setLoading(true);
    try {
      const reply = await generateEmailReply(selectedThreadId, undefined, getSelectedGeminiModel());
      setLastResponse(reply);
      addMessage({ role: "model", text: `Draft reply generated:\n\n${reply}` });
    } catch (e) {
      addMessage({ role: "model", text: `Error: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleOrganize = async () => {
    if (isLoading) return;
    setLoading(true);
    try {
      const result = await organizeInbox(getSelectedGeminiModel());
      addMessage({ role: "model", text: result });
    } catch (e) {
      addMessage({ role: "model", text: `Error: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDailyReport = async () => {
    if (isLoading) return;
    setLoading(true);
    try {
      const result = await generateDailyReport(getSelectedGeminiModel());
      addMessage({ role: "model", text: result });
    } catch (e) {
      addMessage({ role: "model", text: `Error: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  const isMailView = activeView === "mail";

  const content = (
    <div className={cn(
        "flex flex-col h-full bg-gray-50 overflow-hidden",
        !isIntegrated && "rounded-2xl border border-white/5 shadow-2xl"
    )}>
      {/* Header */}
      <div className={cn(
          "flex items-center gap-2 px-4 py-4 bg-gray-900 flex-shrink-0 border-b border-white/5",
          isIntegrated ? "h-16" : ""
      )}>
        <div className="w-8 h-8 rounded-xl bg-gray-900 border border-white/10 flex items-center justify-center shadow-lg">
            <Sparkles className="w-4.5 h-4.5 text-blue-400" />
        </div>
        <div className="flex-1">
            <span className="text-[11px] font-black text-white uppercase tracking-widest block leading-tight">Gemini AI</span>
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-tighter block">Expert Assistant</span>
        </div>
        {["drive","docs","sheets","slides"].includes(activeView) && (
          <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest px-2 py-0.5 bg-blue-500/10 rounded-full border border-blue-500/20">
            Drive Connected
          </span>
        )}
        {!isIntegrated && (
          <button
            onClick={() => setGeminiOpen(false)}
            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      {isMailView && (
        <div className="flex border-b border-white/5 bg-gray-900/20 flex-shrink-0 p-1 gap-1">
            {(["chat", "reply", "organize"] as const).map((tab) => (
            <button
                key={tab}
                onClick={() => setGeminiTab(tab)}
                className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg",
                geminiTab === tab
                    ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/10"
                    : "text-gray-500 hover:text-gray-300"
                )}
            >
                {tab}
            </button>
            ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 bg-transparent shadow-inner">
          {geminiTab === "chat" && (
            <>
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 custom-scrollbar">
                {chatHistory.length === 0 && (
                <div className="text-center py-12">
                    <Sparkles className="w-12 h-12 mx-auto text-gray-900 mb-4 animate-pulse" />
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-6">Expert intelligence at your fingertips.</p>
                    <div className="mt-6 space-y-2 px-4">
                    {SUGGESTIONS.map((s) => (
                        <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="w-full text-left text-[10px] font-bold uppercase tracking-tight px-4 py-3 bg-gray-900/40 hover:bg-gray-900 hover:text-white rounded-xl text-gray-500 transition-all border border-white/5 shadow-sm"
                        >
                        {s}
                        </button>
                    ))}
                    </div>
                </div>
                )}
                {chatHistory.map((msg, i) => (
                <GeminiMessageBubble key={i} msg={msg} />
                ))}
                {isLoading && (
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-900/40 rounded-2xl animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Processing Intelligence...</span>
                </div>
                )}
                <div ref={messagesEndRef} />
                {driveFileResults.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] px-1">Files Found</p>
                    {driveFileResults.map((f) => (
                      <DriveFileChip key={f.id} file={f} />
                    ))}
                  </div>
                )}
            </div>

            <div className="border-t border-white/5 p-4 bg-transparent flex-shrink-0">
                <div className="flex gap-2 bg-gray-900 p-1.5 rounded-2xl border border-white/10 shadow-2xl focus-within:ring-4 focus-within:ring-blue-500/5 transition-all">
                    <input
                        className="flex-1 text-xs font-bold px-3 py-2 outline-none text-white bg-transparent placeholder:text-gray-700 placeholder:font-black placeholder:uppercase placeholder:tracking-widest"
                        placeholder="Consult Gemini..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                    />
                    <button
                        onClick={handleChatSend}
                        disabled={!input.trim() || isLoading}
                        className="p-3 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-500/20 disabled:opacity-50 transition-all active:scale-95"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
            </>
          )}

          {geminiTab === "reply" && (
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 custom-scrollbar">
                <div className="bg-gray-900 rounded-[24px] p-5 shadow-xl border border-white/10">
                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1.5">Context: Selected Thread</p>
                    <p className="text-[11px] font-bold text-white tracking-tight leading-relaxed">
                    {selectedThreadId ? `Synthesizing intelligence for thread ${selectedThreadId.slice(0, 12)}...` : "Select an email thread to generate intelligence-driven replies."}
                    </p>
                </div>

                <button
                    onClick={handleGenerateReply}
                    disabled={!selectedThreadId || isLoading}
                    className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-gray-900 text-white rounded-[24px] text-[11px] font-black uppercase tracking-widest shadow-2xl shadow-black/20 border border-white/5 transition-all active:scale-95 group disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" /> : <Sparkles className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />}
                    Generate Expert Draft
                </button>

                <div className="space-y-4">
                    {chatHistory.filter((m) => m.role === "model").map((msg, i) => (
                    <div key={i} className="bg-gray-900/40 border border-white/5 rounded-[28px] p-5 text-[11px] font-medium text-gray-300 whitespace-pre-wrap leading-relaxed shadow-sm">
                        {msg.text}
                    </div>
                    ))}
                </div>
            </div>
          )}
      </div>
    </div>
  );

  if (isIntegrated) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="fixed z-40"
      style={{
        bottom: "88px",
        right: chatPanelOpen ? "calc(280px + 24px)" : "24px",
        width: "400px",
        height: "600px",
      }}
    >
      {content}
    </motion.div>
  );
}

function GeminiMessageBubble({ msg }: { msg: GeminiMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex w-full", isUser ? "justify-end pl-12" : "justify-start pr-12")}>
      <div
        className={cn(
          "px-4 py-3 rounded-[24px] text-[11px] font-medium leading-relaxed whitespace-pre-wrap shadow-xl border",
          isUser
            ? "bg-gray-900 text-white rounded-br-sm border-white/10"
            : "bg-gray-900/40 text-gray-300 rounded-tl-sm border-white/5"
        )}
      >
        {msg.text}
      </div>
    </div>
  );
}

function DriveFileChip({ file }: { file: { id: string; name: string; mimeType: string; webViewLink?: string; snippet?: string } }) {
  const icon = getFileIcon(file.mimeType);
  const handleClick = async () => {
    if (file.webViewLink) {
      await openDriveFile(file.webViewLink);
    }
  };
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 bg-gray-900 border border-white/10 rounded-2xl hover:border-blue-500/40 hover:shadow-[0_0_12px_rgba(59,130,246,0.15)] transition-all group w-full text-left"
    >
      <div className="flex-shrink-0 w-7 h-7 rounded-xl bg-gray-800 border border-white/5 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">{file.name}</p>
        {file.snippet && (
          <p className="text-[9px] text-gray-500 truncate mt-0.5">{file.snippet}</p>
        )}
      </div>
      <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
    </button>
  );
}

function getFileIcon(mimeType: string) {
  if (mimeType.includes("document")) return <FileText className="w-3.5 h-3.5 text-blue-400" />;
  if (mimeType.includes("spreadsheet")) return <Table2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (mimeType.includes("presentation")) return <Layers className="w-3.5 h-3.5 text-orange-400" />;
  if (mimeType.includes("folder")) return <FolderOpen className="w-3.5 h-3.5 text-yellow-400" />;
  return <File className="w-3.5 h-3.5 text-gray-400" />;
}

const SUGGESTIONS = [
  "Summarize operational traffic from today",
  "Which threads require immediate attention?",
  "Synthesize a mission report for this week",
  "Audit my shared resources for security risks",
];

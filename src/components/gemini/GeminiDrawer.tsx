import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { X, Sparkles, Send, Loader2, RefreshCw, Inbox } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { useGeminiStore } from "@/store/geminiStore";
import { geminiChat, generateEmailReply, organizeInbox, generateDailyReport } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { GeminiMessage } from "@/types";

export default function GeminiDrawer() {
  const { setGeminiOpen, geminiTab, setGeminiTab, chatPanelOpen, selectedThreadId } = useUIStore();
  const { chatHistory, addMessage, setLoading, isLoading, selectedEmailContext, setLastResponse } = useGeminiStore();
  const [input, setInput] = useState("");
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
    try {
      const response = await geminiChat({
        messages: [...chatHistory, userMsg],
        context: selectedEmailContext ?? undefined,
      });
      addMessage({ role: "model", text: response });
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
      const reply = await generateEmailReply(selectedThreadId);
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
      const result = await organizeInbox();
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
      const result = await generateDailyReport();
      addMessage({ role: "model", text: result });
    } catch (e) {
      addMessage({ role: "model", text: `Error: ${String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="fixed z-40 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
      style={{
        bottom: "88px",
        right: chatPanelOpen ? "calc(280px + 24px)" : "24px",
        width: "380px",
        height: "500px",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 flex-shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
        <span className="text-sm font-semibold text-white flex-1">Gemini AI Assistant</span>
        <button
          onClick={() => setGeminiOpen(false)}
          className="p-1 hover:bg-white/20 rounded transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {(["chat", "reply", "organize"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setGeminiTab(tab)}
            className={cn(
              "flex-1 py-2 text-xs font-medium capitalize transition-colors",
              geminiTab === tab
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {geminiTab === "chat" && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chatHistory.length === 0 && (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">Ask me anything about your emails, calendar, or tasks.</p>
                <div className="mt-3 space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="w-full text-left text-xs px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
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
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-100 p-3 flex gap-2 flex-shrink-0">
            <input
              className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 bg-gray-50"
              placeholder="Ask Gemini..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleChatSend()}
            />
            <button
              onClick={handleChatSend}
              disabled={!input.trim() || isLoading}
              className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white rounded-xl transition-opacity"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {geminiTab === "reply" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="bg-blue-50 rounded-xl p-3">
            <p className="text-xs font-medium text-blue-700 mb-1">Selected email</p>
            <p className="text-xs text-blue-600">
              {selectedThreadId ? `Thread: ${selectedThreadId}` : "No email selected. Click an email first."}
            </p>
          </div>

          <button
            onClick={handleGenerateReply}
            disabled={!selectedThreadId || isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-opacity"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Reply Draft
          </button>

          <div className="flex-1 overflow-y-auto space-y-3">
            {chatHistory.filter((m) => m.role === "model").map((msg, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                {msg.text}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 text-center">
            Generated drafts are inserted into Compose automatically.
          </p>
        </div>
      )}

      {geminiTab === "organize" && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <ActionCard
              icon={Inbox}
              title="Organize Inbox"
              description="Categorize emails by priority"
              onClick={handleOrganize}
              loading={isLoading}
            />
            <ActionCard
              icon={RefreshCw}
              title="Daily Report"
              description="Summarize today's activity"
              onClick={handleDailyReport}
              loading={isLoading}
            />
          </div>

          <div className="flex-1 space-y-3">
            {chatHistory.filter((m) => m.role === "model").map((msg, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                {msg.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function GeminiMessageBubble({ msg }: { msg: GeminiMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap",
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        )}
      >
        {msg.text}
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  loading,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex flex-col items-start gap-1.5 p-3 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 rounded-xl transition-colors text-left"
    >
      <Icon className="w-5 h-5 text-blue-600" />
      <span className="text-xs font-semibold text-gray-800">{title}</span>
      <span className="text-xs text-gray-500 leading-tight">{description}</span>
    </button>
  );
}

const SUGGESTIONS = [
  "Summarize my inbox from today",
  "What emails need my urgent attention?",
  "Create a meeting with my team tomorrow at 2pm",
  "Draft a follow-up email for my last sent message",
];

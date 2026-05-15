import { useRef, useState } from "react";
import { useDocStore } from "@/store/docStore";
import { geminiChatWithSearch } from "@/lib/tauri";
import type { GeminiMessage } from "@/types";
import { Globe, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function GeminiDocsPanel(): React.JSX.Element {
  const activeDoc = useDocStore((s) => s.activeDoc);
  const activeSelection = useDocStore((s) => s.activeSelection);

  const [messages, setMessages] = useState<GeminiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const context: string | undefined = activeSelection
    ? `Document selection: "${activeSelection}"`
    : activeDoc
    ? `Document title: "${activeDoc.title}". Working in Google Docs.`
    : undefined;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: GeminiMessage = { role: "user", text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    setTimeout(scrollToBottom, 50);

    try {
      const reply = await geminiChatWithSearch(next, context, webSearch);
      const modelMsg: GeminiMessage = { role: "model", text: reply ?? "" };
      setMessages((prev) => [...prev, modelMsg]);
      setTimeout(scrollToBottom, 50);
    } catch (err) {
      const errMsg: GeminiMessage = {
        role: "model",
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInsert = (text: string) => {
    window.dispatchEvent(new CustomEvent("gemini:insert", { detail: { text } }));
  };

  const contextPreview = activeSelection
    ? activeSelection.slice(0, 120) + (activeSelection.length > 120 ? "…" : "")
    : null;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-gray-200/60 bg-gray-100">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">
            Gemini
          </span>
        </div>

        {/* Web search toggle */}
        <button
          onClick={() => setWebSearch((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all duration-200 border",
            webSearch
              ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border-white/5"
              : "bg-gray-200/60 text-gray-400 border-transparent hover:bg-gray-200 hover:text-gray-700"
          )}
          title={webSearch ? "Web search on" : "Web search off"}
        >
          <Globe
            className={cn(
              "w-3.5 h-3.5 transition-colors",
              webSearch ? "text-blue-400" : "text-gray-400"
            )}
          />
          <span>{webSearch ? "WEB ON" : "WEB OFF"}</span>
        </button>
      </div>

      {/* ── Context bar ── */}
      <div className="flex-shrink-0 border-b border-gray-200/60 bg-gray-100/80">
        <button
          onClick={() => setContextOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-200/50 transition-colors"
        >
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
            Selected Text
          </span>
          <div
            className={cn(
              "ml-auto w-3 h-3 border-t border-r border-gray-400 transition-transform duration-200",
              contextOpen ? "rotate-[-45deg]" : "rotate-[135deg]"
            )}
          />
        </button>
        {contextOpen && (
          <div className="px-4 pb-3">
            {contextPreview ? (
              <p className="text-[10px] text-gray-500 leading-relaxed font-mono break-words">
                "{contextPreview}"
              </p>
            ) : (
              <p className="text-[10px] text-gray-400 italic">
                NO SELECTION — full doc context
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Message list ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
            <Sparkles className="w-8 h-8 text-blue-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              Ask Gemini anything
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col gap-1",
              msg.role === "user" ? "items-end" : "items-start"
            )}
          >
            {/* Role label */}
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 px-1">
              {msg.role === "user" ? "You" : "Gemini"}
            </span>

            {/* Bubble */}
            <div
              className={cn(
                "max-w-[88%] px-3 py-2 text-[11px] leading-relaxed break-words",
                msg.role === "user"
                  ? "bg-gray-900 text-white rounded-[28px] rounded-tr-md shadow-[0_0_20px_rgba(255,255,255,0.06)] border border-white/5"
                  : "bg-gray-100 text-gray-800 rounded-[28px] rounded-tl-md border border-gray-200/80"
              )}
            >
              {msg.text}
            </div>

            {/* Insert button for model messages */}
            {msg.role === "model" && (
              <button
                onClick={() => handleInsert(msg.text)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest rounded-2xl bg-gray-200/60 text-gray-500 hover:bg-gray-900 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-200 active:scale-95 border border-transparent hover:border-white/5"
              >
                INSERT AT CURSOR
              </button>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-[28px] rounded-tl-md border border-gray-200/80">
              <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
              <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                Thinking
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ── */}
      <div className="flex-shrink-0 border-t border-gray-200/60 p-3 bg-gray-100/80">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Gemini…"
            rows={2}
            className="flex-1 resize-none bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2 text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-blue-400/60 focus:shadow-[0_0_0_2px_rgba(96,165,250,0.12)] transition-all leading-relaxed custom-scrollbar"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className={cn(
              "flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-2xl transition-all duration-200 active:scale-95",
              input.trim() && !loading
                ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5 hover:shadow-[0_0_30px_rgba(255,255,255,0.15)]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            )}
            title="Send"
          >
            <Send className={cn("w-3.5 h-3.5", input.trim() && !loading ? "text-blue-400" : "text-gray-400")} />
          </button>
        </div>
        <p className="mt-1.5 text-[8px] text-gray-400 font-black uppercase tracking-widest text-right">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

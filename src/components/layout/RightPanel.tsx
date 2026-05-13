import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { listSpaces, listChatMessages, sendChatMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { X, Send, Hash, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Space, ChatMessage } from "@/types";

const POLL_INTERVAL = 10_000; // 10 seconds

export default function RightPanel() {
  const { toggleChatPanel } = useUIStore();
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: spaces } = useQuery({
    queryKey: ["spaces"],
    queryFn: listSpaces,
    staleTime: 60_000,
  });

  const { data: messageData, refetch: refetchMessages } = useQuery({
    queryKey: ["chat-messages", selectedSpace?.name],
    queryFn: () => listChatMessages(selectedSpace!.name, undefined, 50),
    enabled: !!selectedSpace,
    refetchInterval: POLL_INTERVAL,
  });

  const messages = messageData?.messages
    ? [...messageData.messages].reverse()
    : [];

  const sendMutation = useMutation({
    mutationFn: ({ space, text }: { space: string; text: string }) =>
      sendChatMessage(space, text),
    onSuccess: () => {
      setMessageText("");
      refetchMessages();
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!selectedSpace || !messageText.trim()) return;
    sendMutation.mutate({ space: selectedSpace.name, text: messageText.trim() });
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200" style={{ paddingTop: "28px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">Chat</span>
        </div>
        <button
          onClick={toggleChatPanel}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Space list */}
        <div className="w-24 flex-shrink-0 border-r border-gray-100 overflow-y-auto py-2">
          {spaces?.map((space) => (
            <button
              key={space.name}
              onClick={() => setSelectedSpace(space)}
              className={cn(
                "w-full px-2 py-2 text-left transition-colors",
                selectedSpace?.name === space.name
                  ? "bg-blue-50"
                  : "hover:bg-gray-50"
              )}
              title={space.displayName}
            >
              <div className="w-8 h-8 mx-auto rounded-lg bg-blue-100 flex items-center justify-center mb-1">
                <Hash className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs text-center text-gray-600 truncate leading-tight">
                {space.displayName ?? space.name.split("/").pop()}
              </p>
            </button>
          ))}
        </div>

        {/* Message thread */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedSpace ? (
            <>
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-700 truncate">
                  {selectedSpace.displayName}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {messages.map((msg: ChatMessage) => (
                  <ChatBubble key={msg.name} msg={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-100 p-2 flex gap-1.5">
                <input
                  className="flex-1 text-xs px-2.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-gray-50"
                  placeholder="Message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sendMutation.isPending}
                  className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-gray-400 text-center px-4">
                Select a space to start chatting
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-start gap-1.5">
        <div className="w-5 h-5 rounded-full bg-blue-200 flex-shrink-0 flex items-center justify-center">
          <span className="text-xs font-bold text-blue-700">
            {(msg.sender?.displayName ?? "?")[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 mb-0.5">
            <span className="text-xs font-semibold text-gray-800">
              {msg.sender?.displayName ?? "Unknown"}
            </span>
            {msg.createTime && (
              <span className="text-xs text-gray-400">
                {new Date(msg.createTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-700 break-words leading-relaxed">
            {msg.text ?? msg.formattedText}
          </p>
        </div>
      </div>
    </div>
  );
}

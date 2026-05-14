import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listSpaces, listChatMessages, sendChatMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { X, Send, Hash, MessageCircle, Users, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Space, ChatMessage } from "@/types";

const POLL_INTERVAL = 10_000;

export default function RightPanel() {
  const toggleChatPanel = useUIStore((s) => s.toggleChatPanel);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [messageText, setMessageText] = useState("");
  const [view, setView] = useState<"list" | "thread">("list");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: spaces, isLoading: spacesLoading } = useQuery({
    queryKey: ["spaces"],
    queryFn: listSpaces,
    staleTime: 60_000,
  });

  const { data: messageData } = useQuery({
    queryKey: ["chat-messages", selectedSpace?.name],
    queryFn: () => listChatMessages(selectedSpace!.name, undefined, 50),
    enabled: !!selectedSpace && view === "thread",
    refetchInterval: POLL_INTERVAL,
  });

  const messages = messageData?.messages ?? [];

  const sendMutation = useMutation({
    mutationFn: ({ space, text }: { space: string; text: string }) =>
      sendChatMessage(space, text),
    onSuccess: () => {
      setMessageText("");
      qc.invalidateQueries({ queryKey: ["chat-messages", selectedSpace?.name] });
    },
  });

  useEffect(() => {
    if (view === "thread") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages.length, view]);

  const openSpace = (space: Space) => {
    setSelectedSpace(space);
    setView("thread");
  };

  const handleSend = () => {
    if (!selectedSpace || !messageText.trim()) return;
    sendMutation.mutate({ space: selectedSpace.name, text: messageText.trim() });
  };

  const namedSpaces = spaces?.filter((s) => s.spaceType === "SPACE") ?? [];
  const groupChats = spaces?.filter((s) => s.spaceType === "GROUP_CHAT") ?? [];
  const dms = spaces?.filter((s) => s.spaceType === "DIRECT_MESSAGE") ?? [];

  return (
    <div
      className="flex flex-col bg-white border-l border-gray-200 overflow-hidden"
      style={{ width: "100%", height: "100%", paddingTop: "28px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {view === "thread" && (
            <button
              onClick={() => setView("list")}
              className="p-1 rounded hover:bg-gray-100 transition-colors mr-0.5 flex-shrink-0"
              title="Back to spaces"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
          )}
          <MessageCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-800 truncate">
            {view === "thread" && selectedSpace
              ? (selectedSpace.displayName ?? selectedSpace.name.split("/").pop())
              : "Chat"}
          </span>
        </div>
        <button
          onClick={toggleChatPanel}
          className="p-1 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
          title="Close chat"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Space list view */}
      {view === "list" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {spacesLoading ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Named Spaces */}
              {namedSpaces.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                    <Hash className="w-3 h-3 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Spaces</span>
                  </div>
                  {namedSpaces.map((space) => (
                    <SpaceRow key={space.name} space={space} onSelect={openSpace} />
                  ))}
                </div>
              )}

              {/* Group Chats */}
              {groupChats.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                    <Users className="w-3 h-3 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Group Chats</span>
                  </div>
                  {groupChats.map((space) => (
                    <SpaceRow key={space.name} space={space} onSelect={openSpace} isGroup />
                  ))}
                </div>
              )}

              {/* Direct Messages */}
              {dms.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-3 pt-3 pb-1">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-gray-400" />
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Direct Messages</span>
                    </div>
                  </div>
                  {dms.map((space) => (
                    <SpaceRow key={space.name} space={space} onSelect={openSpace} isDm />
                  ))}
                </div>
              )}

              {spaces?.length === 0 && (
                <div className="px-4 py-8 text-center">
                  <MessageCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No Chat spaces found.</p>
                  <p className="text-xs text-gray-400 mt-1">Open Google Chat to create spaces.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Thread view */}
      {view === "thread" && selectedSpace && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center pt-6">No messages yet.</p>
            ) : (
              messages.map((msg: ChatMessage) => (
                <ChatBubble key={msg.name} msg={msg} />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-100 p-2 flex gap-1.5 flex-shrink-0">
            <input
              ref={inputRef}
              className="flex-1 text-xs px-2.5 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 bg-gray-50 min-w-0"
              placeholder={`Message ${selectedSpace.displayName ?? ""}...`}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors flex-shrink-0"
              title="Send"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SpaceRow({
  space, onSelect, isDm, isGroup,
}: {
  space: Space; onSelect: (s: Space) => void; isDm?: boolean; isGroup?: boolean;
}) {
  const label = space.displayName ?? space.name.split("/").pop() ?? "Unknown";
  return (
    <button
      onClick={() => onSelect(space)}
      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
    >
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
        isDm ? "bg-green-100" : isGroup ? "bg-purple-100" : "bg-blue-100"
      )}>
        {isDm
          ? <Users className="w-3.5 h-3.5 text-green-600" />
          : isGroup
          ? <Users className="w-3.5 h-3.5 text-purple-600" />
          : <Hash className="w-3.5 h-3.5 text-blue-600" />
        }
      </div>
      <span className="text-sm text-gray-700 truncate">{label}</span>
    </button>
  );
}

function stripMarkup(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isDeleted = !!msg.deleteTime;
  const bodyText = isDeleted
    ? null
    : (msg.text ?? (msg.formattedText ? stripMarkup(msg.formattedText) : null));

  return (
    <div className="animate-fade-in">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-blue-200 flex-shrink-0 flex items-center justify-center mt-0.5">
          <span className="text-xs font-bold text-blue-700">
            {(msg.sender?.displayName ?? "?")[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-xs font-semibold text-gray-800 truncate">
              {msg.sender?.displayName ?? "Unknown"}
            </span>
            {msg.createTime && (
              <span className="text-xs text-gray-400 flex-shrink-0">
                {new Date(msg.createTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          {isDeleted ? (
            <p className="text-xs text-gray-400 italic">This message was deleted.</p>
          ) : bodyText ? (
            <p className="text-xs text-gray-700 break-words leading-relaxed">{bodyText}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useUIStore } from "@/store/uiStore";
import MessageList from "./MessageList";
import MessageDetail from "./MessageDetail";

export default function MailView() {
  const { selectedThreadId } = useUIStore();
  const [listWidth, setListWidth] = useState(360);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => setIsDragging(true);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setListWidth(Math.max(280, Math.min(600, e.clientX - 220)));
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-white"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Message list */}
      <div
        className="flex flex-col border-r border-gray-200 flex-shrink-0 overflow-hidden"
        style={{ width: listWidth }}
      >
        <MessageList />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize hover:bg-blue-400 transition-colors flex-shrink-0"
        style={{ backgroundColor: isDragging ? "#3b82f6" : undefined }}
      />

      {/* Message detail */}
      <div className="flex-1 overflow-hidden min-w-0">
        {selectedThreadId ? (
          <MessageDetail threadId={selectedThreadId} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-sm">Select a conversation to read</p>
      </div>
    </div>
  );
}

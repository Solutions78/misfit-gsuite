import { useState } from "react";
import { useUIStore } from "@/store/uiStore";
import MessageList from "./MessageList";
import DetailPane from "./DetailPane";

export default function MailView() {
  // MailView deliberately does NOT read selectedThreadId.
  // Doing so caused it to re-render on every click, which collapsed the flex layout
  // during React's reconciliation of EmptyState → MessageDetail.
  const mailLayout = useUIStore((s) => s.mailLayout);
  const [listWidth, setListWidth] = useState(360);
  const [listHeight, setListHeight] = useState(280);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (mailLayout === "side") {
      setListWidth(Math.max(240, Math.min(560, e.clientX - rect.left)));
    } else {
      setListHeight(Math.max(180, Math.min(480, e.clientY - rect.top)));
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  if (mailLayout === "top") {
    return (
      <div
        className="flex flex-col h-full w-full overflow-hidden bg-white"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex-shrink-0 border-b border-gray-200 overflow-hidden"
          style={{ height: listHeight }}
        >
          <MessageList />
        </div>

        <div
          onMouseDown={() => setIsDragging(true)}
          className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-400 transition-colors"
          style={{ background: isDragging ? "#3b82f6" : undefined }}
        />

        <div className="flex-1 min-h-0 overflow-hidden">
          <DetailPane />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-white"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Fixed-width list — three constraints so flex never overrides it */}
      <div
        className="flex flex-col border-r border-gray-200 flex-shrink-0 overflow-hidden"
        style={{ width: listWidth, minWidth: listWidth, maxWidth: listWidth }}
      >
        <MessageList />
      </div>

      <div
        onMouseDown={() => setIsDragging(true)}
        className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 transition-colors"
        style={{ backgroundColor: isDragging ? "#3b82f6" : undefined }}
      />

      {/* Detail pane — always present, reads selectedThreadId itself */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <DetailPane />
      </div>
    </div>
  );
}

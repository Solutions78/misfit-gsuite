import { useState } from "react";
import { useUIStore } from "@/store/uiStore";
import MessageList from "./MessageList";
import DetailPane from "./DetailPane";

export default function MailView() {
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
        className="flex flex-col h-full w-full overflow-hidden bg-gray-50"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex-shrink-0 border-b border-white/5 overflow-hidden"
          style={{ height: listHeight }}
        >
          <MessageList />
        </div>

        <div
          onMouseDown={() => setIsDragging(true)}
          className="h-1 flex-shrink-0 cursor-row-resize hover:bg-blue-400/40 transition-colors z-20"
          style={{ background: isDragging ? "#3b82f6" : undefined }}
        />

        <div className="flex-1 min-h-0 overflow-hidden bg-gray-50">
          <DetailPane />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-gray-50"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        className="flex flex-col border-r border-white/5 flex-shrink-0 overflow-hidden bg-gray-50"
        style={{ width: listWidth, minWidth: listWidth, maxWidth: listWidth }}
      >
        <MessageList />
      </div>

      <div
        onMouseDown={() => setIsDragging(true)}
        className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400/40 transition-colors z-20"
        style={{ backgroundColor: isDragging ? "#3b82f6" : undefined }}
      />

      <div className="flex-1 min-w-0 overflow-hidden bg-gray-50">
        <DetailPane />
      </div>
    </div>
  );
}

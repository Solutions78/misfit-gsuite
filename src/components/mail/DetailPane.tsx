import { useUIStore } from "@/store/uiStore";
import MessageDetail from "./MessageDetail";
import { Mail } from "lucide-react";

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-gray-900 border border-white/5 rounded-[32px] flex items-center justify-center shadow-2xl">
          <Mail className="w-10 h-10 text-gray-700 animate-pulse" />
        </div>
        <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.3em]">Awaiting Data Transmission</p>
      </div>
    </div>
  );
}

export default function DetailPane() {
  const selectedThreadId = useUIStore((s) => s.selectedThreadId);

  return (
    <div className="h-full w-full overflow-hidden bg-gray-50">
      {selectedThreadId
        ? <MessageDetail key={selectedThreadId} threadId={selectedThreadId} />
        : <EmptyState />}
    </div>
  );
}

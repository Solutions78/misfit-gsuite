import { useUIStore } from "@/store/uiStore";
import MessageDetail from "./MessageDetail";

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-sm">Select a conversation to read</p>
      </div>
    </div>
  );
}

// Isolated component so that selectedThreadId changes only re-render this
// subtree — not MailView and its flex layout.
export default function DetailPane() {
  const selectedThreadId = useUIStore((s) => s.selectedThreadId);

  return (
    <div className="h-full w-full overflow-hidden">
      {selectedThreadId
        ? <MessageDetail key={selectedThreadId} threadId={selectedThreadId} />
        : <EmptyState />}
    </div>
  );
}

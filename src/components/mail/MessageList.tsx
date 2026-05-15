import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { listThreadSummaries, searchThreadSummaries, syncInbox, trashMessage, listLabels, createLabel, modifyMessage, getThreadView } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, ArrowUpDown, CalendarDays, User2, Star, X, ChevronDown } from "lucide-react";
import SearchBar from "./SearchBar";
import { isOtherThread } from "@/lib/domainFilter";
import type { ThreadSummary, GmailLabel } from "@/types";
import MessagePopup from "@/components/common/MessagePopup";

function formatDate(date?: string, internalDate?: string): string {
  const ts = internalDate ? parseInt(internalDate) : date ? Date.parse(date) : NaN;
  if (isNaN(ts)) return "";
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isThisYear = d.getFullYear() === now.getFullYear();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isThisYear) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

function formatSender(from?: string): string {
  if (!from) return "Unknown";
  const match = from.match(/^([^<]+)</);
  if (match) return match[1].trim();
  return from.replace(/<|>/g, "").trim();
}


export default function MessageList() {
  // Fine-grained selectors — one per field — so this component only re-renders
  // when that specific field changes, not on every store update.
  const selectedLabel     = useUIStore((s) => s.selectedLabel);
  const searchQuery       = useUIStore((s) => s.searchQuery);
  const sortField         = useUIStore((s) => s.sortField);
  const sortDir           = useUIStore((s) => s.sortDir);
  const setSortField      = useUIStore((s) => s.setSortField);
  const setSortDir        = useUIStore((s) => s.setSortDir);
  const selectedThreadId  = useUIStore((s) => s.selectedThreadId);
  const setSelectedThread = useUIStore((s) => s.setSelectedThread);
  const inboxTab          = useUIStore((s) => s.inboxTab);
  const setInboxTab       = useUIStore((s) => s.setInboxTab);

  const isInbox = selectedLabel === "INBOX" && !searchQuery;

  const parentRef = useRef<HTMLDivElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [moveModal, setMoveModal] = useState<{ threadId: string; msgId: string } | null>(null);
  const [popupThreadId, setPopupThreadId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const threadsQuery = useInfiniteQuery({
    queryKey: ["thread-summaries", selectedLabel, searchQuery],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      searchQuery
        ? searchThreadSummaries(searchQuery, pageParam)
        : listThreadSummaries({ labelIds: [selectedLabel], pageToken: pageParam, maxResults: 50 }),
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncInbox();
      await threadsQuery.refetch();
    } finally {
      setSyncing(false);
    }
  };

  const pages = threadsQuery.data?.pages;

  const allThreads = useMemo(() => {
    const raw = (pages?.flatMap((p) => p.threads) ?? []) as ThreadSummary[];
    const seen = new Set<string>();
    let deduped = raw.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    // Focused/Other tab filtering — only applies to INBOX view
    if (isInbox) {
      if (inboxTab === "other") {
        deduped = deduped.filter((t) => isOtherThread(t.from, t.labelIds ?? []));
      } else {
        // Focused: business-domain emails not categorized as promotions/social/etc.
        deduped = deduped.filter((t) => !isOtherThread(t.from, t.labelIds ?? []));
      }
    }
    if (sortField === "date") {
      deduped.sort((a, b) => {
        const ta = parseInt(a.internalDate ?? "0");
        const tb = parseInt(b.internalDate ?? "0");
        return sortDir === "desc" ? tb - ta : ta - tb;
      });
    } else {
      deduped.sort((a, b) => {
        const sa = formatSender(a.from).toLowerCase();
        const sb = formatSender(b.from).toLowerCase();
        const cmp = sa.localeCompare(sb);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return deduped;
  }, [pages, sortField, sortDir, inboxTab, isInbox]);

  // Infinite scroll via scroll event on the list container
  const fetchNextPage = threadsQuery.fetchNextPage;
  const hasNextPage = threadsQuery.hasNextPage;
  const isFetchingNextPage = threadsQuery.isFetchingNextPage;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasNextPage && !isFetchingNextPage && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const trashMutation = useMutation({
    mutationFn: (msgId: string) => trashMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
    },
  });

  const selectedIndex = allThreads.findIndex((t) => t.id === selectedThreadId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (allThreads.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = selectedIndex < allThreads.length - 1 ? selectedIndex + 1 : selectedIndex;
        setSelectedThread(allThreads[next].id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = selectedIndex > 0 ? selectedIndex - 1 : 0;
        setSelectedThread(allThreads[prev].id);
      } else if (e.key === "ArrowLeft") {
        if (selectedIndex < 0) return;
        e.preventDefault();
        trashMutation.mutate(allThreads[selectedIndex].id);
        const nextIdx = selectedIndex < allThreads.length - 1 ? selectedIndex : selectedIndex - 1;
        setSelectedThread(nextIdx >= 0 ? (allThreads[nextIdx]?.id ?? null) : null);
      } else if (e.key === "ArrowRight") {
        if (selectedIndex < 0) return;
        e.preventDefault();
        setMoveModal({ threadId: allThreads[selectedIndex].id, msgId: allThreads[selectedIndex].id });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [allThreads, selectedIndex, setSelectedThread, trashMutation.mutate]);

  const cycleSortDir = () => setSortDir(sortDir === "desc" ? "asc" : "desc");

  return (
    <div className="flex flex-col h-full" tabIndex={-1}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0" style={{ paddingTop: "calc(28px + 6px)" }}>
        {/* Label title + sync */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800 capitalize flex-1">
            {isInbox ? "Inbox" : selectedLabel.replace(/_/g, " ").toLowerCase()}
          </span>
          <button
            onClick={handleSync}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            disabled={syncing || threadsQuery.isFetching}
            title="Sync"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 text-gray-500", (syncing || threadsQuery.isFetching) && "animate-spin")} />
          </button>
        </div>

        <SearchBar />

        {/* Focused / Other tabs — inbox only, below search */}
        {isInbox && (
          <div className="flex items-center gap-0 mt-3 border-b border-gray-100">
            <button
              onClick={() => setInboxTab("focused")}
              className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 -mb-px transition-all",
                inboxTab === "focused"
                  ? "border-blue-600 text-blue-600 bg-blue-50/30"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              Focused
            </button>
            <button
              onClick={() => setInboxTab("other")}
              className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest border-b-2 -mb-px transition-all",
                inboxTab === "other"
                  ? "border-blue-600 text-blue-600 bg-blue-50/30"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              )}
            >
              Other
            </button>
          </div>
        )}

        {/* Sort controls */}
        <div className="flex items-center gap-2 mt-3 pl-1">
          <span className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">Sort by</span>
          <button
            onClick={() => { setSortField("date"); if (sortField === "date") cycleSortDir(); }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all",
              sortField === "date" ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
            )}
          >
            <CalendarDays className="w-3 h-3" />
            Date
            {sortField === "date" && <ArrowUpDown className={cn("w-3 h-3", sortDir === "asc" && "rotate-180")} />}
          </button>
          <button
            onClick={() => { setSortField("sender"); if (sortField === "sender") cycleSortDir(); }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all",
              sortField === "sender" ? "bg-gray-900 text-white shadow-sm" : "text-gray-500 hover:bg-gray-100"
            )}
          >
            <User2 className="w-3 h-3" />
            Sender
            {sortField === "sender" && <ArrowUpDown className={cn("w-3 h-3", sortDir === "asc" && "rotate-180")} />}
          </button>
        </div>
      </div>

      {/* Thread list */}
      {threadsQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      ) : threadsQuery.isError ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-xs font-semibold text-red-600 mb-1">Failed to load mail</p>
            <p className="text-xs text-gray-500 break-all">{String(threadsQuery.error)}</p>
            <button onClick={() => threadsQuery.refetch()} className="mt-2 text-xs text-blue-600 hover:underline">Retry</button>
          </div>
        </div>
      ) : allThreads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-gray-400">No messages</p>
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          {allThreads.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              isSelected={thread.id === selectedThreadId}
              onSelect={() => setSelectedThread(thread.id)}
              onOpenPopup={() => setPopupThreadId(thread.id)}
            />
          ))}
          {threadsQuery.isFetchingNextPage && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          )}
        </div>
      )}

      {/* Move modal */}
      {moveModal && (
        <MoveModal
          threadId={moveModal.threadId}
          onClose={() => setMoveModal(null)}
          onMoved={() => {
            setMoveModal(null);
            queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
          }}
        />
      )}

      {popupThreadId && (
        <EmailThreadPopup
          threadId={popupThreadId}
          onClose={() => setPopupThreadId(null)}
        />
      )}
    </div>
  );
}

function EmailThreadPopup({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { data: messages, isLoading, error } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getThreadView(threadId),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6 backdrop-blur-sm" onMouseDown={onClose}>
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm font-semibold text-gray-600">Opening email…</span>
        </div>
      </div>
    );
  }

  if (error || !messages?.length) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6 backdrop-blur-sm" onMouseDown={onClose}>
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
          <p className="mb-2 text-sm font-bold text-red-600">Failed to open email</p>
          <p className="break-words text-xs text-gray-500">{String(error ?? "No messages found")}</p>
          <button onClick={onClose} className="mt-4 rounded-xl bg-gray-900 px-4 py-2 text-xs font-bold text-white">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <MessagePopup
      content={{ type: "email-thread", messages, title: messages[0]?.subject || "Email Conversation" }}
      onClose={onClose}
    />
  );
}

// ── ThreadRow ────────────────────────────────────────────────────────────────

function ThreadRow({
  thread,
  isSelected,
  onSelect,
  onOpenPopup,
}: {
  thread: ThreadSummary;
  isSelected: boolean;
  onSelect: () => void;
  onOpenPopup: () => void;
}) {
  const sender = formatSender(thread.from);
  const dateStr = formatDate(thread.date, thread.internalDate);
  const subject = thread.subject || "(no subject)";

  return (
    <div>
      <button
        style={{
          width: "100%",
          background: isSelected ? "var(--c-overlay)" : "transparent",
          borderBottom: "1px solid var(--c-border)",
          boxShadow: isSelected ? "inset 3px 0 0 0 var(--c-accent)" : undefined,
        }}
        onClick={onSelect}
        onDoubleClick={(event) => {
          event.preventDefault();
          onOpenPopup();
        }}
        className="w-full text-left px-4 py-3.5 transition-all group relative"
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--c-overlay)"; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
      >
        <div className="flex items-center justify-between gap-3 w-full mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {thread.isUnread && (
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: "var(--c-accent)", boxShadow: "0 0 6px color-mix(in srgb, var(--c-accent) 60%, transparent)" }}
              />
            )}
            <span
              className="text-[13px] truncate tracking-tight"
              style={{
                color: "var(--c-text-1)",
                fontWeight: thread.isUnread ? 700 : 500,
              }}
            >
              {sender}
            </span>
            {thread.messageCount > 1 && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none flex-shrink-0"
                style={{ background: "var(--c-overlay)", color: "var(--c-text-3)", border: "1px solid var(--c-border)" }}
              >
                {thread.messageCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {thread.isStarred && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
            <span className="text-[10px] font-medium" style={{ color: "var(--c-text-3)" }}>{dateStr}</span>
          </div>
        </div>

        <p
          className="text-[12px] truncate w-full mb-0.5"
          style={{
            color: thread.isUnread ? "var(--c-text-1)" : "var(--c-text-2)",
            fontWeight: thread.isUnread ? 600 : 400,
          }}
        >
          {subject}
        </p>

        {thread.snippet && (
          <p className="text-[11px] truncate w-full font-normal leading-tight" style={{ color: "var(--c-text-3)" }}>
            {thread.snippet}
          </p>
        )}
      </button>
    </div>
  );
}

// ── Move Modal ───────────────────────────────────────────────────────────────

function MoveModal({
  threadId,
  onClose,
  onMoved,
}: {
  threadId: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [selected, setSelected] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);

  const { data: labels = [] } = useQuery({
    queryKey: ["labels"],
    queryFn: listLabels,
    staleTime: 60_000,
  });

  const movableLabels = labels.filter(
    (l: GmailLabel) => !["UNREAD", "IMPORTANT", "CATEGORY_PERSONAL"].includes(l.id)
  );

  const handleMove = async () => {
    if (!selected) return;
    setMoving(true);
    try {
      await modifyMessage(threadId, [selected], ["INBOX"]);
      onMoved();
    } finally {
      setMoving(false);
    }
  };

  const handleCreateAndMove = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const created = await createLabel(newLabel.trim());
      await modifyMessage(threadId, [created.id], ["INBOX"]);
      onMoved();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-72 p-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Move to:</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Label dropdown */}
        <div className="relative mb-3">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full appearance-none px-3 py-2 pr-8 text-sm border border-gray-200 rounded-xl bg-white text-gray-800 outline-none focus:border-blue-400"
          >
            <option value="">Select a label…</option>
            {movableLabels.map((l: GmailLabel) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {selected && (
          <button
            onClick={handleMove}
            disabled={moving}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors mb-3"
          >
            {moving ? "Moving…" : "Move"}
          </button>
        )}

        <div className="border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 mb-2">Or create a new label:</p>
          <div className="flex gap-2">
            <input
              className="flex-1 text-sm px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-blue-400"
              placeholder="New label name"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateAndMove()}
            />
            <button
              onClick={handleCreateAndMove}
              disabled={!newLabel.trim() || creating}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors"
            >
              {creating ? "…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { dbg, dbgRender } from "@/lib/debugLog";
import { listThreadSummaries, searchThreadSummaries, syncInbox, trashMessage, listLabels, createLabel, modifyMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, ArrowUpDown, CalendarDays, User2, Star, X, ChevronDown } from "lucide-react";
import SearchBar from "./SearchBar";
import type { ThreadSummary, GmailLabel } from "@/types";

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
  const renderCount = useRef(0);
  renderCount.current += 1;

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

  const parentRef = useRef<HTMLDivElement>(null);
  const [syncing, setSyncing] = useState(false);
  const [moveModal, setMoveModal] = useState<{ threadId: string; msgId: string } | null>(null);
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

  const rawThreads = (threadsQuery.data?.pages.flatMap((p) => p.threads) ?? []) as ThreadSummary[];
  dbg("MessageList", `status=${threadsQuery.status} pages=${threadsQuery.data?.pages.length ?? 0} threads=${rawThreads.length} label=${selectedLabel} search="${searchQuery}"`);

  const allThreads = useMemo(() => {
    const sorted = [...rawThreads];
    if (sortField === "date") {
      sorted.sort((a, b) => {
        const ta = parseInt(a.internalDate ?? "0");
        const tb = parseInt(b.internalDate ?? "0");
        return sortDir === "desc" ? tb - ta : ta - tb;
      });
    } else {
      sorted.sort((a, b) => {
        const sa = formatSender(a.from).toLowerCase();
        const sb = formatSender(b.from).toLowerCase();
        const cmp = sa.localeCompare(sb);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return sorted;
  }, [rawThreads, sortField, sortDir]);

  const rowVirtualizer = useVirtualizer({
    count: allThreads.length + (threadsQuery.hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 10,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  // Infinite scroll — stable refs so the effect deps never change identity.
  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const fetchNextPage = threadsQuery.fetchNextPage;
  const hasNextPage = threadsQuery.hasNextPage;
  const isFetchingNextPage = threadsQuery.isFetchingNextPage;
  const threadCount = allThreads.length;

  useEffect(() => {
    if (lastVirtualIndex >= threadCount - 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [lastVirtualIndex, threadCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  const trashMutation = useMutation({
    mutationFn: (msgId: string) => trashMessage(msgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
    },
  });

  const selectedIndex = allThreads.findIndex((t) => t.id === selectedThreadId);

  const virtualizerRef = useRef(rowVirtualizer);
  virtualizerRef.current = rowVirtualizer;
  const scrollToIndex = useCallback((idx: number) => {
    virtualizerRef.current.scrollToIndex(idx, { align: "auto" });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only fire when not typing in an input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (allThreads.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = selectedIndex < allThreads.length - 1 ? selectedIndex + 1 : selectedIndex;
        setSelectedThread(allThreads[next].id);
        scrollToIndex(next);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = selectedIndex > 0 ? selectedIndex - 1 : 0;
        setSelectedThread(allThreads[prev].id);
        scrollToIndex(prev);
      } else if (e.key === "ArrowLeft") {
        // Delete selected thread
        if (selectedIndex < 0) return;
        e.preventDefault();
        const thread = allThreads[selectedIndex];
        // Use thread id as msg id for trash (backend accepts thread id)
        trashMutation.mutate(thread.id);
        // Advance selection to next item
        const nextIdx = selectedIndex < allThreads.length - 1 ? selectedIndex : selectedIndex - 1;
        if (nextIdx >= 0) setSelectedThread(allThreads[nextIdx]?.id ?? null);
        else setSelectedThread(null);
      } else if (e.key === "ArrowRight") {
        // Move selected thread — open move modal
        if (selectedIndex < 0) return;
        e.preventDefault();
        const thread = allThreads[selectedIndex];
        setMoveModal({ threadId: thread.id, msgId: thread.id });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [allThreads, selectedIndex, setSelectedThread, trashMutation.mutate, scrollToIndex]);

  const cycleSortDir = () => setSortDir(sortDir === "desc" ? "asc" : "desc");

  return (
    <div className="flex flex-col h-full" tabIndex={-1}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0" style={{ paddingTop: "calc(28px + 6px)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800 capitalize">
            {selectedLabel.toLowerCase()}
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

        {/* Sort controls */}
        <div className="flex items-center gap-1 mt-2">
          <span className="text-xs text-gray-400 mr-0.5">Sort:</span>
          <button
            onClick={() => { setSortField("date"); if (sortField === "date") cycleSortDir(); }}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors",
              sortField === "date" ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"
            )}
          >
            <CalendarDays className="w-3 h-3" />
            Date
            {sortField === "date" && <ArrowUpDown className={cn("w-3 h-3", sortDir === "asc" && "rotate-180")} />}
          </button>
          <button
            onClick={() => { setSortField("sender"); if (sortField === "sender") cycleSortDir(); }}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors",
              sortField === "sender" ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"
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
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const thread = allThreads[virtualRow.index];
              if (!thread) {
                return (
                  <div
                    key="loader"
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    style={{ position: "absolute", top: virtualRow.start, width: "100%" }}
                    className="flex items-center justify-center py-4"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  </div>
                );
              }
              return (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  isSelected={thread.id === selectedThreadId}
                  onSelect={() => {
                    dbg("ThreadRow.click", `id=${thread.id} idx=${virtualRow.index} top=${virtualRow.start}`);
                    setSelectedThread(thread.id);
                    dbg("ThreadRow.click", "setSelectedThread dispatched");
                  }}
                  onMouseDown={() => dbg("ThreadRow.mousedown", `id=${thread.id}`)}
                  onMouseUp={() => dbg("ThreadRow.mouseup", `id=${thread.id}`)}
                  virtualIndex={virtualRow.index}
                  measureRef={rowVirtualizer.measureElement}
                  style={{ position: "absolute", top: virtualRow.start, width: "100%" }}
                />
              );
            })}
          </div>
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
    </div>
  );
}

// ── ThreadRow ────────────────────────────────────────────────────────────────

function ThreadRow({
  thread,
  isSelected,
  onSelect,
  onMouseDown,
  onMouseUp,
  virtualIndex,
  measureRef,
  style,
}: {
  thread: ThreadSummary;
  isSelected: boolean;
  onSelect: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  virtualIndex: number;
  measureRef: (el: Element | null) => void;
  style: React.CSSProperties;
}) {
  const sender = formatSender(thread.from);
  const dateStr = formatDate(thread.date, thread.internalDate);
  const subject = thread.subject || "(no subject)";

  return (
    <div data-index={virtualIndex} ref={measureRef} style={style}>
      <button
        style={{ width: "100%" }}
        onClick={onSelect}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        className={cn(
          "w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors hover:bg-gray-50 flex flex-col gap-0.5",
          isSelected && "bg-blue-50 hover:bg-blue-50"
        )}
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-1.5 min-w-0">
            {thread.isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
            <span className={cn("text-sm truncate", thread.isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700")}>
              {sender}
            </span>
            {thread.messageCount > 1 && (
              <span className="text-xs text-gray-400 flex-shrink-0">({thread.messageCount})</span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {thread.isStarred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
            <span className="text-xs" style={{ color: "var(--mm-text-muted, #9ca3af)" }}>{dateStr}</span>
          </div>
        </div>

        <p className={cn(
          "text-xs truncate w-full",
          thread.isUnread ? "text-gray-800 font-medium" : "text-gray-600",
          thread.isUnread ? "pl-3.5" : "pl-0"
        )}>
          {subject}
        </p>

        {thread.snippet && (
          <p className="text-xs truncate w-full" style={{ color: "var(--mm-text-secondary, #6b7280)" }}>
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

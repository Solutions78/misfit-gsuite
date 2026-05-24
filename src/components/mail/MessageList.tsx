import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { listThreadSummaries, searchThreadSummaries, syncInbox, trashMessage, listLabels, createLabel, modifyMessage, getThreadView } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, ArrowUpDown, CalendarDays, User2, Star, X, ChevronDown, Inbox as InboxIcon } from "lucide-react";
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

    if (isInbox) {
      if (inboxTab === "other") {
        deduped = deduped.filter((t) => isOtherThread(t.from, t.labelIds ?? []));
      } else {
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

  const fetchNextPage = threadsQuery.fetchNextPage;
  const hasNextPage = threadsQuery.hasNextPage;
  const isFetchingNextPage = threadsQuery.isFetchingNextPage;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (hasNextPage && !isFetchingNextPage && el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden" tabIndex={-1}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 flex-shrink-0 bg-transparent" style={{ paddingTop: "calc(28px + 12px)" }}>
        {/* Label title + sync */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-gray-900 border border-white/5 flex items-center justify-center shadow-lg">
                <InboxIcon className="w-4 h-4 text-blue-400" />
             </div>
             <span className="text-[13px] font-black text-white uppercase tracking-tight">
                {isInbox ? "Inbox" : selectedLabel.replace(/_/g, " ").toLowerCase()}
             </span>
          </div>
          <button
            onClick={handleSync}
            className="p-2 hover:bg-white/10 rounded-xl transition-all active:scale-90"
            disabled={syncing || threadsQuery.isFetching}
            title="Sync"
          >
            <RefreshCw className={cn("w-4 h-4 text-gray-500", (syncing || threadsQuery.isFetching) && "animate-spin")} />
          </button>
        </div>

        <SearchBar />

        {/* Focused / Other tabs — standardized Glow-Pills */}
        {isInbox && (
          <div className="flex bg-gray-900/40 p-1 rounded-xl mt-4 border border-white/5 gap-1">
            <button
              onClick={() => setInboxTab("focused")}
              className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg",
                inboxTab === "focused"
                  ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/10"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              Focused
            </button>
            <button
              onClick={() => setInboxTab("other")}
              className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-lg",
                inboxTab === "other"
                  ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/10"
                  : "text-gray-500 hover:text-gray-300"
              )}
            >
              Other
            </button>
          </div>
        )}

        {/* Sort controls */}
        <div className="flex items-center gap-3 mt-4 pl-1">
          <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Sort by</span>
          <button
            onClick={() => { setSortField("date"); if (sortField === "date") cycleSortDir(); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all",
              sortField === "date" 
                ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/10" 
                : "text-gray-500 hover:bg-gray-900/40 hover:text-gray-300"
            )}
          >
            <CalendarDays className={cn("w-3.5 h-3.5", sortField === "date" ? "text-blue-400" : "text-gray-500")} />
            Date
            {sortField === "date" && <ArrowUpDown className={cn("w-3 h-3 ml-0.5", sortDir === "asc" && "rotate-180")} />}
          </button>
          <button
            onClick={() => { setSortField("sender"); if (sortField === "sender") cycleSortDir(); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all",
              sortField === "sender" 
                ? "bg-gray-900 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)] border border-white/10" 
                : "text-gray-500 hover:bg-gray-900/40 hover:text-gray-300"
            )}
          >
            <User2 className={cn("w-3.5 h-3.5", sortField === "sender" ? "text-blue-400" : "text-gray-500")} />
            Sender
            {sortField === "sender" && <ArrowUpDown className={cn("w-3 h-3 ml-0.5", sortDir === "asc" && "rotate-180")} />}
          </button>
        </div>
      </div>

      {/* Thread list */}
      <div className="flex-1 min-h-0 bg-transparent">
      {threadsQuery.isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500/50" />
        </div>
      ) : (
        <div ref={parentRef} className="h-full overflow-y-auto custom-scrollbar" onScroll={handleScroll}>
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
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
            </div>
          )}
        </div>
      )}
      </div>

      {popupThreadId && (
        <EmailThreadPopup
          threadId={popupThreadId}
          onClose={() => setPopupThreadId(null)}
        />
      )}
    </div>
  );
}

function ThreadRow({ thread, isSelected, onSelect, onOpenPopup }: { thread: ThreadSummary; isSelected: boolean; onSelect: () => void; onOpenPopup: () => void; }) {
  const sender = formatSender(thread.from);
  const dateStr = formatDate(thread.date, thread.internalDate);
  const subject = thread.subject || "(no subject)";

  return (
    <button
      onClick={onSelect}
      onDoubleClick={(event) => { event.preventDefault(); onOpenPopup(); }}
      className={cn(
          "w-full text-left px-5 py-4 transition-all group relative border-b border-white/5",
          isSelected ? "bg-gray-900 shadow-inner" : "bg-transparent hover:bg-gray-900/40"
      )}
    >
      {isSelected && <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.5)]" />}
      
      <div className="flex items-center justify-between gap-3 w-full mb-1.5">
        <div className="flex items-center gap-3 min-w-0">
          {thread.isUnread ? (
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
          ) : (
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 opacity-0" />
          )}
          <span className={cn("text-[13px] truncate tracking-tight transition-colors", thread.isUnread ? "text-white font-black" : isSelected ? "text-white font-bold" : "text-gray-300 font-medium group-hover:text-white")}>
            {sender}
          </span>
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 group-hover:text-gray-400">{dateStr}</span>
      </div>

      <div className="pl-[26px]">
          <p className={cn("text-[12px] truncate w-full mb-1 tracking-tight transition-colors", thread.isUnread ? "text-gray-100 font-bold" : "text-gray-400 font-medium group-hover:text-gray-200")}>
            {subject}
          </p>
          {thread.snippet && (
            <p className="text-[11px] truncate w-full font-medium leading-tight text-gray-600 group-hover:text-gray-500 italic">
                {thread.snippet}
            </p>
          )}
      </div>
    </button>
  );
}

function EmailThreadPopup({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { data: messages, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => getThreadView(threadId),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-md" onMouseDown={onClose}>
        <div className="flex items-center gap-3 rounded-[28px] bg-gray-900 border border-white/10 px-8 py-6 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          <span className="text-[11px] font-black text-white uppercase tracking-widest">Synthesizing...</span>
        </div>
      </div>
    );
  }

  return (
    <MessagePopup
      content={{ type: "email-thread", messages: messages ?? [], title: messages?.[0]?.subject || "Email Conversation" }}
      onClose={onClose}
    />
  );
}

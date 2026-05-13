import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { listThreads, searchThreads } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2 } from "lucide-react";
import SearchBar from "./SearchBar";
import type { ThreadListItem } from "@/types";

export default function MessageList() {
  const { selectedLabel, selectedThreadId, setSelectedThread, searchQuery } = useUIStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const threadsQuery = useInfiniteQuery({
    queryKey: ["threads", selectedLabel, searchQuery],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      searchQuery
        ? searchThreads(searchQuery, pageParam)
        : listThreads({ labelIds: [selectedLabel], pageToken: pageParam, maxResults: 50 }),
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
  });

  const allThreads = threadsQuery.data?.pages.flatMap((p) => (p as any).threads ?? []) as ThreadListItem[] ?? [];

  const rowVirtualizer = useVirtualizer({
    count: allThreads.length + (threadsQuery.hasNextPage ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 10,
  });

  // Load more when hitting the bottom sentinel
  useEffect(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (
      last.index >= allThreads.length - 5 &&
      threadsQuery.hasNextPage &&
      !threadsQuery.isFetchingNextPage
    ) {
      threadsQuery.fetchNextPage();
    }
  }, [rowVirtualizer.getVirtualItems(), allThreads.length, threadsQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-100" style={{ paddingTop: "calc(28px + 8px)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800 capitalize">
            {selectedLabel.toLowerCase()}
          </span>
          <button
            onClick={() => threadsQuery.refetch()}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            disabled={threadsQuery.isFetching}
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5 text-gray-500", threadsQuery.isFetching && "animate-spin")}
            />
          </button>
        </div>
        <SearchBar />
      </div>

      {/* Thread list */}
      {threadsQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        </div>
      ) : (
        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const thread = allThreads[virtualRow.index];
              if (!thread) {
                return (
                  <div
                    key="loader"
                    style={{
                      position: "absolute",
                      top: virtualRow.start,
                      height: virtualRow.size,
                      width: "100%",
                    }}
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
                  onSelect={() => setSelectedThread(thread.id)}
                  style={{
                    position: "absolute",
                    top: virtualRow.start,
                    height: virtualRow.size,
                    width: "100%",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  isSelected,
  onSelect,
  style,
}: {
  thread: ThreadListItem;
  isSelected: boolean;
  onSelect: () => void;
  style: React.CSSProperties;
}) {
  return (
    <button
      style={style}
      onClick={onSelect}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-gray-100 transition-colors hover:bg-gray-50 flex flex-col gap-1",
        isSelected && "bg-blue-50 hover:bg-blue-50"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 opacity-0" />
        <span className="flex-1 text-sm font-medium text-gray-900 truncate">
          Thread
        </span>
      </div>
      <p className="text-xs text-gray-500 truncate pl-4 leading-relaxed">
        {thread.snippet}
      </p>
    </button>
  );
}

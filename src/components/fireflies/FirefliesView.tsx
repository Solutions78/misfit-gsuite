import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic2, Loader2, Users, Clock, Calendar, Sparkles, CheckSquare, FolderInput } from "lucide-react";
import { cn } from "@/lib/utils";
import { listFirefliesMeetings, getFirefliesMeeting, listFirefliesChannels, moveFirefliesMeetings } from "@/lib/tauri";
import { setGeminiContext, clearGeminiContext } from "@/lib/geminiContextBridge";
import { useUIStore } from "@/store/uiStore";
import type { FirefliesMeeting, FirefliesChannel } from "@/types";

// date is ms since epoch (Float from Fireflies)
function formatDate(ms?: number): string {
  if (!ms) return "--";
  return new Date(ms).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// duration is in minutes (Float from Fireflies)
function formatDuration(mins?: number): string {
  if (!mins) return "--";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// start_time is a String from Fireflies (e.g. "42.5" seconds)
function formatStartTime(t?: string): string {
  if (!t) return "";
  const secs = parseFloat(t);
  if (isNaN(secs)) return t;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Meeting list item ──────────────────────────────────────────────────────

function MeetingItem({
  meeting, isActive, onClick, channels, onMove,
}: {
  meeting: FirefliesMeeting;
  isActive: boolean;
  onClick: () => void;
  channels: FirefliesChannel[];
  onMove: (meetingId: string, channelId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={cn(
          "w-full text-left px-4 py-3.5 rounded-2xl transition-all duration-200 active:scale-95",
          isActive
            ? "bg-gray-900 shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
            : "hover:bg-gray-200/50"
        )}
      >
        <p className={cn(
          "text-[11px] font-black uppercase tracking-tight truncate mb-1.5",
          isActive ? "text-white" : "text-gray-700"
        )}>
          {meeting.title ?? "Untitled Meeting"}
        </p>
        <div className="flex items-center gap-3">
          <span className={cn("text-[9px] font-bold uppercase tracking-widest flex items-center gap-1", isActive ? "text-gray-400" : "text-gray-500")}>
            <Calendar className="w-2.5 h-2.5" />
            {formatDate(meeting.date)}
          </span>
          {meeting.duration != null && (
            <span className={cn("text-[9px] font-bold uppercase tracking-widest flex items-center gap-1", isActive ? "text-gray-400" : "text-gray-500")}>
              <Clock className="w-2.5 h-2.5" />
              {formatDuration(meeting.duration)}
            </span>
          )}
          {meeting.participants && meeting.participants.length > 0 && (
            <span className={cn("text-[9px] font-bold uppercase tracking-widest flex items-center gap-1", isActive ? "text-gray-400" : "text-gray-500")}>
              <Users className="w-2.5 h-2.5" />
              {meeting.participants.length}
            </span>
          )}
        </div>
      </button>

      {/* Move to folder button — appears on hover */}
      {channels.length > 0 && (
        <div ref={menuRef} className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className={cn(
              "p-1.5 rounded-xl transition-all duration-150",
              "opacity-0 group-hover:opacity-100",
              menuOpen ? "opacity-100 bg-gray-900 text-blue-400" : "hover:bg-gray-900/50 text-gray-500 hover:text-gray-300"
            )}
            title="Move to folder"
          >
            <FolderInput className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-gray-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Move to Folder</p>
              </div>
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  onClick={(e) => { e.stopPropagation(); onMove(meeting.id, ch.id); setMenuOpen(false); }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[10px] font-black uppercase tracking-tight transition-colors",
                    meeting.channelId === ch.id
                      ? "text-blue-400 bg-gray-900"
                      : "text-gray-400 hover:bg-gray-900/60 hover:text-white"
                  )}
                >
                  {ch.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

type MeetingTab = "summary" | "transcript" | "actions";

function TabButton({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95",
        isActive
          ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
          : "text-gray-500 hover:bg-gray-900/30 hover:text-gray-300"
      )}
    >
      {label}
    </button>
  );
}

// ── Detail pane ────────────────────────────────────────────────────────────

function MeetingDetail({ meetingId }: { meetingId: string }) {
  const [activeTab, setActiveTab] = useState<MeetingTab>("summary");

  const { data: meeting, isLoading } = useQuery<FirefliesMeeting>({
    queryKey: ["fireflies-meeting", meetingId],
    queryFn: () => getFirefliesMeeting(meetingId),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!meeting) return;
    const parts: string[] = [
      `[MEETING CONTEXT]\nMeeting: ${meeting.title ?? "Untitled"}\nDate: ${formatDate(meeting.date)}`,
    ];
    if (meeting.participants?.length) {
      parts.push(`Participants: ${meeting.participants.join(", ")}`);
    }
    if (meeting.summary?.overview) {
      parts.push(`\nOverview:\n${meeting.summary.overview}`);
    }
    if (meeting.summary?.actionItems) {
      parts.push(`\nAction Items:\n${meeting.summary.actionItems}`);
    }
    setGeminiContext(parts.join("\n"), "[MEETING CONTEXT]");
    return () => clearGeminiContext();
  }, [meeting]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center opacity-20">
        <p className="text-[11px] font-black text-white uppercase tracking-widest">Meeting not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <div className="px-8 py-5 border-b border-white/5 flex-shrink-0">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-gray-900 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/5 flex-shrink-0">
            <Mic2 className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-black text-white uppercase tracking-tight truncate mb-2">
              {meeting.title ?? "Untitled Meeting"}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" />
                {formatDate(meeting.date)}
              </span>
              {meeting.duration != null && (
                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {formatDuration(meeting.duration)}
                </span>
              )}
            </div>
          </div>
        </div>

        {meeting.participants && meeting.participants.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {meeting.participants.map((p) => (
              <span key={p} className="px-3 py-1 bg-gray-900/60 border border-white/5 rounded-full text-[9px] font-black text-gray-400 uppercase tracking-widest">
                {p}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 px-8 py-3 border-b border-white/5 flex-shrink-0 bg-gray-900/10">
        <TabButton label="Summary"     isActive={activeTab === "summary"}    onClick={() => setActiveTab("summary")} />
        <TabButton label="Transcript"  isActive={activeTab === "transcript"} onClick={() => setActiveTab("transcript")} />
        <TabButton label="Action Items" isActive={activeTab === "actions"}   onClick={() => setActiveTab("actions")} />
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar py-6 px-8">
        {activeTab === "summary" && (
          <div className="space-y-6 max-w-3xl">
            {meeting.summary?.overview && (
              <div className="bg-gray-900/40 border border-white/5 rounded-[24px] p-6">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-3">Overview</p>
                <p className="text-[12px] text-gray-300 leading-relaxed">{meeting.summary.overview}</p>
              </div>
            )}
            {meeting.summary?.keywords && meeting.summary.keywords.length > 0 && (
              <div>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Keywords</p>
                <div className="flex flex-wrap gap-2">
                  {meeting.summary.keywords.map((kw) => (
                    <span key={kw} className="px-3 py-1.5 bg-gray-900 border border-white/5 rounded-full text-[10px] font-black text-gray-300 uppercase tracking-tight">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {meeting.summary?.outline && (
              <div>
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3">Outline</p>
                <div className="bg-gray-900/40 border border-white/5 rounded-[24px] p-5">
                  <p className="text-[11px] text-gray-300 leading-relaxed whitespace-pre-wrap">{meeting.summary.outline}</p>
                </div>
              </div>
            )}
            {meeting.summary?.shortSummary && (
              <div className="bg-gray-900/40 border border-white/5 rounded-[24px] p-6">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-3">Short Summary</p>
                <p className="text-[12px] text-gray-300 leading-relaxed">{meeting.summary.shortSummary}</p>
              </div>
            )}
            {!meeting.summary?.overview && !meeting.summary?.outline && !meeting.summary?.shortSummary && (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <Sparkles className="w-12 h-12 text-blue-400 mb-4" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">No summary available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "actions" && (
          <div className="max-w-2xl">
            {meeting.summary?.actionItems ? (
              <div className="bg-gray-900/40 border border-white/5 rounded-[24px] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckSquare className="w-4 h-4 text-blue-400" />
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Action Items</p>
                </div>
                <p className="text-[12px] text-gray-300 leading-relaxed whitespace-pre-wrap">{meeting.summary.actionItems}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <CheckSquare className="w-12 h-12 text-blue-400 mb-4" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">No action items</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "transcript" && (
          <div className="space-y-0 max-w-3xl">
            {meeting.transcript && meeting.transcript.length > 0 ? (
              meeting.transcript.map((sentence) => (
                <div
                  key={sentence.index}
                  className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0 group hover:bg-gray-900/20 transition-colors px-2 rounded-xl"
                >
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest w-10 flex-shrink-0 pt-0.5 text-right">
                    {formatStartTime(sentence.startTime)}
                  </span>
                  <div className="flex-1 min-w-0">
                    {sentence.speakerName && (
                      <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest block mb-0.5">
                        {sentence.speakerName}
                      </span>
                    )}
                    <p className="text-[11px] text-gray-300 leading-relaxed">{sentence.text}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <Mic2 className="w-12 h-12 text-blue-400 mb-4" />
                <p className="text-[10px] font-black text-white uppercase tracking-widest">No transcript available</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main FirefliesView ─────────────────────────────────────────────────────

export default function FirefliesView() {
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const { firefliesChannelId } = useUIStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    return () => clearGeminiContext();
  }, []);

  const { data: meetings, isLoading } = useQuery<FirefliesMeeting[]>({
    queryKey: ["fireflies-meetings"],
    queryFn: () => listFirefliesMeetings(50),
    staleTime: 5 * 60_000,
  });

  const { data: channels } = useQuery<FirefliesChannel[]>({
    queryKey: ["fireflies-channels"],
    queryFn: () => listFirefliesChannels(),
    staleTime: 10 * 60_000,
  });

  const moveMutation = useMutation({
    mutationFn: ({ meetingId, channelId }: { meetingId: string; channelId: string }) =>
      moveFirefliesMeetings([meetingId], channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fireflies-meetings"] });
    },
  });

  const meetingList = meetings ?? [];
  const channelList = channels ?? [];

  const filteredMeetings = firefliesChannelId
    ? meetingList.filter((m) => m.channelId === firefliesChannelId)
    : meetingList;

  const activeChannelTitle = firefliesChannelId
    ? channelList.find((c) => c.id === firefliesChannelId)?.title ?? "Folder"
    : null;

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--c-bg)" }}>
      {/* Left pane */}
      <div className="w-64 flex-shrink-0 border-r border-white/5 flex flex-col bg-gray-50">
        <div className="px-5 py-5 border-b border-white/5 flex items-center gap-2">
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.25em] flex-1 truncate">
            {activeChannelTitle ?? "All Meetings"}
          </span>
          {filteredMeetings.length > 0 && (
            <span className="text-[9px] font-black text-gray-600 tabular-nums">{filteredMeetings.length}</span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-3 px-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 opacity-20 px-4">
              <Mic2 className="w-10 h-10 text-blue-400 mb-3" />
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest text-center">No meetings found</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredMeetings.map((m) => (
                <MeetingItem
                  key={m.id}
                  meeting={m}
                  isActive={selectedMeetingId === m.id}
                  onClick={() => setSelectedMeetingId(m.id)}
                  channels={channelList}
                  onMove={(meetingId, channelId) => moveMutation.mutate({ meetingId, channelId })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main pane */}
      <div className="flex-1 flex min-w-0 shadow-2xl relative z-10 overflow-hidden" style={{ background: "var(--c-surface)" }}>
        {!selectedMeetingId ? (
          <div className="flex-1 flex flex-col items-center justify-center opacity-10 grayscale">
            <Mic2 className="w-24 h-24 mb-8 text-blue-400" />
            <p className="text-xl font-black text-white uppercase tracking-[0.5em]">Select a Meeting</p>
          </div>
        ) : (
          <MeetingDetail meetingId={selectedMeetingId} />
        )}
      </div>
    </div>
  );
}

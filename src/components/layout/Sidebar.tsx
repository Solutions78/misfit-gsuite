import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { useQuery } from "@tanstack/react-query";
import { listLabels, listSlackChannels, slackGetToken, slackDisconnect, listFirefliesChannels } from "@/lib/tauri";
import {
  Inbox,
  Send,
  FileText,
  Trash2,
  Star,
  Tag,
  PenSquare,
  MessageSquare,
  Palette,
  Rows2,
  PanelLeft,
  Plus,
  CalendarPlus,
  CheckCircle2,
  FolderPlus,
  Files,
  LayoutGrid,
  Users,
  Hash,
  Lock,
  User,
  LogOut,
  Loader2,
  Folder,
  Mic2,
  ExternalLink,
} from "lucide-react";
import type { GmailLabel, SlackChannel } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { useSlackUsers } from "@/hooks/useSlackUsers";

const SYSTEM_LABELS = [
  { id: "INBOX", name: "Inbox", icon: Inbox },
  { id: "STARRED", name: "Starred", icon: Star },
  { id: "SENT", name: "Sent", icon: Send },
  { id: "DRAFT", name: "Drafts", icon: FileText },
  { id: "TRASH", name: "Trash", icon: Trash2 },
];

export default function Sidebar() {
  const activeView        = useUIStore((s) => s.activeView);
  const selectedLabel     = useUIStore((s) => s.selectedLabel);
  const setSelectedLabel  = useUIStore((s) => s.setSelectedLabel);
  const openCompose       = useUIStore((s) => s.openCompose);
  const toggleChatPanel   = useUIStore((s) => s.toggleChatPanel);
  const mailLayout        = useUIStore((s) => s.mailLayout);
  const setMailLayout     = useUIStore((s) => s.setMailLayout);
  const setThemePanelOpen = useUIStore((s) => s.setThemePanelOpen);
  const openEventModal    = useUIStore((s) => s.openEventModal);
  const activeSubscriptions = useUIStore((s) => s.activeCalendarSubscriptions);
  const toggleSubscriptions = useUIStore((s) => s.toggleCalendarSubscriptions);

  const driveCategory = useUIStore((s) => s.driveCategory);
  const setDriveCategory = useUIStore((s) => s.setDriveCategory);

  const slackChannelId    = useUIStore((s) => s.slackChannelId);
  const setSlackChannelId = useUIStore((s) => s.setSlackChannelId);
  const queryClient       = useQueryClient();

  const { data: labels } = useQuery({
    queryKey: ["labels"],
    queryFn: listLabels,
    staleTime: 60_000,
  });

  const isSlack = activeView === "slack";

  const { data: slackTokenInfo } = useQuery({
    queryKey: ["slack-token"],
    queryFn: slackGetToken,
    enabled: isSlack,
    staleTime: 30_000,
  });

  const isSlackConnected = !!slackTokenInfo;
  const workspaceName = slackTokenInfo?.team?.name ?? "Slack Workspace";

  const { data: slackChannelData, isLoading: slackChannelsLoading } = useQuery({
    queryKey: ["slack-channels"],
    queryFn: () => listSlackChannels(),
    enabled: isSlack && isSlackConnected,
    staleTime: 60_000,
  });

  const allSlackChannels = slackChannelData?.channels ?? [];
  const regularChannels = allSlackChannels.filter((c) => !c.isIm && !c.isMpim);
  const dmChannels = allSlackChannels.filter((c) => c.isIm || c.isMpim);

  // Resolve DM peer user IDs to real names (name field is a user ID for IM channels)
  const dmUserIds = dmChannels.map((c) => c.name).filter(Boolean);
  const resolveSlackUser = useSlackUsers(dmUserIds, isSlack && isSlackConnected);

  function slackAvatarColor(seed: string): string {
    const palette = ["#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1"];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  }

  function slackInitials(name: string): string {
    return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  // ── Fireflies ──────────────────────────────────────────────────────────────
  const isFireflies = activeView === "fireflies";
  const firefliesChannelId    = useUIStore((s) => s.firefliesChannelId);
  const setFirefliesChannelId = useUIStore((s) => s.setFirefliesChannelId);

  const { data: firefliesChannels, isLoading: ffChannelsLoading } = useQuery({
    queryKey: ["fireflies-channels"],
    queryFn: listFirefliesChannels,
    enabled: isFireflies,
    staleTime: 5 * 60_000,
  });

  const handleSlackDisconnect = async () => {
    await slackDisconnect();
    setSlackChannelId(null);
    queryClient.invalidateQueries({ queryKey: ["slack-token"] });
    queryClient.invalidateQueries({ queryKey: ["slack-channels"] });
  };

  const userLabels = labels?.filter((l) => {
    const t = l.type ?? l.labelType;
    return t === "user" && !SYSTEM_LABELS.find((s) => s.id === l.id);
  }) ?? [];

  return (
    <div
      className="flex flex-col bg-gray-50 border-r border-gray-200 overflow-hidden relative h-full"
    >
      {/* Logo background at 7% opacity */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url('/logo.jpg')",
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center center",
          opacity: 0.07,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div className="relative z-10 flex flex-col h-full overflow-hidden">
        {/* Navigation Content based on Active View */}
        <div className="flex-1 overflow-y-auto px-2 pt-4 custom-scrollbar">
          {activeView === "mail" && (
            <>
              <div className="px-2 mb-4">
                <button
                  onClick={() => openCompose()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5 active:scale-95 group"
                >
                  <PenSquare className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                  Compose
                </button>
              </div>
              <ul className="space-y-1">
                {SYSTEM_LABELS.map(({ id, name, icon: Icon }) => {
                  const label = labels?.find((l) => l.id === id);
                  const isActive = selectedLabel === id;
                  return (
                    <li key={id}>
                      <button
                        onClick={() => setSelectedLabel(id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                          isActive 
                            ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
                            : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                        )}
                      >
                        <Icon className={cn("w-4.5 h-4.5 transition-transform", isActive ? "scale-110 text-blue-400" : "text-gray-400 group-hover:scale-110")} />
                        <span className="flex-1 text-left">{name}</span>
                        {label?.messagesUnread ? (
                          <span className={cn(
                            "px-2 py-0.5 text-[9px] font-black rounded-full transition-colors",
                            isActive ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
                          )}>
                            {label.messagesUnread}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {userLabels.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-center gap-2 px-3 mb-2">
                    <Tag className="w-3 h-3 text-gray-300" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Labels</span>
                  </div>
                  <ul className="space-y-1">
                    {userLabels.map((label: GmailLabel) => {
                      const isActive = selectedLabel === label.id;
                      return (
                        <li key={label.id}>
                          <button
                            onClick={() => setSelectedLabel(label.id)}
                            className={cn(
                              "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                              isActive 
                                ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
                                : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                            )}
                          >
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" style={{ background: labelColor(label.id) }} />
                            <span className="flex-1 text-left truncate">{label.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          {activeView === "calendar" && (
            <div className="space-y-6">
              <div className="px-2 space-y-2">
                <SidebarActionButton 
                  icon={CalendarPlus} 
                  label="New Event" 
                  onClick={() => openEventModal()} 
                  primary 
                />
                <SidebarActionButton 
                  icon={CheckCircle2} 
                  label="New Task" 
                  onClick={() => openEventModal()} 
                  primary
                />
              </div>
              <div className="px-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Management</span>
                <div className="mt-3 space-y-1">
                  <SidebarNavItem icon={LayoutGrid} label="My Calendars" active />
                  <SidebarNavItem 
                    icon={Star} 
                    label="Subscriptions" 
                    active={activeSubscriptions}
                    onClick={toggleSubscriptions}
                  />
                </div>
              </div>
            </div>
          )}

          {isSlack && (
            <div className="space-y-4">
              {/* Header row with workspace name + disconnect */}
              <div className="px-3 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Slack</span>
                {isSlackConnected && (
                  <button
                    onClick={() => void handleSlackDisconnect()}
                    title="Disconnect Slack"
                    className="p-1.5 rounded-xl text-gray-500 hover:bg-gray-900 hover:text-white transition-all active:scale-95"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {slackChannelsLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                </div>
              )}

              {regularChannels.length > 0 && (
                <div>
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] px-3 mb-2 block">
                    Channels
                  </span>
                  <div className="space-y-0.5">
                    {regularChannels.map((ch: SlackChannel) => {
                      const isActive = slackChannelId === ch.id;
                      const Icon = ch.isPrivate ? Lock : Hash;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => setSlackChannelId(ch.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                            isActive
                              ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                              : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5 flex-shrink-0 transition-transform", isActive ? "text-blue-400 scale-110" : "text-gray-400 group-hover:scale-110")} />
                          <span className="flex-1 text-left truncate">{ch.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {dmChannels.length > 0 && (
                <div>
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] px-3 mb-2 block">
                    Direct Messages
                  </span>
                  <div className="space-y-0.5">
                    {dmChannels.map((ch: SlackChannel) => {
                      const isActive = slackChannelId === ch.id;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => setSlackChannelId(ch.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                            isActive
                              ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                              : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                          )}
                        >
                          <User className={cn("w-3.5 h-3.5 flex-shrink-0 transition-transform", isActive ? "text-blue-400 scale-110" : "text-gray-400 group-hover:scale-110")} />
                          <span className="flex-1 text-left truncate">{resolveSlackUser(ch.name)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {isFireflies && (
            <div className="space-y-4">
              <div className="px-3 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Fireflies</span>
                <a
                  href="https://app.fireflies.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Manage folders in Fireflies"
                  className="p-1.5 rounded-xl text-gray-500 hover:bg-gray-900 hover:text-white transition-all active:scale-95"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* All Meetings */}
              <div className="space-y-0.5">
                <button
                  onClick={() => setFirefliesChannelId(null)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                    firefliesChannelId === null
                      ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                      : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                  )}
                >
                  <Mic2 className={cn("w-3.5 h-3.5 flex-shrink-0 transition-transform", firefliesChannelId === null ? "text-blue-400 scale-110" : "text-gray-400 group-hover:scale-110")} />
                  <span className="flex-1 text-left">All Meetings</span>
                </button>
              </div>

              {/* Channel folders */}
              {ffChannelsLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                </div>
              )}

              {firefliesChannels && firefliesChannels.length > 0 && (
                <div>
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] px-3 mb-2 block">
                    Folders
                  </span>
                  <div className="space-y-0.5">
                    {firefliesChannels.map((ch) => {
                      const isActive = firefliesChannelId === ch.id;
                      return (
                        <button
                          key={ch.id}
                          onClick={() => setFirefliesChannelId(ch.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                            isActive
                              ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                              : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                          )}
                        >
                          <Folder className={cn("w-3.5 h-3.5 flex-shrink-0 transition-transform", isActive ? "text-blue-400 scale-110" : "text-gray-400 group-hover:scale-110")} />
                          <span className="flex-1 text-left truncate">{ch.title}</span>
                          {ch.isPrivate && (
                            <Lock className="w-2.5 h-2.5 flex-shrink-0 text-gray-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="px-3 pt-2">
                <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest leading-relaxed">
                  Folders are managed in the Fireflies web app. Use the ↗ button above.
                </p>
              </div>
            </div>
          )}

          {(activeView === "drive" || activeView === "docs" || activeView === "sheets" || activeView === "slides") && (
            <div className="space-y-6">
              <div className="px-2">
                <SidebarActionButton icon={Plus} label="New Item" onClick={() => {}} primary />
              </div>
              <div className="px-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Exploration</span>
                <div className="mt-3 space-y-1">
                  <SidebarNavItem 
                    icon={Files} 
                    label="All Files" 
                    active={driveCategory === "all"} 
                    onClick={() => setDriveCategory("all")}
                  />
                  <SidebarNavItem 
                    icon={Star} 
                    label="Starred" 
                    active={driveCategory === "starred"} 
                    onClick={() => setDriveCategory("starred")}
                  />
                  <SidebarNavItem 
                    icon={FileText} 
                    label="Recent" 
                    active={driveCategory === "recent"} 
                    onClick={() => setDriveCategory("recent")}
                  />
                  <SidebarNavItem 
                    icon={Users} 
                    label="Shared with me" 
                    active={driveCategory === "shared"} 
                    onClick={() => setDriveCategory("shared")}
                  />
                  <SidebarNavItem 
                    icon={FolderPlus} 
                    label="Shortcuts" 
                    active={driveCategory === "shortcuts"} 
                    onClick={() => setDriveCategory("shortcuts")}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Unified Bottom Section */}
        <div className="border-t border-gray-200/50 p-2 space-y-1 bg-transparent backdrop-blur-md">
          {isSlack && isSlackConnected && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-gray-900/40 border border-white/5 mb-1">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
                style={{ background: slackAvatarColor(workspaceName) }}
              >
                {slackInitials(workspaceName)}
              </div>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider truncate">
                {workspaceName}
              </span>
            </div>
          )}
          <SidebarBottomButton onClick={toggleChatPanel} icon={MessageSquare} label="Messaging" />
          <SidebarBottomButton onClick={() => setThemePanelOpen(true)} icon={Palette} label="Appearance" />
          <SidebarBottomButton onClick={() => setMailLayout(mailLayout === "side" ? "top" : "side")} icon={mailLayout === "side" ? Rows2 : PanelLeft} label={mailLayout === "side" ? "Stacked" : "Split"} />
        </div>
      </div>
    </div>
  );
}

function SidebarActionButton({ icon: Icon, label, onClick, primary }: { icon: any; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group shadow-xl",
        primary 
          ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/10 hover:shadow-[0_0_30px_rgba(255,255,255,0.15)]" 
          : "bg-gray-200/50 text-gray-500 hover:bg-gray-200 hover:text-gray-900"
      )}
    >
      <Icon className={cn("w-4 h-4 transition-transform", primary ? "text-blue-400 group-hover:scale-110" : "text-gray-400 group-hover:scale-110")} />
      {label}
    </button>
  );
}

function SidebarNavItem({ icon: Icon, label, active, onClick }: { icon: any; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
        active 
          ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5" 
          : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
      )}
    >
      <Icon className={cn("w-4.5 h-4.5 transition-transform", active ? "scale-110 text-blue-400" : "text-gray-400 group-hover:scale-110")} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

function SidebarBottomButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:bg-gray-900 hover:text-white hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all duration-200 active:scale-95 group"
    >
      <Icon className="w-4.5 h-4.5 opacity-60 group-hover:opacity-100 group-hover:text-blue-400 transition-all" />
      <span>{label}</span>
    </button>
  );
}

function labelColor(id: string): string {
  const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

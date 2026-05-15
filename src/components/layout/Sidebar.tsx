import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { useQuery } from "@tanstack/react-query";
import { listLabels } from "@/lib/tauri";
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
  LayoutGrid
} from "lucide-react";
import type { GmailLabel } from "@/types";

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

  const { data: labels } = useQuery({
    queryKey: ["labels"],
    queryFn: listLabels,
    staleTime: 60_000,
  });

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

          {(activeView === "drive" || activeView === "docs" || activeView === "sheets" || activeView === "slides") && (
            <div className="space-y-6">
              <div className="px-2">
                <SidebarActionButton icon={Plus} label="New Item" onClick={() => {}} primary />
              </div>
              <div className="px-3">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Exploration</span>
                <div className="mt-3 space-y-1">
                  <SidebarNavItem icon={Star} label="Starred" />
                  <SidebarNavItem icon={FileText} label="Recent" />
                  <SidebarNavItem icon={FolderPlus} label="Shortcuts" />
                  <SidebarNavItem icon={Files} label="All Files" active />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Unified Bottom Section */}
        <div className="border-t border-gray-200/50 p-2 space-y-1 bg-transparent backdrop-blur-md">
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

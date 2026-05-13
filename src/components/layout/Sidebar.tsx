import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { listLabels } from "@/lib/tauri";
import {
  Mail,
  Calendar,
  Inbox,
  Send,
  FileText,
  Trash2,
  Star,
  Tag,
  PenSquare,
  MessageSquare,
  ChevronDown,
  User,
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
  const { activeView, setActiveView, selectedLabel, setSelectedLabel, openCompose, toggleChatPanel } = useUIStore();
  const { currentAccount } = useAuthStore();

  const { data: labels } = useQuery({
    queryKey: ["labels"],
    queryFn: listLabels,
    staleTime: 60_000,
  });

  const userLabels = labels?.filter(
    (l) => l.labelType === "user" && !SYSTEM_LABELS.find((s) => s.id === l.id)
  ) ?? [];

  return (
    <div
      className="flex flex-col bg-gray-50 border-r border-gray-200 overflow-hidden"
      style={{ width: "220px", paddingTop: "28px", flexShrink: 0 }}
    >
      {/* View switcher */}
      <div className="flex gap-1 px-3 mb-2">
        <button
          onClick={() => setActiveView("mail")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors",
            activeView === "mail"
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-gray-200"
          )}
        >
          <Mail className="w-3.5 h-3.5" />
          Mail
        </button>
        <button
          onClick={() => setActiveView("calendar")}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors",
            activeView === "calendar"
              ? "bg-blue-600 text-white"
              : "text-gray-600 hover:bg-gray-200"
          )}
        >
          <Calendar className="w-3.5 h-3.5" />
          Calendar
        </button>
      </div>

      {/* Compose button */}
      <div className="px-3 mb-3">
        <button
          onClick={() => openCompose()}
          className="w-full flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
        >
          <PenSquare className="w-4 h-4" />
          Compose
        </button>
      </div>

      {/* System labels */}
      <nav className="flex-1 overflow-y-auto px-2">
        <ul className="space-y-0.5">
          {SYSTEM_LABELS.map(({ id, name, icon: Icon }) => {
            const label = labels?.find((l) => l.id === id);
            return (
              <li key={id}>
                <button
                  onClick={() => { setSelectedLabel(id); setActiveView("mail"); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                    selectedLabel === id && activeView === "mail"
                      ? "bg-blue-100 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-200"
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{name}</span>
                  {label?.messagesUnread ? (
                    <span className="text-xs font-semibold text-blue-600">
                      {label.messagesUnread}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {/* User labels */}
        {userLabels.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1 px-2.5 mb-1">
              <Tag className="w-3 h-3 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Labels</span>
            </div>
            <ul className="space-y-0.5">
              {userLabels.map((label: GmailLabel) => (
                <li key={label.id}>
                  <button
                    onClick={() => { setSelectedLabel(label.id); setActiveView("mail"); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors",
                      selectedLabel === label.id && activeView === "mail"
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-200"
                    )}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400 flex-shrink-0" />
                    <span className="flex-1 text-left truncate">{label.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-gray-200 p-2 space-y-1">
        <button
          onClick={toggleChatPanel}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-200 transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Chat
        </button>

        {/* Account */}
        {currentAccount && (
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            {currentAccount.pictureUrl ? (
              <img
                src={currentAccount.pictureUrl}
                alt=""
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">
                {currentAccount.displayName}
              </p>
              <p className="text-xs text-gray-500 truncate">{currentAccount.email}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

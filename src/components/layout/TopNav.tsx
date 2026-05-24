import { useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/lib/tauri";
import {
  Bell,
  Calendar,
  Cloud,
  ExternalLink,
  FileText,
  HardDrive,
  LayoutPanelLeft,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquare,
  Mic2,
  Palette,
  Presentation,
  Rows2,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Table2,
  UserCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import appIcon from "@/assets/app-icon.png";

const APPS = [
  { id: "mail", label: "Mail", icon: Mail },
  { id: "calendar", label: "Calendar", icon: Calendar },
  { id: "drive", label: "Drive", icon: HardDrive },
  { id: "docs", label: "Docs", icon: FileText },
  { id: "sheets", label: "Sheets", icon: Table2 },
  { id: "slides", label: "Slides", icon: Presentation },
  { id: "slack", label: "Slack", icon: MessageCircle },
  { id: "fireflies", label: "Fireflies", icon: Mic2 },
] as const;

const ADMIN_APPS = [
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "admin", label: "Admin", icon: ShieldCheck },
] as const;

export default function TopNav() {
  const activeView = useUIStore((s) => s.activeView);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const toggleChatPanel = useUIStore((s) => s.toggleChatPanel);
  const mailLayout = useUIStore((s) => s.mailLayout);
  const setMailLayout = useUIStore((s) => s.setMailLayout);
  const setThemePanelOpen = useUIStore((s) => s.setThemePanelOpen);
  const currentAccount = useAuthStore((s) => s.currentAccount);
  const removeAccount = useAuthStore((s) => s.removeAccount);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
        setAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  const isAdmin = currentAccount?.email?.endsWith("modularmisfits.com");

  const placeholder = {
    mail: "Search messages...",
    calendar: "Search events...",
    drive: "Search files...",
    docs: "Search documents...",
    sheets: "Search spreadsheets...",
    slides: "Search presentations...",
    cloud: "Search resources...",
    admin: "Search users & groups...",
    slack: "Search channels...",
    fireflies: "Search meetings...",
  }[activeView as string] ?? "Search...";

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setAccountOpen(false);
    setSettingsOpen(false);
  };

  const handleSignOut = async () => {
    if (!currentAccount?.email) return;
    try {
      await signOut(currentAccount.email);
      removeAccount(currentAccount.email);
    } catch (e) {
      alert(`Failed to sign out: ${e}`);
    } finally {
      setAccountOpen(false);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex-shrink-0 flex items-center border-b z-30"
      style={{
        height: "56px",
        background: "var(--mm-bg)",
        borderColor: "var(--mm-border)",
        paddingLeft: "80px",
        paddingRight: "16px",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2 mr-6 flex-shrink-0">
        <img src={appIcon} alt="" className="w-6 h-6 rounded-md object-cover" />
        <span className="text-xs font-black uppercase tracking-widest hidden sm:inline" style={{ color: "var(--mm-text-primary)" }}>
          Hub
        </span>
      </div>

      {/* App pill nav */}
      <nav
        className="flex items-center gap-1 px-1.5 py-1 rounded-full flex-shrink-0"
        style={{
          background: "var(--mm-surface)",
          border: "1px solid var(--mm-border)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.35)",
        }}
      >
        {APPS.map((app) => (
          <PillButton
            key={app.id}
            icon={app.icon}
            label={app.label}
            isActive={activeView === app.id}
            onClick={() => setActiveView(app.id as any)}
          />
        ))}
        {isAdmin && (
          <>
            <div className="w-px h-4 mx-0.5 rounded-full" style={{ background: "var(--mm-border)" }} />
            {ADMIN_APPS.map((app) => (
              <PillButton
                key={app.id}
                icon={app.icon}
                label={app.label}
                isActive={activeView === app.id}
                onClick={() => setActiveView(app.id as any)}
              />
            ))}
          </>
        )}
      </nav>

      <div data-tauri-drag-region className="flex-1 h-full" />

      {/* Search + actions */}
      <div className="flex items-center gap-2" ref={menuRef}>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
            style={{ color: "var(--mm-text-muted)" }}
          />
          <input
            type="text"
            placeholder={placeholder}
            className="h-8 pl-9 pr-4 w-52 rounded-full text-xs font-medium focus:outline-none transition-all border"
            style={{
              background: "var(--mm-surface)",
              borderColor: "var(--mm-border)",
              color: "var(--mm-text-primary)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="relative flex items-center gap-0.5">
          <ActionButton icon={Bell} title="Notifications" />
          <ActionButton
            icon={Settings}
            title="Settings"
            active={settingsOpen}
            onClick={() => {
              setSettingsOpen((open) => !open);
              setAccountOpen(false);
            }}
          />

          {settingsOpen && (
            <Dropdown className="right-0 top-10 w-64">
              <MenuHeader title="Settings" subtitle="App preferences" />
              <MenuButton
                icon={Palette}
                label="Appearance"
                detail="Theme and color settings"
                onClick={() => {
                  setThemePanelOpen(true);
                  setSettingsOpen(false);
                }}
              />
              <MenuButton
                icon={MessageSquare}
                label="Messaging panel"
                detail="Show or hide Google Chat"
                onClick={() => {
                  toggleChatPanel();
                  setSettingsOpen(false);
                }}
              />
              <MenuButton
                icon={mailLayout === "side" ? Rows2 : LayoutPanelLeft}
                label="Mail layout"
                detail={mailLayout === "side" ? "Switch to stacked" : "Switch to split"}
                onClick={() => {
                  setMailLayout(mailLayout === "side" ? "top" : "side");
                  setSettingsOpen(false);
                }}
              />
            </Dropdown>
          )}
        </div>

        {/* Avatar */}
        <div className="relative ml-1">
          <button
            onClick={() => {
              setAccountOpen((open) => !open);
              setSettingsOpen(false);
            }}
            className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 block transition-transform active:scale-95"
            style={{ border: "2px solid var(--mm-border)" }}
            title="Google account"
          >
            {currentAccount?.pictureUrl ? (
              <img src={currentAccount.pictureUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-[10px] font-black uppercase"
                style={{ background: "var(--mm-surface)", color: "var(--mm-text-secondary)" }}
              >
                {currentAccount?.displayName?.[0] ?? "?"}
              </div>
            )}
          </button>

          {accountOpen && (
            <Dropdown className="right-0 top-10 w-72">
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--mm-border)" }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--mm-border)" }}>
                    {currentAccount?.pictureUrl ? (
                      <img src={currentAccount.pictureUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-black" style={{ background: "var(--mm-surface)", color: "var(--mm-text-primary)" }}>
                        {currentAccount?.displayName?.[0] ?? "?"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--mm-text-primary)" }}>
                      {currentAccount?.displayName ?? "Google Account"}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--mm-text-muted)" }}>
                      {currentAccount?.email ?? "Not signed in"}
                    </p>
                  </div>
                </div>
              </div>
              <MenuButton
                icon={UserCircle}
                label="Manage your Google Account"
                detail="Profile, personal info, and preferences"
                rightIcon={ExternalLink}
                onClick={() => openExternal("https://myaccount.google.com/")}
              />
              <MenuButton
                icon={Shield}
                label="Security"
                detail="Password, devices, and sign-in"
                rightIcon={ExternalLink}
                onClick={() => openExternal("https://myaccount.google.com/security")}
              />
              <MenuButton
                icon={ShieldCheck}
                label="Data & privacy"
                detail="Privacy controls and data settings"
                rightIcon={ExternalLink}
                onClick={() => openExternal("https://myaccount.google.com/data-and-privacy")}
              />
              <div className="border-t mt-1 pt-1" style={{ borderColor: "var(--mm-border)" }}>
                <MenuButton icon={LogOut} label="Sign out" detail={currentAccount?.email} onClick={handleSignOut} destructive />
              </div>
            </Dropdown>
          )}
        </div>
      </div>
    </div>
  );
}

function PillButton({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: any;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group min-w-[80px] justify-center"
      style={
        isActive
          ? {
              background: "#0F1117",
              color: "#FFFFFF",
              boxShadow: "0 0 20px rgba(255, 255, 255, 0.12), inset 0 0 0 1px rgba(255, 255, 255, 0.05)",
            }
          : {
              color: "var(--mm-text-muted)",
              background: "transparent",
            }
      }
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--mm-text-primary)";
          e.currentTarget.style.background = "var(--mm-surface)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.color = "var(--mm-text-muted)";
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <Icon className={cn("w-3.5 h-3.5 flex-shrink-0 transition-transform", isActive ? "scale-110 text-blue-400" : "group-hover:scale-110")} />
      <span>{label}</span>
    </button>
  );
}

function ActionButton({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: any;
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-2 rounded-full transition-colors"
      style={{ color: active ? "var(--mm-text-primary)" : "var(--mm-text-muted)", background: active ? "var(--mm-surface)" : "" }}
      title={title}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--mm-surface)";
        e.currentTarget.style.color = "var(--mm-text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? "var(--mm-surface)" : "";
        e.currentTarget.style.color = active ? "var(--mm-text-primary)" : "var(--mm-text-muted)";
      }}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

function Dropdown({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`absolute z-50 rounded-2xl border shadow-2xl overflow-hidden py-1 ${className ?? ""}`}
      style={{ background: "var(--mm-bg)", borderColor: "var(--mm-border)", boxShadow: "0 18px 50px rgba(0,0,0,0.35)" }}
    >
      {children}
    </div>
  );
}

function MenuHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: "var(--mm-border)" }}>
      <p className="text-sm font-bold" style={{ color: "var(--mm-text-primary)" }}>{title}</p>
      {subtitle && <p className="text-xs" style={{ color: "var(--mm-text-muted)" }}>{subtitle}</p>}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  detail,
  rightIcon: RightIcon,
  destructive,
  onClick,
}: {
  icon: any;
  label: string;
  detail?: string;
  rightIcon?: any;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: destructive ? "var(--mm-error)" : "var(--mm-text-secondary)" }} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate" style={{ color: destructive ? "var(--mm-error)" : "var(--mm-text-primary)" }}>
          {label}
        </span>
        {detail && <span className="block text-[11px] truncate" style={{ color: "var(--mm-text-muted)" }}>{detail}</span>}
      </span>
      {RightIcon && <RightIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mm-text-muted)" }} />}
    </button>
  );
}

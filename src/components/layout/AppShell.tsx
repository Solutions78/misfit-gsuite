import { useEffect, useRef, useState } from "react";
import { dbg } from "@/lib/debugLog";
import { listen } from "@tauri-apps/api/event";
import { useUIStore } from "@/store/uiStore";
import { useQueryClient } from "@tanstack/react-query";
import Sidebar from "./Sidebar";
import RightPanel from "./RightPanel";
import TitleBar from "./TitleBar";
import MailView from "@/components/mail/MailView";
import CalendarView from "@/components/calendar/CalendarView";
import ComposeModal from "@/components/mail/ComposeModal";
import GeminiButton from "@/components/gemini/GeminiButton";
import GeminiDrawer from "@/components/gemini/GeminiDrawer";
import ThemePanel from "@/components/layout/ThemePanel";
import { syncInbox, drainPendingOps } from "@/lib/tauri";
import DebugOverlay from "@/components/debug/DebugOverlay";

export default function AppShell() {
  const renderCount = useRef(0);
  renderCount.current += 1;
  dbg("AppShell", `render #${renderCount.current}`);

  const activeView      = useUIStore((s) => s.activeView);
  const chatPanelOpen   = useUIStore((s) => s.chatPanelOpen);
  const geminiOpen      = useUIStore((s) => s.geminiOpen);
  const composeState    = useUIStore((s) => s.composeState);
  const darkMode        = useUIStore((s) => s.darkMode);
  const sidebarWidth    = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const chatPanelWidth  = useUIStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useUIStore((s) => s.setChatPanelWidth);
  const theme           = useUIStore((s) => s.theme);
  const setTheme        = useUIStore((s) => s.setTheme);
  const queryClient = useQueryClient();

  const [draggingSidebar, setDraggingSidebar] = useState(false);
  const [draggingChat, setDraggingChat] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Invalidate thread list when background sync completes
  useEffect(() => {
    const unlisten = listen("mail::synced", () => {
      queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [queryClient]);

  // Also invalidate on the legacy push-notification event
  useEffect(() => {
    const unlisten = listen("mail::new_messages", () => {
      queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [queryClient]);

  // Drain queued offline operations when the browser reports we're back online
  useEffect(() => {
    const handler = () => {
      drainPendingOps().then((count) => {
        if (count > 0) {
          queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
        }
      });
    };
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  }, [queryClient]);

  // Apply dark mode class to body (legacy, kept for body.dark selectors)
  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Apply theme to <html> and listen for OS color-scheme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const current = useUIStore.getState().theme;
      const family = current.replace(/-dark$|-light$/, "");
      setTheme(`${family}-${e.matches ? "dark" : "light"}` as typeof theme);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [setTheme]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (draggingSidebar) {
      const newW = Math.max(160, Math.min(320, e.clientX - rect.left));
      setSidebarWidth(newW);
    }
    if (draggingChat) {
      const newW = Math.max(220, Math.min(480, rect.right - e.clientX));
      setChatPanelWidth(newW);
    }
  };

  const handleMouseUp = () => {
    setDraggingSidebar(false);
    setDraggingChat(false);
  };

  return (
    <div
      ref={containerRef}
      className="flex h-screen bg-gray-100 overflow-hidden"
      style={{ cursor: draggingSidebar || draggingChat ? "col-resize" : undefined }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <TitleBar />

      {/* Left sidebar — resizable */}
      <div className="flex-shrink-0 overflow-hidden" style={{ width: sidebarWidth }}>
        <Sidebar />
      </div>

      {/* Sidebar resize handle */}
      <div
        className={`resize-handle w-1${draggingSidebar ? " dragging" : ""}`}
        onMouseDown={() => setDraggingSidebar(true)}
      />

      {/* Main content */}
      <main className="flex-1 flex min-w-0 overflow-hidden">
        {activeView === "mail" ? <MailView /> : <CalendarView />}
      </main>

      {/* Chat panel resize handle — only visible when panel is open */}
      {chatPanelOpen && (
        <div
          className={`resize-handle w-1${draggingChat ? " dragging" : ""}`}
          onMouseDown={() => setDraggingChat(true)}
        />
      )}

      {/* Right Chat panel — resizable, bounded */}
      <div
        className="flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: chatPanelOpen ? chatPanelWidth : 0, minWidth: 0, maxWidth: "40vw" }}
      >
        {chatPanelOpen && <RightPanel />}
      </div>

      {/* Compose modal */}
      {composeState && <ComposeModal />}

      {/* Gemini floating button + drawer */}
      <GeminiButton />
      {geminiOpen && <GeminiDrawer />}

      {/* Theme panel (portal-rendered, triggered from Sidebar) */}
      <ThemePanel />

      {/* Debug overlay — remove when click bug is fixed */}
      <DebugOverlay />
    </div>
  );
}

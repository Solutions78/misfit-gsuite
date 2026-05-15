import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useUIStore } from "@/store/uiStore";
import { useQueryClient } from "@tanstack/react-query";
import TopNav from "./TopNav";
import Sidebar from "./Sidebar";
import RightPanel from "./RightPanel";
import MailView from "@/components/mail/MailView";
import CalendarView from "@/components/calendar/CalendarView";
import DriveView from "@/components/drive/DriveView";
import DocsView from "@/components/drive/DocsView";
import GeminiDocsPanel from "@/components/gemini/GeminiDocsPanel";
import ConsoleView from "@/components/layout/ConsoleView";
import ComposeModal from "@/components/mail/ComposeModal";
import GeminiButton from "@/components/gemini/GeminiButton";
import GeminiDrawer from "@/components/gemini/GeminiDrawer";
import ThemePanel from "@/components/layout/ThemePanel";
import DebugOverlay from "@/components/debug/DebugOverlay";
import { syncInbox, drainPendingOps } from "@/lib/tauri";
import { Sparkles } from "lucide-react";

const IS_DEV = import.meta.env.DEV;

export default function AppShell() {
  const activeView      = useUIStore((s) => s.activeView);
  const chatPanelOpen   = useUIStore((s) => s.chatPanelOpen);
  const geminiOpen      = useUIStore((s) => s.geminiOpen);
  const composeState    = useUIStore((s) => s.composeState);
  const sidebarWidth    = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const chatPanelWidth  = useUIStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useUIStore((s) => s.setChatPanelWidth);
  const theme           = useUIStore((s) => s.theme);
  const setTheme        = useUIStore((s) => s.setTheme);
  const queryClient     = useQueryClient();

  const [draggingSidebar, setDraggingSidebar] = useState(false);
  const [draggingChat, setDraggingChat] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Invalidate thread list when background sync completes
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | undefined;

    listen("mail::synced", () => {
      queryClient.invalidateQueries({ queryKey: ["thread-summaries"] });
    }).then((fn) => {
      if (!isMounted) fn();
      else unlisten = fn;
    });

    return () => {
      isMounted = false;
      unlisten?.();
    };
  }, [queryClient]);

  // Drain queued offline operations when the browser reports we're back online
  useEffect(() => {
    syncInbox();
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

  // Apply theme to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (draggingSidebar) {
      const newW = Math.max(160, Math.min(400, e.clientX - rect.left));
      setSidebarWidth(newW);
    }
    if (draggingChat) {
      const newW = Math.max(220, Math.min(600, rect.right - e.clientX));
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
      className="flex flex-col h-screen w-screen overflow-hidden font-sans antialiased select-none"
      style={{ background: "var(--mm-bg)" }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* TopNav — full width, edge to edge */}
      <TopNav />

      {/* Content row: Sidebar + main panes */}
      <div className="flex flex-1 overflow-hidden">
        {/* Pane 1: Sidebar */}
        <div style={{ width: sidebarWidth }} className="flex-shrink-0 relative">
          <Sidebar />
          <div
            onMouseDown={() => setDraggingSidebar(true)}
            className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/20 transition-colors z-20 ${draggingSidebar ? "bg-blue-500/40" : ""}`}
          />
        </div>

        {/* Panes 2 & 3: Selection & Preview */}
        <main className="flex-1 min-w-0 relative z-10 overflow-hidden" style={{ background: "var(--mm-surface)" }}>
          {activeView === "mail" && <MailView />}
          {activeView === "calendar" && <CalendarView />}
          {activeView === "drive" && <DriveView />}
          {activeView === "docs" && <DocsView />}
          {(activeView === "sheets" || activeView === "slides") && <DriveView filterType={activeView} />}
          {(activeView === "cloud" || activeView === "admin") && <ConsoleView type={activeView} />}
          {activeView === "chat-test" && (
            <div className="h-full flex items-center justify-center text-gray-300 font-black uppercase tracking-[0.3em] italic">
              Debug: Chat API Test
            </div>
          )}
        </main>

        {/* Pane 4: Chat (Right Panel) */}
        {chatPanelOpen && activeView !== "docs" && (
          <div style={{ width: chatPanelWidth }} className="flex-shrink-0 relative">
            <div
              onMouseDown={() => setDraggingChat(true)}
              className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/20 transition-colors z-20 ${draggingChat ? "bg-blue-500/40" : ""}`}
            />
            <RightPanel />
          </div>
        )}
        {activeView === "docs" && <GeminiDocsPanel />}
      </div>

      {/* Global Overlays */}
      {composeState && <ComposeModal />}
      <GeminiButton />
      {geminiOpen && <GeminiDrawer />}
      <ThemePanel />
      {IS_DEV && <DebugOverlay />}
    </div>
  );
}
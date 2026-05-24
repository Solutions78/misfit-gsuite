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
import ConsoleView from "@/components/layout/ConsoleView";
import SlackView from "@/components/slack/SlackView";
import FirefliesView from "@/components/fireflies/FirefliesView";
import ComposeModal from "@/components/mail/ComposeModal";
import GeminiButton from "@/components/gemini/GeminiButton";
import GeminiDrawer from "@/components/gemini/GeminiDrawer";
import ThemePanel from "@/components/layout/ThemePanel";
import SessionTimer from "@/components/auth/SessionTimer";
import { syncInbox, drainPendingOps } from "@/lib/tauri";
import { Sparkles } from "lucide-react";

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
  const fontScale       = useUIStore((s) => s.fontScale);
  const queryClient     = useQueryClient();

  const FONT_SCALE_PX: Record<string, string> = { sm: "13px", md: "15px", lg: "17px", xl: "19px" };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme.endsWith("-dark")) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.fontSize = FONT_SCALE_PX[fontScale] ?? "15px";
  }, [fontScale]);

  const [draggingSidebar, setDraggingSidebar] = useState(false);
  const [draggingChat, setDraggingChat] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDriveView      = activeView === "drive" || activeView === "docs" || activeView === "sheets" || activeView === "slides";
  const isSlackView      = activeView === "slack";
  const isFirefliesView  = activeView === "fireflies";

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

  const onMouseMove = (e: React.MouseEvent) => {
    if (draggingSidebar) {
      const newWidth = Math.max(160, Math.min(400, e.clientX));
      setSidebarWidth(newWidth);
    }
    if (draggingChat) {
      const newWidth = Math.max(200, Math.min(500, window.innerWidth - e.clientX));
      setChatPanelWidth(newWidth);
    }
  };

  const onMouseUp = () => {
    setDraggingSidebar(false);
    setDraggingChat(false);
  };

  return (
    <div
      ref={containerRef}
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "var(--c-bg)" }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <TopNav />

      <div className="flex-1 flex overflow-hidden pt-14 relative">
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
          {activeView === "slack" && <SlackView />}
          {activeView === "fireflies" && <FirefliesView />}
          {activeView === "chat-test" && (
            <div className="h-full flex items-center justify-center text-gray-300 font-black uppercase tracking-[0.3em] italic">
              Debug: Chat API Test
            </div>
          )}
        </main>

        {/* Pane 4: Chat or Gemini (Right Panel) */}
        {chatPanelOpen && (
          <div style={{ width: chatPanelWidth }} className="flex-shrink-0 relative">
            <div
              onMouseDown={() => setDraggingChat(true)}
              className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/20 transition-colors z-20 ${draggingChat ? "bg-blue-500/40" : ""}`}
            />
            {(isDriveView || isSlackView || isFirefliesView) ? (
               <div className="h-full bg-gray-50 flex flex-col border-l border-white/5">
                  <GeminiDrawer isIntegrated />
               </div>
            ) : (
               <RightPanel />
            )}
          </div>
        )}
      </div>

      {/* Global Overlays */}
      {composeState && <ComposeModal />}
      {(!isDriveView && !isSlackView && !isFirefliesView) && <GeminiButton />}
      {(geminiOpen && !isDriveView && !isSlackView && !isFirefliesView) && <GeminiDrawer />}
      <ThemePanel />
      <SessionTimer />
    </div>
  );
}

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useUIStore } from "@/store/uiStore";
import { useQueryClient } from "@tanstack/react-query";
import Sidebar from "./Sidebar";
import RightPanel from "./RightPanel";
import MailView from "@/components/mail/MailView";
import CalendarView from "@/components/calendar/CalendarView";
import ComposeModal from "@/components/mail/ComposeModal";
import GeminiButton from "@/components/gemini/GeminiButton";
import GeminiDrawer from "@/components/gemini/GeminiDrawer";

export default function AppShell() {
  const { activeView, chatPanelOpen, geminiOpen, composeState } = useUIStore();
  const queryClient = useQueryClient();

  // Listen for new mail push events to invalidate the inbox query
  useEffect(() => {
    const unlisten = listen("mail::new_messages", () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [queryClient]);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* macOS traffic light drag region */}
      <div className="titlebar-drag-region absolute top-0 left-0 right-0 z-50" />

      {/* Left sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className="flex-1 flex min-w-0 overflow-hidden">
        {activeView === "mail" ? <MailView /> : <CalendarView />}
      </main>

      {/* Right Chat panel */}
      <div
        className="flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: chatPanelOpen ? "280px" : "0px" }}
      >
        {chatPanelOpen && <RightPanel />}
      </div>

      {/* Compose modal */}
      {composeState && <ComposeModal />}

      {/* Gemini floating button + drawer */}
      <GeminiButton />
      {geminiOpen && <GeminiDrawer />}
    </div>
  );
}

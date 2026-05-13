import { create } from "zustand";

type ActiveView = "mail" | "calendar";
type ComposeMode = "new" | "reply" | "forward" | null;

interface ComposeState {
  mode: ComposeMode;
  to?: string;
  subject?: string;
  body?: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

interface UIStore {
  activeView: ActiveView;
  selectedThreadId: string | null;
  selectedLabel: string;
  chatPanelOpen: boolean;
  geminiOpen: boolean;
  geminiTab: "chat" | "reply" | "organize";
  composeState: ComposeState | null;
  searchQuery: string;

  setActiveView: (view: ActiveView) => void;
  setSelectedThread: (id: string | null) => void;
  setSelectedLabel: (label: string) => void;
  setChatPanelOpen: (open: boolean) => void;
  toggleChatPanel: () => void;
  setGeminiOpen: (open: boolean) => void;
  toggleGemini: () => void;
  setGeminiTab: (tab: "chat" | "reply" | "organize") => void;
  openCompose: (state?: Partial<ComposeState>) => void;
  closeCompose: () => void;
  setSearchQuery: (q: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeView: "mail",
  selectedThreadId: null,
  selectedLabel: "INBOX",
  chatPanelOpen: true,
  geminiOpen: false,
  geminiTab: "chat",
  composeState: null,
  searchQuery: "",

  setActiveView: (activeView) => set({ activeView }),
  setSelectedThread: (selectedThreadId) => set({ selectedThreadId }),
  setSelectedLabel: (selectedLabel) => set({ selectedLabel, selectedThreadId: null }),
  setChatPanelOpen: (chatPanelOpen) => set({ chatPanelOpen }),
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  setGeminiOpen: (geminiOpen) => set({ geminiOpen }),
  toggleGemini: () => set((s) => ({ geminiOpen: !s.geminiOpen })),
  setGeminiTab: (geminiTab) => set({ geminiTab }),
  openCompose: (state) =>
    set({ composeState: { mode: "new", ...state } }),
  closeCompose: () => set({ composeState: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));

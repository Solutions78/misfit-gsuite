import { create } from "zustand";
import { dbg } from "@/lib/debugLog";

type ActiveView = "mail" | "calendar";
type ComposeMode = "new" | "reply" | "forward" | null;
export type SortField = "date" | "sender";
export type SortDir = "asc" | "desc";
export type MailLayout = "side" | "top";
export type ThemeKey =
  | "mm-cool-dark" | "mm-cool-light"
  | "mm-neutral-dark" | "mm-neutral-light"
  | "mm-warm-dark" | "mm-warm-light";

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
  darkMode: boolean;
  sortField: SortField;
  sortDir: SortDir;
  sidebarWidth: number;
  chatPanelWidth: number;
  mailLayout: MailLayout;
  theme: ThemeKey;
  themePanelOpen: boolean;

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
  toggleDarkMode: () => void;
  setSortField: (field: SortField) => void;
  setSortDir: (dir: SortDir) => void;
  setSidebarWidth: (w: number) => void;
  setChatPanelWidth: (w: number) => void;
  setMailLayout: (layout: MailLayout) => void;
  setTheme: (theme: ThemeKey) => void;
  setThemePanelOpen: (open: boolean) => void;
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
  darkMode: false,
  sortField: "date",
  sortDir: "desc",
  sidebarWidth: 220,
  chatPanelWidth: 280,
  mailLayout: "side",
  themePanelOpen: false,
  theme: (() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "mm-neutral-dark" : "mm-neutral-light";
  })(),

  setActiveView: (activeView) => set({ activeView }),
  setSelectedThread: (selectedThreadId) => {
    dbg("uiStore.setSelectedThread", `→ ${selectedThreadId}`, new Error().stack?.split("\n").slice(1, 4).join(" | "));
    set({ selectedThreadId });
  },
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
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setSortField: (sortField) => set({ sortField }),
  setSortDir: (sortDir) => set({ sortDir }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setChatPanelWidth: (chatPanelWidth) => set({ chatPanelWidth }),
  setMailLayout: (mailLayout) => set({ mailLayout }),
  setTheme: (theme) => set({ theme }),
  setThemePanelOpen: (themePanelOpen) => set({ themePanelOpen }),
}));

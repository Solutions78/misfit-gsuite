import { create } from "zustand";

type ActiveView = "mail" | "calendar" | "drive" | "docs" | "sheets" | "slides" | "cloud" | "admin" | "chat-test";
type ComposeMode = "new" | "reply" | "forward" | null;
export type SortField = "date" | "sender";
export type SortDir = "asc" | "desc";
export type MailLayout = "side" | "top";
export type InboxTab = "focused" | "other";
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
  inboxTab: InboxTab;
  theme: ThemeKey;
  themePanelOpen: boolean;
  eventModalOpen: boolean;
  eventModalData: { event: any; initialDate: Date | null } | null;
  activeCalendarSubscriptions: boolean;

  setActiveView: (view: ActiveView) => void;
  setInboxTab: (tab: InboxTab) => void;
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
  openEventModal: (event?: any, initialDate?: Date) => void;
  closeEventModal: () => void;
  toggleCalendarSubscriptions: () => void;
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
  inboxTab: "focused",
  themePanelOpen: false,
  eventModalOpen: false,
  eventModalData: null,
  activeCalendarSubscriptions: false,
  theme: (() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "mm-neutral-dark" : "mm-neutral-light";
  })(),

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
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
  setSortField: (sortField) => set({ sortField }),
  setSortDir: (sortDir) => set({ sortDir }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setChatPanelWidth: (chatPanelWidth) => set({ chatPanelWidth }),
  setMailLayout: (mailLayout) => set({ mailLayout }),
  setInboxTab: (inboxTab) => set({ inboxTab, selectedThreadId: null }),
  setTheme: (theme) => set({ theme }),
  setThemePanelOpen: (themePanelOpen) => set({ themePanelOpen }),
  openEventModal: (event, initialDate) => set({ eventModalOpen: true, eventModalData: { event, initialDate: initialDate ?? null } }),
  closeEventModal: () => set({ eventModalOpen: false, eventModalData: null }),
  toggleCalendarSubscriptions: () => set((s) => ({ activeCalendarSubscriptions: !s.activeCalendarSubscriptions })),
}));

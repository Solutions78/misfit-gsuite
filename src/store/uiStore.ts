import { create } from "zustand";

type ActiveView = "mail" | "calendar" | "drive" | "docs" | "sheets" | "slides" | "cloud" | "admin" | "chat-test" | "slack" | "fireflies" | "knowledge";
type ComposeMode = "new" | "reply" | "forward" | null;
export type SortField = "date" | "sender";
export type SortDir = "asc" | "desc";
export type MailLayout = "side" | "top";
export type InboxTab = "focused" | "other";
export type ThemeKey =
  | "mm-cool-dark" | "mm-cool-light"
  | "mm-neutral-dark" | "mm-neutral-light"
  | "mm-warm-dark" | "mm-warm-light"
  | "mm-custom-dark" | "mm-custom-light";

export type FontScale = "sm" | "md" | "lg" | "xl";

const THEME_STORAGE_KEY = "misfit-gsuite:theme";
const FONT_SCALE_STORAGE_KEY = "misfit-gsuite:font-scale";

const THEME_KEYS: ThemeKey[] = [
  "mm-cool-dark",
  "mm-cool-light",
  "mm-neutral-dark",
  "mm-neutral-light",
  "mm-warm-dark",
  "mm-warm-light",
  "mm-custom-dark",
  "mm-custom-light",
];

const FONT_SCALES: FontScale[] = ["sm", "md", "lg", "xl"];

function readStoredValue<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

function writeStoredValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

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
  driveCategory: "all" | "starred" | "recent" | "shared" | "shortcuts";
  driveFolderId: string;
  openDocId: string | null;
  openDocMimeType: string | null;
  activeDriveId?: string;
  slackChannelId: string | null;
  firefliesChannelId: string | null;
  fontScale: FontScale;

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
  setDriveCategory: (cat: "all" | "starred" | "recent" | "shared" | "shortcuts") => void;
  setDriveFolderId: (id: string) => void;
  setOpenDoc: (id: string | null, mimeType?: string | null) => void;
  setActiveDriveId: (id?: string) => void;
  setSlackChannelId: (id: string | null) => void;
  setFirefliesChannelId: (id: string | null) => void;
  setFontScale: (scale: FontScale) => void;
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
  driveCategory: "all",
  driveFolderId: "root",
  openDocId: null,
  openDocMimeType: null,
  activeDriveId: undefined,
  slackChannelId: null,
  firefliesChannelId: null,
  fontScale: readStoredValue(FONT_SCALE_STORAGE_KEY, FONT_SCALES, "md"),
  theme: readStoredValue(THEME_STORAGE_KEY, THEME_KEYS, "mm-neutral-dark"),

  setActiveView: (activeView) => set({ activeView }),
  setSelectedThread: (selectedThreadId) => set({ selectedThreadId }),
  setSelectedLabel: (selectedLabel) => set({ selectedLabel, selectedThreadId: null }),
  setChatPanelOpen: (chatPanelOpen) => set({ chatPanelOpen }),
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),
  setGeminiOpen: (geminiOpen) => set({ geminiOpen }),
  toggleGemini: () => set((s) => ({ geminiOpen: !s.geminiOpen })),
  setGeminiTab: (tab) => set({ geminiTab: tab }),
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
  setTheme: (theme) => {
    writeStoredValue(THEME_STORAGE_KEY, theme);
    set({ theme });
  },
  setThemePanelOpen: (themePanelOpen) => set({ themePanelOpen }),
  openEventModal: (event, initialDate) => set({ eventModalOpen: true, eventModalData: { event, initialDate: initialDate ?? null } }),
  closeEventModal: () => set({ eventModalOpen: false, eventModalData: null }),
  toggleCalendarSubscriptions: () => set((s) => ({ activeCalendarSubscriptions: !s.activeCalendarSubscriptions })),
  setDriveCategory: (driveCategory) => set({ driveCategory, driveFolderId: "root", activeDriveId: undefined }),
  setDriveFolderId: (driveFolderId) => set({ driveFolderId }),
  setOpenDoc: (openDocId, openDocMimeType = null) => set({ openDocId, openDocMimeType }),
  setActiveDriveId: (activeDriveId) => set({ activeDriveId, driveFolderId: activeDriveId || "root", driveCategory: "all" }),
  setSlackChannelId: (slackChannelId) => set({ slackChannelId }),
  setFirefliesChannelId: (firefliesChannelId) => set({ firefliesChannelId }),
  setFontScale: (fontScale) => {
    writeStoredValue(FONT_SCALE_STORAGE_KEY, fontScale);
    set({ fontScale });
  },
}));

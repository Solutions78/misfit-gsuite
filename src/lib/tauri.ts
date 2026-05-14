import { invoke } from "@tauri-apps/api/core";
import type {
  AccountInfo,
  ThreadListResponse,
  ThreadSummaryPage,
  GmailThread,
  GmailMessage,
  GmailLabel,
  SentMessage,
  CalendarItem,
  CalendarEvent,
  NewEvent,
  Space,
  ChatMessagePage,
  ChatMessage,
  GeminiChatRequest,
} from "@/types";

// ── Auth ──────────────────────────────────────────────────────────────────

export const startOAuthFlow = () =>
  invoke<AccountInfo>("start_oauth_flow");

export const getCurrentAccount = () =>
  invoke<AccountInfo | null>("get_current_account");

export const listAccounts = () =>
  invoke<AccountInfo[]>("list_accounts");

export const switchAccount = (email: string) =>
  invoke<AccountInfo>("switch_account", { email });

export const signOut = (email: string) =>
  invoke<void>("sign_out", { email });

// ── Gmail ─────────────────────────────────────────────────────────────────

export const listThreads = (params: {
  labelIds: string[];
  pageToken?: string;
  maxResults?: number;
}) => invoke<ThreadListResponse>("list_threads", { params });

export const listThreadSummaries = (params: {
  labelIds: string[];
  pageToken?: string;
  maxResults?: number;
}) => invoke<ThreadSummaryPage>("list_thread_summaries", { params });

export const searchThreadSummaries = (query: string, pageToken?: string) =>
  invoke<ThreadSummaryPage>("search_thread_summaries", { query, pageToken });

export const getThread = (threadId: string) =>
  invoke<GmailThread>("get_thread", { threadId });

export const getMessage = (msgId: string) =>
  invoke<GmailMessage>("get_message", { msgId });

export const searchThreads = (query: string, pageToken?: string) =>
  invoke<ThreadListResponse>("search_threads", { query, pageToken });

export const sendMessage = (params: {
  to: string;
  subject: string;
  htmlBody: string;
  inReplyTo?: string;
  references?: string;
}) => invoke<SentMessage>("send_message", params);

export const createDraft = (params: {
  to: string;
  subject: string;
  htmlBody: string;
  inReplyTo?: string;
}) => invoke<unknown>("create_draft", params);

export const modifyMessage = (
  msgId: string,
  addLabels: string[],
  removeLabels: string[]
) => invoke<void>("modify_message", { msgId, addLabels, removeLabels });

export const trashMessage = (msgId: string) =>
  invoke<void>("trash_message", { msgId });

export const starMessage = (msgId: string, starred: boolean) =>
  invoke<void>("star_message", { msgId, starred });

export const archiveMessage = (msgId: string) =>
  invoke<void>("archive_message", { msgId });

export const markRead = (msgId: string, read: boolean) =>
  invoke<void>("mark_read", { msgId, read });

export const listLabels = () => invoke<GmailLabel[]>("list_labels");

export const createLabel = (name: string) =>
  invoke<GmailLabel>("create_label", { name });

export const getAttachment = (msgId: string, attachmentId: string) =>
  invoke<string>("get_attachment", { msgId, attachmentId });

export const syncInbox = () => invoke<void>("sync_inbox");

export const drainPendingOps = () => invoke<number>("drain_pending_ops");

// ── Calendar ──────────────────────────────────────────────────────────────

export const listCalendars = () =>
  invoke<CalendarItem[]>("list_calendars");

export const listEvents = (params: {
  calendarId: string;
  timeMin: string;
  timeMax: string;
  maxResults?: number;
}) => invoke<CalendarEvent[]>("list_events", params);

export const createEvent = (calendarId: string, event: NewEvent) =>
  invoke<CalendarEvent>("create_event", { calendarId, event });

export const updateEvent = (
  calendarId: string,
  eventId: string,
  event: Partial<CalendarEvent>
) => invoke<CalendarEvent>("update_event", { calendarId, eventId, event });

export const deleteEvent = (calendarId: string, eventId: string) =>
  invoke<void>("delete_event", { calendarId, eventId });

export const respondToEvent = (
  calendarId: string,
  eventId: string,
  responseStatus: "accepted" | "declined" | "tentative"
) => invoke<CalendarEvent>("respond_to_event", { calendarId, eventId, responseStatus });

// ── Chat ──────────────────────────────────────────────────────────────────

export const listSpaces = () => invoke<Space[]>("list_spaces");

export const listChatMessages = (
  spaceName: string,
  pageToken?: string,
  pageSize?: number
) => invoke<ChatMessagePage>("list_chat_messages", { spaceName, pageToken, pageSize });

export const sendChatMessage = (spaceName: string, text: string) =>
  invoke<ChatMessage>("send_chat_message", { spaceName, text });

// ── Gemini ────────────────────────────────────────────────────────────────

export const geminiChat = (request: GeminiChatRequest) =>
  invoke<string>("gemini_chat", { request });

export const generateEmailReply = (threadId: string, instructions?: string) =>
  invoke<string>("generate_email_reply", { threadId, instructions });

export const organizeInbox = () => invoke<string>("organize_inbox");

export const generateDailyReport = () => invoke<string>("generate_daily_report");

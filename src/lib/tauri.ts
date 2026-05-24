import { invoke } from "@tauri-apps/api/core";
import { dbg } from "./debugLog";
import type {
  AccountInfo,
  ThreadListResponse,
  ThreadSummaryPage,
  GmailThread,
  GmailMessage,
  GmailLabel,
  SentMessage,
  EmailView,
  CalendarItem,
  CalendarEvent,
  NewEvent,
  Space,
  Membership,
  Attachment,
  UploadAttachmentResponse,
  ChatMessagePage,
  ChatMessage,
  ContactSuggestion,
  GeminiChatRequest,
  GeminiMessage,
  DriveFile,
  DriveFileListResponse,
  SharedDriveListResponse,
  DocContent,
  SlackTokenInfo,
  SlackChannelListResponse,
  SlackMessageListResponse,
  SlackUser,
  FirefliesMeeting,
  FirefliesChannel,
} from "@/types";

const IS_DEV = import.meta.env.DEV;

async function loggedInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (IS_DEV) dbg("Tauri", `invoke: ${command}`, args ?? {});
  try {
    const result = await invoke<T>(command, args);
    if (IS_DEV) dbg("Tauri", `success: ${command}`, result);
    return result;
  } catch (error) {
    if (IS_DEV) dbg("Tauri", `error: ${command}`, error);
    throw error;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────

export const startOAuthFlow = () =>
  loggedInvoke<AccountInfo>("start_oauth_flow");

export const getCurrentAccount = () =>
  loggedInvoke<AccountInfo | null>("get_current_account");

export const listAccounts = () =>
  loggedInvoke<AccountInfo[]>("list_accounts");

export const switchAccount = (email: string) =>
  loggedInvoke<AccountInfo>("switch_account", { email });

export const signOut = (email: string) =>
  loggedInvoke<void>("sign_out", { email });

// ── Gmail ─────────────────────────────────────────────────────────────────

export const listThreads = (params: {
  labelIds: string[];
  pageToken?: string;
  maxResults?: number;
}) => loggedInvoke<ThreadListResponse>("list_threads", { params });

export const listThreadSummaries = (params: {
  labelIds: string[];
  pageToken?: string;
  maxResults?: number;
}) => loggedInvoke<ThreadSummaryPage>("list_thread_summaries", { params });

export const searchThreadSummaries = (query: string, pageToken?: string) =>
  loggedInvoke<ThreadSummaryPage>("search_thread_summaries", { query, pageToken });

export const getThread = (threadId: string) =>
  loggedInvoke<GmailThread>("get_thread", { threadId });

export const getEmailView = (msgId: string) =>
  loggedInvoke<EmailView>("get_email_view", { msgId });

export const getThreadView = (threadId: string) =>
  loggedInvoke<EmailView[]>("get_thread_view", { threadId });

export const getMessage = (msgId: string) =>
  loggedInvoke<GmailMessage>("get_message", { msgId });

export const searchThreads = (query: string, pageToken?: string) =>
  loggedInvoke<ThreadListResponse>("search_threads", { query, pageToken });

export const sendMessage = (params: {
  to: string;
  subject: string;
  htmlBody: string;
  inReplyTo?: string;
  references?: string;
}) => loggedInvoke<SentMessage>("send_message", params);

export const createDraft = (params: {
  to: string;
  subject: string;
  htmlBody: string;
  inReplyTo?: string;
}) => loggedInvoke<unknown>("create_draft", params);

export const modifyMessage = (
  msgId: string,
  addLabels: string[],
  removeLabels: string[]
) => loggedInvoke<void>("modify_message", { msgId, addLabels, removeLabels });

export const trashMessage = (msgId: string) =>
  loggedInvoke<void>("trash_message", { msgId });

export const starMessage = (msgId: string, starred: boolean) =>
  loggedInvoke<void>("star_message", { msgId, starred });

export const archiveMessage = (msgId: string) =>
  loggedInvoke<void>("archive_message", { msgId });

export const markRead = (msgId: string, read: boolean) =>
  loggedInvoke<void>("mark_read", { msgId, read });

export const listLabels = () => loggedInvoke<GmailLabel[]>("list_labels");

export const createLabel = (name: string) =>
  loggedInvoke<GmailLabel>("create_label", { name });

export const getAttachment = (msgId: string, attachmentId: string) =>
  loggedInvoke<string>("get_attachment", { msgId, attachmentId });

export const syncInbox = () => loggedInvoke<void>("sync_inbox");

export const drainPendingOps = () => loggedInvoke<number>("drain_pending_ops");

// ── Calendar ──────────────────────────────────────────────────────────────

export const listCalendars = () =>
  loggedInvoke<CalendarItem[]>("list_calendars");

export const listEvents = (params: {
  calendarId: string;
  timeMin: string;
  timeMax: string;
  maxResults?: number;
}) => loggedInvoke<CalendarEvent[]>("list_events", params);

export const createEvent = (calendarId: string, event: NewEvent) =>
  loggedInvoke<CalendarEvent>("create_event", { calendarId, event });

export const updateEvent = (
  calendarId: string,
  eventId: string,
  event: Partial<CalendarEvent>
) => loggedInvoke<CalendarEvent>("update_event", { calendarId, eventId, event });

export const deleteEvent = (calendarId: string, eventId: string) =>
  loggedInvoke<void>("delete_event", { calendarId, eventId });

export const respondToEvent = (
  calendarId: string,
  eventId: string,
  responseStatus: "accepted" | "declined" | "tentative"
) => loggedInvoke<CalendarEvent>("respond_to_event", { calendarId, eventId, responseStatus });

// ── Drive ──────────────────────────────────────────────────────────────────

export const listDriveFiles = (query?: string, pageToken?: string, pageSize?: number, driveId?: string, orderBy?: string) =>
  loggedInvoke<DriveFileListResponse>("list_drive_files", { query, pageToken, pageSize, driveId, orderBy });

export const listDriveFilesRecursive = (rootFolderId: string, mimeType: string, pageToken?: string, pageSize?: number, driveId?: string, orderBy?: string) =>
  loggedInvoke<DriveFileListResponse>("list_drive_files_recursive", { rootFolderId, mimeType, pageToken, pageSize, driveId, orderBy });

export const listSharedDrives = (pageToken?: string) =>
  loggedInvoke<SharedDriveListResponse>("list_shared_drives", { pageToken });

export const openDriveFile = (url: string) =>
  loggedInvoke<void>("open_drive_file", { url });

export const createDriveFolder = (name: string, parents?: string[]) =>
  loggedInvoke<DriveFile>("create_drive_folder", { name, parents });

export const deleteDriveFile = (fileId: string) =>
  loggedInvoke<void>("delete_drive_file", { fileId });

// ── Docs ──────────────────────────────────────────────────────────────────

export const getDocument = (docId: string) =>
  loggedInvoke<DocContent>("get_document", { docId });

export const saveDocument = (docId: string, requests: object[]) =>
  loggedInvoke<void>("save_document", { docId, requests });

export const createDocument = (title: string, folderId?: string) =>
  loggedInvoke<DocContent>("create_document", { title, folderId });

// ── Chat ──────────────────────────────────────────────────────────────────

export const listSpaces = () => loggedInvoke<Space[]>("list_spaces");

export const searchChatContacts = (query: string) =>
  loggedInvoke<ContactSuggestion[]>("search_chat_contacts", { query });

export const listSpaceMembers = (spaceName: string) =>
  loggedInvoke<Membership[]>("list_space_members", { spaceName });

export const setupChatSpace = (space: Space, memberships: Membership[]) =>
  loggedInvoke<Space>("setup_chat_space", { space, memberships });

export const listChatMessages = (
  spaceName: string,
  pageToken?: string,
  pageSize?: number
) => loggedInvoke<ChatMessagePage>("list_chat_messages", { spaceName, pageToken, pageSize });

export const sendChatMessage = (
  spaceName: string,
  text: string,
  attachments?: Attachment[]
) => loggedInvoke<ChatMessage>("send_chat_message", { spaceName, text, attachments });

export const uploadChatAttachment = (
  spaceName: string,
  filename: string,
  mimeType: string,
  data: Uint8Array
) => loggedInvoke<UploadAttachmentResponse>("upload_chat_attachment", { spaceName, filename, mimeType, data });

export const deleteChatSpace = (spaceName: string) =>
  loggedInvoke<void>("delete_chat_space", { spaceName });

// ── Gemini ────────────────────────────────────────────────────────────────

export const geminiChat = (request: GeminiChatRequest) =>
  loggedInvoke<string>("gemini_chat", { request });

export const generateEmailReply = (threadId: string, instructions?: string) =>
  loggedInvoke<string>("generate_email_reply", { threadId, instructions });

export const organizeInbox = () => loggedInvoke<string>("organize_inbox");

export const generateDailyReport = () => loggedInvoke<string>("generate_daily_report");

export const geminiChatWithSearch = (messages: GeminiMessage[], context?: string, webSearch?: boolean) =>
  loggedInvoke<string>("gemini_chat_with_search", { messages, context, webSearch: webSearch ?? false });

// ── Slack ──────────────────────────────────────────────────────────────────

export const slackGetToken = () =>
  loggedInvoke<SlackTokenInfo | null>("slack_get_token");

export const startSlackOAuthFlow = () =>
  loggedInvoke<SlackTokenInfo>("start_slack_oauth_flow");

export const slackExchangeCode = (code: string) =>
  loggedInvoke<SlackTokenInfo>("slack_exchange_code", { code });

export const slackDisconnect = () =>
  loggedInvoke<void>("slack_disconnect");

export const listSlackChannels = (cursor?: string) =>
  loggedInvoke<SlackChannelListResponse>("list_slack_channels", { cursor });

export const getSlackHistory = (channelId: string, cursor?: string, oldest?: string) =>
  loggedInvoke<SlackMessageListResponse>("get_slack_history", { channelId, cursor, oldest });

export const getSlackUser = (userId: string) =>
  loggedInvoke<SlackUser>("get_slack_user", { userId });

export const sendSlackMessage = (channelId: string, text: string) =>
  loggedInvoke<void>("send_slack_message", { channelId, text });

// ── Fireflies ─────────────────────────────────────────────────────────────

export const listFirefliesMeetings = (limit?: number) =>
  loggedInvoke<FirefliesMeeting[]>("list_fireflies_meetings", { limit });

export const getFirefliesMeeting = (id: string) =>
  loggedInvoke<FirefliesMeeting>("get_fireflies_meeting", { id });

export const listFirefliesChannels = () =>
  loggedInvoke<FirefliesChannel[]>("list_fireflies_channels");

export const moveFirefliesMeetings = (transcriptIds: string[], channelId: string) =>
  loggedInvoke<void>("move_fireflies_meetings", { transcriptIds, channelId });

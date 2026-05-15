// ── Auth ──────────────────────────────────────────────────────────────────

export interface AccountInfo {
  email: string;
  displayName: string;
  pictureUrl?: string;
}

// ── Gmail ─────────────────────────────────────────────────────────────────

export interface EmailView {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyHtml: string;
  snippet: string;
  labelIds: string[];
  attachments: EmailAttachment[];
  cidMap: Record<string, string>;
}

export interface EmailAttachment {
  id?: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageBody {
  size?: number;
  data?: string;
  attachmentId?: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  headers?: GmailMessageHeader[];
  body?: GmailMessageBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
  sizeEstimate?: number;
  internalDate?: string;
  historyId?: string;
}

export interface ThreadListItem {
  id: string;
  snippet?: string;
  historyId?: string;
}

export interface ThreadListResponse {
  threads?: ThreadListItem[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

export interface ThreadSummary {
  id: string;
  snippet?: string;
  from?: string;
  subject?: string;
  date?: string;
  internalDate?: string;
  isUnread: boolean;
  isStarred: boolean;
  messageCount: number;
  labelIds: string[];
}

export interface ThreadSummaryPage {
  threads: ThreadSummary[];
  nextPageToken?: string;
}

export interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface GmailLabel {
  id: string;
  name: string;
  type?: string;          // "system" | "user" — matches Rust serde rename
  labelType?: string;     // kept for backwards compat
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
}

export interface SentMessage {
  id: string;
  threadId: string;
}

// ── Drive ──────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  parents?: string[];
  driveId?: string;
  shared?: boolean;
}

export interface DriveFileListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface SharedDrive {
  id: string;
  name: string;
}

export interface SharedDriveListResponse {
  drives: SharedDrive[];
  nextPageToken?: string;
}

export interface DocContent {
  docId: string;
  title: string;
  revisionId: string;
  bodyJson: string;
}

// Google Docs StructuralElement (subset needed for rendering)
export interface DocsElement {
  paragraph?: {
    elements: Array<{ textRun?: { content: string; textStyle?: Record<string, unknown> } }>;
    paragraphStyle?: { namedStyleType?: string; alignment?: string };
    bullet?: { listId: string; nestingLevel?: number };
  };
  table?: { rows: unknown[] };
  sectionBreak?: unknown;
  startIndex?: number;
  endIndex?: number;
}

// ── Calendar ──────────────────────────────────────────────────────────────

export interface EventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface Attendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
  organizer?: boolean;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: EventDateTime;
  end?: EventDateTime;
  attendees?: Attendee[];
  recurrence?: string[];
  recurringEventId?: string;
  status?: string;
  htmlLink?: string;
  colorId?: string;
  allDay?: boolean;
}

export interface CalendarItem {
  id: string;
  summary?: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

export interface NewEvent {
  summary: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  attendees?: { email: string }[];
  recurrence?: string[];
  conferenceDataVersion?: number;
}

// ── Chat ──────────────────────────────────────────────────────────────────

export interface User {
  name?: string;
  displayName?: string;
  type?: string;
}

export interface Membership {
  name: string;
  state?: string;
  role?: string;
  member?: User;
}

export interface SetUpSpaceRequest {
  space: Space;
  memberships?: Membership[];
}

export interface Space {
  name: string;
  displayName?: string;
  spaceType?: string;
  singleUserBotDm?: boolean;
}

export interface ContactSuggestion {
  resourceName?: string;
  displayName: string;
  email: string;
  photoUrl?: string;
}

export interface ChatThread {
  name?: string;
  threadKey?: string;
}

export interface Attachment {
  name?: string;
  contentName?: string;
  contentType?: string;
  attachmentDataRef?: AttachmentDataRef;
}

export interface AttachmentDataRef {
  resourceName: string;
  attachmentUploadToken: string;
}

export interface UploadAttachmentResponse {
  attachmentDataRef: AttachmentDataRef;
}

export interface ChatMessage {
  name: string;
  sender?: User;
  createTime?: string;
  lastUpdateTime?: string;
  deleteTime?: string;
  text?: string;
  formatted_text?: string;
  thread?: ChatThread;
  threadReply?: boolean;
  attachments?: Attachment[];
}

export interface ChatMessagePage {
  messages?: ChatMessage[];
  nextPageToken?: string;
}

// ── Gemini ────────────────────────────────────────────────────────────────

export interface GeminiMessage {
  role: "user" | "model";
  text: string;
}

export interface GeminiChatRequest {
  messages: GeminiMessage[];
  context?: string;
}

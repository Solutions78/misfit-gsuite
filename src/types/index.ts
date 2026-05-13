// ── Auth ──────────────────────────────────────────────────────────────────

export interface AccountInfo {
  email: string;
  displayName: string;
  pictureUrl?: string;
}

// ── Gmail ─────────────────────────────────────────────────────────────────

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

export interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface GmailLabel {
  id: string;
  name: string;
  labelType?: string;
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
}

export interface SentMessage {
  id: string;
  threadId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function extractHeader(msg: GmailMessage, name: string): string {
  return (
    msg.payload?.headers?.find(
      (h) => h.name.toLowerCase() === name.toLowerCase()
    )?.value ?? ""
  );
}

export function extractBodyHtml(msg: GmailMessage): string {
  const payload = msg.payload;
  if (!payload) return "";
  return findPartByMime(payload, "text/html") ?? findPartByMime(payload, "text/plain") ?? "";
}

function findPartByMime(part: GmailMessagePart, mime: string): string | null {
  if (part.mimeType === mime && part.body?.data) {
    try {
      return atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    } catch {
      return null;
    }
  }
  for (const sub of part.parts ?? []) {
    const found = findPartByMime(sub, mime);
    if (found) return found;
  }
  return null;
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

export interface Space {
  name: string;
  displayName?: string;
  spaceType?: string;
}

export interface ChatMessage {
  name: string;
  sender?: {
    name?: string;
    displayName?: string;
    type?: string;
  };
  createTime?: string;
  text?: string;
  formattedText?: string;
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

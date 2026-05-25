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

// ── Slack ─────────────────────────────────────────────────────────────────

export interface SlackProfile {
  realName?: string;
  realNameNormalized?: string;
  displayName?: string;
  displayNameNormalized?: string;
  image48?: string;
  image72?: string;
  // Backward-compatible tolerance for older/stale cached shapes.
  real_name?: string;
  real_name_normalized?: string;
  display_name?: string;
  display_name_normalized?: string;
  image_48?: string;
  image_72?: string;
}

export interface SlackUser {
  id: string;
  name: string;
  realName?: string;
  // Backward-compatible tolerance for older/stale cached shapes.
  real_name?: string;
  profile?: SlackProfile;
  isBot?: boolean;
  is_bot?: boolean;
}

export interface SlackReaction {
  name: string;
  count: number;
  users?: string[];
}

export interface SlackFile {
  id: string;
  name?: string;
  title?: string;
  mimetype?: string;
  permalink?: string;
  urlPrivate?: string;
  urlPrivateDownload?: string;
  thumb64?: string;
  thumb80?: string;
  thumb160?: string;
  thumb360?: string;
  thumb480?: string;
  thumb720?: string;
  thumb960?: string;
  thumb1024?: string;
}

export interface SlackMessage {
  type?: string;
  user?: string;
  text?: string;
  ts: string;
  threadTs?: string;
  replyCount?: number;
  reactions?: SlackReaction[];
  files?: SlackFile[];
  botId?: string;
  username?: string;
  subtype?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isIm: boolean;
  isMpim: boolean;
  isMember: boolean;
  numMembers?: number;
  topic?: { value?: string };
  purpose?: { value?: string };
}

export interface SlackTeam {
  id: string;
  name: string;
  domain: string;
  icon?: { image_68?: string; image_132?: string };
}

export interface SlackTokenInfo {
  access_token: string;
  token_type?: string;
  scope?: string;
  bot_user_id?: string;
  app_id?: string;
  team?: SlackTeam;
  authed_user?: { id: string; scope?: string; access_token?: string };
}

export interface SlackChannelListResponse {
  channels: SlackChannel[];
  next_cursor?: string;
}

export interface SlackMessageListResponse {
  messages: SlackMessage[];
  has_more?: boolean;
  next_cursor?: string;
}

// ── Fireflies ─────────────────────────────────────────────────────────────

export interface FirefliesSentence {
  index: number;
  speakerName?: string;
  text: string;
  startTime?: string;
}

export interface FirefliesSummary {
  keywords?: string[];
  actionItems?: string;
  outline?: string;
  overview?: string;
  shortSummary?: string;
}

export interface FirefliesChannel {
  id: string;
  title: string;
  isPrivate?: boolean;
}

export interface FirefliesMeeting {
  id: string;
  title?: string;
  // Float: milliseconds since epoch (divide by 1000 for Date constructor)
  date?: number;
  // Float: duration in minutes
  duration?: number;
  participants?: string[];
  summary?: FirefliesSummary;
  transcript?: FirefliesSentence[];
  videoUrl?: string;
  channelId?: string;
}

// ── Gemini ────────────────────────────────────────────────────────────────

export interface GeminiMessage {
  role: "user" | "model";
  text: string;
}

export interface GeminiModel {
  name: string;
  displayName?: string;
  description?: string;
  version?: string;
  supportedGenerationMethods: string[];
}

export interface GeminiChatRequest {
  messages: GeminiMessage[];
  context?: string;
  model?: string;
}

export interface DriveFileResult {
  id: string;
  name: string;
  mimeType: string;
  snippet?: string;
  webViewLink?: string;
}

// ── Knowledge Graph ────────────────────────────────────────────────────────

export interface KgEntity {
  name: string;
  entityType: "person" | "project" | "client" | "product" | string;
}

export interface KgRelationship {
  targetFileId: string | null;
  description: string;
}

export interface KgEdgeView {
  sourceId: string;
  targetId: string;
  edgeType: "folder_hierarchy" | "gemini_reference" | "entity_link";
  weight: number;
  label?: string;
}

export interface KgNodeView {
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  driveId?: string;
  topicTags: string[];
  importanceScore?: number;
  summary?: string;
  entities: KgEntity[];
}

export interface KgNode {
  fileId: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  parentsJson: string;
  driveId?: string;
  shared: boolean;
  ownersJson: string;
  lastModifyingUser?: string;
  crawledAt: number;
  enrichStatus: string;
  enrichError?: string;
  enrichedAt?: number;
  topicTagsJson?: string;
  importanceScore?: number;
  summary?: string;
  entitiesJson?: string;
  relationshipsJson?: string;
}

export interface KgGraphPayload {
  nodes: KgNodeView[];
  edges: KgEdgeView[];
}

export interface KgStatusResponse {
  crawlStatus: "idle" | "running" | "done" | "failed";
  totalFiles: number;
  crawledFiles: number;
  enrichedFiles: number;
  lastCrawlAt?: number;
  pendingEnrichment: number;
}

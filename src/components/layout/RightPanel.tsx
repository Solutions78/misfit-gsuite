import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteChatSpace,
  listChatMessages,
  listSpaces,
  searchChatContacts,
  sendChatMessage,
  setupChatSpace,
  uploadChatAttachment,
} from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hash,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attachment, ChatMessage, ContactSuggestion, Membership, Space } from "@/types";
import { useAuthStore } from "@/store/authStore";
import MessagePopup from "@/components/common/MessagePopup";

const POLL_INTERVAL = 10_000;

type ChatSection = "dms" | "spaces" | "groups";

export default function RightPanel() {
  const toggleChatPanel = useUIStore((s) => s.toggleChatPanel);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [messageText, setMessageText] = useState("");
  const [view, setView] = useState<"list" | "thread">("list");
  const [showNewChat, setShowNewChat] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [popupMessage, setPopupMessage] = useState<ChatMessage | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState<Record<ChatSection, boolean>>({
    dms: true,
    spaces: true,
    groups: true,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const currentAccount = useAuthStore((s) => s.currentAccount);

  const { data: spaces, isLoading: spacesLoading, error: spacesError } = useQuery({
    queryKey: ["spaces"],
    queryFn: listSpaces,
    staleTime: 60_000,
  });

  const { data: messageData, error: messagesError } = useQuery({
    queryKey: ["chat-messages", selectedSpace?.name],
    queryFn: () => listChatMessages(selectedSpace!.name, undefined, 50),
    enabled: !!selectedSpace && view === "thread",
    refetchInterval: POLL_INTERVAL,
  });

  const messages = messageData?.messages ?? [];

  const sendMutation = useMutation({
    mutationFn: async ({ space, text, attachments: files }: { space: string; text: string; attachments?: File[] }) => {
      const attachmentRefs: Attachment[] = [];

      if (files && files.length > 0) {
        setIsUploading(true);
        try {
          for (const file of files) {
            const bytes = await file.arrayBuffer().then((ab) => new Uint8Array(ab));
            const uploadResp = await uploadChatAttachment(space, file.name, file.type, bytes);
            attachmentRefs.push({
              attachmentDataRef: uploadResp.attachmentDataRef,
              contentName: file.name,
              contentType: file.type,
            });
          }
        } catch (e) {
          console.error("Upload failed", e);
          throw e;
        }
      }

      return sendChatMessage(space, text, attachmentRefs.length > 0 ? attachmentRefs : undefined);
    },
    onSuccess: () => {
      setMessageText("");
      setAttachments([]);
      setReplyTo(null);
      setIsUploading(false);
      setSendError(null);
      qc.refetchQueries({ queryKey: ["chat-messages", selectedSpace?.name] });
      qc.invalidateQueries({ queryKey: ["spaces"] });
    },
    onError: (e) => {
      setIsUploading(false);
      setSendError(String(e));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteChatSpace,
    onSuccess: (_result, spaceName) => {
      if (selectedSpace?.name === spaceName) {
        setSelectedSpace(null);
        setView("list");
      }
      qc.invalidateQueries({ queryKey: ["spaces"] });
    },
    onError: (e) => alert(`Failed to delete chat: ${e}`),
  });

  useEffect(() => {
    if (view === "thread") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages.length, view]);

  const openSpace = (space: Space) => {
    setSelectedSpace(space);
    setView("thread");
    setReplyTo(null);
  };

  const handleSend = () => {
    if (!selectedSpace || (!messageText.trim() && attachments.length === 0)) return;
    setSendError(null);
    sendMutation.mutate({
      space: selectedSpace.name,
      text: messageText.trim(),
      attachments,
    });
  };

  const handleDeleteSpace = (space: Space) => {
    const label = getSpaceLabel(space);
    const confirmed = window.confirm(`Remove "${label}" from this app's chat list?`);
    if (!confirmed) return;
    deleteMutation.mutate(space.name);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)]);
      e.target.value = "";
    }
  };

  const toggleSection = (section: ChatSection) => {
    setSectionsOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const namedSpaces = spaces?.filter((s) => s.spaceType === "SPACE") ?? [];
  const groupChats = spaces?.filter((s) => s.spaceType === "GROUP_CHAT") ?? [];
  const dms = spaces?.filter((s) => s.spaceType === "DIRECT_MESSAGE") ?? [];

  return (
    <div
      className="relative flex flex-col overflow-hidden border-l"
      style={{
        width: "100%",
        height: "100%",
        paddingTop: "28px",
        background: "var(--mm-bg)",
        borderColor: "var(--mm-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--mm-border)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {view === "thread" && (
            <button
              onClick={() => setView("list")}
              className="p-1.5 rounded-lg transition-colors mr-0.5 flex-shrink-0"
              style={{ color: "var(--mm-text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-elevated)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <MessageCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mm-accent)" }} />
          <span className="text-sm font-semibold truncate" style={{ color: "var(--mm-text-primary)" }}>
            {view === "thread" && selectedSpace ? getSpaceLabel(selectedSpace) : "Messaging"}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {view === "list" && (
            <button
              onClick={() => setShowNewChat(true)}
              className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: "var(--mm-text-secondary)" }}
              title="New Chat"
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-elevated)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={toggleChatPanel}
            className="p-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: "var(--mm-text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-elevated)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreated={(s) => {
            setShowNewChat(false);
            openSpace(s);
            qc.invalidateQueries({ queryKey: ["spaces"] });
            qc.invalidateQueries({ queryKey: ["chat-messages", s.name] });
          }}
        />
      )}

      {view === "list" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {spacesLoading ? (
            <div className="flex items-center justify-center h-20">
              <div
                className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: "var(--mm-accent)", borderTopColor: "transparent" }}
              />
            </div>
          ) : spacesError ? (
            <ChatError error={spacesError} />
          ) : (
            <div className="py-2">
              {dms.length > 0 && (
                <section>
                  <SectionHeader
                    label="Direct Messages"
                    count={dms.length}
                    isOpen={sectionsOpen.dms}
                    onToggle={() => toggleSection("dms")}
                  />
                  {sectionsOpen.dms && dms.map((space) => (
                    <SpaceRow
                      key={space.name}
                      space={space}
                      onSelect={openSpace}
                      onDelete={handleDeleteSpace}
                      isDeleting={deleteMutation.isPending}
                      isDm
                    />
                  ))}
                </section>
              )}

              {namedSpaces.length > 0 && (
                <section className="mt-4">
                  <SectionHeader
                    label="Spaces"
                    count={namedSpaces.length}
                    isOpen={sectionsOpen.spaces}
                    onToggle={() => toggleSection("spaces")}
                  />
                  {sectionsOpen.spaces && namedSpaces.map((space) => (
                    <SpaceRow
                      key={space.name}
                      space={space}
                      onSelect={openSpace}
                      onDelete={handleDeleteSpace}
                      isDeleting={deleteMutation.isPending}
                    />
                  ))}
                </section>
              )}

              {groupChats.length > 0 && (
                <section className="mt-4">
                  <SectionHeader
                    label="Groups"
                    count={groupChats.length}
                    isOpen={sectionsOpen.groups}
                    onToggle={() => toggleSection("groups")}
                  />
                  {sectionsOpen.groups && groupChats.map((space) => (
                    <SpaceRow
                      key={space.name}
                      space={space}
                      onSelect={openSpace}
                      onDelete={handleDeleteSpace}
                      isDeleting={deleteMutation.isPending}
                      isGroup
                    />
                  ))}
                </section>
              )}

              {spaces?.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <MessageCircle className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: "var(--mm-text-muted)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--mm-text-muted)" }}>No active chats</p>
                  <button
                    onClick={() => setShowNewChat(true)}
                    className="mt-4 px-4 py-1.5 text-xs font-semibold rounded-full transition-colors"
                    style={{ background: "var(--mm-surface)", color: "var(--mm-accent)", border: "1px solid var(--mm-border)" }}
                  >
                    Start a conversation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {view === "thread" && selectedSpace && (
        <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--mm-surface)" }}>
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 min-h-0 custom-scrollbar">
            {messagesError ? (
              <ChatError error={messagesError} />
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 opacity-30">
                <MessageCircle className="w-8 h-8" style={{ color: "var(--mm-text-muted)" }} />
                <p className="text-xs font-medium" style={{ color: "var(--mm-text-muted)" }}>No messages yet</p>
              </div>
            ) : (
              messages.map((msg: ChatMessage) => (
                <MessageBubble
                  key={msg.name}
                  msg={msg}
                  isMe={msg.sender?.displayName?.trim() === currentAccount?.displayName?.trim()}
                  onReply={() => {
                    setReplyTo(msg);
                    inputRef.current?.focus();
                  }}
                  onOpen={() => setPopupMessage(msg)}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {replyTo && (
            <div
              className="px-3 py-2 border-t flex items-center justify-between"
              style={{ background: "var(--mm-elevated)", borderColor: "var(--mm-border)" }}
            >
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--mm-accent)" }}>
                  Replying to {getUserLabel(replyTo.sender)}
                </p>
                <p className="text-xs truncate italic" style={{ color: "var(--mm-text-secondary)" }}>"{replyTo.text}"</p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--mm-text-muted)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div
              className="px-3 py-2 border-t flex gap-2 overflow-x-auto flex-shrink-0"
              style={{ background: "var(--mm-elevated)", borderColor: "var(--mm-border)" }}
            >
              {attachments.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: "var(--mm-surface)", color: "var(--mm-text-primary)", border: "1px solid var(--mm-border)" }}
                >
                  <span className="truncate max-w-[100px]">{f.name}</span>
                  <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X className="w-3 h-3" style={{ color: "var(--mm-text-muted)" }} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {sendError && (
            <div
              className="px-3 py-2 text-xs font-medium border-t flex items-center gap-2"
              style={{ background: "var(--mm-bg)", borderColor: "var(--mm-border)", color: "var(--mm-error)" }}
            >
              <span className="flex-1 truncate">Failed to send: {sendError}</span>
              <button onClick={() => setSendError(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <div
            className="border-t p-3 flex items-end gap-2 flex-shrink-0"
            style={{ background: "var(--mm-bg)", borderColor: "var(--mm-border)" }}
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-lg transition-colors mb-0.5 flex-shrink-0"
              style={{ color: "var(--mm-text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-elevated)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileSelect} />

            <div className="flex-1 min-w-0">
              <textarea
                ref={inputRef}
                rows={1}
                className="w-full text-sm px-3 py-2 rounded-lg border focus:outline-none transition-all resize-none max-h-32"
                style={{
                  background: "var(--mm-elevated)",
                  borderColor: "var(--mm-border)",
                  color: "var(--mm-text-primary)",
                }}
                placeholder="Type a message…"
                value={messageText}
                onChange={(e) => { setMessageText(e.target.value); if (sendError) setSendError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={(!messageText.trim() && attachments.length === 0) || sendMutation.isPending || isUploading}
              className="p-2.5 rounded-lg transition-colors flex-shrink-0 disabled:opacity-40"
              style={{ background: "var(--mm-accent)", color: "var(--mm-accent-fg)" }}
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {popupMessage && selectedSpace && (
        <MessagePopup
          content={{
            type: "chat",
            message: popupMessage,
            title: "Chat Message",
            subtitle: getSpaceLabel(selectedSpace),
          }}
          onClose={() => setPopupMessage(null)}
        />
      )}
    </div>
  );
}

function NewChatModal({ onClose, onCreated }: { onClose: () => void; onCreated: (s: Space) => void }) {
  const [toQuery, setToQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactSuggestion | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const searchTerm = selectedContact ? "" : toQuery.trim();
  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ["chat-contacts", searchTerm],
    queryFn: () => searchChatContacts(searchTerm),
    enabled: searchTerm.length >= 2,
    staleTime: 5 * 60_000,
  });

  const recipientEmail = selectedContact?.email ?? extractEmail(toQuery);
  const canSend = Boolean(recipientEmail && message.trim() && !loading);

  const handleSend = async () => {
    if (!canSend || !recipientEmail) return;
    setLoading(true);
    try {
      const space: Space = {
        name: "",
        spaceType: "DIRECT_MESSAGE",
        singleUserBotDm: false,
      };
      const memberships: Membership[] = [
        { name: "", member: { name: `users/${recipientEmail}`, type: "HUMAN" } },
      ];
      const created = await setupChatSpace(space, memberships);
      await sendChatMessage(created.name, message.trim());
      onCreated({
        ...created,
        displayName: created.displayName || selectedContact?.displayName || recipientEmail,
      });
    } catch (e) {
      alert(String(e));
    } finally {
      setLoading(false);
    }
  };

  const chooseSuggestion = (contact: ContactSuggestion) => {
    setSelectedContact(contact);
    setToQuery(`${contact.displayName} <${contact.email}>`);
    setSuggestionsOpen(false);
  };

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ background: "var(--mm-bg)", paddingTop: "28px" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--mm-border)" }}
      >
        <div className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" style={{ color: "var(--mm-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--mm-text-primary)" }}>New Conversation</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded transition-colors"
          style={{ color: "var(--mm-text-muted)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4 p-4">
        <div className="relative flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--mm-text-muted)" }}>
            To:
          </label>
          <input
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none transition-all"
            style={{
              background: "var(--mm-elevated)",
              borderColor: "var(--mm-border)",
              color: "var(--mm-text-primary)",
            }}
            placeholder="Start typing a name or email"
            value={toQuery}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)}
            onChange={(e) => {
              setToQuery(e.target.value);
              setSelectedContact(null);
              setSuggestionsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />

          {suggestionsOpen && (isFetching || suggestions.length > 0 || searchTerm.length >= 2) && (
            <div
              className="absolute left-0 right-0 top-[64px] z-10 max-h-60 overflow-y-auto rounded-xl border shadow-2xl"
              style={{ background: "var(--mm-bg)", borderColor: "var(--mm-border)" }}
            >
              {isFetching ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs" style={{ color: "var(--mm-text-muted)" }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching contacts…
                </div>
              ) : suggestions.length > 0 ? (
                suggestions.map((contact) => (
                  <button
                    key={`${contact.resourceName ?? contact.email}-${contact.email}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => chooseSuggestion(contact)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-surface)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <ContactAvatar contact={contact} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate" style={{ color: "var(--mm-text-primary)" }}>
                        {contact.displayName}
                      </span>
                      <span className="block text-[11px] truncate" style={{ color: "var(--mm-text-muted)" }}>
                        {contact.email}
                      </span>
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-3 text-xs" style={{ color: "var(--mm-text-muted)" }}>
                  No contacts found. You can still type a full email address.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 min-h-0">
          <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--mm-text-muted)" }}>
            Message:
          </label>
          <textarea
            className="w-full flex-1 min-h-[160px] px-3 py-2 text-sm rounded-lg border focus:outline-none transition-all resize-none"
            style={{
              background: "var(--mm-elevated)",
              borderColor: "var(--mm-border)",
              color: "var(--mm-text-primary)",
            }}
            placeholder="Type the first message…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <p className="text-[10px]" style={{ color: "var(--mm-text-muted)" }}>
            Press ⌘Enter to send.
          </p>
        </div>
      </div>

      <div className="px-4 py-3 border-t flex-shrink-0" style={{ borderColor: "var(--mm-border)" }}>
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="w-full py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "var(--mm-accent)", color: "var(--mm-accent-fg)" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  count,
  isOpen,
  onToggle,
}: {
  label: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-4 py-2 transition-colors text-left"
      style={{ color: "var(--mm-text-muted)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] flex-1">{label}</span>
      <span className="text-[10px] font-bold tabular-nums">{count}</span>
    </button>
  );
}

function ContactAvatar({ contact }: { contact: ContactSuggestion }) {
  return (
    <span
      className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-[10px] font-black uppercase"
      style={{ background: "var(--mm-elevated)", color: "var(--mm-accent)", border: "1px solid var(--mm-border)" }}
    >
      {contact.photoUrl ? (
        <img src={contact.photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        contact.displayName?.[0] ?? contact.email[0]
      )}
    </span>
  );
}

function getSpaceLabel(space: Space) {
  const displayName = space.displayName?.trim();
  if (displayName) return displayName;
  if (space.spaceType === "DIRECT_MESSAGE") return "Unknown direct message";
  if (space.spaceType === "GROUP_CHAT") return "Unnamed group chat";
  return space.name.split("/").pop() ?? "Unknown";
}

function getUserLabel(user?: { displayName?: string; name?: string }) {
  const displayName = user?.displayName?.trim();
  if (displayName) return displayName;
  return user?.name?.split("/").pop() ?? "Unknown";
}

function extractEmail(value: string) {
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate) ? candidate : "";
}

function SpaceRow({
  space,
  onSelect,
  onDelete,
  isDeleting,
  isDm,
  isGroup,
}: {
  space: Space;
  onSelect: (s: Space) => void;
  onDelete: (s: Space) => void;
  isDeleting?: boolean;
  isDm?: boolean;
  isGroup?: boolean;
}) {
  const label = getSpaceLabel(space);
  return (
    <div
      className="group flex items-center gap-2 px-2 transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--mm-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <button onClick={() => onSelect(space)} className="min-w-0 flex-1 flex items-center gap-3 py-2.5 text-left">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
          style={{ background: "var(--mm-elevated)", color: "var(--mm-accent)" }}
        >
          {isDm ? <Users className="w-4 h-4" /> : isGroup ? <Users className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--mm-text-primary)" }}>{label}</p>
          <p className="text-[10px] truncate" style={{ color: "var(--mm-text-muted)" }}>
            {isDm ? "Direct message" : isGroup ? "Group chat" : "Space"}
          </p>
        </div>
      </button>
      <button
        onClick={() => onDelete(space)}
        disabled={isDeleting}
        className="p-1.5 rounded-lg opacity-60 hover:opacity-100 transition-all disabled:opacity-30"
        title="Delete chat"
        style={{ color: "var(--mm-text-muted)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--mm-elevated)";
          e.currentTarget.style.color = "var(--mm-error)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "";
          e.currentTarget.style.color = "var(--mm-text-muted)";
        }}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function MessageBubble({
  msg,
  isMe,
  onReply,
  onOpen,
}: {
  msg: ChatMessage;
  isMe: boolean;
  onReply: () => void;
  onOpen: () => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const isDeleted = !!msg.deleteTime;
  const bodyText = isDeleted ? "Message deleted" : msg.text;
  const senderLabel = getUserLabel(msg.sender);

  return (
    <div
      className={cn("flex flex-col", isMe ? "items-end" : "items-start")}
      onClick={() => !isDeleted && setShowActions(!showActions)}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!isDeleted) onOpen();
      }}
      title="Double-click to open in a popup"
    >
      {!isMe && !isDeleted && (
        <span className="text-[10px] font-semibold mb-1 ml-1" style={{ color: "var(--mm-text-muted)" }}>
          {senderLabel}
        </span>
      )}

      <div className={cn("max-w-[85%]", isMe ? "ml-8" : "mr-8")}>
        <div
          className={cn(
            "px-3 py-2 rounded-2xl text-sm leading-relaxed",
            isMe ? "rounded-tr-sm" : "rounded-tl-sm",
            isDeleted && "opacity-50 italic",
          )}
          style={
            isMe
              ? { background: "var(--mm-accent)", color: "var(--mm-accent-fg)" }
              : { background: "var(--mm-elevated)", color: "var(--mm-text-primary)", border: "1px solid var(--mm-border)" }
          }
        >
          {bodyText}

          {msg.attachments?.map((att, i) => (
            <div
              key={i}
              className="mt-2 p-2 rounded-lg flex items-center gap-2"
              style={{ background: isMe ? "rgba(255,255,255,0.15)" : "var(--mm-surface)" }}
            >
              <Paperclip className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
              <span className="text-xs font-medium truncate underline cursor-pointer">{att.contentName}</span>
            </div>
          ))}

          <div className="text-[9px] mt-1 text-right opacity-50 font-medium">
            {msg.createTime && new Date(msg.createTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {showActions && (
        <div className={cn("mt-1 flex gap-1.5", isMe ? "pr-1" : "pl-1")}>
          <button
            onClick={(e) => { e.stopPropagation(); onReply(); setShowActions(false); }}
            className="px-3 py-1 text-[10px] font-semibold rounded-full transition-colors"
            style={{
              background: "var(--mm-elevated)",
              color: "var(--mm-text-secondary)",
              border: "1px solid var(--mm-border)",
            }}
          >
            Reply
          </button>
        </div>
      )}
    </div>
  );
}

function ChatError({ error }: { error: any }) {
  const msg = String(error);
  const isConfigError = msg.includes("Google Chat app not found") || msg.includes("404");

  if (isConfigError) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2" style={{ color: "var(--mm-error)" }}>
          <X className="w-5 h-5" />
          <p className="text-sm font-semibold">Configuration required</p>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--mm-text-secondary)" }}>
          The Google Chat API requires a one-time setup before it can be used.
        </p>
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--mm-border)" }}>
          <div className="px-4 py-2 border-b" style={{ background: "var(--mm-surface)", borderColor: "var(--mm-border)" }}>
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--mm-text-muted)" }}>Steps</span>
          </div>
          <ol className="text-xs p-4 space-y-2.5 font-medium" style={{ color: "var(--mm-text-primary)" }}>
            <li>1. Open <a href="https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat" target="_blank" className="underline" style={{ color: "var(--mm-accent)" }}>Chat API Console</a></li>
            <li>2. Select the <b>Configuration</b> tab</li>
            <li>3. Add an <b>App name</b> and <b>Avatar URL</b></li>
            <li>4. Enable <b>"Receive 1:1 messages"</b></li>
            <li>5. Save and restart the app</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 text-center flex flex-col items-center gap-3">
      <X className="w-8 h-8 opacity-30" style={{ color: "var(--mm-error)" }} />
      <p className="text-xs font-semibold" style={{ color: "var(--mm-text-secondary)" }}>Failed to load chats</p>
      <p className="text-[10px]" style={{ color: "var(--mm-text-muted)" }}>{msg}</p>
    </div>
  );
}

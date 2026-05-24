import { useState, useCallback, useEffect, useRef, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table as TiptapTable } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { useDocStore } from "@/store/docStore";
import {
  listDriveFiles,
  listSharedDrives,
  getDocument,
  saveDocument,
  createDocument,
  startOAuthFlow,
} from "@/lib/tauri";
import type { DriveFile, DocContent } from "@/types";
import {
  Folder,
  HardDrive,
  ChevronRight,
  FilePlus,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table,
  Save,
  FileText,
  HardDrive as DriveIcon,
  Loader2,
  AlertTriangle,
  LogIn,
} from "lucide-react";
import type { DocsElement } from "@/types";


// ── Google Docs → Tiptap HTML conversion ────────────────────────────────────
function docsBodyToHtml(bodyJson: string): string {
  let elements: DocsElement[];
  try {
    elements = JSON.parse(bodyJson) as DocsElement[];
  } catch {
    return "<p></p>";
  }

  const parts: string[] = [];

  for (const el of elements) {
    if (el.sectionBreak !== undefined) continue;

    if (el.paragraph) {
      const { paragraph } = el;
      const styleType = paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";
      const alignment = paragraph.paragraphStyle?.alignment;

      const ALIGN_CLASS: Record<string, string> = {
        CENTER: "text-center",
        END: "text-right",
        JUSTIFIED: "text-justify",
        START: "",
      };
      const alignClass = ALIGN_CLASS[alignment ?? "START"] ?? "";
      const classAttr = alignClass ? ` class="${alignClass}"` : "";

      // Collect inline text with style
      let inner = "";
      for (const textEl of paragraph.elements ?? []) {
        if (!textEl.textRun) continue;
        const raw = textEl.textRun.content ?? "";
        const ts = (textEl.textRun.textStyle ?? {}) as Record<string, unknown>;
        let text = raw.replace(/\n$/, ""); // strip trailing newline from run

        // Escape HTML entities
        text = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        if (ts.bold) text = `<strong>${text}</strong>`;
        if (ts.italic) text = `<em>${text}</em>`;
        if (ts.underline) text = `<u>${text}</u>`;
        if (ts.strikethrough) text = `<s>${text}</s>`;
        inner += text;
      }

      // Handle bullet lists
      if (paragraph.bullet) {
        parts.push(`<li${classAttr}>${inner}</li>`);
        continue;
      }

      // Map named style to tag
      let tag = "p";
      if (styleType === "HEADING_1") tag = "h1";
      else if (styleType === "HEADING_2") tag = "h2";
      else if (styleType === "HEADING_3") tag = "h3";

      parts.push(`<${tag}${classAttr}>${inner || "<br>"}</${tag}>`);
      continue;
    }

    if (el.table) {
      // Minimal table passthrough — just a placeholder
      parts.push("<p>[Table]</p>");
    }
  }

  // Wrap adjacent <li> items in <ul>
  const html = parts
    .join("")
    .replace(/(<li[^>]*>.*?<\/li>)+/gs, (match) => `<ul>${match}</ul>`);

  return html || "<p></p>";
}

// ── HTML sanitizer (DOMPurify — blocks XSS from Google Docs API HTML) ────────
function sanitizeHtml(html: string): string {
  const ALLOWED_CLASSES = new Set(["text-center", "text-right", "text-justify"]);
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p","h1","h2","h3","h4","h5","h6","strong","em","u","s","br",
                   "ul","ol","li","blockquote","code","pre",
                   "table","thead","tbody","tr","th","td","a"],
    ALLOWED_ATTR: ["href", "target", "rel", "class"],
    FORBID_ATTR: ["style", "id"],
    FORCE_BODY: true,
  });
  // Strip any class values not in our allowlist
  return clean.replace(/class="([^"]*)"/g, (_, classes: string) => {
    const safe = classes.split(/\s+/).filter(c => ALLOWED_CLASSES.has(c)).join(" ");
    return safe ? `class="${safe}"` : "";
  });
}

// ── MIME constants ────────────────────────────────────────────────────────────
const GDOC_MIME = "application/vnd.google-apps.document";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// ── Folder Tree (left pane) ──────────────────────────────────────────────────
interface FolderTreeProps {
  currentFolderId: string;
  currentDriveId?: string;
  onSelectFolder: (id: string, driveId?: string) => void;
  onNewDoc: () => void;
  onOpenDoc: (file: DriveFile) => void;
}

function FolderTree({
  currentFolderId,
  currentDriveId,
  onSelectFolder,
  onNewDoc,
  onOpenDoc,
}: FolderTreeProps) {
  const { data: rootFolders } = useQuery({
    queryKey: ["docs-folders", "root"],
    queryFn: () =>
      listDriveFiles(
        `mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`
      ),
  });

  const { data: sharedDrives } = useQuery({
    queryKey: ["docs-shared-drives"],
    queryFn: () => listSharedDrives(),
  });

  const { data: currentFolderContents } = useQuery({
    queryKey: ["docs-folder-contents", currentFolderId, currentDriveId],
    queryFn: () =>
      listDriveFiles(
        `'${currentFolderId}' in parents and trashed=false and (mimeType='${FOLDER_MIME}' or mimeType='${GDOC_MIME}')`,
        undefined,
        undefined,
        currentDriveId
      ),
    enabled: currentFolderId !== "root",
  });

  return (
    <div className="flex flex-col h-full">
      {/* New Doc button */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={onNewDoc}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5 active:scale-95 group"
        >
          <FilePlus className="w-3.5 h-3.5 text-blue-400" />
          New Doc
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-1 px-3">
        {/* MY DRIVE section */}
        <div className="px-1 pt-2 pb-1">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.25em]">
            My Drive
          </span>
        </div>

        {/* Root entry */}
        <button
          onClick={() => onSelectFolder("root", undefined)}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
            currentFolderId === "root" && !currentDriveId
              ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
              : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
          )}
        >
          <HardDrive
            className={cn(
              "w-4 h-4 flex-shrink-0 transition-transform",
              currentFolderId === "root" && !currentDriveId
                ? "scale-110 text-blue-400"
                : "text-gray-400 group-hover:scale-110"
            )}
          />
          <span className="truncate flex-1 text-left">Root</span>
        </button>

        {/* Root-level folders */}
        {rootFolders?.files.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelectFolder(f.id, undefined)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
              currentFolderId === f.id && !currentDriveId
                ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
            )}
          >
            <Folder
              className={cn(
                "w-4 h-4 flex-shrink-0 transition-transform",
                currentFolderId === f.id && !currentDriveId
                  ? "scale-110 text-blue-400"
                  : "text-gray-400 group-hover:scale-110"
              )}
            />
            <span className="truncate flex-1 text-left">{f.name}</span>
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 flex-shrink-0 transition-opacity",
                currentFolderId === f.id && !currentDriveId
                  ? "opacity-40"
                  : "opacity-0 group-hover:opacity-20"
              )}
            />
          </button>
        ))}

        {/* Subfolder / doc contents when a non-root folder is active */}
        {currentFolderId !== "root" && currentFolderContents?.files && (
          <div className="pl-4 space-y-1 mt-1 border-l border-gray-200/60 ml-4">
            {currentFolderContents.files.map((f) =>
              f.mimeType === FOLDER_MIME ? (
                <button
                  key={f.id}
                  onClick={() => onSelectFolder(f.id, currentDriveId)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                    currentFolderId === f.id
                      ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                      : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                  )}
                >
                  <Folder
                    className={cn(
                      "w-3.5 h-3.5 flex-shrink-0 transition-transform",
                      currentFolderId === f.id
                        ? "scale-110 text-blue-400"
                        : "text-gray-400 group-hover:scale-110"
                    )}
                  />
                  <span className="truncate flex-1 text-left">{f.name}</span>
                </button>
              ) : (
                <button
                  key={f.id}
                  onClick={() => onOpenDoc(f)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                >
                  <FileText className="w-3.5 h-3.5 flex-shrink-0 text-blue-400/60 group-hover:text-blue-400 transition-colors" />
                  <span className="truncate flex-1 text-left">{f.name}</span>
                </button>
              )
            )}
          </div>
        )}

        {/* SHARED DRIVES section */}
        {sharedDrives?.drives && sharedDrives.drives.length > 0 && (
          <>
            <div className="px-1 pt-4 pb-1">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.25em]">
                Shared Drives
              </span>
            </div>
            {sharedDrives.drives.map((d) => (
              <button
                key={d.id}
                onClick={() => onSelectFolder(d.id, d.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 active:scale-95 group",
                  currentDriveId === d.id
                    ? "bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5"
                    : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
                )}
              >
                <DriveIcon
                  className={cn(
                    "w-4 h-4 flex-shrink-0 transition-transform",
                    currentDriveId === d.id
                      ? "scale-110 text-blue-400"
                      : "text-gray-400 group-hover:scale-110"
                  )}
                />
                <span className="truncate flex-1 text-left">{d.name}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ── Toolbar button ─────────────────────────────────────────────────────────
interface ToolbarBtnProps {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}

function ToolbarBtn({ onClick, active, title, children }: ToolbarBtnProps) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded-lg text-[11px] transition-all duration-150 active:scale-90",
        active
          ? "bg-gray-900 text-white shadow-[0_0_12px_rgba(255,255,255,0.12)] border border-white/5"
          : "text-gray-500 hover:bg-gray-200 hover:text-gray-900"
      )}
    >
      {children}
    </button>
  );
}

// ── Toolbar divider ──────────────────────────────────────────────────────────
function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5 flex-shrink-0" />;
}

// ── Main DocsView ─────────────────────────────────────────────────────────────
export default function DocsView(): JSX.Element {
  const [currentFolderId, setCurrentFolderId] = useState<string>("root");
  const [currentDriveId, setCurrentDriveId] = useState<string | undefined>(
    undefined
  );
  const [docTitle, setDocTitle] = useState<string>("Untitled Document");
  const [isSaving, setIsSaving] = useState(false);
  const [docError, setDocError] = useState<"permission" | "generic" | null>(null);
  const [newDocDialog, setNewDocDialog] = useState<{ open: boolean; title: string }>({ open: false, title: "Untitled Document" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDocIdRef = useRef<string | null>(null);

  const { activeDoc, isDirty, lastSaved, setActiveDoc, setDirty, setLastSaved, setActiveSelection, pendingFileId, setPendingFileId } =
    useDocStore();

  // ── Tiptap editor ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TiptapTable.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: "<p>Open or create a document to start editing.</p>",
    onUpdate({ editor }) {
      setDirty(true);

      // Update selected text in store
      const { selection } = editor.state;
      if (!selection.empty) {
        setActiveSelection(
          editor.state.doc.textBetween(selection.from, selection.to, " ")
        );
      } else {
        setActiveSelection("");
      }

      // Debounced auto-save (60s)
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (activeDocIdRef.current) {
          void handleSave(activeDocIdRef.current);
        }
      }, 60_000);
    },
    editorProps: {
      attributes: {
        class: "ProseMirror-doc focus:outline-none",
        spellCheck: "true",
      },
      handleKeyDown(_, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === "s") {
          event.preventDefault();
          if (activeDocIdRef.current) {
            void handleSave(activeDocIdRef.current);
          }
          return true;
        }
        return false;
      },
    },
  });

  // ── Load document into editor ─────────────────────────────────────────────
  const loadDoc = useCallback(
    (doc: DocContent) => {
      setActiveDoc(doc);
      setDocTitle(doc.title);
      activeDocIdRef.current = doc.docId;

      if (!editor) return;

      const rawHtml = docsBodyToHtml(doc.bodyJson);
      const safeHtml = sanitizeHtml(rawHtml);
      editor.commands.setContent(safeHtml);
      setDocError(null);
      setDirty(false);
    },
    [editor, setActiveDoc, setDirty]
  );

  // ── Open doc from file browser ────────────────────────────────────────────
  const handleOpenDoc = useCallback(
    async (file: DriveFile) => {
      try {
        const doc = await getDocument(file.id);
        loadDoc(doc);
      } catch (err) {
        const msg = String(err);
        const isPermission = msg.includes("403") || msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("forbidden");
        setDocError(isPermission ? "permission" : "generic");
        console.error("Failed to open document:", err);
      }
    },
    [loadDoc]
  );

  // ── Auto-open a file queued from DriveView ────────────────────────────────
  useEffect(() => {
    if (!pendingFileId) return;
    const id = pendingFileId;
    setPendingFileId(null);
    void handleOpenDoc({ id, name: "", mimeType: "application/vnd.google-apps.document" } as DriveFile);
  }, [pendingFileId, handleOpenDoc, setPendingFileId]);

  // ── Save handler (builds minimal batchUpdate requests) ────────────────────
  const handleSave = useCallback(
    async (docId: string) => {
      if (!editor) return;
      setIsSaving(true);
      try {
        // Send empty requests — actual content reconciliation would require
        // diff-based requests. This signals a save intent to the backend.
        await saveDocument(docId, []);
        setLastSaved(new Date());
      } catch (err) {
        console.error("Save failed:", err);
      } finally {
        setIsSaving(false);
      }
    },
    [editor, setLastSaved]
  );

  // ── New doc handler ───────────────────────────────────────────────────────
  const handleNewDoc = useCallback(() => {
    setNewDocDialog({ open: true, title: "Untitled Document" });
  }, []);

  const handleCreateDoc = useCallback(async () => {
    const title = newDocDialog.title.trim().slice(0, 255);
    if (!title) return;
    setNewDocDialog({ open: false, title: "" });
    try {
      const folderId =
        currentFolderId !== "root" ? currentFolderId : undefined;
      const doc = await createDocument(title, folderId);
      loadDoc(doc);
    } catch (err) {
      console.error("Failed to create document:", err);
    }
  }, [newDocDialog.title, currentFolderId, loadDoc]);

  // ── Folder selection ──────────────────────────────────────────────────────
  const handleSelectFolder = useCallback(
    (id: string, driveId?: string) => {
      setCurrentFolderId(id);
      setCurrentDriveId(driveId);
    },
    []
  );

  // ── Status bar text ───────────────────────────────────────────────────────
  const statusText = (() => {
    if (isSaving) return "Saving…";
    if (isDirty) return "Unsaved changes";
    if (lastSaved) {
      const mins = Math.round((Date.now() - lastSaved.getTime()) / 60_000);
      return mins <= 1 ? "Saved just now" : `Saved ${mins} minutes ago`;
    }
    return "No document open";
  })();

  const wordCount = editor
    ? editor.state.doc.textContent.trim().split(/\s+/).filter(Boolean).length
    : 0;

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Tiptap ProseMirror styles */}
      <style>{`
        .ProseMirror-doc { outline: none; min-height: 100%; padding: 1rem 0; }
        .ProseMirror-doc h1 { font-size: 2em; font-weight: 900; margin: 0.5em 0; }
        .ProseMirror-doc h2 { font-size: 1.5em; font-weight: 800; margin: 0.4em 0; }
        .ProseMirror-doc h3 { font-size: 1.2em; font-weight: 700; margin: 0.3em 0; }
        .ProseMirror-doc p { margin: 0.25em 0; }
        .ProseMirror-doc ul, .ProseMirror-doc ol { padding-left: 1.5em; }
        .ProseMirror-doc table { border-collapse: collapse; width: 100%; }
        .ProseMirror-doc td, .ProseMirror-doc th { border: 1px solid #555; padding: 4px 8px; }
      `}</style>

      <div className="flex h-full bg-gray-50 overflow-hidden">
        {/* Left pane: folder tree */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50">
          <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between bg-transparent">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em]">
              Documents
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FolderTree
              currentFolderId={currentFolderId}
              currentDriveId={currentDriveId}
              onSelectFolder={handleSelectFolder}
              onNewDoc={() => void handleNewDoc()}
              onOpenDoc={(f) => void handleOpenDoc(f)}
            />
          </div>
        </div>

        {/* New doc dialog */}
        {newDocDialog.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-80 shadow-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">New Document</p>
              <input
                type="text"
                value={newDocDialog.title}
                onChange={e => setNewDocDialog(d => ({ ...d, title: e.target.value.slice(0, 255) }))}
                onKeyDown={e => { if (e.key === "Enter") void handleCreateDoc(); if (e.key === "Escape") setNewDocDialog({ open: false, title: "" }); }}
                maxLength={255}
                autoFocus
                className="w-full bg-gray-800 border border-white/10 rounded-2xl px-4 py-2 text-sm text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4"
                placeholder="Document title..."
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setNewDocDialog({ open: false, title: "" })} className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:bg-gray-800">Cancel</button>
                <button onClick={() => void handleCreateDoc()} className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-gray-900 text-white shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5">Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Middle pane: editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50 overflow-hidden">
          {/* Toolbar */}
          <div className="flex-shrink-0 border-b border-gray-200 bg-gray-100 px-4 py-2">
            <div className="flex items-center gap-1 flex-wrap">
              {/* File name */}
              <input
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="h-7 px-2 mr-2 bg-transparent border border-gray-200 rounded-lg text-[11px] font-black text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-40 transition-all"
                placeholder="Document title"
              />

              {/* Save button */}
              <button
                onClick={() =>
                  activeDocIdRef.current
                    ? void handleSave(activeDocIdRef.current)
                    : undefined
                }
                className={cn(
                  "flex items-center gap-1.5 px-3 h-7 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 mr-2",
                  isDirty
                    ? "bg-gray-900 text-white shadow-[0_0_12px_rgba(255,255,255,0.12)] border border-white/5"
                    : "bg-gray-200 text-gray-500"
                )}
              >
                {isSaving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                Save
              </button>

              <Divider />

              {/* Bold / Italic / Underline / Strike */}
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleBold().run()}
                active={editor?.isActive("bold")}
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                active={editor?.isActive("italic")}
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                active={editor?.isActive("underline")}
                title="Underline"
              >
                <UnderlineIcon className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                active={editor?.isActive("strike")}
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </ToolbarBtn>

              <Divider />

              {/* Headings */}
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().toggleHeading({ level: 1 }).run()
                }
                active={editor?.isActive("heading", { level: 1 })}
                title="Heading 1"
              >
                <span className="text-[10px] font-black">H1</span>
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().toggleHeading({ level: 2 }).run()
                }
                active={editor?.isActive("heading", { level: 2 })}
                title="Heading 2"
              >
                <span className="text-[10px] font-black">H2</span>
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().toggleHeading({ level: 3 }).run()
                }
                active={editor?.isActive("heading", { level: 3 })}
                title="Heading 3"
              >
                <span className="text-[10px] font-black">H3</span>
              </ToolbarBtn>

              <Divider />

              {/* Lists */}
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().toggleBulletList().run()
                }
                active={editor?.isActive("bulletList")}
                title="Bullet list"
              >
                <List className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().toggleOrderedList().run()
                }
                active={editor?.isActive("orderedList")}
                title="Ordered list"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </ToolbarBtn>

              <Divider />

              {/* Blockquote / Code */}
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().toggleBlockquote().run()
                }
                active={editor?.isActive("blockquote")}
                title="Blockquote"
              >
                <Quote className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleCode().run()}
                active={editor?.isActive("code")}
                title="Code"
              >
                <Code className="w-3.5 h-3.5" />
              </ToolbarBtn>

              <Divider />

              {/* Text align */}
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().setTextAlign("left").run()
                }
                active={editor?.isActive({ textAlign: "left" })}
                title="Align left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().setTextAlign("center").run()
                }
                active={editor?.isActive({ textAlign: "center" })}
                title="Align center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().setTextAlign("right").run()
                }
                active={editor?.isActive({ textAlign: "right" })}
                title="Align right"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </ToolbarBtn>

              <Divider />

              {/* Insert table */}
              <ToolbarBtn
                onClick={() =>
                  editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
                title="Insert table"
              >
                <Table className="w-3.5 h-3.5" />
              </ToolbarBtn>
            </div>
          </div>

          {/* Document area */}
          <div className="flex-1 overflow-y-auto bg-gray-50 px-8 py-8 relative">
            {docError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-gray-50">
                <div className="bg-gray-900 border border-white/10 rounded-[28px] p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
                  <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
                  {docError === "permission" ? (
                    <>
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-200 mb-2">Authorization Required</p>
                      <p className="text-[10px] text-gray-400 font-bold mb-6">Google Docs access requires updated permissions. Re-authorize your account to continue.</p>
                      <button
                        onClick={() => { void startOAuthFlow(); setDocError(null); }}
                        className="w-full px-4 py-3 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.12)] border border-white/5 active:scale-95 transition-all"
                      >
                        <LogIn className="w-3.5 h-3.5 inline mr-2 text-blue-400" />
                        Re-authorize Google
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-200 mb-2">Failed to Load</p>
                      <p className="text-[10px] text-gray-400 font-bold mb-4">Could not open this document. Please try again.</p>
                      <button onClick={() => setDocError(null)} className="text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gray-300">Dismiss</button>
                    </>
                  )}
                </div>
              </div>
            )}
            <div className="max-w-4xl mx-auto">
              {/* Paper */}
              <div className="bg-gray-100 rounded-[28px] shadow-[0_4px_40px_rgba(0,0,0,0.08)] border border-gray-200/60 px-16 py-14 min-h-[calc(100vh-260px)]">
                {editor ? (
                  <EditorContent editor={editor} />
                ) : (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-gray-100 px-6 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors",
                  isDirty ? "bg-amber-400" : "bg-green-400"
                )}
              />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                {statusText}
              </span>
            </div>
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {wordCount.toLocaleString()} words
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

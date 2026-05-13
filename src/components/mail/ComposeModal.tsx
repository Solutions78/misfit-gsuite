import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendMessage } from "@/lib/tauri";
import { useUIStore } from "@/store/uiStore";
import { useGeminiStore } from "@/store/geminiStore";
import { X, Send, Bold, Italic, UnderlineIcon, List, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ComposeModal() {
  const { composeState, closeCompose } = useUIStore();
  const { lastResponse } = useGeminiStore();
  const queryClient = useQueryClient();

  const [to, setTo] = useState(composeState?.to ?? "");
  const [subject, setSubject] = useState(composeState?.subject ?? "");
  const [minimized, setMinimized] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: composeState?.body ?? "",
  });

  // Inject Gemini-generated reply if available
  useEffect(() => {
    if (lastResponse && editor) {
      editor.commands.setContent(`<p>${lastResponse.replace(/\n/g, "</p><p>")}</p>`);
    }
  }, [lastResponse, editor]);

  const sendMutation = useMutation({
    mutationFn: () =>
      sendMessage({
        to,
        subject,
        htmlBody: editor?.getHTML() ?? "",
        inReplyTo: composeState?.inReplyTo,
        references: composeState?.references,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads", "SENT"] });
      closeCompose();
    },
  });

  if (!editor) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-40 transition-all duration-200",
        minimized ? "w-72 h-12" : "w-[560px] h-[480px]"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded-t-2xl flex-shrink-0">
        <span className="text-sm font-medium text-white">
          {composeState?.mode === "reply" ? "Reply" : "New Message"}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-1 hover:bg-gray-700 rounded transition-colors"
          >
            <Minimize2 className="w-3.5 h-3.5 text-gray-300" />
          </button>
          <button onClick={closeCompose} className="p-1 hover:bg-gray-700 rounded transition-colors">
            <X className="w-3.5 h-3.5 text-gray-300" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Fields */}
          <div className="border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
              <span className="text-xs text-gray-400 w-12 flex-shrink-0">To</span>
              <input
                className="flex-1 text-sm outline-none text-gray-800"
                placeholder="Recipients"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-xs text-gray-400 w-12 flex-shrink-0">Subject</span>
              <input
                className="flex-1 text-sm outline-none text-gray-800"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-4 py-1.5 border-b border-gray-100 flex-shrink-0">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
              icon={Bold}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
              icon={Italic}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive("underline")}
              icon={UnderlineIcon}
            />
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
              icon={List}
            />
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto px-4 py-3 email-body">
            <EditorContent
              editor={editor}
              className="min-h-full outline-none text-sm text-gray-800 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full"
            />
          </div>

          {/* Send button */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 flex-shrink-0">
            <span className="text-xs text-gray-400">
              {sendMutation.isError ? "Failed to send. Try again." : ""}
            </span>
            <button
              onClick={() => sendMutation.mutate()}
              disabled={!to || sendMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              {sendMutation.isPending ? "Sending..." : "Send"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  icon: Icon,
}: {
  onClick: () => void;
  active: boolean;
  icon: React.ElementType;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        "p-1.5 rounded transition-colors",
        active ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

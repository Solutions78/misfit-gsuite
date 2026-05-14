import { useEffect, useRef } from "react";
import { getAttachment } from "@/lib/tauri";
import type { GmailMessage, GmailMessagePart } from "@/types";

interface Props {
  html: string;
  msg: GmailMessage;
  className?: string;
}

export default function EmailBody({ html, msg, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const imgs = Array.from(ref.current.querySelectorAll("img[src]")) as HTMLImageElement[];
    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (src.startsWith("cid:")) {
        const contentId = src.slice(4).replace(/[<>]/g, "");
        const part = findPartByContentId(msg.payload, contentId);
        if (part?.body?.attachmentId) {
          getAttachment(msg.id, part.body.attachmentId)
            .then((b64) => {
              img.src = `data:${part.mimeType ?? "image/png"};base64,${b64}`;
            })
            .catch(() => { img.style.display = "none"; });
        } else if (part?.body?.data) {
          // Inline data already present in the payload
          img.src = `data:${part.mimeType ?? "image/png"};base64,${part.body.data.replace(/-/g, "+").replace(/_/g, "/")}`;
        } else {
          img.style.display = "none";
        }
      }
    }
  }, [html, msg]);

  return (
    <div
      ref={ref}
      className={className}
      style={{ maxWidth: "100%", overflowX: "hidden", wordBreak: "break-word" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function findPartByContentId(
  part: GmailMessagePart | undefined,
  contentId: string
): GmailMessagePart | null {
  if (!part) return null;
  if (part.headers) {
    const cid = part.headers.find((h) => h.name.toLowerCase() === "content-id");
    if (cid && cid.value.replace(/[<>]/g, "") === contentId) return part;
  }
  for (const sub of part.parts ?? []) {
    const found = findPartByContentId(sub, contentId);
    if (found) return found;
  }
  return null;
}

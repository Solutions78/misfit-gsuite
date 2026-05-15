import { useEffect, useRef } from "react";
import type { EmailView } from "@/types";

interface Props {
  view: EmailView;
  className?: string;
}

function sanitizeHtml(raw: string): string {
  if (!raw) return "";
  return raw
    // Remove width/height/min-width attributes on tags entirely
    .replace(/\s+width\s*=\s*["']?\d+%?["']?/gi, "")
    .replace(/\s+height\s*=\s*["']?\d+%?["']?/gi, "")
    // Strip fixed px widths and min-widths from inline styles
    .replace(/([\s;]width\s*:\s*)\d+px/gi, "$1100%")
    .replace(/([\s;]min-width\s*:\s*)\d+px/gi, "$110px")
    // Strip fixed px widths set at the start of a style attribute
    .replace(/(style\s*=\s*["'][^"']*\bwidth\s*:\s*)\d+px/gi, "$1100%");
}

export default function EmailBody({ view, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  
  // Replace cid: references with data URIs from the backend map
  let html = view.bodyHtml;
  Object.entries(view.cidMap).forEach(([cid, dataUri]) => {
    // Search for cid:ID or cid:<ID>
    const regex = new RegExp(`src=["']cid:<?${cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>?["']`, 'gi');
    html = html.replace(regex, `src="${dataUri}"`);
  });

  const sanitized = sanitizeHtml(html);

  return (
    <div
      ref={ref}
      className={className}
      style={{ maxWidth: "100%", overflowX: "hidden", wordBreak: "break-word" }}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

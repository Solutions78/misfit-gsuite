// Free/consumer email providers — senders from these domains route to "Other"
const CONSUMER_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.ca", "yahoo.com.au", "yahoo.fr", "yahoo.de", "yahoo.es", "yahoo.it",
  "ymail.com", "rocketmail.com",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it",
  "outlook.com", "outlook.co.uk", "outlook.fr", "live.com", "live.co.uk",
  "msn.com", "passport.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com",
  "protonmail.com", "proton.me", "pm.me",
  "tutanota.com", "tutamail.com", "tuta.io",
  "zoho.com", "zohomail.com",
  "mail.com", "email.com", "gmx.com", "gmx.net", "gmx.de", "gmx.us",
  "inbox.com",
  "yandex.com", "yandex.ru",
  "qq.com", "163.com", "126.com", "sina.com",
  "naver.com", "daum.net",
  "web.de", "t-online.de", "freenet.de",
  "laposte.net", "free.fr", "sfr.fr", "wanadoo.fr", "orange.fr",
  "libero.it", "virgilio.it", "alice.it", "tin.it",
  "terra.com.br", "bol.com.br", "uol.com.br",
]);

// Known automated/notification sender patterns (no-reply, noreply, etc.)
const AUTOMATED_PREFIXES = [
  "noreply", "no-reply", "no_reply", "donotreply", "do-not-reply",
  "notifications", "notification", "notify",
  "mailer-daemon", "postmaster",
  "bounce", "bounces",
  "alerts", "alert",
  "support+", "info+", "help+",
];

export type DomainClass = "business" | "consumer" | "automated" | "unknown";

export function classifyDomain(from: string | undefined): DomainClass {
  if (!from) return "unknown";

  // Extract email address from "Display Name <email@domain.com>" or plain "email@domain.com"
  const emailMatch = from.match(/<([^>]+)>/) ?? from.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
  if (!emailMatch) return "unknown";

  const email = emailMatch[1].toLowerCase().trim();
  const atIdx = email.lastIndexOf("@");
  if (atIdx === -1) return "unknown";

  const localPart = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);

  // Check for automated senders first
  if (AUTOMATED_PREFIXES.some((prefix) => localPart.startsWith(prefix) || localPart === prefix.replace("+", ""))) {
    return "automated";
  }

  if (CONSUMER_DOMAINS.has(domain)) return "consumer";

  return "business";
}

// Returns true if the thread should appear in "Other" based on its sender domain.
// "Other" = consumer email domains, automated senders, or Gmail's own category labels.
export function isOtherThread(
  from: string | undefined,
  labelIds: string[],
): boolean {
  const CATEGORY_LABELS = new Set([
    "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES",
    "CATEGORY_SOCIAL",
    "CATEGORY_FORUMS",
  ]);

  if (labelIds.some((l) => CATEGORY_LABELS.has(l))) return true;

  const cls = classifyDomain(from);
  return cls === "consumer" || cls === "automated";
}

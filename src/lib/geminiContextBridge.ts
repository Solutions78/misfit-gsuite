/**
 * Simple module-level mutable store for injecting view-specific context
 * into the Gemini drawer without circular imports.
 *
 * Views write to this; GeminiDrawer reads from it at send-time.
 */

let _context: string = "";
let _label: string = "";

export function setGeminiContext(ctx: string, label = "") {
  _context = ctx;
  _label = label;
}

export function clearGeminiContext() {
  _context = "";
  _label = "";
}

export function getGeminiContext(): string | undefined {
  return _context || undefined;
}

export function getGeminiContextLabel(): string {
  return _label;
}

/**
 * Typed context bridge — Drive/Docs/Sheets/Slides views write their current
 * state here; GeminiDrawer reads it at send-time to pass ViewContext to Rust.
 */

export interface DriveViewContext {
  activeView: string;
  openDocId?: string;
  openDocMimeType?: string;
  currentFolderId?: string;
  driveId?: string;
}

let _driveContext: DriveViewContext | null = null;

// Legacy string context for Slack/Fireflies (keep working)
let _stringContext: string = "";
let _stringLabel: string = "";

export function setDriveContext(ctx: DriveViewContext) {
  _driveContext = ctx;
}

export function clearDriveContext() {
  _driveContext = null;
}

export function getDriveContext(): DriveViewContext | null {
  return _driveContext;
}

// Legacy Slack/Fireflies string context — unchanged
export function setGeminiContext(ctx: string, label = "") {
  _stringContext = ctx;
  _stringLabel = label;
}

export function clearGeminiContext() {
  _stringContext = "";
  _stringLabel = "";
}

export function getGeminiContext(): string | undefined {
  return _stringContext || undefined;
}

export function getGeminiContextLabel(): string {
  return _stringLabel;
}

pub const SCHEMA: &str = "
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    subject TEXT,
    from_address TEXT,
    snippet TEXT,
    body_html TEXT,
    label_ids TEXT DEFAULT '[]',
    is_read INTEGER DEFAULT 0,
    is_starred INTEGER DEFAULT 0,
    has_attachment INTEGER DEFAULT 0,
    internal_date INTEGER,
    synced_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(internal_date DESC);

CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    account_email TEXT NOT NULL,
    name TEXT NOT NULL,
    label_type TEXT,
    messages_total INTEGER DEFAULT 0,
    messages_unread INTEGER DEFAULT 0,
    background_color TEXT,
    text_color TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
    account_email TEXT PRIMARY KEY,
    history_id TEXT,
    last_synced_at INTEGER,
    watch_expiration INTEGER
);

CREATE TABLE IF NOT EXISTS accounts (
    email TEXT PRIMARY KEY,
    display_name TEXT,
    picture_url TEXT,
    added_at INTEGER
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS pending_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_type TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hidden_chat_spaces (
    account_email TEXT NOT NULL,
    space_name TEXT NOT NULL,
    hidden_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    PRIMARY KEY (account_email, space_name)
);

CREATE TABLE IF NOT EXISTS docs_cache (
  doc_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  content_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS docs_drafts (
  draft_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES docs_cache(doc_id),
  delta_json TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);
";

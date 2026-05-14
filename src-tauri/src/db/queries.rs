use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

// ── Structs ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedMessage {
    pub id: String,
    pub thread_id: String,
    pub subject: Option<String>,
    pub from_address: Option<String>,
    pub snippet: Option<String>,
    pub body_html: Option<String>,
    pub date_header: Option<String>,
    pub label_ids: Vec<String>,
    pub is_read: bool,
    pub is_starred: bool,
    pub has_attachment: bool,
    pub internal_date: Option<i64>,
}

/// A flattened thread summary read from the local cache — used for the list pane.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedThreadSummary {
    pub id: String,          // message id of the representative (latest) message
    pub thread_id: String,
    pub subject: Option<String>,
    pub from_address: Option<String>,
    pub snippet: Option<String>,
    pub date_header: Option<String>,
    pub internal_date: Option<i64>,
    pub is_read: bool,
    pub is_starred: bool,
    pub message_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingOp {
    pub id: i64,
    pub op_type: String,
    pub payload: String,
    pub attempts: i32,
}

// ── Core message CRUD ──────────────────────────────────────────────────────

pub fn upsert_message(conn: &Connection, msg: &CachedMessage) -> Result<(), AppError> {
    let label_ids_json = serde_json::to_string(&msg.label_ids)?;
    conn.execute(
        "INSERT OR REPLACE INTO messages
         (id, thread_id, subject, from_address, snippet, body_html, date_header,
          label_ids, is_read, is_starred, has_attachment, internal_date, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, strftime('%s','now'))",
        params![
            msg.id,
            msg.thread_id,
            msg.subject,
            msg.from_address,
            msg.snippet,
            msg.body_html,
            msg.date_header,
            label_ids_json,
            msg.is_read as i32,
            msg.is_starred as i32,
            msg.has_attachment as i32,
            msg.internal_date,
        ],
    )?;
    Ok(())
}

/// Alias — callers in sync paths use this name for clarity.
pub fn upsert_thread_summary(conn: &Connection, msg: &CachedMessage) -> Result<(), AppError> {
    upsert_message(conn, msg)
}

// ── Thread-summary list ────────────────────────────────────────────────────

/// Return one summary row per thread, using the most-recently-dated message as
/// the representative. `label_id` is matched against the JSON array stored in
/// label_ids (e.g. "INBOX", "SENT", "STARRED").
pub fn list_cached_thread_summaries(
    conn: &Connection,
    label_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<CachedThreadSummary>, AppError> {
    // We select the latest message per thread where that message carries the
    // requested label, then join back to get a count of all messages in the thread.
    let mut stmt = conn.prepare(
        "SELECT
            m.id,
            m.thread_id,
            m.subject,
            m.from_address,
            m.snippet,
            m.date_header,
            m.internal_date,
            m.is_read,
            m.is_starred,
            (SELECT COUNT(*) FROM messages mc WHERE mc.thread_id = m.thread_id) AS message_count
         FROM messages m
         INNER JOIN (
             SELECT thread_id, MAX(internal_date) AS max_date
             FROM messages
             WHERE label_ids LIKE '%' || ?1 || '%'
             GROUP BY thread_id
         ) latest ON m.thread_id = latest.thread_id AND m.internal_date = latest.max_date
         ORDER BY m.internal_date DESC
         LIMIT ?2 OFFSET ?3",
    )?;

    let rows = stmt.query_map(params![label_id, limit, offset], |row| {
        Ok(CachedThreadSummary {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            subject: row.get(2)?,
            from_address: row.get(3)?,
            snippet: row.get(4)?,
            date_header: row.get(5)?,
            internal_date: row.get(6)?,
            is_read: row.get::<_, i32>(7)? != 0,
            is_starred: row.get::<_, i32>(8)? != 0,
            message_count: row.get(9)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(AppError::Database)?);
    }
    Ok(results)
}

/// Search cached messages by query string across subject, from_address, snippet.
pub fn search_cached_threads(
    conn: &Connection,
    query: &str,
    limit: i64,
) -> Result<Vec<CachedThreadSummary>, AppError> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT
            m.id,
            m.thread_id,
            m.subject,
            m.from_address,
            m.snippet,
            m.date_header,
            m.internal_date,
            m.is_read,
            m.is_starred,
            (SELECT COUNT(*) FROM messages mc WHERE mc.thread_id = m.thread_id) AS message_count
         FROM messages m
         INNER JOIN (
             SELECT thread_id, MAX(internal_date) AS max_date
             FROM messages
             WHERE subject LIKE ?1 OR from_address LIKE ?1 OR snippet LIKE ?1
             GROUP BY thread_id
         ) latest ON m.thread_id = latest.thread_id AND m.internal_date = latest.max_date
         ORDER BY m.internal_date DESC
         LIMIT ?2",
    )?;

    let rows = stmt.query_map(params![pattern, limit], |row| {
        Ok(CachedThreadSummary {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            subject: row.get(2)?,
            from_address: row.get(3)?,
            snippet: row.get(4)?,
            date_header: row.get(5)?,
            internal_date: row.get(6)?,
            is_read: row.get::<_, i32>(7)? != 0,
            is_starred: row.get::<_, i32>(8)? != 0,
            message_count: row.get(9)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(AppError::Database)?);
    }
    Ok(results)
}

// ── Body cache ─────────────────────────────────────────────────────────────

pub fn get_cached_body(conn: &Connection, msg_id: &str) -> Result<Option<String>, AppError> {
    let result = conn.query_row(
        "SELECT body_html FROM messages WHERE id = ?1",
        params![msg_id],
        |row| row.get::<_, Option<String>>(0),
    );
    match result {
        Ok(body) => Ok(body),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

pub fn store_body(conn: &Connection, msg_id: &str, body_html: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE messages SET body_html = ?1, synced_at = strftime('%s','now') WHERE id = ?2",
        params![body_html, msg_id],
    )?;
    Ok(())
}

// ── Label mutations ────────────────────────────────────────────────────────

/// Optimistically apply a label change to the local DB.
pub fn apply_local_label_change(
    conn: &Connection,
    msg_id: &str,
    add_labels: &[String],
    remove_labels: &[String],
) -> Result<(), AppError> {
    // Read current label_ids JSON
    let label_ids_json: String = conn.query_row(
        "SELECT label_ids FROM messages WHERE id = ?1",
        params![msg_id],
        |row| row.get(0),
    ).unwrap_or_else(|_| "[]".to_string());

    let mut labels: Vec<String> = serde_json::from_str(&label_ids_json).unwrap_or_default();

    for l in remove_labels {
        labels.retain(|x| x != l);
    }
    for l in add_labels {
        if !labels.contains(l) {
            labels.push(l.clone());
        }
    }

    let is_read = !labels.contains(&"UNREAD".to_string());
    let is_starred = labels.contains(&"STARRED".to_string());
    let new_json = serde_json::to_string(&labels)?;

    conn.execute(
        "UPDATE messages SET label_ids = ?1, is_read = ?2, is_starred = ?3 WHERE id = ?4",
        params![new_json, is_read as i32, is_starred as i32, msg_id],
    )?;
    Ok(())
}

// ── Pending operations ─────────────────────────────────────────────────────

pub fn enqueue_op(conn: &Connection, op_type: &str, payload: &str) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO pending_operations (op_type, payload) VALUES (?1, ?2)",
        params![op_type, payload],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_pending_ops(conn: &Connection) -> Result<Vec<PendingOp>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, op_type, payload, attempts FROM pending_operations ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PendingOp {
            id: row.get(0)?,
            op_type: row.get(1)?,
            payload: row.get(2)?,
            attempts: row.get(3)?,
        })
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(AppError::Database)?);
    }
    Ok(results)
}

pub fn delete_pending_op(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM pending_operations WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn increment_op_attempts(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE pending_operations SET attempts = attempts + 1 WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

// ── Sync state ────────────────────────────────────────────────────────────

pub fn get_sync_state(conn: &Connection, email: &str) -> Result<Option<String>, AppError> {
    let result = conn.query_row(
        "SELECT history_id FROM sync_state WHERE account_email = ?1",
        params![email],
        |row| row.get::<_, Option<String>>(0),
    );
    match result {
        Ok(id) => Ok(id),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

pub fn update_sync_state(conn: &Connection, email: &str, history_id: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR REPLACE INTO sync_state (account_email, history_id, last_synced_at)
         VALUES (?1, ?2, strftime('%s','now'))",
        params![email, history_id],
    )?;
    Ok(())
}

pub fn update_watch_expiration(conn: &Connection, email: &str, expiration: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_state SET watch_expiration = ?1 WHERE account_email = ?2",
        params![expiration, email],
    )?;
    Ok(())
}

pub fn get_watch_expiration(conn: &Connection, email: &str) -> Result<Option<i64>, AppError> {
    let result = conn.query_row(
        "SELECT watch_expiration FROM sync_state WHERE account_email = ?1",
        params![email],
        |row| row.get::<_, Option<i64>>(0),
    );
    match result {
        Ok(exp) => Ok(exp),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

// ── Accounts ───────────────────────────────────────────────────────────────

pub fn upsert_account(conn: &Connection, email: &str, display_name: &str, picture_url: Option<&str>) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR REPLACE INTO accounts (email, display_name, picture_url, added_at)
         VALUES (?1, ?2, ?3, strftime('%s','now'))",
        params![email, display_name, picture_url],
    )?;
    Ok(())
}

pub fn list_accounts(conn: &Connection) -> Result<Vec<(String, String, Option<String>)>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT email, display_name, picture_url FROM accounts ORDER BY added_at"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(AppError::Database)?);
    }
    Ok(results)
}

// ── Per-message fetch helpers ──────────────────────────────────────────────

/// Return all messages for a thread, ordered oldest-first.
pub fn get_messages_for_thread(
    conn: &Connection,
    thread_id: &str,
) -> Result<Vec<CachedMessage>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, thread_id, subject, from_address, snippet, body_html, date_header,
                label_ids, is_read, is_starred, has_attachment, internal_date
         FROM messages
         WHERE thread_id = ?1
         ORDER BY internal_date ASC",
    )?;

    let rows = stmt.query_map(params![thread_id], |row| {
        let label_ids_json: String = row.get(7)?;
        let label_ids: Vec<String> =
            serde_json::from_str(&label_ids_json).unwrap_or_default();
        Ok(CachedMessage {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            subject: row.get(2)?,
            from_address: row.get(3)?,
            snippet: row.get(4)?,
            body_html: row.get(5)?,
            date_header: row.get(6)?,
            label_ids,
            is_read: row.get::<_, i32>(8)? != 0,
            is_starred: row.get::<_, i32>(9)? != 0,
            has_attachment: row.get::<_, i32>(10)? != 0,
            internal_date: row.get(11)?,
        })
    })?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(AppError::Database)?);
    }
    Ok(results)
}

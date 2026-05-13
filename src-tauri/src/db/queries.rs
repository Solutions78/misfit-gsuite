use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedMessage {
    pub id: String,
    pub thread_id: String,
    pub subject: Option<String>,
    pub from_address: Option<String>,
    pub snippet: Option<String>,
    pub label_ids: Vec<String>,
    pub is_read: bool,
    pub is_starred: bool,
    pub has_attachment: bool,
    pub internal_date: Option<i64>,
}

pub fn upsert_message(conn: &Connection, msg: &CachedMessage) -> Result<(), AppError> {
    let label_ids_json = serde_json::to_string(&msg.label_ids)?;
    conn.execute(
        "INSERT OR REPLACE INTO messages
         (id, thread_id, subject, from_address, snippet, label_ids, is_read, is_starred, has_attachment, internal_date, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, strftime('%s','now'))",
        params![
            msg.id,
            msg.thread_id,
            msg.subject,
            msg.from_address,
            msg.snippet,
            label_ids_json,
            msg.is_read as i32,
            msg.is_starred as i32,
            msg.has_attachment as i32,
            msg.internal_date,
        ],
    )?;
    Ok(())
}

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
        results.push(row?);
    }
    Ok(results)
}

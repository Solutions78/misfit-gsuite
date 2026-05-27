//! Knowledge Graph Crawler Engine
//!
//! This module implements a high-performance, resilient background crawler for Google Drive.
//! It builds a local "digital brain" by indexing file metadata and structural relationships.

use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::api::client::ApiClient;
use crate::api::drive;
use crate::db::kg_queries::{self, KgCrawlState, KgNode};
use crate::error::AppError;

// ── High-Value MIME Whitelist ─────────────────────────────────────────────

const KG_MIME_WHITELIST: &[&str] = &[
    "application/vnd.google-apps.folder",
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/pdf",
    "text/markdown",
    "text/plain",
    "text/csv",
    "text/tab-separated-values",
    "text/javascript",
    "application/x-shellscript",
];

fn is_high_value(name: &str, mime_type: &str) -> bool {
    // 1. Ignore hidden files
    if name.starts_with('.') {
        return false;
    }

    // 2. Check whitelist
    if KG_MIME_WHITELIST.contains(&mime_type) {
        return true;
    }

    // 3. Check media and code patterns
    let mt = mime_type.to_lowercase();
    if mt.starts_with("video/") || mt.starts_with("audio/") || mt.starts_with("text/x-") {
        return true;
    }

    false
}

// ── Conversion helper ─────────────────────────────────────────────────────

fn drive_file_to_kg_node(f: &drive::DriveFileKg) -> KgNode {
    let now = now_secs();

    let parents_json = serde_json::to_string(&f.parents.as_deref().unwrap_or(&[]))
        .unwrap_or_else(|_| "[]".to_string());

    let owners_json = f
        .owners
        .as_ref()
        .map(|owners| {
            let emails: Vec<&str> = owners
                .iter()
                .filter_map(|o| o.email_address.as_deref())
                .collect();
            serde_json::to_string(&emails).unwrap_or_else(|_| "[]".to_string())
        })
        .unwrap_or_else(|| "[]".to_string());

    let last_modifying_user = f
        .last_modifying_user
        .as_ref()
        .and_then(|u| u.email_address.clone());

    KgNode {
        file_id: f.id.clone(),
        name: f.name.clone(),
        mime_type: f.mime_type.clone(),
        modified_time: f.modified_time.clone(),
        web_view_link: f.web_view_link.clone(),
        parents_json,
        drive_id: f.drive_id.clone(),
        shared: f.shared.unwrap_or(false),
        owners_json,
        last_modifying_user,
        crawled_at: now,
        enrich_status: "pending".to_string(),
        enrich_error: None,
        enriched_at: None,
        topic_tags_json: None,
        importance_score: None,
        summary: None,
        entities_json: None,
        relationships_json: None,
    }
}

// ── Full crawl ────────────────────────────────────────────────────────────

pub async fn run_full_crawl(
    api: &ApiClient,
    db: &Mutex<rusqlite::Connection>,
    app: &AppHandle,
) -> Result<(), AppError> {
    let mut state = {
        let conn = db.lock().await;
        kg_queries::get_crawl_state(&conn)?
    };

    if state.crawl_status == "done" && state.changes_page_token.is_some() {
        return Ok(());
    }

    crate::logging::info(
        "kg.crawler",
        format!(
            "Starting/Resuming full crawl. Current status: {}",
            state.crawl_status
        ),
    );

    if state.crawl_status == "idle" || state.crawl_status == "failed" {
        state.crawl_status = "running".to_string();
        state.crawled_files = 0;
        state.total_files = 0;
        state.active_drive_id = Some("user".to_string());
        state.active_page_token = None;
        state.last_activity_at = Some(now_secs());

        let conn = db.lock().await;
        kg_queries::update_crawl_state(&conn, &state)?;
    }

    let mut crawled_count = state.crawled_files;

    // ── 1. My Drive (corpora = "user") ────────────────────────────────────
    if state.active_drive_id.as_deref() == Some("user") {
        let mut page_token = state.active_page_token.clone();

        loop {
            heartbeat(db, &mut state, crawled_count).await?;

            let resp =
                drive::list_files_for_kg(api, "user", None, page_token.as_deref(), 100).await?;

            // Filter for high-value assets only
            let high_value_files: Vec<_> = resp
                .files
                .into_iter()
                .filter(|f| is_high_value(&f.name, &f.mime_type))
                .collect();

            process_batch(db, &high_value_files, &mut crawled_count).await?;
            let _ = app.emit("kg::crawl_progress", crawled_count);

            match resp.next_page_token {
                Some(token) => {
                    page_token = Some(token.clone());
                    state.active_page_token = Some(token);
                }
                None => {
                    state.active_drive_id = Some("shared_drives_start".to_string());
                    state.active_page_token = None;
                    break;
                }
            }
        }
    }

    // ── 2. Shared drives ──────────────────────────────────────────────────
    let mut drives_page_token: Option<String> = None;
    let mut resume_drive_id = if state.active_drive_id.as_deref() == Some("shared_drives_start") {
        None
    } else {
        state.active_drive_id.clone()
    };

    loop {
        let drives_resp = drive::list_shared_drives(api, drives_page_token.as_deref()).await?;

        for shared_drive in &drives_resp.drives {
            if let Some(ref target_id) = resume_drive_id {
                if &shared_drive.id != target_id {
                    continue;
                }
                resume_drive_id = None;
            }

            state.active_drive_id = Some(shared_drive.id.clone());
            let mut file_page_token = state.active_page_token.clone();

            loop {
                heartbeat(db, &mut state, crawled_count).await?;

                let resp = drive::list_files_for_kg(
                    api,
                    "drive",
                    Some(&shared_drive.id),
                    file_page_token.as_deref(),
                    100,
                )
                .await?;

                // Filter for high-value assets only
                let high_value_files: Vec<_> = resp
                    .files
                    .into_iter()
                    .filter(|f| is_high_value(&f.name, &f.mime_type))
                    .collect();

                process_batch(db, &high_value_files, &mut crawled_count).await?;
                let _ = app.emit("kg::crawl_progress", crawled_count);

                match resp.next_page_token {
                    Some(token) => {
                        file_page_token = Some(token.clone());
                        state.active_page_token = Some(token);
                    }
                    None => {
                        state.active_page_token = None;
                        break;
                    }
                }
            }
        }

        match drives_resp.next_page_token {
            Some(token) => drives_page_token = Some(token),
            None => break,
        }
    }

    // ── 3. Finalize ───────────────────────────────────────────────────────
    let start_token = drive::get_changes_start_token(api).await?;

    state.changes_page_token = Some(start_token);
    state.crawl_status = "done".to_string();
    state.last_crawl_at = Some(now_secs());
    state.last_activity_at = Some(now_secs());
    state.active_drive_id = None;
    state.active_page_token = None;
    state.crawled_files = crawled_count;
    state.total_files = crawled_count;

    {
        let conn = db.lock().await;
        kg_queries::update_crawl_state(&conn, &state)?;
    }

    crate::logging::info(
        "kg.crawler",
        format!("Full crawl complete. Files indexed: {}", crawled_count),
    );
    let _ = app.emit("kg::crawl_complete", crawled_count);
    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────

async fn heartbeat(
    db: &Mutex<rusqlite::Connection>,
    state: &mut KgCrawlState,
    crawled_count: i64,
) -> Result<(), AppError> {
    state.last_activity_at = Some(now_secs());
    state.crawled_files = crawled_count;

    let conn = db.lock().await;
    kg_queries::update_crawl_state(&conn, state)?;
    Ok(())
}

async fn process_batch(
    db: &Mutex<rusqlite::Connection>,
    files: &[drive::DriveFileKg],
    count: &mut i64,
) -> Result<(), AppError> {
    let conn = db.lock().await;
    conn.execute("BEGIN TRANSACTION", [])?;

    for file in files {
        let node = drive_file_to_kg_node(file);
        let parents = file.parents.clone().unwrap_or_default();
        let file_id = file.id.clone();

        kg_queries::upsert_kg_node(&conn, &node)?;

        for parent_id in &parents {
            kg_queries::insert_kg_edge(&conn, parent_id, &file_id, "folder_hierarchy", 1.0, None)?;
        }
        *count += 1;
    }

    conn.execute("COMMIT", [])?;
    Ok(())
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

// ── Delta sync ────────────────────────────────────────────────────────────

pub async fn run_delta_sync(
    api: &ApiClient,
    db: &Mutex<rusqlite::Connection>,
    app: &AppHandle,
) -> Result<(), AppError> {
    let mut state = {
        let conn = db.lock().await;
        kg_queries::get_crawl_state(&conn)?
    };

    let mut page_token = match state.changes_page_token.clone() {
        Some(t) => t,
        None => {
            return run_full_crawl(api, db, app).await;
        }
    };

    crate::logging::info(
        "kg.crawler",
        format!("Starting delta sync from token: {}", page_token),
    );

    state.crawl_status = "running".to_string();
    state.last_activity_at = Some(now_secs());
    {
        let conn = db.lock().await;
        kg_queries::update_crawl_state(&conn, &state)?;
    }
    let _ = app.emit("kg::crawl_progress", ());

    let mut new_start_token: Option<String> = None;
    let mut processed_changes = 0;

    loop {
        let resp = drive::list_changes(api, &page_token).await?;

        {
            let conn = db.lock().await;
            conn.execute("BEGIN TRANSACTION", [])?;

            for change in &resp.changes {
                if change.removed {
                    kg_queries::delete_kg_node(&conn, &change.file_id)?;
                } else if let Some(file) = &change.file {
                    // Apply high-value filter during delta sync
                    if is_high_value(&file.name, &file.mime_type) {
                        let node = drive_file_to_kg_node(file);
                        let parents = file.parents.clone().unwrap_or_default();
                        let file_id = file.id.clone();

                        kg_queries::upsert_kg_node(&conn, &node)?;

                        for parent_id in &parents {
                            kg_queries::insert_kg_edge(
                                &conn,
                                parent_id,
                                &file_id,
                                "folder_hierarchy",
                                1.0,
                                None,
                            )?;
                        }
                    }
                }
                processed_changes += 1;
            }
            conn.execute("COMMIT", [])?;
        }

        if let Some(ref t) = resp.new_start_page_token {
            new_start_token = Some(t.clone());
        }

        match resp.next_page_token {
            Some(next) => {
                page_token = next.clone();
                state.changes_page_token = Some(next);
                let current_crawled = state.crawled_files;
                heartbeat(db, &mut state, current_crawled).await?;
            }
            None => break,
        }
    }

    state.crawl_status = "done".to_string();
    state.last_delta_at = Some(now_secs());
    state.last_activity_at = Some(now_secs());
    if let Some(t) = new_start_token {
        state.changes_page_token = Some(t);
    }

    {
        let conn = db.lock().await;
        kg_queries::update_crawl_state(&conn, &state)?;
    }

    crate::logging::info(
        "kg.crawler",
        format!(
            "Delta sync complete. Processed {} changes.",
            processed_changes
        ),
    );
    let _ = app.emit("kg::crawl_complete", ());
    Ok(())
}

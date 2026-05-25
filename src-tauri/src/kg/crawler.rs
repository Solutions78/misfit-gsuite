use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::api::client::ApiClient;
use crate::api::drive;
use crate::db::kg_queries::{self, KgNode};
use crate::error::AppError;

// ── Conversion helper ─────────────────────────────────────────────────────

fn drive_file_to_kg_node(f: &drive::DriveFileKg) -> KgNode {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

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

/// Crawl all of My Drive and every shared drive, upsert each file as a
/// KgNode, write folder-hierarchy edges, then record the Changes API
/// start-page-token so future calls can use delta sync.
pub async fn run_full_crawl(
    api: &ApiClient,
    db: &Mutex<rusqlite::Connection>,
    app: &AppHandle,
) -> Result<(), AppError> {
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Mark crawl as running
    {
        let conn = db.lock().await;
        let mut state = kg_queries::get_crawl_state(&conn)?;
        state.crawl_status = "running".to_string();
        state.crawled_files = 0;
        state.total_files = 0;
        kg_queries::update_crawl_state(&conn, &state)?;
    }
    let _ = app.emit("kg::crawl_progress", 0u64);

    let mut crawled_count: i64 = 0;

    // ── 1. My Drive (corpora = "user") ────────────────────────────────────
    let mut page_token: Option<String> = None;
    loop {
        let resp = drive::list_files_for_kg(
            api,
            "user",
            None,
            page_token.as_deref(),
            100,
        )
        .await?;

        for file in &resp.files {
            let node = drive_file_to_kg_node(file);
            let parents = file.parents.clone().unwrap_or_default();
            let file_id = file.id.clone();

            {
                let conn = db.lock().await;
                kg_queries::upsert_kg_node(&conn, &node)?;
            }

            for parent_id in &parents {
                let conn = db.lock().await;
                kg_queries::insert_kg_edge(
                    &conn,
                    parent_id,
                    &file_id,
                    "folder_hierarchy",
                    1.0,
                    None,
                )?;
            }

            crawled_count += 1;
        }

        // Emit progress after each page
        {
            let conn = db.lock().await;
            let mut state = kg_queries::get_crawl_state(&conn)?;
            state.crawled_files = crawled_count;
            kg_queries::update_crawl_state(&conn, &state)?;
        }
        let _ = app.emit("kg::crawl_progress", crawled_count);

        match resp.next_page_token {
            Some(token) => page_token = Some(token),
            None => break,
        }
    }

    // ── 2. Shared drives ──────────────────────────────────────────────────
    let mut drives_page_token: Option<String> = None;
    loop {
        let drives_resp =
            drive::list_shared_drives(api, drives_page_token.as_deref()).await?;

        for shared_drive in &drives_resp.drives {
            let drive_id = shared_drive.id.clone();
            let mut file_page_token: Option<String> = None;

            loop {
                let resp = drive::list_files_for_kg(
                    api,
                    "drive",
                    Some(&drive_id),
                    file_page_token.as_deref(),
                    100,
                )
                .await?;

                for file in &resp.files {
                    let node = drive_file_to_kg_node(file);
                    let parents = file.parents.clone().unwrap_or_default();
                    let file_id = file.id.clone();

                    {
                        let conn = db.lock().await;
                        kg_queries::upsert_kg_node(&conn, &node)?;
                    }

                    for parent_id in &parents {
                        let conn = db.lock().await;
                        kg_queries::insert_kg_edge(
                            &conn,
                            parent_id,
                            &file_id,
                            "folder_hierarchy",
                            1.0,
                            None,
                        )?;
                    }

                    crawled_count += 1;
                }

                // Emit progress after each page
                {
                    let conn = db.lock().await;
                    let mut state = kg_queries::get_crawl_state(&conn)?;
                    state.crawled_files = crawled_count;
                    kg_queries::update_crawl_state(&conn, &state)?;
                }
                let _ = app.emit("kg::crawl_progress", crawled_count);

                match resp.next_page_token {
                    Some(token) => file_page_token = Some(token),
                    None => break,
                }
            }
        }

        match drives_resp.next_page_token {
            Some(token) => drives_page_token = Some(token),
            None => break,
        }
    }

    // ── 3. Record the Changes API start-page-token ────────────────────────
    let start_token = drive::get_changes_start_token(api).await?;

    {
        let conn = db.lock().await;
        let mut state = kg_queries::get_crawl_state(&conn)?;
        state.changes_page_token = Some(start_token);
        state.crawl_status = "done".to_string();
        state.last_crawl_at = Some(now_secs);
        state.crawled_files = crawled_count;
        kg_queries::update_crawl_state(&conn, &state)?;
    }

    let _ = app.emit("kg::crawl_complete", crawled_count);
    Ok(())
}

// ── Delta sync ────────────────────────────────────────────────────────────

/// Apply incremental Drive changes since the last crawl.  Falls back to a
/// full crawl if no start-page-token is recorded yet.
pub async fn run_delta_sync(
    api: &ApiClient,
    db: &Mutex<rusqlite::Connection>,
    app: &AppHandle,
) -> Result<(), AppError> {
    // Read current state; fall back to full crawl if no token recorded.
    let initial_token = {
        let conn = db.lock().await;
        let state = kg_queries::get_crawl_state(&conn)?;
        state.changes_page_token.clone()
    };

    let mut page_token = match initial_token {
        Some(t) => t,
        None => {
            return run_full_crawl(api, db, app).await;
        }
    };

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // Mark delta as running
    {
        let conn = db.lock().await;
        let mut state = kg_queries::get_crawl_state(&conn)?;
        state.crawl_status = "running".to_string();
        state.last_delta_at = Some(now_secs);
        kg_queries::update_crawl_state(&conn, &state)?;
    }
    let _ = app.emit("kg::crawl_progress", ());

    let mut new_start_token: Option<String> = None;

    // ── Paginate through all changes ──────────────────────────────────────
    loop {
        let resp = drive::list_changes(api, &page_token).await?;

        for change in &resp.changes {
            if change.removed {
                let conn = db.lock().await;
                kg_queries::delete_kg_node(&conn, &change.file_id)?;
            } else if let Some(file) = &change.file {
                let node = drive_file_to_kg_node(file);
                let parents = file.parents.clone().unwrap_or_default();
                let file_id = file.id.clone();

                {
                    let conn = db.lock().await;
                    kg_queries::upsert_kg_node(&conn, &node)?;
                }

                for parent_id in &parents {
                    let conn = db.lock().await;
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

        // Save new_start_page_token if the API returned one (last page).
        if let Some(ref t) = resp.new_start_page_token {
            new_start_token = Some(t.clone());
        }

        match resp.next_page_token {
            Some(next) => page_token = next,
            None => break,
        }
    }

    // ── Persist updated token and mark done ───────────────────────────────
    let final_now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    {
        let conn = db.lock().await;
        let mut state = kg_queries::get_crawl_state(&conn)?;
        state.crawl_status = "done".to_string();
        state.last_delta_at = Some(final_now);
        if let Some(t) = new_start_token {
            state.changes_page_token = Some(t);
        }
        kg_queries::update_crawl_state(&conn, &state)?;
    }

    let _ = app.emit("kg::crawl_complete", ());
    Ok(())
}

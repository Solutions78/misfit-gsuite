use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::db::kg_queries::{self, KgGraphPayload, KgNode};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KgStatusResponse {
    pub crawl_status: String,
    pub total_files: i64,
    pub crawled_files: i64,
    pub enriched_files: i64,
    pub last_crawl_at: Option<i64>,
    pub pending_enrichment: i64,
}

#[tauri::command]
pub async fn start_kg_crawl(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Check if already running
    {
        let conn = state.db.lock().await;
        let crawl_state = kg_queries::get_crawl_state(&conn).map_err(|e| e.to_string())?;
        if crawl_state.crawl_status == "running" {
            return Err("Crawl already in progress".to_string());
        }
    }

    // Clone AppHandle to move into spawned task — AppHandle is Clone + Send + Sync
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        let state = app_clone.state::<AppState>();
        let api = state.api.read().await;

        if let Err(e) = crate::kg::crawler::run_full_crawl(&api, &state.db, &app_clone).await {
            eprintln!("KG full crawl error: {}", e);
            // Mark as failed in DB
            let conn = state.db.lock().await;
            if let Ok(mut cs) = kg_queries::get_crawl_state(&conn) {
                cs.crawl_status = "failed".to_string();
                cs.error_message = Some(e.to_string());
                let _ = kg_queries::update_crawl_state(&conn, &cs);
            }
            return;
        }

        drop(api); // release read lock before re-acquiring

        let api = state.api.read().await;
        if let Err(e) = crate::kg::enricher::run_enrichment_batch(&api, &state.db, &app_clone).await {
            eprintln!("KG enrichment error: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_kg_status(state: State<'_, AppState>) -> Result<KgStatusResponse, String> {
    let conn = state.db.lock().await;
    let cs = kg_queries::get_crawl_state(&conn).map_err(|e| e.to_string())?;
    let pending = kg_queries::get_pending_enrichment_count(&conn).map_err(|e| e.to_string())?;
    Ok(KgStatusResponse {
        crawl_status: cs.crawl_status,
        total_files: cs.total_files,
        crawled_files: cs.crawled_files,
        enriched_files: cs.enriched_files,
        last_crawl_at: cs.last_crawl_at,
        pending_enrichment: pending,
    })
}

#[tauri::command]
pub async fn get_kg_graph(state: State<'_, AppState>) -> Result<KgGraphPayload, String> {
    let conn = state.db.lock().await;
    kg_queries::get_kg_graph(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_kg_node(
    state: State<'_, AppState>,
    file_id: String,
) -> Result<Option<KgNode>, String> {
    let conn = state.db.lock().await;
    kg_queries::get_kg_node(&conn, &file_id).map_err(|e| e.to_string())
}

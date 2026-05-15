use serde_json::Value;
use tauri::State;

use crate::api::docs::{self, DocContent};
use crate::db::queries;
use crate::AppState;

#[tauri::command]
pub async fn get_document(
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<DocContent, String> {
    let api = state.api.read().await;
    let doc = docs::get_document(&api, &doc_id)
        .await
        .map_err(|e| e.to_string())?;

    // Cache to SQLite
    {
        let db = state.db.lock().await;
        let _ = queries::upsert_doc_cache(
            &db,
            &doc.doc_id,
            &doc.title,
            &doc.revision_id,
            &doc.body_json,
        );
    }

    Ok(doc)
}

#[tauri::command]
pub async fn save_document(
    state: State<'_, AppState>,
    doc_id: String,
    requests: Vec<Value>,
) -> Result<(), String> {
    let api = state.api.read().await;
    docs::save_document(&api, &doc_id, requests)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_document(
    state: State<'_, AppState>,
    title: String,
    folder_id: Option<String>,
) -> Result<DocContent, String> {
    let api = state.api.read().await;
    let doc = docs::create_document(&api, &title, folder_id)
        .await
        .map_err(|e| e.to_string())?;

    // Cache to SQLite
    {
        let db = state.db.lock().await;
        let _ = queries::upsert_doc_cache(
            &db,
            &doc.doc_id,
            &doc.title,
            &doc.revision_id,
            &doc.body_json,
        );
    }

    Ok(doc)
}

use serde_json::Value;
use tauri::State;

use crate::api::docs::{self, DocContent};
use crate::db::queries;
use crate::AppState;

fn validate_drive_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 256
        || !id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("Invalid Drive ID: '{}'", id));
    }
    Ok(())
}

fn validate_title(title: &str) -> Result<(), String> {
    if title.is_empty() || title.len() > 1024 {
        return Err("Document title must be 1–1024 characters".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_document(
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<DocContent, String> {
    validate_drive_id(&doc_id)?;
    let api = state.api.read().await;
    let doc = docs::get_document(&api, &doc_id)
        .await
        .map_err(|e| e.to_string())?;

    // Cache to SQLite
    {
        let db = state.db.lock().await;
        if let Err(e) = queries::upsert_doc_cache(
            &db,
            &doc.doc_id,
            &doc.title,
            &doc.revision_id,
            &doc.body_json,
        ) {
            eprintln!("[docs_cache] upsert failed for {}: {}", doc.doc_id, e);
        }
    }

    Ok(doc)
}

#[tauri::command]
pub async fn save_document(
    state: State<'_, AppState>,
    doc_id: String,
    requests: Vec<Value>,
) -> Result<(), String> {
    validate_drive_id(&doc_id)?;
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
    validate_title(&title)?;
    if let Some(ref id) = folder_id {
        validate_drive_id(id)?;
    }
    let api = state.api.read().await;
    let doc = docs::create_document(&api, &title, folder_id)
        .await
        .map_err(|e| e.to_string())?;

    // Cache to SQLite
    {
        let db = state.db.lock().await;
        if let Err(e) = queries::upsert_doc_cache(
            &db,
            &doc.doc_id,
            &doc.title,
            &doc.revision_id,
            &doc.body_json,
        ) {
            eprintln!("[docs_cache] upsert failed for {}: {}", doc.doc_id, e);
        }
    }

    Ok(doc)
}

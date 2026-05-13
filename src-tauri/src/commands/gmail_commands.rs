use serde::{Deserialize, Serialize};
use tauri::State;

use crate::api::gmail::{self, GmailMessage, Label, Thread, ThreadListResponse, SentMessage};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct ListThreadsParams {
    pub label_ids: Vec<String>,
    pub page_token: Option<String>,
    pub max_results: Option<u32>,
}

#[tauri::command]
pub async fn list_threads(
    state: State<'_, AppState>,
    params: ListThreadsParams,
) -> Result<ThreadListResponse, String> {
    let api = state.api.read().await;
    gmail::list_threads(
        &api,
        &params.label_ids,
        params.page_token.as_deref(),
        params.max_results.unwrap_or(50),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_thread(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Thread, String> {
    let api = state.api.read().await;
    gmail::get_thread(&api, &thread_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_message(
    state: State<'_, AppState>,
    msg_id: String,
) -> Result<GmailMessage, String> {
    let api = state.api.read().await;
    gmail::get_message(&api, &msg_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_threads(
    state: State<'_, AppState>,
    query: String,
    page_token: Option<String>,
) -> Result<ThreadListResponse, String> {
    let api = state.api.read().await;
    gmail::search_messages(&api, &query, page_token.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    to: String,
    subject: String,
    html_body: String,
    in_reply_to: Option<String>,
    references: Option<String>,
) -> Result<SentMessage, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let from = oauth
        .current_token()
        .map(|t| t.email.clone())
        .unwrap_or_default();
    drop(oauth);

    let raw = gmail::build_raw_message(
        &to,
        &from,
        &subject,
        &html_body,
        in_reply_to.as_deref(),
        references.as_deref(),
    );
    gmail::send_message(&api, raw).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_draft(
    state: State<'_, AppState>,
    to: String,
    subject: String,
    html_body: String,
    in_reply_to: Option<String>,
) -> Result<serde_json::Value, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let from = oauth
        .current_token()
        .map(|t| t.email.clone())
        .unwrap_or_default();
    drop(oauth);

    let raw = gmail::build_raw_message(&to, &from, &subject, &html_body, in_reply_to.as_deref(), None);
    gmail::create_draft(&api, raw).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn modify_message(
    state: State<'_, AppState>,
    msg_id: String,
    add_labels: Vec<String>,
    remove_labels: Vec<String>,
) -> Result<(), String> {
    let api = state.api.read().await;
    gmail::modify_message(&api, &msg_id, add_labels, remove_labels)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn trash_message(
    state: State<'_, AppState>,
    msg_id: String,
) -> Result<(), String> {
    let api = state.api.read().await;
    gmail::trash_message(&api, &msg_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn star_message(
    state: State<'_, AppState>,
    msg_id: String,
    starred: bool,
) -> Result<(), String> {
    let api = state.api.read().await;
    if starred {
        gmail::modify_message(&api, &msg_id, vec!["STARRED".to_string()], vec![])
            .await
            .map_err(|e| e.to_string())
    } else {
        gmail::modify_message(&api, &msg_id, vec![], vec!["STARRED".to_string()])
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn archive_message(
    state: State<'_, AppState>,
    msg_id: String,
) -> Result<(), String> {
    let api = state.api.read().await;
    gmail::modify_message(&api, &msg_id, vec![], vec!["INBOX".to_string()])
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_read(
    state: State<'_, AppState>,
    msg_id: String,
    read: bool,
) -> Result<(), String> {
    let api = state.api.read().await;
    if read {
        gmail::modify_message(&api, &msg_id, vec![], vec!["UNREAD".to_string()])
            .await
            .map_err(|e| e.to_string())
    } else {
        gmail::modify_message(&api, &msg_id, vec!["UNREAD".to_string()], vec![])
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn list_labels(state: State<'_, AppState>) -> Result<Vec<Label>, String> {
    let api = state.api.read().await;
    gmail::list_labels(&api).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn setup_gmail_watch(
    state: State<'_, AppState>,
    topic_name: String,
) -> Result<String, String> {
    let api = state.api.read().await;
    let watch_resp = gmail::watch(&api, &topic_name).await.map_err(|e| e.to_string())?;
    Ok(watch_resp.history_id)
}

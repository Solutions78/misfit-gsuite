use tauri::State;

use crate::api::chat::{self, ChatMessage, MessageListResponse, Space};
use crate::AppState;

#[tauri::command]
pub async fn list_spaces(state: State<'_, AppState>) -> Result<Vec<Space>, String> {
    let api = state.api.read().await;
    chat::list_spaces(&api).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_chat_messages(
    state: State<'_, AppState>,
    space_name: String,
    page_token: Option<String>,
    page_size: Option<u32>,
) -> Result<MessageListResponse, String> {
    let api = state.api.read().await;
    chat::list_messages(&api, &space_name, page_token.as_deref(), page_size.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_chat_message(
    state: State<'_, AppState>,
    space_name: String,
    text: String,
) -> Result<ChatMessage, String> {
    let api = state.api.read().await;
    chat::send_message(&api, &space_name, text)
        .await
        .map_err(|e| e.to_string())
}

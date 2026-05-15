use tauri::State;

use crate::api::chat::{
    self, Attachment, ChatMessage, ContactSuggestion, Membership, MessageListResponse, Space,
    UploadAttachmentResponse,
};
use crate::AppState;

#[tauri::command]
pub async fn list_spaces(state: State<'_, AppState>) -> Result<Vec<Space>, String> {
    let api = state.api.read().await;
    let account_email = {
        let oauth = api.oauth_state.read().await;
        oauth.current_token().map(|token| token.email.clone())
    };

    let mut spaces = chat::list_spaces(&api).await.map_err(|e| e.to_string())?;
    drop(api);

    if let Some(email) = account_email {
        let db = state.db.lock().await;
        let hidden =
            crate::db::queries::list_hidden_chat_spaces(&db, &email).map_err(|e| e.to_string())?;
        spaces.retain(|space| !hidden.contains(&space.name));
    }

    Ok(spaces)
}

#[tauri::command]
pub async fn list_space_members(
    state: State<'_, AppState>,
    space_name: String,
) -> Result<Vec<Membership>, String> {
    let api = state.api.read().await;
    chat::list_members(&api, &space_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn setup_chat_space(
    state: State<'_, AppState>,
    space: Space,
    memberships: Vec<Membership>,
) -> Result<Space, String> {
    let api = state.api.read().await;
    chat::setup_space(&api, space, memberships)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upload_chat_attachment(
    state: State<'_, AppState>,
    space_name: String,
    filename: String,
    mime_type: String,
    data: Vec<u8>,
) -> Result<UploadAttachmentResponse, String> {
    let api = state.api.read().await;
    chat::upload_attachment(&api, &space_name, &filename, &mime_type, data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_chat_messages(
    state: State<'_, AppState>,
    space_name: String,
    page_token: Option<String>,
    page_size: Option<u32>,
) -> Result<MessageListResponse, String> {
    let api = state.api.read().await;
    chat::list_messages(
        &api,
        &space_name,
        page_token.as_deref(),
        page_size.unwrap_or(50),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_chat_message(
    state: State<'_, AppState>,
    space_name: String,
    text: String,
    attachments: Option<Vec<Attachment>>,
) -> Result<ChatMessage, String> {
    let api = state.api.read().await;
    chat::send_message(&api, &space_name, text, attachments)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_chat_contacts(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<ContactSuggestion>, String> {
    let api = state.api.read().await;
    chat::search_contacts(&api, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_chat_space(
    state: State<'_, AppState>,
    space_name: String,
) -> Result<(), String> {
    let api = state.api.read().await;
    let account_email = {
        let oauth = api.oauth_state.read().await;
        oauth
            .current_token()
            .map(|token| token.email.clone())
            .ok_or_else(|| "Not authenticated".to_string())?
    };
    drop(api);

    let db = state.db.lock().await;
    crate::db::queries::hide_chat_space(&db, &account_email, &space_name).map_err(|e| e.to_string())
}

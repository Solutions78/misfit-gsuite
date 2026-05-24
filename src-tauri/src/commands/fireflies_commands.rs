use crate::api::fireflies::{self, FirefliesChannel, FirefliesMeeting};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_fireflies_meetings(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<FirefliesMeeting>, String> {
    let api = state.api.read().await;
    fireflies::list_meetings(
        &api.http,
        &state.proxy_base,
        &state.proxy_app_token,
        limit.unwrap_or(20),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_fireflies_meeting(
    state: State<'_, AppState>,
    id: String,
) -> Result<FirefliesMeeting, String> {
    let api = state.api.read().await;
    fireflies::get_meeting(&api.http, &state.proxy_base, &state.proxy_app_token, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_fireflies_channels(
    state: State<'_, AppState>,
) -> Result<Vec<FirefliesChannel>, String> {
    let api = state.api.read().await;
    fireflies::list_channels(&api.http, &state.proxy_base, &state.proxy_app_token)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_fireflies_meetings(
    state: State<'_, AppState>,
    transcript_ids: Vec<String>,
    channel_id: String,
) -> Result<(), String> {
    let api = state.api.read().await;
    fireflies::move_meetings_to_channel(
        &api.http,
        &state.proxy_base,
        &state.proxy_app_token,
        &transcript_ids,
        &channel_id,
    )
    .await
    .map_err(|e| e.to_string())
}

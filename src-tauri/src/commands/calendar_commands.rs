use tauri::State;

use crate::api::calendar::{self, CalendarEvent, CalendarListEntry, NewEvent};
use crate::AppState;

#[tauri::command]
pub async fn list_calendars(state: State<'_, AppState>) -> Result<Vec<CalendarListEntry>, String> {
    let api = state.api.read().await;
    calendar::list_calendars(&api).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_events(
    state: State<'_, AppState>,
    calendar_id: String,
    time_min: String,
    time_max: String,
    max_results: Option<u32>,
) -> Result<Vec<CalendarEvent>, String> {
    let api = state.api.read().await;
    calendar::list_events(&api, &calendar_id, &time_min, &time_max, max_results.unwrap_or(250))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_event(
    state: State<'_, AppState>,
    calendar_id: String,
    event: NewEvent,
) -> Result<CalendarEvent, String> {
    let api = state.api.read().await;
    calendar::create_event(&api, &calendar_id, &event)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_event(
    state: State<'_, AppState>,
    calendar_id: String,
    event_id: String,
    event: serde_json::Value,
) -> Result<CalendarEvent, String> {
    let api = state.api.read().await;
    calendar::update_event(&api, &calendar_id, &event_id, &event)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_event(
    state: State<'_, AppState>,
    calendar_id: String,
    event_id: String,
) -> Result<(), String> {
    let api = state.api.read().await;
    calendar::delete_event(&api, &calendar_id, &event_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn respond_to_event(
    state: State<'_, AppState>,
    calendar_id: String,
    event_id: String,
    response_status: String,
) -> Result<CalendarEvent, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let email = oauth
        .current_token()
        .map(|t| t.email.clone())
        .unwrap_or_default();
    drop(oauth);
    calendar::respond_to_event(&api, &calendar_id, &event_id, &email, &response_status)
        .await
        .map_err(|e| e.to_string())
}

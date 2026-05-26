#![allow(dead_code)]

use crate::api::fireflies::{self, FirefliesChannel, FirefliesMeeting};
use crate::auth::keychain;
use crate::error::AppError;
use crate::AppState;
use tauri::State;

const FIREFLIES_API_KEY_KEYCHAIN_KEY: &str = "misfit-gsuite/fireflies/api-key";

fn load_fireflies_api_key() -> Result<String, AppError> {
    let api_key = keychain::load_secret(FIREFLIES_API_KEY_KEYCHAIN_KEY)?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            AppError::Auth(
                "Fireflies API key is not configured. Add it in Settings → Integrations."
                    .to_string(),
            )
        })?;
    Ok(api_key)
}

#[tauri::command]
pub async fn get_fireflies_api_key_status() -> Result<bool, String> {
    keychain::load_secret(FIREFLIES_API_KEY_KEYCHAIN_KEY)
        .map(|value| value.map(|s| !s.trim().is_empty()).unwrap_or(false))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_fireflies_api_key(api_key: String) -> Result<(), String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("Fireflies API key cannot be empty.".to_string());
    }

    keychain::store_secret(FIREFLIES_API_KEY_KEYCHAIN_KEY, api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_fireflies_api_key() -> Result<(), String> {
    keychain::delete_secret(FIREFLIES_API_KEY_KEYCHAIN_KEY).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_fireflies_meetings(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<FirefliesMeeting>, String> {
    let api = state.api.read().await;
    let fireflies_api_key = load_fireflies_api_key().map_err(|e| e.to_string())?;
    fireflies::list_meetings(&api.http, &fireflies_api_key, limit.unwrap_or(20))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_fireflies_meeting(
    state: State<'_, AppState>,
    id: String,
) -> Result<FirefliesMeeting, String> {
    let api = state.api.read().await;
    let fireflies_api_key = load_fireflies_api_key().map_err(|e| e.to_string())?;
    fireflies::get_meeting(&api.http, &fireflies_api_key, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_fireflies_channels(
    state: State<'_, AppState>,
) -> Result<Vec<FirefliesChannel>, String> {
    let api = state.api.read().await;
    let fireflies_api_key = load_fireflies_api_key().map_err(|e| e.to_string())?;
    fireflies::list_channels(&api.http, &fireflies_api_key)
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
    let fireflies_api_key = load_fireflies_api_key().map_err(|e| e.to_string())?;
    fireflies::move_meetings_to_channel(&api.http, &fireflies_api_key, &transcript_ids, &channel_id)
        .await
        .map_err(|e| e.to_string())
}

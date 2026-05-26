use crate::api::drive::{self, DriveFile, DriveFileListResponse, SharedDriveListResponse};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn list_drive_files(
    state: State<'_, AppState>,
    query: Option<String>,
    page_token: Option<String>,
    page_size: Option<u32>,
    drive_id: Option<String>,
    order_by: Option<String>,
) -> Result<DriveFileListResponse, String> {
    let api = state.api.read().await;
    drive::list_files(
        &api,
        query.as_deref(),
        page_token.as_deref(),
        page_size.unwrap_or(50),
        drive_id.as_deref(),
        order_by.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_drive_files_recursive(
    state: State<'_, AppState>,
    root_folder_id: String,
    mime_type: String,
    page_token: Option<String>,
    page_size: Option<u32>,
    drive_id: Option<String>,
    order_by: Option<String>,
) -> Result<DriveFileListResponse, String> {
    let api = state.api.read().await;
    drive::list_files_recursive(
        &api,
        &root_folder_id,
        &mime_type,
        page_token.as_deref(),
        page_size.unwrap_or(50),
        drive_id.as_deref(),
        order_by.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_shared_drives(
    state: State<'_, AppState>,
    page_token: Option<String>,
) -> Result<SharedDriveListResponse, String> {
    let api = state.api.read().await;
    drive::list_shared_drives(&api, page_token.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_drive_file(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!(
            "Invalid URL: only http:// and https:// URLs are permitted, got: {}",
            &url[..url.len().min(64)]
        ));
    }
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_drive_folder(
    state: State<'_, AppState>,
    name: String,
    parents: Option<Vec<String>>,
) -> Result<DriveFile, String> {
    let api = state.api.read().await;
    drive::create_folder(&api, &name, parents)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_drive_file(state: State<'_, AppState>, file_id: String) -> Result<(), String> {
    let api = state.api.read().await;
    drive::delete_file(&api, &file_id)
        .await
        .map_err(|e| e.to_string())
}

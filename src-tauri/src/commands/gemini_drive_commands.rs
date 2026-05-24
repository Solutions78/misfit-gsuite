use serde::{Deserialize, Serialize};
use tauri::State;

use crate::api::gemini::{self, GeminiMessage};
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewContext {
    pub active_view: String,
    pub open_doc_id: Option<String>,
    pub open_doc_mime_type: Option<String>,
    pub current_folder_id: Option<String>,
    pub drive_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFileResult {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub web_view_link: Option<String>,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiDriveResponse {
    pub text: String,
    pub file_results: Vec<DriveFileResult>,
}

fn build_drive_system_prompt(name: &str, email: &str, ctx: &ViewContext) -> String {
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let view_desc = match ctx.active_view.as_str() {
        "drive" => "Google Drive file browser".to_string(),
        "docs" => format!(
            "Google Docs editor{}",
            ctx.open_doc_id.as_ref().map(|id| format!(" (document ID: {})", id)).unwrap_or_default()
        ),
        "sheets" => format!(
            "Google Sheets{}",
            ctx.open_doc_id.as_ref().map(|id| format!(" (spreadsheet ID: {})", id)).unwrap_or_default()
        ),
        "slides" => format!(
            "Google Slides{}",
            ctx.open_doc_id.as_ref().map(|id| format!(" (presentation ID: {})", id)).unwrap_or_default()
        ),
        v => v.to_string(),
    };

    let folder_info = ctx.current_folder_id.as_ref()
        .filter(|id| *id != "root")
        .map(|id| format!(" The user is currently browsing folder ID: {}.", id))
        .unwrap_or_default();

    let drive_info = ctx.drive_id.as_ref()
        .map(|id| format!(" They are in shared drive ID: {}.", id))
        .unwrap_or_default();

    format!(
        "You are an AI assistant for {} ({}) integrated directly into their Google Workspace desktop app. \
        Today is {}. The user is currently in the {} view.{}{} \
        You have DIRECT ACCESS to the user's Google Drive. When they ask you to find, search, list, summarize, \
        or analyze files or documents, USE YOUR TOOLS to actually do it — do not tell them to search themselves. \
        When you find files, present them clearly. Be concise and action-oriented.",
        name, email, now, view_desc, folder_info, drive_info
    )
}

#[tauri::command]
pub async fn gemini_drive_chat(
    state: State<'_, AppState>,
    messages: Vec<GeminiMessage>,
    view_context: ViewContext,
    model: Option<String>,
) -> Result<GeminiDriveResponse, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let (name, email) = oauth
        .current_token()
        .map(|t| (t.display_name.clone(), t.email.clone()))
        .unwrap_or_default();
    drop(oauth);

    let system = build_drive_system_prompt(&name, &email, &view_context);

    // Build view context string — inject the currently open doc ID so Gemini
    // can immediately call get_document_content without asking for the file ID
    let view_ctx_str = if let (Some(doc_id), Some(mime)) = (&view_context.open_doc_id, &view_context.open_doc_mime_type) {
        Some(format!(
            "The user currently has the following file open: ID={}, mimeType={}. \
            If they ask to summarize, read, or analyze 'this document' or 'the current file', \
            call get_document_content with file_id='{}' and mime_type='{}'.",
            doc_id, mime, doc_id, mime
        ))
    } else {
        None
    };

    let (text, file_results) = gemini::generate_with_tools(
        &api,
        messages,
        Some(system),
        model,
        view_ctx_str,
    )
    .await
    .map_err(|e| e.to_string())?;

    let mapped_files = file_results
        .into_iter()
        .map(|f| DriveFileResult {
            id: f.id,
            name: f.name,
            mime_type: f.mime_type,
            web_view_link: f.web_view_link,
            snippet: f.snippet,
        })
        .collect();

    Ok(GeminiDriveResponse {
        text,
        file_results: mapped_files,
    })
}

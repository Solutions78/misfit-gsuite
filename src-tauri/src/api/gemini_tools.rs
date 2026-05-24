use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::api::client::ApiClient;
use crate::api::drive;
use crate::error::AppError;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

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
pub enum ToolCall {
    SearchDriveFiles {
        query: String,
        mime_type_filter: Option<String>,
        max_results: Option<u32>,
    },
    GetDocumentContent {
        file_id: String,
        mime_type: String,
    },
    ListRecentDriveFiles {
        folder_id: Option<String>,
        drive_id: Option<String>,
        max_results: Option<u32>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub tool_name: String,
    pub files: Vec<DriveFileResult>,
    pub content_text: Option<String>,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

pub async fn execute_tool(client: &ApiClient, call: ToolCall) -> Result<ToolResult, AppError> {
    match call {
        ToolCall::SearchDriveFiles {
            query,
            mime_type_filter,
            max_results,
        } => search_drive_files(client, query, mime_type_filter, max_results).await,

        ToolCall::GetDocumentContent { file_id, mime_type } => {
            get_document_content(client, file_id, mime_type).await
        }

        ToolCall::ListRecentDriveFiles {
            folder_id,
            drive_id,
            max_results,
        } => list_recent_drive_files(client, folder_id, drive_id, max_results).await,
    }
}

// ---------------------------------------------------------------------------
// search_drive_files
// ---------------------------------------------------------------------------

async fn search_drive_files(
    client: &ApiClient,
    query: String,
    mime_type_filter: Option<String>,
    max_results: Option<u32>,
) -> Result<ToolResult, AppError> {
    let mut q = format!("{} and trashed = false", query);
    if let Some(ref mime) = mime_type_filter {
        q.push_str(&format!(" and mimeType = '{}'", mime));
    }

    let limit = max_results.unwrap_or(10).min(20);
    let drive_files =
        drive::list_files(client, Some(&q), None, limit, None, Some("modifiedTime desc")).await?;

    let files: Vec<DriveFileResult> = drive_files.files
        .into_iter()
        .map(|f| DriveFileResult {
            id: f.id,
            name: f.name,
            mime_type: f.mime_type,
            web_view_link: f.web_view_link,
            snippet: None,
        })
        .collect();

    Ok(ToolResult {
        tool_name: "search_drive_files".to_string(),
        files,
        content_text: None,
    })
}

// ---------------------------------------------------------------------------
// get_document_content
// ---------------------------------------------------------------------------

async fn get_document_content(
    client: &ApiClient,
    file_id: String,
    mime_type: String,
) -> Result<ToolResult, AppError> {
    // Validate file_id: alphanumeric, hyphens, underscores only; max 256 chars
    let valid = !file_id.is_empty()
        && file_id.len() <= 256
        && file_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if !valid {
        return Err(AppError::Auth("Invalid file ID".to_string()));
    }

    let content_text = match mime_type.as_str() {
        "application/vnd.google-apps.document" => fetch_doc_text(client, &file_id).await?,
        "application/vnd.google-apps.spreadsheet" => fetch_sheet_text(client, &file_id).await?,
        "application/vnd.google-apps.presentation" => fetch_slides_text(client, &file_id).await?,
        _ => "Unsupported file type for content reading".to_string(),
    };

    Ok(ToolResult {
        tool_name: "get_document_content".to_string(),
        files: vec![],
        content_text: Some(content_text),
    })
}

// ---------------------------------------------------------------------------
// list_recent_drive_files
// ---------------------------------------------------------------------------

async fn list_recent_drive_files(
    client: &ApiClient,
    folder_id: Option<String>,
    drive_id: Option<String>,
    max_results: Option<u32>,
) -> Result<ToolResult, AppError> {
    let q = match &folder_id {
        Some(fid) => format!("'{}' in parents and trashed = false", fid),
        None => "trashed = false".to_string(),
    };

    let limit = max_results.unwrap_or(15).min(20);
    let drive_files = drive::list_files(
        client,
        Some(&q),
        None,
        limit,
        drive_id.as_deref(),
        Some("modifiedTime desc"),
    )
    .await?;

    let files: Vec<DriveFileResult> = drive_files.files
        .into_iter()
        .map(|f| DriveFileResult {
            id: f.id,
            name: f.name,
            mime_type: f.mime_type,
            web_view_link: f.web_view_link,
            snippet: None,
        })
        .collect();

    Ok(ToolResult {
        tool_name: "list_recent_drive_files".to_string(),
        files,
        content_text: None,
    })
}

// ---------------------------------------------------------------------------
// fetch_doc_text  (Google Docs)
// ---------------------------------------------------------------------------

async fn fetch_doc_text(client: &ApiClient, doc_id: &str) -> Result<String, AppError> {
    let token = client.access_token().await?;
    let url = format!("https://docs.googleapis.com/v1/documents/{}", doc_id);

    let resp = client
        .http
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .error_for_status()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    let mut parts: Vec<String> = Vec::new();

    if let Some(content) = body.pointer("/body/content") {
        if let Some(arr) = content.as_array() {
            for item in arr {
                if let Some(elements) = item.pointer("/paragraph/elements") {
                    if let Some(elems) = elements.as_array() {
                        for elem in elems {
                            if let Some(text) =
                                elem.pointer("/textRun/content").and_then(|v| v.as_str())
                            {
                                parts.push(text.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result = parts.join("\n");
    result.truncate(12_000);
    Ok(result)
}

// ---------------------------------------------------------------------------
// fetch_sheet_text  (Google Sheets)
// ---------------------------------------------------------------------------

async fn fetch_sheet_text(client: &ApiClient, sheet_id: &str) -> Result<String, AppError> {
    let token = client.access_token().await?;
    let url = format!(
        "https://sheets.googleapis.com/v4/spreadsheets/{}?includeGridData=true&fields=sheets(properties(title),data(rowData(values(formattedValue))))",
        sheet_id
    );

    let resp = client
        .http
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .error_for_status()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    let mut output = String::new();

    if let Some(sheets) = body["sheets"].as_array() {
        for sheet in sheets {
            let title = sheet
                .pointer("/properties/title")
                .and_then(|v| v.as_str())
                .unwrap_or("Sheet");
            output.push_str(&format!("Sheet: {}\n", title));

            if let Some(data_arr) = sheet["data"].as_array() {
                for data in data_arr {
                    if let Some(rows) = data["rowData"].as_array() {
                        for row in rows {
                            if let Some(values) = row["values"].as_array() {
                                let cells: Vec<&str> = values
                                    .iter()
                                    .map(|v| {
                                        v["formattedValue"].as_str().unwrap_or("")
                                    })
                                    .collect();
                                output.push_str(&cells.join("\t"));
                                output.push('\n');
                            }
                        }
                    }
                }
            }
        }
    }

    output.truncate(12_000);
    Ok(output)
}

// ---------------------------------------------------------------------------
// fetch_slides_text  (Google Slides)
// ---------------------------------------------------------------------------

async fn fetch_slides_text(client: &ApiClient, pres_id: &str) -> Result<String, AppError> {
    let token = client.access_token().await?;
    let url = format!(
        "https://slides.googleapis.com/v1/presentations/{}",
        pres_id
    );

    let resp = client
        .http
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .error_for_status()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let body: Value = resp
        .json()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    let mut slides_text: Vec<String> = Vec::new();

    if let Some(slides) = body["slides"].as_array() {
        for slide in slides {
            let mut slide_parts: Vec<String> = Vec::new();

            if let Some(elements) = slide["pageElements"].as_array() {
                for element in elements {
                    if let Some(text_elements) =
                        element.pointer("/shape/text/textElements")
                    {
                        if let Some(te_arr) = text_elements.as_array() {
                            for te in te_arr {
                                if let Some(content) = te
                                    .pointer("/textRun/content")
                                    .and_then(|v| v.as_str())
                                {
                                    if !content.trim().is_empty() {
                                        slide_parts.push(content.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if !slide_parts.is_empty() {
                slides_text.push(slide_parts.join(""));
            }
        }
    }

    let mut result = slides_text.join("\n---\n");
    result.truncate(12_000);
    Ok(result)
}

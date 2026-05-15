use crate::api::client::ApiClient;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const DOCS_BASE: &str = "https://docs.googleapis.com/v1/documents";
const DRIVE_FILES_BASE: &str = "https://www.googleapis.com/drive/v3/files";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocContent {
    pub doc_id: String,
    pub title: String,
    pub revision_id: String,
    pub body_json: String, // JSON string of Google Docs StructuralElement[]
}

pub async fn get_document(client: &ApiClient, doc_id: &str) -> Result<DocContent, AppError> {
    let token = client.access_token().await?;
    let url = format!("{}/{}", DOCS_BASE, doc_id);

    let resp: Value = client
        .http
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let title = resp
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let revision_id = resp
        .get("revisionId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let body_content = resp
        .get("body")
        .and_then(|b| b.get("content"))
        .cloned()
        .unwrap_or(Value::Array(vec![]));

    let body_json = serde_json::to_string(&body_content)
        .map_err(|e| AppError::Other(format!("Failed to serialize body: {}", e)))?;

    Ok(DocContent {
        doc_id: doc_id.to_string(),
        title,
        revision_id,
        body_json,
    })
}

pub async fn save_document(
    client: &ApiClient,
    doc_id: &str,
    requests: Vec<Value>,
) -> Result<(), AppError> {
    let token = client.access_token().await?;
    let url = format!("{}/{}:batchUpdate", DOCS_BASE, doc_id);

    let body = serde_json::json!({ "requests": requests });

    client
        .http
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await?
        .error_for_status()?;

    Ok(())
}

pub async fn create_document(
    client: &ApiClient,
    title: &str,
    folder_id: Option<String>,
) -> Result<DocContent, AppError> {
    let token = client.access_token().await?;

    // Create the document
    let create_body = serde_json::json!({ "title": title });

    let resp: Value = client
        .http
        .post(DOCS_BASE)
        .bearer_auth(&token)
        .json(&create_body)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let doc_id = resp
        .get("documentId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Other("No documentId in create response".to_string()))?
        .to_string();

    let doc_title = resp
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or(title)
        .to_string();

    let revision_id = resp
        .get("revisionId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let body_content = resp
        .get("body")
        .and_then(|b| b.get("content"))
        .cloned()
        .unwrap_or(Value::Array(vec![]));

    let body_json = serde_json::to_string(&body_content)
        .map_err(|e| AppError::Other(format!("Failed to serialize body: {}", e)))?;

    // Move to folder if specified
    if let Some(fid) = folder_id {
        let move_url = format!(
            "{}/{}?addParents={}&supportsAllDrives=true",
            DRIVE_FILES_BASE, doc_id, fid
        );
        let token2 = client.access_token().await?;
        client
            .http
            .patch(&move_url)
            .bearer_auth(&token2)
            .header("Content-Length", "0")
            .send()
            .await?
            .error_for_status()?;
    }

    Ok(DocContent {
        doc_id,
        title: doc_title,
        revision_id,
        body_json,
    })
}

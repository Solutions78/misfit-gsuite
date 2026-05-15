use crate::api::client::ApiClient;
use crate::error::AppError;
use serde::{Deserialize, Serialize};

const DRIVE_BASE: &str = "https://www.googleapis.com/drive/v3";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub modified_time: Option<String>,
    pub size: Option<String>,
    pub icon_link: Option<String>,
    pub thumbnail_link: Option<String>,
    pub web_view_link: Option<String>,
    pub parents: Option<Vec<String>>,
    #[serde(default)]
    pub drive_id: Option<String>,
    #[serde(default)]
    pub shared: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFileListResponse {
    pub files: Vec<DriveFile>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedDrive {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedDriveListResponse {
    pub drives: Vec<SharedDrive>,
    pub next_page_token: Option<String>,
}

pub async fn list_files(
    client: &ApiClient,
    query: Option<&str>,
    page_token: Option<&str>,
    page_size: u32,
    drive_id: Option<&str>,
) -> Result<DriveFileListResponse, AppError> {
    let fields = "nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,thumbnailLink,webViewLink,parents,driveId,shared)";
    let mut url = format!(
        "{}/files?pageSize={}&fields={}&supportsAllDrives=true&includeItemsFromAllDrives=true",
        DRIVE_BASE,
        page_size,
        urlencoding::encode(fields)
    );

    if let Some(id) = drive_id {
        url.push_str(&format!("&corpora=drive&driveId={}", urlencoding::encode(id)));
    }

    if let Some(q) = query {
        url.push_str(&format!("&q={}", urlencoding::encode(q)));
    }

    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }

    let resp = client
        .get(&url)
        .await?
        .json::<DriveFileListResponse>()
        .await?;
    Ok(resp)
}

pub async fn list_shared_drives(
    client: &ApiClient,
    page_token: Option<&str>,
) -> Result<SharedDriveListResponse, AppError> {
    let mut url = format!("{}/drives?pageSize=100", DRIVE_BASE);
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }
    let resp = client
        .get(&url)
        .await?
        .json::<SharedDriveListResponse>()
        .await?;
    Ok(resp)
}

pub async fn create_folder(
    client: &ApiClient,
    name: &str,
    parents: Option<Vec<String>>,
) -> Result<DriveFile, AppError> {
    let url = format!("{}/files?supportsAllDrives=true", DRIVE_BASE);
    let mut body = serde_json::json!({
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    });

    if let Some(p) = parents {
        body["parents"] = serde_json::json!(p);
    }

    let resp = client.post(&url, &body).await?.json::<DriveFile>().await?;
    Ok(resp)
}

pub async fn delete_file(client: &ApiClient, file_id: &str) -> Result<(), AppError> {
    let url = format!("{}/files/{}?supportsAllDrives=true", DRIVE_BASE, file_id);
    client.delete(&url).await?;
    Ok(())
}

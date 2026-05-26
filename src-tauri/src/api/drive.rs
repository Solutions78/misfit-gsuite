use crate::api::client::ApiClient;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use tracing::debug;

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
    order_by: Option<&str>,
) -> Result<DriveFileListResponse, AppError> {
    let fields = "nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,thumbnailLink,webViewLink,parents,driveId,shared)";
    let mut url = format!(
        "{}/files?pageSize={}&fields={}&supportsAllDrives=true&includeItemsFromAllDrives=true",
        DRIVE_BASE,
        page_size,
        urlencoding::encode(fields)
    );

    if let Some(id) = drive_id {
        url.push_str(&format!(
            "&corpora=drive&driveId={}",
            urlencoding::encode(id)
        ));
    }

    if let Some(q) = query {
        url.push_str(&format!("&q={}", urlencoding::encode(q)));
    }

    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }

    if let Some(order) = order_by {
        url.push_str(&format!("&orderBy={}", urlencoding::encode(order)));
    }

    debug!(
        "Drive API Query [drive_id={:?}] [orderBy={:?}]: {}",
        drive_id,
        order_by,
        query.unwrap_or("(none)")
    );

    let resp = client
        .get(&url)
        .await?
        .json::<DriveFileListResponse>()
        .await?;

    debug!("Drive API Response: found {} files", resp.files.len());

    Ok(resp)
}

pub async fn get_descendant_folders(
    client: &ApiClient,
    root_folder_id: &str,
    drive_id: Option<&str>,
) -> Result<Vec<String>, AppError> {
    let mut all_folder_ids = vec![root_folder_id.to_string()];
    let mut queue = VecDeque::new();
    queue.push_back(root_folder_id.to_string());

    // Google Drive API supports BFS traversal
    // We fetch one level at a time to build the set of parent IDs
    while let Some(current_id) = queue.pop_front() {
        let q = format!("'{}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false", current_id);
        let resp = list_files(client, Some(&q), None, 100, drive_id, None).await?;

        for file in resp.files {
            if !all_folder_ids.contains(&file.id) {
                all_folder_ids.push(file.id.clone());
                queue.push_back(file.id);
            }
        }

        // Safety break to prevent infinite loops or excessive API usage
        if all_folder_ids.len() > 500 {
            debug!("Recursive traversal reached 500 folders limit, capping results.");
            break;
        }
    }

    Ok(all_folder_ids)
}

pub async fn list_files_recursive(
    client: &ApiClient,
    root_folder_id: &str,
    mime_type: &str,
    page_token: Option<&str>,
    page_size: u32,
    drive_id: Option<&str>,
    order_by: Option<&str>,
) -> Result<DriveFileListResponse, AppError> {
    debug!(
        "Starting recursive file search for root folder: {}",
        root_folder_id
    );

    let folder_ids = get_descendant_folders(client, root_folder_id, drive_id).await?;
    debug!(
        "Recursive traversal found {} descendant folders",
        folder_ids.len()
    );

    // Build the query: mimeType = '...' and ( 'id1' in parents or 'id2' in parents ... )
    // Note: Google Drive has a 100kb query limit, but with IDs we should be safe up to ~200 parents
    let mut parent_queries = Vec::new();
    for id in folder_ids {
        parent_queries.push(format!("'{}' in parents", id));
    }

    // Process in batches if necessary, but for now we'll combine up to a reasonable limit
    let q = format!(
        "mimeType = '{}' and trashed = false and ({})",
        mime_type,
        parent_queries.join(" or ")
    );

    list_files(client, Some(&q), page_token, page_size, drive_id, order_by).await
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

// ---------------------------------------------------------------------------
// KG crawl structs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DriveFileOwner {
    pub display_name: Option<String>,
    pub email_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DriveFileUser {
    pub display_name: Option<String>,
    pub email_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFileKg {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub modified_time: Option<String>,
    pub web_view_link: Option<String>,
    pub parents: Option<Vec<String>>,
    #[serde(default)]
    pub drive_id: Option<String>,
    #[serde(default)]
    pub shared: Option<bool>,
    #[serde(default)]
    pub owners: Option<Vec<DriveFileOwner>>,
    pub last_modifying_user: Option<DriveFileUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFileKgListResponse {
    pub files: Vec<DriveFileKg>,
    pub next_page_token: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveChange {
    pub file_id: String,
    #[serde(default)]
    pub removed: bool,
    pub file: Option<DriveFileKg>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveChangesResponse {
    #[serde(default)]
    pub changes: Vec<DriveChange>,
    pub next_page_token: Option<String>,
    pub new_start_page_token: Option<String>,
}

// ---------------------------------------------------------------------------
// KG crawl functions
// ---------------------------------------------------------------------------

/// List all Drive files with extended metadata for KG crawling.
/// Uses an expanded fields parameter to include owners and lastModifyingUser.
pub async fn list_files_for_kg(
    client: &ApiClient,
    corpora: &str,          // "user" or "drive"
    drive_id: Option<&str>, // required when corpora="drive"
    page_token: Option<&str>,
    page_size: u32,
) -> Result<DriveFileKgListResponse, AppError> {
    let token = client.access_token().await?;
    let fields = "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,parents,driveId,shared,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress))";

    let mut req = client
        .http
        .get(&format!("{}/files", DRIVE_BASE))
        .bearer_auth(&token)
        .query(&[
            ("corpora", corpora),
            ("pageSize", &page_size.to_string()),
            ("fields", fields),
            ("supportsAllDrives", "true"),
            ("includeItemsFromAllDrives", "true"),
        ]);

    if let Some(did) = drive_id {
        req = req.query(&[("driveId", did)]);
    }
    if let Some(pt) = page_token {
        req = req.query(&[("pageToken", pt)]);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let msg = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: msg,
        });
    }

    resp.json::<DriveFileKgListResponse>()
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

/// Get the startPageToken for the Drive Changes API.
/// Call this after a full crawl to establish the delta sync baseline.
pub async fn get_changes_start_token(client: &ApiClient) -> Result<String, AppError> {
    let token = client.access_token().await?;
    let url = format!(
        "{}/changes/startPageToken?supportsAllDrives=true&includeItemsFromAllDrives=true",
        DRIVE_BASE
    );

    let resp = client
        .http
        .get(&url)
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let msg = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: msg,
        });
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    body["startPageToken"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| AppError::Other("No startPageToken in Drive response".to_string()))
}

/// Fetch changes from the Drive Changes API for delta sync.
#[allow(dead_code)]
pub async fn list_changes(
    client: &ApiClient,
    page_token: &str,
) -> Result<DriveChangesResponse, AppError> {
    let token = client.access_token().await?;
    let fields = "nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,webViewLink,parents,driveId,shared,owners(displayName,emailAddress),lastModifyingUser(displayName,emailAddress)))";

    let resp = client
        .http
        .get(&format!("{}/changes", DRIVE_BASE))
        .bearer_auth(&token)
        .query(&[
            ("pageToken", page_token),
            ("supportsAllDrives", "true"),
            ("includeItemsFromAllDrives", "true"),
            ("fields", fields),
        ])
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let msg = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: msg,
        });
    }

    resp.json::<DriveChangesResponse>()
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

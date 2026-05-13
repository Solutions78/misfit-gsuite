use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::api::client::ApiClient;
use crate::error::AppError;

const GMAIL_BASE: &str = "https://gmail.googleapis.com/gmail/v1/users/me";

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageHeader {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePart {
    pub mime_type: Option<String>,
    pub headers: Option<Vec<MessageHeader>>,
    pub body: Option<MessageBody>,
    pub parts: Option<Vec<MessagePart>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageBody {
    pub size: Option<i64>,
    pub data: Option<String>,
    pub attachment_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GmailMessage {
    pub id: String,
    pub thread_id: String,
    pub label_ids: Option<Vec<String>>,
    pub snippet: Option<String>,
    pub payload: Option<MessagePart>,
    pub size_estimate: Option<i64>,
    pub internal_date: Option<String>,
    pub history_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadListItem {
    pub id: String,
    pub snippet: Option<String>,
    pub history_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadListResponse {
    pub threads: Option<Vec<ThreadListItem>>,
    pub next_page_token: Option<String>,
    pub result_size_estimate: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    pub history_id: Option<String>,
    pub messages: Option<Vec<GmailMessage>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub label_type: Option<String>,
    pub messages_total: Option<i64>,
    pub messages_unread: Option<i64>,
    pub threads_total: Option<i64>,
    pub threads_unread: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelListResponse {
    pub labels: Vec<Label>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifyRequest {
    #[serde(rename = "addLabelIds")]
    pub add_label_ids: Vec<String>,
    #[serde(rename = "removeLabelIds")]
    pub remove_label_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendMessageRequest {
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SentMessage {
    pub id: String,
    #[serde(rename = "threadId")]
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchRequest {
    pub topic_name: String,
    pub label_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchResponse {
    pub history_id: String,
    pub expiration: String,
}

// ── API functions ──────────────────────────────────────────────────────────

pub async fn list_threads(
    client: &ApiClient,
    label_ids: &[String],
    page_token: Option<&str>,
    max_results: u32,
) -> Result<ThreadListResponse, AppError> {
    let mut url = format!("{}/threads?maxResults={}", GMAIL_BASE, max_results);
    if !label_ids.is_empty() {
        url.push_str(&format!("&labelIds={}", label_ids.join("&labelIds=")));
    }
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }
    let resp = client.get(&url).await?.json::<ThreadListResponse>().await?;
    Ok(resp)
}

pub async fn get_thread(client: &ApiClient, thread_id: &str) -> Result<Thread, AppError> {
    let url = format!("{}/threads/{}?format=full", GMAIL_BASE, thread_id);
    let resp = client.get(&url).await?.json::<Thread>().await?;
    Ok(resp)
}

pub async fn get_message(client: &ApiClient, msg_id: &str) -> Result<GmailMessage, AppError> {
    let url = format!("{}/messages/{}?format=full", GMAIL_BASE, msg_id);
    let resp = client.get(&url).await?.json::<GmailMessage>().await?;
    Ok(resp)
}

pub async fn search_messages(
    client: &ApiClient,
    query: &str,
    page_token: Option<&str>,
) -> Result<ThreadListResponse, AppError> {
    let mut url = format!(
        "{}/threads?q={}&maxResults=50",
        GMAIL_BASE,
        urlencoding::encode(query)
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }
    let resp = client.get(&url).await?.json::<ThreadListResponse>().await?;
    Ok(resp)
}

pub async fn modify_message(
    client: &ApiClient,
    msg_id: &str,
    add_labels: Vec<String>,
    remove_labels: Vec<String>,
) -> Result<(), AppError> {
    let url = format!("{}/messages/{}/modify", GMAIL_BASE, msg_id);
    let body = ModifyRequest {
        add_label_ids: add_labels,
        remove_label_ids: remove_labels,
    };
    client.post(&url, &body).await?;
    Ok(())
}

pub async fn trash_message(client: &ApiClient, msg_id: &str) -> Result<(), AppError> {
    let url = format!("{}/messages/{}/trash", GMAIL_BASE, msg_id);
    client.post(&url, &serde_json::Value::Null).await?;
    Ok(())
}

pub async fn send_message(
    client: &ApiClient,
    raw_base64: String,
) -> Result<SentMessage, AppError> {
    let url = format!("{}/messages/send", GMAIL_BASE);
    let body = SendMessageRequest { raw: raw_base64 };
    let resp = client.post(&url, &body).await?.json::<SentMessage>().await?;
    Ok(resp)
}

pub async fn create_draft(
    client: &ApiClient,
    raw_base64: String,
) -> Result<serde_json::Value, AppError> {
    let url = format!("{}/drafts", GMAIL_BASE);
    let body = serde_json::json!({ "message": { "raw": raw_base64 } });
    let resp = client.post(&url, &body).await?.json::<serde_json::Value>().await?;
    Ok(resp)
}

pub async fn list_labels(client: &ApiClient) -> Result<Vec<Label>, AppError> {
    let url = format!("{}/labels", GMAIL_BASE);
    let resp = client.get(&url).await?.json::<LabelListResponse>().await?;
    Ok(resp.labels)
}

pub async fn watch(
    client: &ApiClient,
    topic_name: &str,
) -> Result<WatchResponse, AppError> {
    let url = format!("{}/watch", GMAIL_BASE);
    let body = WatchRequest {
        topic_name: topic_name.to_string(),
        label_ids: vec!["INBOX".to_string()],
    };
    let resp = client.post(&url, &body).await?.json::<WatchResponse>().await?;
    Ok(resp)
}

pub async fn stop_watch(client: &ApiClient) -> Result<(), AppError> {
    let url = format!("{}/stop", GMAIL_BASE);
    client.post(&url, &serde_json::Value::Null).await?;
    Ok(())
}

pub async fn get_history(
    client: &ApiClient,
    start_history_id: &str,
) -> Result<serde_json::Value, AppError> {
    let url = format!(
        "{}/history?startHistoryId={}&historyTypes=messageAdded",
        GMAIL_BASE, start_history_id
    );
    let resp = client.get(&url).await?.json::<serde_json::Value>().await?;
    Ok(resp)
}

/// Build a base64url-encoded RFC 2822 email message.
pub fn build_raw_message(
    to: &str,
    from: &str,
    subject: &str,
    html_body: &str,
    in_reply_to: Option<&str>,
    references: Option<&str>,
) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

    let mut headers = format!(
        "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n",
        from, to, subject
    );
    if let Some(irt) = in_reply_to {
        headers.push_str(&format!("In-Reply-To: {}\r\n", irt));
    }
    if let Some(refs) = references {
        headers.push_str(&format!("References: {}\r\n", refs));
    }
    let full = format!("{}\r\n{}", headers, html_body);
    URL_SAFE_NO_PAD.encode(full.as_bytes())
}

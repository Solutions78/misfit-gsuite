use serde::{Deserialize, Serialize};

use crate::api::client::ApiClient;
use crate::error::AppError;

const CHAT_BASE: &str = "https://chat.googleapis.com/v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub name: String,
    pub display_name: Option<String>,
    pub space_type: Option<String>,
    pub single_user_bot_dm: Option<bool>,
    pub threaded: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceListResponse {
    pub spaces: Option<Vec<Space>>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUser {
    pub name: Option<String>,
    pub display_name: Option<String>,
    #[serde(rename = "type")]
    pub user_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageText {
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThread {
    pub name: Option<String>,
    pub thread_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub name: String,
    pub sender: Option<ChatUser>,
    pub create_time: Option<String>,
    pub last_update_time: Option<String>,
    pub delete_time: Option<String>,
    pub text: Option<String>,
    pub formatted_text: Option<String>,
    pub thread: Option<ChatThread>,
    pub thread_reply: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageListResponse {
    pub messages: Option<Vec<ChatMessage>>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub text: String,
}

pub async fn list_spaces(client: &ApiClient) -> Result<Vec<Space>, AppError> {
    let url = format!("{}/spaces?pageSize=100", CHAT_BASE);
    let resp = client.get(&url).await?.json::<SpaceListResponse>().await?;
    Ok(resp.spaces.unwrap_or_default())
}

pub async fn list_messages(
    client: &ApiClient,
    space_name: &str,
    page_token: Option<&str>,
    page_size: u32,
) -> Result<MessageListResponse, AppError> {
    let mut url = format!(
        "{}/{}/messages?pageSize={}&orderBy=createTime%20ASC",
        CHAT_BASE, space_name, page_size
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }
    let resp = client.get(&url).await?.json::<MessageListResponse>().await?;
    Ok(resp)
}

pub async fn send_message(
    client: &ApiClient,
    space_name: &str,
    text: String,
) -> Result<ChatMessage, AppError> {
    let url = format!("{}/{}/messages", CHAT_BASE, space_name);
    let body = SendMessageRequest { text };
    let resp = client.post(&url, &body).await?.json::<ChatMessage>().await?;
    Ok(resp)
}

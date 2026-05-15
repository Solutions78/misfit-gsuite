use mailparse::MailHeaderMap;
use serde::{Deserialize, Serialize};

use crate::api::client::ApiClient;
use crate::error::AppError;

const GMAIL_BASE: &str = "https://gmail.googleapis.com/gmail/v1/users/me";

// ── Types ──────────────────────────────────────────────────────────────────

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
    pub raw: Option<String>,
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
    pub result_size_estimate: Option<u32>,
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
pub struct ThreadSummary {
    pub id: String,
    pub snippet: Option<String>,
    pub from: Option<String>,
    pub subject: Option<String>,
    pub date: Option<String>,
    pub internal_date: Option<String>,
    pub is_unread: bool,
    pub is_starred: bool,
    pub message_count: usize,
    pub label_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummaryPage {
    pub threads: Vec<ThreadSummary>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadStubPublic {
    pub id: String,
    pub snippet: Option<String>,
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
pub struct MessageHeader {
    pub name: String,
    pub value: String,
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
pub struct Label {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub label_type: String,
    pub messages_total: Option<u32>,
    pub messages_unread: Option<u32>,
    pub threads_total: Option<u32>,
    pub threads_unread: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelsResponse {
    pub labels: Vec<Label>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SentMessage {
    pub id: String,
    pub thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchResponse {
    pub history_id: String,
    pub expiration: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailView {
    pub id: String,
    pub thread_id: String,
    pub from: String,
    pub to: String,
    pub subject: String,
    pub date: String,
    pub body_html: String,
    pub snippet: String,
    pub label_ids: Vec<String>,
    pub attachments: Vec<EmailAttachment>,
    pub cid_map: std::collections::HashMap<String, String>, // cid -> data_uri
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailAttachment {
    pub id: Option<String>,
    pub filename: String,
    pub mime_type: String,
    pub size: usize,
}

impl EmailView {
    pub fn from_raw(
        id: String,
        thread_id: String,
        label_ids: Vec<String>,
        snippet: String,
        raw_b64: &str,
    ) -> Result<Self, AppError> {
        let bytes = decode_gmail_base64_bytes(raw_b64)?;

        let parsed = mailparse::parse_mail(&bytes)
            .map_err(|e| AppError::Other(format!("MIME parse failed: {}", e)))?;

        let get_header = |name: &str| parsed.headers.get_first_value(name).unwrap_or_default();

        let mut body_html = String::new();
        let mut body_plain = String::new();
        let mut attachments = Vec::new();
        let mut cid_map = std::collections::HashMap::new();

        fn walk_parts(
            part: &mailparse::ParsedMail,
            html: &mut String,
            plain: &mut String,
            atts: &mut Vec<EmailAttachment>,
            cids: &mut std::collections::HashMap<String, String>,
        ) {
            let content_type = part.ctype.mimetype.to_lowercase();
            let disposition = part.get_content_disposition();

            // Extract CID for inline images
            for h in &part.headers {
                if h.get_key().eq_ignore_ascii_case("Content-ID") {
                    let cid = h
                        .get_value()
                        .trim_matches(|c| c == '<' || c == '>')
                        .to_string();
                    if !cid.is_empty() {
                        if let Ok(raw_bytes) = part.get_body_raw() {
                            use base64::{engine::general_purpose::STANDARD, Engine};
                            let b64 = STANDARD.encode(&raw_bytes);
                            cids.insert(cid, format!("data:{};base64,{}", content_type, b64));
                        }
                    }
                }
            }

            if disposition.disposition == mailparse::DispositionType::Attachment {
                atts.push(EmailAttachment {
                    id: None,
                    filename: disposition
                        .params
                        .get("filename")
                        .cloned()
                        .unwrap_or_else(|| "unnamed".to_string()),
                    mime_type: content_type,
                    size: part.get_body_raw().unwrap_or_default().len(),
                });
            } else if content_type == "text/html" {
                if let Ok(body) = part.get_body() {
                    html.push_str(&body);
                }
            } else if content_type == "text/plain" {
                if let Ok(body) = part.get_body() {
                    plain.push_str(&body);
                }
            }

            for sub in &part.subparts {
                walk_parts(sub, html, plain, atts, cids);
            }
        }

        walk_parts(
            &parsed,
            &mut body_html,
            &mut body_plain,
            &mut attachments,
            &mut cid_map,
        );

        // Fallback to plain text if no HTML found
        if body_html.is_empty() && !body_plain.is_empty() {
            body_html = format!(
                "<pre style=\"white-space: pre-wrap; font-family: inherit;\">{}</pre>",
                body_plain
            );
        }

        Ok(EmailView {
            id,
            thread_id,
            from: get_header("From"),
            to: get_header("To"),
            subject: get_header("Subject"),
            date: get_header("Date"),
            body_html,
            snippet,
            label_ids,
            attachments,
            cid_map,
        })
    }
}

// ── API functions ──────────────────────────────────────────────────────────

pub async fn list_threads(
    client: &ApiClient,
    label_ids: &[String],
    page_token: Option<&str>,
    max_results: u32,
) -> Result<ThreadListResponse, AppError> {
    let mut url = format!("{}/threads?maxResults={}", GMAIL_BASE, max_results);
    for lid in label_ids {
        url.push_str(&format!("&labelIds={}", lid));
    }
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", token));
    }
    let resp = client.get(&url).await?.json::<ThreadListResponse>().await?;
    Ok(resp)
}

pub async fn list_thread_summaries(
    client: &ApiClient,
    label_ids: &[String],
    page_token: Option<&str>,
    max_results: u32,
) -> Result<ThreadSummaryPage, AppError> {
    let threads_resp = list_threads(client, label_ids, page_token, max_results).await?;
    let mut summaries = Vec::new();

    if let Some(threads) = threads_resp.threads {
        for t in threads {
            // Fetch metadata for each thread to get from/subject/date
            let url = format!("{}/threads/{}?format=metadata", GMAIL_BASE, t.id);
            if let Ok(full_t) = client.get(&url).await?.json::<Thread>().await {
                if let Some(msgs) = full_t.messages {
                    if let Some(m) = msgs.first() {
                        summaries.push(ThreadSummary {
                            id: t.id,
                            snippet: m.snippet.clone(),
                            from: Some(extract_header_raw(m, "From")),
                            subject: Some(extract_header_raw(m, "Subject")),
                            date: Some(extract_header_raw(m, "Date")),
                            internal_date: m.internal_date.clone(),
                            is_unread: m
                                .label_ids
                                .as_ref()
                                .map(|l| l.contains(&"UNREAD".to_string()))
                                .unwrap_or(false),
                            is_starred: m
                                .label_ids
                                .as_ref()
                                .map(|l| l.contains(&"STARRED".to_string()))
                                .unwrap_or(false),
                            message_count: msgs.len(),
                            label_ids: m.label_ids.clone().unwrap_or_default(),
                        });
                    }
                }
            }
        }
    }

    Ok(ThreadSummaryPage {
        threads: summaries,
        next_page_token: threads_resp.next_page_token,
    })
}

pub async fn search_thread_summaries(
    client: &ApiClient,
    query: &str,
    page_token: Option<&str>,
) -> Result<ThreadSummaryPage, AppError> {
    let mut url = format!(
        "{}/threads?q={}&maxResults=50",
        GMAIL_BASE,
        urlencoding::encode(query)
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", token));
    }
    let threads_resp = client.get(&url).await?.json::<ThreadListResponse>().await?;
    let mut summaries = Vec::new();

    if let Some(threads) = threads_resp.threads {
        for t in threads {
            let url = format!("{}/threads/{}?format=metadata", GMAIL_BASE, t.id);
            if let Ok(full_t) = client.get(&url).await?.json::<Thread>().await {
                if let Some(msgs) = full_t.messages {
                    if let Some(m) = msgs.first() {
                        summaries.push(ThreadSummary {
                            id: t.id,
                            snippet: m.snippet.clone(),
                            from: Some(extract_header_raw(m, "From")),
                            subject: Some(extract_header_raw(m, "Subject")),
                            date: Some(extract_header_raw(m, "Date")),
                            internal_date: m.internal_date.clone(),
                            is_unread: m
                                .label_ids
                                .as_ref()
                                .map(|l| l.contains(&"UNREAD".to_string()))
                                .unwrap_or(false),
                            is_starred: m
                                .label_ids
                                .as_ref()
                                .map(|l| l.contains(&"STARRED".to_string()))
                                .unwrap_or(false),
                            message_count: msgs.len(),
                            label_ids: m.label_ids.clone().unwrap_or_default(),
                        });
                    }
                }
            }
        }
    }

    Ok(ThreadSummaryPage {
        threads: summaries,
        next_page_token: threads_resp.next_page_token,
    })
}

pub async fn get_thread(client: &ApiClient, thread_id: &str) -> Result<Thread, AppError> {
    let url = format!("{}/threads/{}?format=full", GMAIL_BASE, thread_id);
    let resp = client.get(&url).await?.json::<Thread>().await?;
    Ok(resp)
}

pub async fn get_message(client: &ApiClient, msg_id: &str) -> Result<GmailMessage, AppError> {
    let url = format!("{}/messages/{}?format=raw", GMAIL_BASE, msg_id);
    let resp = client.get(&url).await?.json::<GmailMessage>().await?;
    Ok(resp)
}

pub async fn get_email_view(client: &ApiClient, msg_id: &str) -> Result<EmailView, AppError> {
    let msg = get_message(client, msg_id).await?;
    let raw = msg
        .raw
        .ok_or_else(|| AppError::Other("No raw data in message".to_string()))?;
    EmailView::from_raw(
        msg.id,
        msg.thread_id,
        msg.label_ids.unwrap_or_default(),
        msg.snippet.unwrap_or_default(),
        &raw,
    )
}

pub async fn get_thread_view(
    client: &ApiClient,
    thread_id: &str,
) -> Result<Vec<EmailView>, AppError> {
    let url = format!("{}/threads/{}?format=metadata", GMAIL_BASE, thread_id);
    let thread = client.get(&url).await?.json::<Thread>().await?;
    let msgs = thread.messages.unwrap_or_default();

    let mut views = Vec::new();
    for m in msgs {
        views.push(get_email_view(client, &m.id).await?);
    }
    Ok(views)
}

pub async fn search_messages(
    client: &ApiClient,
    query: &str,
    page_token: Option<&str>,
) -> Result<ThreadListResponse, AppError> {
    let mut url = format!(
        "{}/messages?q={}&maxResults=50",
        GMAIL_BASE,
        urlencoding::encode(query)
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", token));
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
    let body = serde_json::json!({
        "addLabelIds": add_labels,
        "removeLabelIds": remove_labels,
    });
    client.post(&url, &body).await?;
    Ok(())
}

pub async fn trash_message(client: &ApiClient, msg_id: &str) -> Result<(), AppError> {
    let url = format!("{}/messages/{}/trash", GMAIL_BASE, msg_id);
    client.post(&url, &serde_json::Value::Null).await?;
    Ok(())
}

pub async fn send_message(client: &ApiClient, raw_b64: String) -> Result<SentMessage, AppError> {
    let url = format!("{}/messages/send", GMAIL_BASE);
    let body = serde_json::json!({ "raw": raw_b64 });
    let resp = client
        .post(&url, &body)
        .await?
        .json::<SentMessage>()
        .await?;
    Ok(resp)
}

pub async fn create_draft(
    client: &ApiClient,
    raw_b64: String,
) -> Result<serde_json::Value, AppError> {
    let url = format!("{}/drafts", GMAIL_BASE);
    let body = serde_json::json!({ "message": { "raw": raw_b64 } });
    let resp = client
        .post(&url, &body)
        .await?
        .json::<serde_json::Value>()
        .await?;
    Ok(resp)
}

pub async fn list_labels(client: &ApiClient) -> Result<Vec<Label>, AppError> {
    let url = format!("{}/labels", GMAIL_BASE);
    let resp = client.get(&url).await?.json::<LabelsResponse>().await?;
    Ok(resp.labels)
}

pub async fn get_profile(client: &ApiClient) -> Result<serde_json::Value, AppError> {
    let url = format!("{}/profile", GMAIL_BASE);
    let resp = client.get(&url).await?.json::<serde_json::Value>().await?;
    Ok(resp)
}

pub async fn get_history(
    client: &ApiClient,
    start_history_id: &str,
) -> Result<serde_json::Value, AppError> {
    let url = format!("{}/history?startHistoryId={}", GMAIL_BASE, start_history_id);
    let resp = client.get(&url).await?.json::<serde_json::Value>().await?;
    Ok(resp)
}

pub async fn watch(client: &ApiClient, topic_name: &str) -> Result<WatchResponse, AppError> {
    let url = format!("{}/watch", GMAIL_BASE);
    let body = serde_json::json!({ "topicName": topic_name, "labelFilterAction": "include", "labelIds": ["INBOX"] });
    let resp = client
        .post(&url, &body)
        .await?
        .json::<WatchResponse>()
        .await?;
    Ok(resp)
}

pub async fn get_attachment(
    client: &ApiClient,
    msg_id: &str,
    attachment_id: &str,
) -> Result<String, AppError> {
    let url = format!(
        "{}/messages/{}/attachments/{}",
        GMAIL_BASE, msg_id, attachment_id
    );
    let resp = client.get(&url).await?.json::<serde_json::Value>().await?;
    Ok(resp["data"].as_str().unwrap_or_default().to_string())
}

pub async fn create_label(client: &ApiClient, name: &str) -> Result<Label, AppError> {
    let url = format!("{}/labels", GMAIL_BASE);
    let body = serde_json::json!({ "name": name, "labelListVisibility": "labelShow", "messageListVisibility": "show" });
    let resp = client.post(&url, &body).await?.json::<Label>().await?;
    Ok(resp)
}

// ── Utils ──────────────────────────────────────────────────────────────────

pub fn decode_gmail_base64_bytes(data: &str) -> Result<Vec<u8>, AppError> {
    use base64::{
        engine::general_purpose::{STANDARD, URL_SAFE, URL_SAFE_NO_PAD},
        Engine,
    };

    let data = data.trim();
    URL_SAFE_NO_PAD
        .decode(data)
        .or_else(|_| URL_SAFE.decode(data))
        .or_else(|_| STANDARD.decode(data))
        .map_err(|e| AppError::Other(format!("Base64 decode failed: {}", e)))
}

pub fn decode_gmail_base64_string(data: &str) -> Result<String, AppError> {
    let bytes = decode_gmail_base64_bytes(data)?;
    String::from_utf8(bytes)
        .map_err(|e| AppError::Other(format!("Gmail body was not valid UTF-8: {}", e)))
}

pub fn build_raw_message(
    to: &str,
    from: &str,
    subject: &str,
    html_body: &str,
    in_reply_to: Option<&str>,
    references: Option<&str>,
) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

    let mut msg = format!(
        "To: {}\r\nFrom: {}\r\nSubject: {}\r\nContent-Type: text/html; charset=utf-8\r\n",
        to, from, subject
    );

    if let Some(id) = in_reply_to {
        msg.push_str(&format!("In-Reply-To: <{}>\r\n", id));
    }
    if let Some(refs) = references {
        msg.push_str(&format!("References: {}\r\n", refs));
    }

    msg.push_str("\r\n");
    msg.push_str(html_body);

    URL_SAFE_NO_PAD.encode(msg.as_bytes())
}

fn extract_header_raw(msg: &GmailMessage, name: &str) -> String {
    msg.payload
        .as_ref()
        .and_then(|p| p.headers.as_ref())
        .and_then(|headers| {
            headers
                .iter()
                .find(|h| h.name.eq_ignore_ascii_case(name))
                .map(|h| h.value.clone())
        })
        .unwrap_or_default()
}

pub async fn fetch_summary_for_stub_public(
    client: &ApiClient,
    stub: ThreadStubPublic,
) -> ThreadSummary {
    let url = format!("{}/threads/{}?format=metadata", GMAIL_BASE, stub.id);
    if let Ok(resp) = client.get(&url).await {
        if let Ok(full_t) = resp.json::<Thread>().await {
            if let Some(msgs) = full_t.messages {
                if let Some(m) = msgs.first() {
                    return ThreadSummary {
                        id: stub.id,
                        snippet: m.snippet.clone(),
                        from: Some(extract_header_raw(m, "From")),
                        subject: Some(extract_header_raw(m, "Subject")),
                        date: Some(extract_header_raw(m, "Date")),
                        internal_date: m.internal_date.clone(),
                        is_unread: m
                            .label_ids
                            .as_ref()
                            .map(|l| l.contains(&"UNREAD".to_string()))
                            .unwrap_or(false),
                        is_starred: m
                            .label_ids
                            .as_ref()
                            .map(|l| l.contains(&"STARRED".to_string()))
                            .unwrap_or(false),
                        message_count: msgs.len(),
                        label_ids: m.label_ids.clone().unwrap_or_default(),
                    };
                }
            }
        }
    }

    ThreadSummary {
        id: stub.id,
        snippet: stub.snippet,
        from: None,
        subject: None,
        date: None,
        internal_date: None,
        is_unread: false,
        is_starred: false,
        message_count: 0,
        label_ids: Vec::new(),
    }
}

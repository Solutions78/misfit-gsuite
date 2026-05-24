use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::api::gmail::{
    self, EmailView, GmailMessage, Label, MessageBody, MessageHeader, MessagePart,
    Thread, ThreadListResponse, ThreadSummary, ThreadSummaryPage,
};
use crate::db::queries::{self, CachedMessage, CachedThreadSummary};
use crate::AppState;

// ── Helpers ────────────────────────────────────────────────────────────────

/// Map a CachedThreadSummary to the ThreadSummary the frontend expects.
fn cached_to_thread_summary(c: CachedThreadSummary) -> ThreadSummary {
    ThreadSummary {
        id: c.thread_id.clone(),
        snippet: c.snippet,
        from: c.from_address,
        subject: c.subject,
        date: c.date_header,
        internal_date: c.internal_date.map(|d| d.to_string()),
        is_unread: !c.is_read,
        is_starred: c.is_starred,
        message_count: c.message_count as usize,
        label_ids: c.label_ids,
    }
}

/// True when the reqwest error looks like a connectivity problem (not an
/// auth/API-level error that should still propagate).
fn is_network_error(e: &crate::error::AppError) -> bool {
    match e {
        crate::error::AppError::Http(re) => re.is_connect() || re.is_timeout(),
        _ => false,
    }
}

/// Get the current user's email from the oauth state (best-effort).
async fn current_email(state: &AppState) -> String {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    oauth
        .current_token()
        .map(|t| t.email.clone())
        .unwrap_or_default()
}

/// Extract the text body from a GmailMessage payload tree (HTML preferred,
/// plain-text fallback). Returns base64url-decoded string.
fn extract_body_html(msg: &GmailMessage) -> Option<String> {
    fn decode(data: &str) -> Option<String> {
        gmail::decode_gmail_base64_string(data).ok()
    }

    fn find_in_part(part: &MessagePart, prefer_html: bool) -> Option<String> {
        let mime = part.mime_type.as_deref().unwrap_or("");
        if prefer_html && mime == "text/html" {
            if let Some(body) = &part.body {
                if let Some(data) = &body.data {
                    return decode(data);
                }
            }
        }
        if !prefer_html && mime == "text/plain" {
            if let Some(body) = &part.body {
                if let Some(data) = &body.data {
                    return decode(data).map(|t| {
                        let escaped = t
                            .replace('&', "&amp;")
                            .replace('<', "&lt;")
                            .replace('>', "&gt;")
                            .replace('"', "&quot;");
                        format!("<pre>{}</pre>", escaped)
                    });
                }
            }
        }
        if let Some(parts) = &part.parts {
            for p in parts {
                if let Some(found) = find_in_part(p, prefer_html) {
                    return Some(found);
                }
            }
        }
        None
    }

    if let Some(payload) = &msg.payload {
        // Try HTML first
        if let Some(html) = find_in_part(payload, true) {
            return Some(html);
        }
        // Plain-text fallback
        if let Some(plain) = find_in_part(payload, false) {
            return Some(plain);
        }
        // Direct body (non-multipart)
        if let Some(body) = &payload.body {
            if let Some(data) = &body.data {
                return decode(data);
            }
        }
    }
    None
}

/// Build a synthetic GmailMessage from cached data so Thread responses work
/// without hitting the network.
fn cached_msg_to_gmail_message(cached: &CachedMessage) -> GmailMessage {
    // Reconstruct minimal headers so the frontend can display From/Subject/Date
    let mut headers: Vec<MessageHeader> = Vec::new();
    if let Some(from) = &cached.from_address {
        headers.push(MessageHeader {
            name: "From".to_string(),
            value: from.clone(),
        });
    }
    if let Some(subject) = &cached.subject {
        headers.push(MessageHeader {
            name: "Subject".to_string(),
            value: subject.clone(),
        });
    }
    if let Some(date) = &cached.date_header {
        headers.push(MessageHeader {
            name: "Date".to_string(),
            value: date.clone(),
        });
    }

    let body_data = cached.body_html.as_ref().map(|html| {
        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
        URL_SAFE_NO_PAD.encode(html.as_bytes())
    });

    let payload = Some(MessagePart {
        mime_type: Some("text/html".to_string()),
        headers: Some(headers),
        body: Some(MessageBody {
            size: body_data.as_ref().map(|d| d.len() as i64),
            data: body_data,
            attachment_id: None,
        }),
        parts: None,
    });

    GmailMessage {
        id: cached.id.clone(),
        thread_id: cached.thread_id.clone(),
        label_ids: Some(cached.label_ids.clone()),
        snippet: cached.snippet.clone(),
        payload,
        size_estimate: None,
        internal_date: cached.internal_date.map(|d| d.to_string()),
        history_id: None,
        raw: None,
    }
}

// ── Params ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListThreadsParams {
    pub label_ids: Vec<String>,
    pub page_token: Option<String>,
    pub max_results: Option<u32>,
}

// ── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_threads(
    state: State<'_, AppState>,
    params: ListThreadsParams,
) -> Result<ThreadListResponse, String> {
    let api = state.api.read().await;
    gmail::list_threads(
        &api,
        &params.label_ids,
        params.page_token.as_deref(),
        params.max_results.unwrap_or(50),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_email_view(
    state: State<'_, AppState>,
    msg_id: String,
) -> Result<EmailView, String> {
    let api = state.api.read().await;
    gmail::get_email_view(&api, &msg_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_thread_view(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Vec<EmailView>, String> {
    let api = state.api.read().await;
    gmail::get_thread_view(&api, &thread_id)
        .await
        .map_err(|e| e.to_string())
}

/// Returns cached thread summaries immediately, then spawns a background sync.
/// On first launch (empty cache) does a blocking fetch-and-cache before returning.
#[tauri::command]
pub async fn list_thread_summaries(
    state: State<'_, AppState>,
    app: AppHandle,
    params: ListThreadsParams,
) -> Result<ThreadSummaryPage, String> {
    let label_id = params
        .label_ids
        .first()
        .cloned()
        .unwrap_or_else(|| "INBOX".to_string());
    let max = params.max_results.unwrap_or(50) as i64;

    // --- Try cache first ---
    let cached = {
        let db = state.db.lock().await;
        queries::list_cached_thread_summaries(&db, &label_id, max, 0).unwrap_or_default()
    };

    if !cached.is_empty() {
        // Return cached data immediately
        let threads: Vec<ThreadSummary> =
            cached.into_iter().map(cached_to_thread_summary).collect();
        let page = ThreadSummaryPage {
            threads,
            next_page_token: None,
        };

        return Ok(page);
    }

    // --- First launch: blocking fetch-and-cache ---
    let page = {
        let api = state.api.read().await;
        gmail::list_thread_summaries(
            &api,
            &params.label_ids,
            params.page_token.as_deref(),
            max as u32,
        )
        .await
        .map_err(|e| e.to_string())?
    };

    // Persist to cache in background (don't block return)
    let summaries = page.threads.clone();
    let label_id_clone = label_id.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_handle.state::<AppState>();
        cache_thread_summaries(&state, summaries, &label_id_clone).await;
    });

    Ok(page)
}

/// Persist a list of ThreadSummary values to the local DB.
async fn cache_thread_summaries(state: &AppState, summaries: Vec<ThreadSummary>, label_id: &str) {
    let db = state.db.lock().await;
    for s in summaries {
        let msg = CachedMessage {
            id: s.id.clone(),
            thread_id: s.id.clone(),
            subject: s.subject,
            from_address: s.from,
            snippet: s.snippet,
            body_html: None,
            date_header: s.date,
            label_ids: {
                let mut labels = vec![label_id.to_string()];
                if s.is_unread {
                    labels.push("UNREAD".to_string());
                }
                if s.is_starred {
                    labels.push("STARRED".to_string());
                }
                labels
            },
            is_read: !s.is_unread,
            is_starred: s.is_starred,
            has_attachment: false,
            internal_date: s
                .internal_date
                .as_deref()
                .and_then(|d| d.parse::<i64>().ok()),
        };
        let _ = queries::upsert_thread_summary(&db, &msg);
    }
}

#[allow(dead_code)]
async fn background_sync_threads(
    state: &AppState,
    app: &AppHandle,
    label_ids: &[String],
    max_results: u32,
) {
    let result = {
        let api = state.api.read().await;
        gmail::list_thread_summaries(&api, label_ids, None, max_results).await
    };

    match result {
        Ok(page) => {
            let label_id = label_ids
                .first()
                .cloned()
                .unwrap_or_else(|| "INBOX".to_string());
            cache_thread_summaries(state, page.threads, &label_id).await;
            let _ = app.emit("mail::synced", ());
        }
        Err(e) => {
            eprintln!("Background thread sync failed: {}", e);
        }
    }
}

#[tauri::command]
pub async fn search_thread_summaries(
    state: State<'_, AppState>,
    query: String,
    page_token: Option<String>,
) -> Result<ThreadSummaryPage, String> {
    // Try local cache first
    let cached = {
        let db = state.db.lock().await;
        queries::search_cached_threads(&db, &query, 50).unwrap_or_default()
    };

    if !cached.is_empty() {
        let threads = cached.into_iter().map(cached_to_thread_summary).collect();
        return Ok(ThreadSummaryPage {
            threads,
            next_page_token: None,
        });
    }

    // Fall back to API
    let api = state.api.read().await;
    gmail::search_thread_summaries(&api, &query, page_token.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Returns a full Thread. Checks local cache for body_html on each message;
/// if all bodies present, returns from DB. Otherwise fetches from API.
#[tauri::command]
pub async fn get_thread(state: State<'_, AppState>, thread_id: String) -> Result<Thread, String> {
    // Check if we have all messages for this thread cached with bodies
    let cached_msgs = {
        let db = state.db.lock().await;
        queries::get_messages_for_thread(&db, &thread_id).unwrap_or_default()
    };

    let all_have_bodies =
        !cached_msgs.is_empty() && cached_msgs.iter().all(|m| m.body_html.is_some());

    if all_have_bodies {
        let messages: Vec<GmailMessage> = cached_msgs
            .iter()
            .map(cached_msg_to_gmail_message)
            .collect();
        return Ok(Thread {
            id: thread_id,
            history_id: None,
            messages: Some(messages),
        });
    }

    // Fetch from API
    let thread = {
        let api = state.api.read().await;
        gmail::get_thread(&api, &thread_id)
            .await
            .map_err(|e| e.to_string())?
    };

    // Persist bodies to DB. Only store the body_html; don't upsert per-message rows
    // with null subject/from as that would clobber good thread-summary rows.
    if let Some(msgs) = &thread.messages {
        let db = state.db.lock().await;
        for msg in msgs {
            if let Some(body_html) = extract_body_html(msg) {
                let _ = queries::store_body(&db, &msg.id, &body_html);
            }
        }
    }

    Ok(thread)
}

#[tauri::command]
pub async fn get_message(
    state: State<'_, AppState>,
    msg_id: String,
) -> Result<GmailMessage, String> {
    let api = state.api.read().await;
    gmail::get_message(&api, &msg_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_threads(
    state: State<'_, AppState>,
    query: String,
    page_token: Option<String>,
) -> Result<ThreadListResponse, String> {
    let api = state.api.read().await;
    gmail::search_messages(&api, &query, page_token.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Send a message. On network error, enqueues as pending_op and returns queued flag.
#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    to: String,
    subject: String,
    html_body: String,
    in_reply_to: Option<String>,
    references: Option<String>,
) -> Result<serde_json::Value, String> {
    let from = current_email(&state).await;

    let raw = gmail::build_raw_message(
        &to,
        &from,
        &subject,
        &html_body,
        in_reply_to.as_deref(),
        references.as_deref(),
    );

    let send_result = {
        let api = state.api.read().await;
        gmail::send_message(&api, raw.clone()).await
    };

    match send_result {
        Ok(sent) => {
            // Cache the sent message
            let cached = CachedMessage {
                id: sent.id.clone(),
                thread_id: sent.thread_id.clone(),
                subject: Some(subject),
                from_address: Some(from),
                snippet: Some(html_body.chars().take(200).collect()),
                body_html: Some(html_body),
                date_header: None,
                label_ids: vec!["SENT".to_string()],
                is_read: true,
                is_starred: false,
                has_attachment: false,
                internal_date: Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or(0),
                ),
            };
            let db = state.db.lock().await;
            let _ = queries::upsert_message(&db, &cached);
            drop(db);

            Ok(serde_json::json!({ "id": sent.id, "threadId": sent.thread_id, "queued": false }))
        }
        Err(e) if is_network_error(&e) => {
            // Enqueue for later
            let payload = serde_json::json!({
                "to": to,
                "from": from,
                "subject": subject,
                "raw": raw,
                "in_reply_to": in_reply_to,
                "references": references,
            });
            let db = state.db.lock().await;
            let op_id = queries::enqueue_op(&db, "send", &payload.to_string())
                .map_err(|e| e.to_string())?;
            drop(db);
            Ok(
                serde_json::json!({ "id": null, "threadId": null, "queued": true, "queueId": op_id }),
            )
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn create_draft(
    state: State<'_, AppState>,
    to: String,
    subject: String,
    html_body: String,
    in_reply_to: Option<String>,
) -> Result<serde_json::Value, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let from = oauth
        .current_token()
        .map(|t| t.email.clone())
        .unwrap_or_default();
    drop(oauth);

    let raw = gmail::build_raw_message(
        &to,
        &from,
        &subject,
        &html_body,
        in_reply_to.as_deref(),
        None,
    );
    gmail::create_draft(&api, raw)
        .await
        .map_err(|e| e.to_string())
}

/// Trash a message optimistically, enqueue on network failure.
#[tauri::command]
pub async fn trash_message(state: State<'_, AppState>, msg_id: String) -> Result<(), String> {
    // Optimistic local update
    {
        let db = state.db.lock().await;
        let _ = queries::apply_local_label_change(
            &db,
            &msg_id,
            &["TRASH".to_string()],
            &["INBOX".to_string()],
        );
    }

    let api_result = {
        let api = state.api.read().await;
        gmail::trash_message(&api, &msg_id).await
    };

    match api_result {
        Ok(_) => Ok(()),
        Err(e) if is_network_error(&e) => {
            let payload = serde_json::json!({ "msg_id": msg_id });
            let db = state.db.lock().await;
            let _ = queries::enqueue_op(&db, "trash", &payload.to_string());
            Ok(()) // optimistic — UI already updated
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Star/unstar a message optimistically, enqueue on network failure.
#[tauri::command]
pub async fn star_message(
    state: State<'_, AppState>,
    msg_id: String,
    starred: bool,
) -> Result<(), String> {
    let (add, remove): (Vec<String>, Vec<String>) = if starred {
        (vec!["STARRED".to_string()], vec![])
    } else {
        (vec![], vec!["STARRED".to_string()])
    };

    // Optimistic update
    {
        let db = state.db.lock().await;
        let _ = queries::apply_local_label_change(&db, &msg_id, &add, &remove);
    }

    let api_result = {
        let api = state.api.read().await;
        gmail::modify_message(&api, &msg_id, add.clone(), remove.clone()).await
    };

    match api_result {
        Ok(_) => Ok(()),
        Err(e) if is_network_error(&e) => {
            let op = if starred { "star" } else { "unstar" };
            let payload = serde_json::json!({ "msg_id": msg_id, "starred": starred });
            let db = state.db.lock().await;
            let _ = queries::enqueue_op(&db, op, &payload.to_string());
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Archive a message optimistically, enqueue on network failure.
#[tauri::command]
pub async fn archive_message(state: State<'_, AppState>, msg_id: String) -> Result<(), String> {
    {
        let db = state.db.lock().await;
        let _ = queries::apply_local_label_change(&db, &msg_id, &[], &["INBOX".to_string()]);
    }

    let api_result = {
        let api = state.api.read().await;
        gmail::modify_message(&api, &msg_id, vec![], vec!["INBOX".to_string()]).await
    };

    match api_result {
        Ok(_) => Ok(()),
        Err(e) if is_network_error(&e) => {
            let payload = serde_json::json!({ "msg_id": msg_id });
            let db = state.db.lock().await;
            let _ = queries::enqueue_op(&db, "archive", &payload.to_string());
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Mark read/unread optimistically, enqueue on network failure.
#[tauri::command]
pub async fn mark_read(
    state: State<'_, AppState>,
    msg_id: String,
    read: bool,
) -> Result<(), String> {
    let (add, remove): (Vec<String>, Vec<String>) = if read {
        (vec![], vec!["UNREAD".to_string()])
    } else {
        (vec!["UNREAD".to_string()], vec![])
    };

    {
        let db = state.db.lock().await;
        let _ = queries::apply_local_label_change(&db, &msg_id, &add, &remove);
    }

    let api_result = {
        let api = state.api.read().await;
        gmail::modify_message(&api, &msg_id, add.clone(), remove.clone()).await
    };

    match api_result {
        Ok(_) => Ok(()),
        Err(e) if is_network_error(&e) => {
            let op = if read { "mark_read" } else { "mark_unread" };
            let payload = serde_json::json!({ "msg_id": msg_id, "read": read });
            let db = state.db.lock().await;
            let _ = queries::enqueue_op(&db, op, &payload.to_string());
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn modify_message(
    state: State<'_, AppState>,
    msg_id: String,
    add_labels: Vec<String>,
    remove_labels: Vec<String>,
) -> Result<(), String> {
    let api = state.api.read().await;
    gmail::modify_message(&api, &msg_id, add_labels, remove_labels)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_labels(state: State<'_, AppState>) -> Result<Vec<Label>, String> {
    let api = state.api.read().await;
    gmail::list_labels(&api).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn setup_gmail_watch(
    state: State<'_, AppState>,
    topic_name: String,
) -> Result<String, String> {
    let api = state.api.read().await;
    let watch_resp = gmail::watch(&api, &topic_name)
        .await
        .map_err(|e| e.to_string())?;
    Ok(watch_resp.history_id)
}

#[tauri::command]
pub async fn get_attachment(
    state: State<'_, AppState>,
    msg_id: String,
    attachment_id: String,
) -> Result<String, String> {
    let api = state.api.read().await;
    gmail::get_attachment(&api, &msg_id, &attachment_id)
        .await
        .map_err(|e| e.to_string())
}

// ── Sync ───────────────────────────────────────────────────────────────────

/// Full or incremental inbox sync.
/// Internal sync logic shared between the Tauri command and the background task.
pub async fn sync_inbox_internal(state: &AppState, app: &AppHandle) -> Result<(), String> {
    let email = current_email(&state).await;
    if email.is_empty() {
        return Err("Not authenticated".to_string());
    }

    // Deduplicate sync calls
    let _sync_guard = state.sync_lock.lock().await;

    let mut history_id = {
        let db = state.db.lock().await;
        queries::get_sync_state(&db, &email).unwrap_or(None)
    };

    if let Some(hid) = &history_id {
        let api = state.api.read().await;
        match gmail::get_history(&api, hid).await {
            Ok(history) => {
                // Collect new message IDs that need full metadata fetch
                let mut new_msg_ids: Vec<(String, String)> = Vec::new(); // (msg_id, thread_id)

                if let Some(records) = history["history"].as_array() {
                    for record in records {
                        if let Some(added) = record["messagesAdded"].as_array() {
                            for item in added {
                                let msg_id =
                                    item["message"]["id"].as_str().unwrap_or("").to_string();
                                let thread_id = item["message"]["threadId"]
                                    .as_str()
                                    .unwrap_or("")
                                    .to_string();
                                if !msg_id.is_empty() {
                                    new_msg_ids.push((msg_id, thread_id));
                                }
                            }
                        }
                    }
                }

                // Fetch full thread summaries for new messages
                let new_summaries: Vec<gmail::ThreadSummary> = {
                    let thread_ids: Vec<String> = {
                        let mut seen = std::collections::HashSet::new();
                        new_msg_ids
                            .iter()
                            .filter(|(_, tid)| seen.insert(tid.clone()))
                            .map(|(_, tid)| tid.clone())
                            .collect()
                    };
                    let mut results = Vec::new();
                    for tid in thread_ids {
                        let stub = gmail::ThreadStubPublic {
                            id: tid,
                            snippet: None,
                        };
                        results.push(gmail::fetch_summary_for_stub_public(&api, stub).await);
                    }
                    results
                };

                let db = state.db.lock().await;

                // Upsert the fully-populated summaries
                for s in new_summaries {
                    let cached = CachedMessage {
                        id: s.id.clone(),
                        thread_id: s.id.clone(),
                        subject: s.subject,
                        from_address: s.from,
                        snippet: s.snippet,
                        body_html: None,
                        date_header: s.date,
                        label_ids: s.label_ids,
                        is_read: !s.is_unread,
                        is_starred: s.is_starred,
                        has_attachment: false,
                        internal_date: s
                            .internal_date
                            .as_deref()
                            .and_then(|d| d.parse::<i64>().ok()),
                    };
                    let _ = queries::upsert_message(&db, &cached);
                }

                // Process labelsAdded / labelsRemoved
                if let Some(records) = history["history"].as_array() {
                    for record in records {
                        if let Some(la) = record["labelsAdded"].as_array() {
                            for item in la {
                                let msg_id = item["message"]["id"].as_str().unwrap_or("");
                                let labels: Vec<String> = item["labelIds"]
                                    .as_array()
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|v| v.as_str().map(String::from))
                                            .collect()
                                    })
                                    .unwrap_or_default();
                                if !msg_id.is_empty() {
                                    let _ = queries::apply_local_label_change(
                                        &db,
                                        msg_id,
                                        &labels,
                                        &[],
                                    );
                                }
                            }
                        }
                        if let Some(lr) = record["labelsRemoved"].as_array() {
                            for item in lr {
                                let msg_id = item["message"]["id"].as_str().unwrap_or("");
                                let labels: Vec<String> = item["labelIds"]
                                    .as_array()
                                    .map(|arr| {
                                        arr.iter()
                                            .filter_map(|v| v.as_str().map(String::from))
                                            .collect()
                                    })
                                    .unwrap_or_default();
                                if !msg_id.is_empty() {
                                    let _ = queries::apply_local_label_change(
                                        &db,
                                        msg_id,
                                        &[],
                                        &labels,
                                    );
                                }
                            }
                        }
                    }
                }

                // Update stored history_id
                if let Some(new_hid) = history["historyId"].as_str() {
                    let _ = queries::update_sync_state(&db, &email, new_hid);
                }
            }
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("404") || err_str.contains("410") || err_str.contains("invalid")
                {
                    // historyId too old or not found — reset and fall through to full sync
                    let db = state.db.lock().await;
                    let _ = queries::clear_sync_state(&db, &email);
                    history_id = None;
                } else {
                    return Err(err_str);
                }
            }
        }
    }

    if history_id.is_none() {
        // Full sync — fetch threads then current historyId
        let page = {
            let api = state.api.read().await;
            gmail::list_thread_summaries(&api, &["INBOX".to_string()], None, 100)
                .await
                .map_err(|e| e.to_string())?
        };
        let profile = {
            let api = state.api.read().await;
            gmail::get_profile(&api).await.ok()
        };

        {
            let db = state.db.lock().await;
            for s in &page.threads {
                let cached = CachedMessage {
                    id: s.id.clone(),
                    thread_id: s.id.clone(),
                    subject: s.subject.clone(),
                    from_address: s.from.clone(),
                    snippet: s.snippet.clone(),
                    body_html: None,
                    date_header: s.date.clone(),
                    label_ids: s.label_ids.clone(),
                    is_read: !s.is_unread,
                    is_starred: s.is_starred,
                    has_attachment: false,
                    internal_date: s
                        .internal_date
                        .as_deref()
                        .and_then(|d| d.parse::<i64>().ok()),
                };
                let _ = queries::upsert_message(&db, &cached);
            }

            // Store the real current historyId so incremental sync works immediately
            let hid = profile
                .as_ref()
                .and_then(|p| p["historyId"].as_str())
                .unwrap_or("1");
            let _ = queries::update_sync_state(&db, &email, hid);
        }
    }

    let _ = app.emit("mail::synced", ());
    Ok(())
}

/// Tauri command wrapper for sync_inbox_internal.
#[tauri::command]
pub async fn sync_inbox(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    sync_inbox_internal(&state, &app).await
}

/// Drain pending operations — retry each against the API.
/// Returns the count of successfully executed operations.
#[tauri::command]
pub async fn drain_pending_ops(state: State<'_, AppState>) -> Result<usize, String> {
    let ops = {
        let db = state.db.lock().await;
        queries::list_pending_ops(&db).map_err(|e| e.to_string())?
    };

    let mut drained = 0usize;

    for op in ops {
        let payload: serde_json::Value = serde_json::from_str(&op.payload).unwrap_or_default();

        let api_result: Result<(), String> = match op.op_type.as_str() {
            "send" => {
                let raw = payload["raw"].as_str().unwrap_or("").to_string();
                let api = state.api.read().await;
                gmail::send_message(&api, raw)
                    .await
                    .map(|_| ())
                    .map_err(|e| e.to_string())
            }
            "trash" => {
                let msg_id = payload["msg_id"].as_str().unwrap_or("").to_string();
                let api = state.api.read().await;
                gmail::trash_message(&api, &msg_id)
                    .await
                    .map_err(|e| e.to_string())
            }
            "star" => {
                let msg_id = payload["msg_id"].as_str().unwrap_or("").to_string();
                let api = state.api.read().await;
                gmail::modify_message(&api, &msg_id, vec!["STARRED".to_string()], vec![])
                    .await
                    .map_err(|e| e.to_string())
            }
            "unstar" => {
                let msg_id = payload["msg_id"].as_str().unwrap_or("").to_string();
                let api = state.api.read().await;
                gmail::modify_message(&api, &msg_id, vec![], vec!["STARRED".to_string()])
                    .await
                    .map_err(|e| e.to_string())
            }
            "archive" => {
                let msg_id = payload["msg_id"].as_str().unwrap_or("").to_string();
                let api = state.api.read().await;
                gmail::modify_message(&api, &msg_id, vec![], vec!["INBOX".to_string()])
                    .await
                    .map_err(|e| e.to_string())
            }
            "mark_read" => {
                let msg_id = payload["msg_id"].as_str().unwrap_or("").to_string();
                let api = state.api.read().await;
                gmail::modify_message(&api, &msg_id, vec![], vec!["UNREAD".to_string()])
                    .await
                    .map_err(|e| e.to_string())
            }
            "mark_unread" => {
                let msg_id = payload["msg_id"].as_str().unwrap_or("").to_string();
                let api = state.api.read().await;
                gmail::modify_message(&api, &msg_id, vec!["UNREAD".to_string()], vec![])
                    .await
                    .map_err(|e| e.to_string())
            }
            other => Err(format!("Unknown op type: {}", other)),
        };

        match api_result {
            Ok(_) => {
                let db = state.db.lock().await;
                let _ = queries::delete_pending_op(&db, op.id);
                drained += 1;
            }
            Err(_) => {
                let db = state.db.lock().await;
                let _ = queries::increment_op_attempts(&db, op.id);
            }
        }
    }

    Ok(drained)
}

#[tauri::command]
pub async fn create_label(state: State<'_, AppState>, name: String) -> Result<Label, String> {
    let api = state.api.read().await;
    gmail::create_label(&api, &name)
        .await
        .map_err(|e| e.to_string())
}

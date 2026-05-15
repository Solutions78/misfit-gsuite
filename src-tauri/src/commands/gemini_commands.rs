use serde::{Deserialize, Serialize};
use tauri::State;

use crate::api::gemini::{self, GeminiMessage};
use crate::api::gmail;
use crate::AppState;

fn build_system_prompt(name: &str, email: &str) -> String {
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
    format!(
        "You are an AI email assistant for {} ({}). \
        Today is {}. Be concise. When writing emails, match a professional tone. \
        When asked to create calendar events or send emails, provide the details in a structured JSON block \
        wrapped in ```json ... ``` so the app can parse and execute them.",
        name, email, now
    )
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeminiChatRequest {
    pub messages: Vec<GeminiMessage>,
    pub context: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyReport {
    pub summary: String,
    pub action_items: Vec<ActionItem>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ActionItem {
    pub description: String,
    pub email_subject: Option<String>,
    pub suggested_followup_date: Option<String>,
}

#[tauri::command]
pub async fn gemini_chat(
    state: State<'_, AppState>,
    request: GeminiChatRequest,
) -> Result<String, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let (name, email) = oauth
        .current_token()
        .map(|t| (t.display_name.clone(), t.email.clone()))
        .unwrap_or_default();
    drop(oauth);

    let mut messages = request.messages;
    if let Some(ctx) = request.context {
        messages.insert(
            0,
            GeminiMessage {
                role: "user".to_string(),
                text: format!("[Email context for your reference]\n{}", ctx),
            },
        );
    }

    let system = build_system_prompt(&name, &email);
    gemini::generate(&api, messages, Some(system), Some(0.7))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_email_reply(
    state: State<'_, AppState>,
    thread_id: String,
    instructions: Option<String>,
) -> Result<String, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let (name, email) = oauth
        .current_token()
        .map(|t| (t.display_name.clone(), t.email.clone()))
        .unwrap_or_default();
    drop(oauth);

    // Fetch thread for context
    let thread = gmail::get_thread(&api, &thread_id)
        .await
        .map_err(|e| e.to_string())?;

    // Extract text from messages for context
    let context = thread
        .messages
        .unwrap_or_default()
        .iter()
        .filter_map(|msg| {
            let from = extract_header(msg, "From").unwrap_or_default();
            let subject = extract_header(msg, "Subject").unwrap_or_default();
            let body = extract_body_text(msg);
            Some(format!("From: {}\nSubject: {}\n{}", from, subject, body))
        })
        .collect::<Vec<_>>()
        .join("\n---\n");

    let instruction = instructions
        .unwrap_or_else(|| "Write a professional reply to this email thread.".to_string());
    let system = build_system_prompt(&name, &email);

    let messages = vec![GeminiMessage {
        role: "user".to_string(),
        text: format!(
            "Email thread:\n{}\n\nInstruction: {}\n\nWrite only the email body, no subject line.",
            context, instruction
        ),
    }];

    gemini::generate(&api, messages, Some(system), Some(0.6))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn organize_inbox(state: State<'_, AppState>) -> Result<String, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let (name, email) = oauth
        .current_token()
        .map(|t| (t.display_name.clone(), t.email.clone()))
        .unwrap_or_default();
    drop(oauth);

    // Fetch recent unread messages
    let threads = gmail::list_threads(&api, &["INBOX".to_string(), "UNREAD".to_string()], None, 30)
        .await
        .map_err(|e| e.to_string())?;

    let thread_summaries = threads
        .threads
        .unwrap_or_default()
        .iter()
        .filter_map(|t| t.snippet.clone())
        .take(30)
        .collect::<Vec<_>>()
        .join("\n- ");

    let system = build_system_prompt(&name, &email);
    let messages = vec![GeminiMessage {
        role: "user".to_string(),
        text: format!(
            "Here are snippets from my unread inbox emails:\n- {}\n\n\
            Analyze these and categorize them by priority:\n\
            1. URGENT (needs reply today)\n\
            2. IMPORTANT (needs attention this week)\n\
            3. LOW (FYI / newsletters / no action needed)\n\n\
            For each category, list the email topics. Be concise.",
            thread_summaries
        ),
    }];

    gemini::generate(&api, messages, Some(system), Some(0.3))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn generate_daily_report(state: State<'_, AppState>) -> Result<String, String> {
    let api = state.api.read().await;
    let oauth = api.oauth_state.read().await;
    let (name, email) = oauth
        .current_token()
        .map(|t| (t.display_name.clone(), t.email.clone()))
        .unwrap_or_default();
    drop(oauth);

    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();

    // Fetch today's sent and received
    let sent = gmail::search_messages(&api, &format!("after:{} in:sent", today), None)
        .await
        .map_err(|e| e.to_string())?;

    let received = gmail::search_messages(&api, &format!("after:{} in:inbox", today), None)
        .await
        .map_err(|e| e.to_string())?;

    let sent_count = sent.threads.as_ref().map(|t| t.len()).unwrap_or(0);
    let received_count = received.threads.as_ref().map(|t| t.len()).unwrap_or(0);

    let received_snippets = received
        .threads
        .unwrap_or_default()
        .iter()
        .filter_map(|t| t.snippet.clone())
        .take(20)
        .collect::<Vec<_>>()
        .join("\n- ");

    let system = build_system_prompt(&name, &email);
    let messages = vec![GeminiMessage {
        role: "user".to_string(),
        text: format!(
            "Generate a daily email activity report for {}.\n\
            Today: {}\n\
            Emails received: {}\n\
            Emails sent: {}\n\
            Recent received snippets:\n- {}\n\n\
            Generate:\n\
            1. A concise daily summary paragraph\n\
            2. A list of action items / follow-ups needed with suggested dates\n\
            Format the action items as:\n\
            ACTION: [description] | SUGGEST_DATE: [YYYY-MM-DD]",
            name, today, received_count, sent_count, received_snippets
        ),
    }];

    gemini::generate(&api, messages, Some(system), Some(0.4))
        .await
        .map_err(|e| e.to_string())
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn extract_header(msg: &crate::api::gmail::GmailMessage, name: &str) -> Option<String> {
    msg.payload
        .as_ref()?
        .headers
        .as_ref()?
        .iter()
        .find_map(|h| {
            if h.name.eq_ignore_ascii_case(name) {
                Some(h.value.clone())
            } else {
                None
            }
        })
}

fn extract_body_text(msg: &crate::api::gmail::GmailMessage) -> String {
    if let Some(payload) = &msg.payload {
        extract_part_text(payload)
    } else {
        String::new()
    }
}

fn extract_part_text(part: &crate::api::gmail::MessagePart) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

    if let Some(mime) = &part.mime_type {
        if mime.starts_with("text/") {
            if let Some(body) = &part.body {
                if let Some(data) = &body.data {
                    if let Ok(bytes) = URL_SAFE_NO_PAD.decode(data) {
                        return String::from_utf8_lossy(&bytes).into_owned();
                    }
                }
            }
        }
    }

    if let Some(parts) = &part.parts {
        // Prefer text/plain, fall back to first available
        let plain = parts
            .iter()
            .find(|p| p.mime_type.as_deref() == Some("text/plain"));
        if let Some(p) = plain {
            let text = extract_part_text(p);
            if !text.is_empty() {
                return text;
            }
        }
        for sub in parts {
            let text = extract_part_text(sub);
            if !text.is_empty() {
                return text;
            }
        }
    }

    String::new()
}

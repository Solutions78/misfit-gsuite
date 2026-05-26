use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::api::gemini::{self, GeminiMessage};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
struct Part {
    text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Content {
    role: String,
    parts: Vec<Part>,
}

#[derive(Debug, Serialize)]
struct GeminiRequestBody {
    contents: Vec<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<Value>>,
}

#[tauri::command]
pub async fn gemini_chat_with_search(
    state: State<'_, AppState>,
    messages: Vec<GeminiMessage>,
    context: Option<String>,
    web_search: bool,
    model: Option<String>,
) -> Result<String, String> {
    let api = state.api.read().await;
    let token = api.access_token().await.map_err(|e| e.to_string())?;
    let model_name = match model {
        Some(model) if !model.trim().is_empty() => gemini::normalize_model_name(&model),
        _ => gemini::pick_default_model(&api)
            .await
            .map_err(|e| e.to_string())?,
    };
    let url = gemini::generate_content_url(&model_name);

    // Build system instruction from context if provided
    let system_instruction = context.map(|ctx| Content {
        role: "system".to_string(),
        parts: vec![Part { text: ctx }],
    });

    // Convert messages to Gemini content format
    let contents: Vec<Content> = messages
        .into_iter()
        .map(|m| Content {
            role: m.role,
            parts: vec![Part { text: m.text }],
        })
        .collect();

    // Optionally add Google Search tool
    let tools = if web_search {
        Some(vec![serde_json::json!({ "google_search": {} })])
    } else {
        None
    };

    let body = GeminiRequestBody {
        contents,
        system_instruction,
        tools,
    };

    let resp = api
        .http
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Gemini model {} failed with {}: {}",
            model_name, status, text
        ));
    }

    let resp: Value = resp.json().await.map_err(|e| e.to_string())?;

    // Extract text from first candidate's first part
    let text = resp
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| "Gemini returned no text".to_string())?
        .to_string();

    Ok(text)
}

use serde::{Deserialize, Serialize};

use crate::api::client::ApiClient;
use crate::error::AppError;

const GEMINI_BASE: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Part {
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Content {
    pub role: String,
    pub parts: Vec<Part>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationConfig {
    pub temperature: Option<f32>,
    pub max_output_tokens: Option<u32>,
    pub top_p: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiRequest {
    pub contents: Vec<Content>,
    pub system_instruction: Option<Content>,
    pub generation_config: Option<GenerationConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candidate {
    pub content: Content,
    #[serde(rename = "finishReason")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiResponse {
    pub candidates: Option<Vec<Candidate>>,
}

impl GeminiResponse {
    pub fn text(&self) -> Option<String> {
        self.candidates.as_ref()?.first()?.content.parts.first().map(|p| p.text.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiMessage {
    pub role: String,
    pub text: String,
}

pub async fn generate(
    client: &ApiClient,
    messages: Vec<GeminiMessage>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
) -> Result<String, AppError> {
    let contents = messages
        .into_iter()
        .map(|m| Content {
            role: m.role,
            parts: vec![Part { text: m.text }],
        })
        .collect();

    let system_instruction = system_prompt.map(|text| Content {
        role: "system".to_string(),
        parts: vec![Part { text }],
    });

    let request = GeminiRequest {
        contents,
        system_instruction,
        generation_config: Some(GenerationConfig {
            temperature,
            max_output_tokens: Some(8192),
            top_p: Some(0.95),
        }),
    };

    let token = client.access_token().await?;
    let resp = client
        .http
        .post(GEMINI_BASE)
        .bearer_auth(&token)
        .json(&request)
        .send()
        .await?
        .error_for_status()?
        .json::<GeminiResponse>()
        .await?;

    resp.text().ok_or_else(|| AppError::Other("Gemini returned no text".to_string()))
}

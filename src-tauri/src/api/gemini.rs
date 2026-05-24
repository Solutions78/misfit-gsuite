use serde::{Deserialize, Serialize};

use crate::api::client::ApiClient;
use crate::error::AppError;

const GEMINI_MODELS_URL: &str = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_API_ROOT: &str = "https://generativelanguage.googleapis.com/v1beta";
const FALLBACK_GEMINI_MODEL: &str = "models/gemini-2.5-flash";

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
        self.candidates
            .as_ref()?
            .first()?
            .content
            .parts
            .first()
            .map(|p| p.text.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeminiMessage {
    pub role: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeminiModel {
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    #[serde(default)]
    pub supported_generation_methods: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct GeminiModelsResponse {
    models: Option<Vec<GeminiModel>>,
}

pub fn normalize_model_name(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        FALLBACK_GEMINI_MODEL.to_string()
    } else if trimmed.starts_with("models/") {
        trimmed.to_string()
    } else {
        format!("models/{}", trimmed)
    }
}

pub fn generate_content_url(model: &str) -> String {
    format!("{}/{}:generateContent", GEMINI_API_ROOT, normalize_model_name(model))
}

fn model_supports_generate_content(model: &GeminiModel) -> bool {
    model
        .supported_generation_methods
        .iter()
        .any(|method| method == "generateContent")
}

pub async fn list_models(client: &ApiClient) -> Result<Vec<GeminiModel>, AppError> {
    let token = client.access_token().await?;
    let resp = client
        .http
        .get(GEMINI_MODELS_URL)
        .bearer_auth(&token)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: text,
        });
    }

    let raw: GeminiModelsResponse = resp.json().await?;
    let mut models = raw
        .models
        .unwrap_or_default()
        .into_iter()
        .filter(model_supports_generate_content)
        .collect::<Vec<_>>();

    models.sort_by(|a, b| {
        let a_flash = a.name.contains("flash");
        let b_flash = b.name.contains("flash");
        b_flash
            .cmp(&a_flash)
            .then_with(|| b.name.cmp(&a.name))
    });

    Ok(models)
}

pub async fn pick_default_model(client: &ApiClient) -> Result<String, AppError> {
    let models = list_models(client).await?;
    if models.is_empty() {
        return Err(AppError::Other(
            "Gemini returned no models that support generateContent".to_string(),
        ));
    }

    let preferred = [
        "models/gemini-2.5-flash",
        "models/gemini-2.0-flash",
        "models/gemini-1.5-flash",
    ];

    for name in preferred {
        if models.iter().any(|model| model.name == name) {
            return Ok(name.to_string());
        }
    }

    Ok(models[0].name.clone())
}

pub async fn generate(
    client: &ApiClient,
    messages: Vec<GeminiMessage>,
    system_prompt: Option<String>,
    temperature: Option<f32>,
    model: Option<String>,
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
    let model_name = match model {
        Some(model) if !model.trim().is_empty() => normalize_model_name(&model),
        _ => pick_default_model(client)
            .await
            .unwrap_or_else(|_| FALLBACK_GEMINI_MODEL.to_string()),
    };
    let url = generate_content_url(&model_name);

    let resp = client
        .http
        .post(&url)
        .bearer_auth(&token)
        .json(&request)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: format!("Gemini model {} failed: {}", model_name, text),
        });
    }

    let resp = resp.json::<GeminiResponse>().await?;

    resp.text()
        .ok_or_else(|| AppError::Other("Gemini returned no text".to_string()))
}

// ---------------------------------------------------------------------------
// Tool-calling types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub function_declarations: Vec<FunctionDeclaration>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionResponse {
    pub name: String,
    pub response: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Drive tool declarations
// ---------------------------------------------------------------------------

pub fn drive_tool_declarations() -> Tool {
    Tool {
        function_declarations: vec![
            FunctionDeclaration {
                name: "search_drive_files".to_string(),
                description: "Search the user's Google Drive for files matching a query. Use this when the user asks to find, locate, search for, or list files by name, content, or type.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Google Drive search query string. Examples: 'name contains NDA', 'fullText contains signed', 'mimeType = application/vnd.google-apps.document'"
                        },
                        "mime_type_filter": {
                            "type": "string",
                            "description": "Optional MIME type to filter results. Use 'application/vnd.google-apps.document' for Docs, 'application/vnd.google-apps.spreadsheet' for Sheets, 'application/vnd.google-apps.presentation' for Slides"
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of results to return (1-20)"
                        }
                    },
                    "required": ["query"]
                }),
            },
            FunctionDeclaration {
                name: "get_document_content".to_string(),
                description: "Read and return the text content of a specific Google Doc, Sheet, or Slides file. Use this when the user asks to summarize, read, or analyze a specific document they have open or referenced.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "file_id": {
                            "type": "string",
                            "description": "The Google Drive file ID"
                        },
                        "mime_type": {
                            "type": "string",
                            "description": "The MIME type of the file (e.g. application/vnd.google-apps.document)"
                        }
                    },
                    "required": ["file_id", "mime_type"]
                }),
            },
            FunctionDeclaration {
                name: "list_recent_drive_files".to_string(),
                description: "List the most recently modified files in the user's Google Drive, optionally scoped to a specific folder or shared drive.".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "folder_id": {
                            "type": "string",
                            "description": "Optional folder ID to scope the listing"
                        },
                        "drive_id": {
                            "type": "string",
                            "description": "Optional shared drive ID"
                        },
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of results (1-20)"
                        }
                    },
                    "required": []
                }),
            },
        ],
    }
}

// ---------------------------------------------------------------------------
// generate_with_tools — Gemini function-calling loop
// ---------------------------------------------------------------------------

pub async fn generate_with_tools(
    client: &ApiClient,
    messages: Vec<GeminiMessage>,
    system_prompt: Option<String>,
    model: Option<String>,
    view_context: Option<String>,
) -> Result<(String, Vec<crate::api::gemini_tools::DriveFileResult>), AppError> {
    use crate::api::gemini_tools::{execute_tool, DriveFileResult};

    let token = client.access_token().await?;
    let model_name = match model {
        Some(m) if !m.trim().is_empty() => normalize_model_name(&m),
        _ => pick_default_model(client)
            .await
            .unwrap_or_else(|_| FALLBACK_GEMINI_MODEL.to_string()),
    };
    let url = generate_content_url(&model_name);

    // Build initial contents
    let mut contents: Vec<serde_json::Value> = Vec::new();

    // Inject view context as a synthetic first user message if provided
    if let Some(ctx) = view_context {
        contents.push(serde_json::json!({
            "role": "user",
            "parts": [{ "text": format!("[Current workspace context — use this to answer questions about the user's files]\n{}", ctx) }]
        }));
        contents.push(serde_json::json!({
            "role": "model",
            "parts": [{ "text": "Understood. I have access to your current workspace context and can search or read your Drive files to answer your questions." }]
        }));
    }

    // Add conversation messages
    for m in &messages {
        contents.push(serde_json::json!({
            "role": m.role,
            "parts": [{ "text": m.text }]
        }));
    }

    let system_instruction = system_prompt.map(|text| serde_json::json!({
        "role": "system",
        "parts": [{ "text": text }]
    }));

    let tools = vec![serde_json::json!({
        "function_declarations": drive_tool_declarations().function_declarations.iter().map(|fd| {
            serde_json::json!({
                "name": fd.name,
                "description": fd.description,
                "parameters": fd.parameters
            })
        }).collect::<Vec<_>>()
    })];

    let mut all_file_results: Vec<DriveFileResult> = Vec::new();

    // Tool-call loop — max 5 rounds
    for _round in 0..5 {
        let mut body = serde_json::json!({
            "contents": contents,
            "tools": tools,
            "generation_config": {
                "temperature": 0.7,
                "maxOutputTokens": 8192,
                "topP": 0.95
            }
        });
        if let Some(ref si) = system_instruction {
            body["system_instruction"] = si.clone();
        }

        let resp = client
            .http
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(AppError::Api {
                status,
                message: format!("Gemini {} failed: {}", model_name, text),
            });
        }

        let resp_json: serde_json::Value = resp.json().await?;

        // Check for function call in first candidate's parts
        let parts = resp_json
            .get("candidates")
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("content"))
            .and_then(|c| c.get("parts"))
            .and_then(|p| p.as_array())
            .cloned()
            .unwrap_or_default();

        // Check if any part is a functionCall
        let function_call_part = parts.iter().find(|p| p.get("functionCall").is_some());

        if let Some(fc_part) = function_call_part {
            let fc = fc_part.get("functionCall").unwrap();
            let fn_name = fc
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();
            let args = fc.get("args").cloned().unwrap_or(serde_json::json!({}));

            // Add model's response (with function call) to contents
            contents.push(serde_json::json!({
                "role": "model",
                "parts": parts
            }));

            // Parse and execute the tool call
            let tool_call = parse_tool_call(&fn_name, &args);
            let tool_result = match tool_call {
                Some(tc) => match execute_tool(client, tc).await {
                    Ok(result) => {
                        all_file_results.extend(result.files.clone());
                        if let Some(content) = result.content_text {
                            serde_json::json!({ "content": content })
                        } else {
                            let files_json: Vec<serde_json::Value> = result
                                .files
                                .iter()
                                .map(|f| {
                                    serde_json::json!({
                                        "id": f.id,
                                        "name": f.name,
                                        "mimeType": f.mime_type,
                                        "webViewLink": f.web_view_link,
                                    })
                                })
                                .collect();
                            let count = files_json.len();
                            serde_json::json!({ "files": files_json, "count": count })
                        }
                    }
                    Err(e) => serde_json::json!({ "error": e.to_string() }),
                },
                None => serde_json::json!({ "error": format!("Unknown tool: {}", fn_name) }),
            };

            // Add function response to contents
            contents.push(serde_json::json!({
                "role": "user",
                "parts": [{
                    "functionResponse": {
                        "name": fn_name,
                        "response": tool_result
                    }
                }]
            }));

            // Continue loop for next round
            continue;
        }

        // No function call — extract text and return
        let text = parts
            .iter()
            .find_map(|p| p.get("text").and_then(|t| t.as_str()))
            .unwrap_or("")
            .to_string();

        if text.is_empty() {
            return Err(AppError::Other("Gemini returned no text".to_string()));
        }

        return Ok((text, all_file_results));
    }

    Err(AppError::Other(
        "Gemini tool-call loop exceeded maximum rounds".to_string(),
    ))
}

fn parse_tool_call(
    name: &str,
    args: &serde_json::Value,
) -> Option<crate::api::gemini_tools::ToolCall> {
    use crate::api::gemini_tools::ToolCall;
    match name {
        "search_drive_files" => Some(ToolCall::SearchDriveFiles {
            query: args
                .get("query")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            mime_type_filter: args
                .get("mime_type_filter")
                .and_then(|v| v.as_str())
                .map(String::from),
            max_results: args
                .get("max_results")
                .and_then(|v| v.as_u64())
                .map(|n| n as u32),
        }),
        "get_document_content" => Some(ToolCall::GetDocumentContent {
            file_id: args
                .get("file_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            mime_type: args
                .get("mime_type")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        }),
        "list_recent_drive_files" => Some(ToolCall::ListRecentDriveFiles {
            folder_id: args
                .get("folder_id")
                .and_then(|v| v.as_str())
                .map(String::from),
            drive_id: args
                .get("drive_id")
                .and_then(|v| v.as_str())
                .map(String::from),
            max_results: args
                .get("max_results")
                .and_then(|v| v.as_u64())
                .map(|n| n as u32),
        }),
        _ => None,
    }
}

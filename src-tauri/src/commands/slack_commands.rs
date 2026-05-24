use crate::api::slack::{
    self, SlackChannelListResponse, SlackMessageListResponse, SlackTokenSet, SlackUser,
};
use crate::error::AppError;
use crate::AppState;
use axum::{extract::Query, response::Html, routing::get, Router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::{oneshot, Mutex};

const SLACK_REDIRECT_URI: &str = "http://localhost:9005/slack/oauth2callback";
const SLACK_OAUTH_PORT: u16 = 9005;

#[derive(serde::Deserialize)]
struct SlackCallbackParams {
    code: Option<String>,
    error: Option<String>,
}

async fn run_slack_callback_server() -> Result<String, AppError> {
    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let app = Router::new().route(
        "/slack/oauth2callback",
        get(move |Query(params): Query<SlackCallbackParams>| {
            let tx = tx.clone();
            async move {
                let result = if let Some(err) = params.error {
                    Err(format!("Slack OAuth error: {}", err))
                } else if let Some(code) = params.code {
                    Ok(code)
                } else {
                    Err("No code received from Slack".to_string())
                };

                if let Some(sender) = tx.lock().await.take() {
                    let _ = sender.send(result);
                }

                Html(
                    r#"<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#111;color:#fff">
                    <h2>✅ Slack connected!</h2>
                    <p>You can close this tab and return to Misfit Hub.</p>
                    <script>setTimeout(()=>window.close(),2000)</script>
                </body></html>"#
                        .to_string(),
                )
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", SLACK_OAUTH_PORT))
        .await
        .map_err(|e| AppError::Other(format!("Cannot bind Slack OAuth port {}: {}", SLACK_OAUTH_PORT, e)))?;

    let server = axum::serve(listener, app);
    let server_handle = tokio::spawn(async move { let _ = server.await; });

    let code = rx
        .await
        .map_err(|_| AppError::Auth("Slack OAuth callback channel dropped".to_string()))?
        .map_err(|e| AppError::Auth(e))?;

    server_handle.abort();
    Ok(code)
}

const SLACK_KEYCHAIN_KEY: &str = "misfit-gsuite/slack/token";
const SERVICE_NAME: &str = "com.modularmisfits.gsuite";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlackTokenInfo {
    pub team_id: String,
    pub team_name: String,
    pub user_id: String,
}

// ── Keychain helpers (macOS) ──────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn keychain_store(key: &str, value: &str) -> Result<(), AppError> {
    use security_framework::passwords::{delete_generic_password, set_generic_password};
    let _ = delete_generic_password(SERVICE_NAME, key);
    set_generic_password(SERVICE_NAME, key, value.as_bytes())
        .map_err(|e| AppError::Auth(format!("Keychain write error: {}", e)))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn keychain_load(key: &str) -> Result<Option<String>, AppError> {
    use security_framework::passwords::get_generic_password;
    use security_framework_sys::base::errSecItemNotFound;
    match get_generic_password(SERVICE_NAME, key) {
        Ok(bytes) => {
            let s = String::from_utf8(bytes)
                .map_err(|e| AppError::Auth(format!("Keychain value not UTF-8: {}", e)))?;
            Ok(Some(s))
        }
        Err(e) if e.code() == errSecItemNotFound => Ok(None),
        Err(e) => Err(AppError::Auth(format!("Keychain read error: {}", e))),
    }
}

#[cfg(target_os = "macos")]
fn keychain_delete(key: &str) -> Result<(), AppError> {
    use security_framework::passwords::delete_generic_password;
    use security_framework_sys::base::errSecItemNotFound;
    match delete_generic_password(SERVICE_NAME, key) {
        Ok(()) => Ok(()),
        Err(e) if e.code() == errSecItemNotFound => Ok(()),
        Err(e) => Err(AppError::Auth(format!("Keychain delete error: {}", e))),
    }
}

#[cfg(not(target_os = "macos"))]
fn keychain_store(key: &str, value: &str) -> Result<(), AppError> {
    use keyring::Entry;
    let entry = Entry::new(SERVICE_NAME, key)
        .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
    entry
        .set_password(value)
        .map_err(|e| AppError::Auth(format!("Keychain write error: {}", e)))?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn keychain_load(key: &str) -> Result<Option<String>, AppError> {
    use keyring::Entry;
    let entry = Entry::new(SERVICE_NAME, key)
        .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
    match entry.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Auth(format!("Keychain read error: {}", e))),
    }
}

#[cfg(not(target_os = "macos"))]
fn keychain_delete(key: &str) -> Result<(), AppError> {
    use keyring::Entry;
    let entry = Entry::new(SERVICE_NAME, key)
        .map_err(|e| AppError::Auth(format!("Keychain entry error: {}", e)))?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(e) => return Err(AppError::Auth(format!("Keychain delete error: {}", e))),
    }
    Ok(())
}

// ── Helper: load access token from keychain ───────────────────────────────────

fn load_token_set() -> Result<SlackTokenSet, AppError> {
    let json = keychain_load(SLACK_KEYCHAIN_KEY)?
        .ok_or(AppError::NotAuthenticated)?;
    let token_set: SlackTokenSet = serde_json::from_str(&json)?;
    Ok(token_set)
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_slack_oauth_flow(
    state: State<'_, AppState>,
) -> Result<SlackTokenInfo, String> {
    // Start the callback listener before opening the browser so we don't miss the redirect
    let code_future = run_slack_callback_server();

    // Open the Slack OAuth URL — client_id read from proxy env isn't available here,
    // so the frontend already opened the URL. We just wait for the code to arrive.
    // (The frontend calls this command after opening the browser URL itself.)
    let code = code_future.await.map_err(|e| e.to_string())?;

    let api = state.api.read().await;
    let token_set = slack::exchange_code(
        &api.http,
        &state.proxy_base,
        &state.proxy_app_token,
        &code,
        SLACK_REDIRECT_URI,
    )
    .await
    .map_err(|e| e.to_string())?;

    let info = SlackTokenInfo {
        team_id: token_set.team.id.clone(),
        team_name: token_set.team.name.clone(),
        user_id: token_set.authed_user.id.clone(),
    };

    let json = serde_json::to_string(&token_set).map_err(|e| e.to_string())?;
    keychain_store(SLACK_KEYCHAIN_KEY, &json).map_err(|e| e.to_string())?;

    Ok(info)
}

#[tauri::command]
pub async fn slack_exchange_code(
    state: State<'_, AppState>,
    code: String,
) -> Result<SlackTokenInfo, String> {
    let api = state.api.read().await;
    let token_set = slack::exchange_code(
        &api.http,
        &state.proxy_base,
        &state.proxy_app_token,
        &code,
        SLACK_REDIRECT_URI,
    )
    .await
    .map_err(|e| e.to_string())?;

    let info = SlackTokenInfo {
        team_id: token_set.team.id.clone(),
        team_name: token_set.team.name.clone(),
        user_id: token_set.authed_user.id.clone(),
    };

    let json = serde_json::to_string(&token_set).map_err(|e| e.to_string())?;
    keychain_store(SLACK_KEYCHAIN_KEY, &json).map_err(|e| e.to_string())?;

    Ok(info)
}

#[tauri::command]
pub async fn slack_get_token(
    _state: State<'_, AppState>,
) -> Result<Option<SlackTokenInfo>, String> {
    let json = keychain_load(SLACK_KEYCHAIN_KEY).map_err(|e| e.to_string())?;
    match json {
        None => Ok(None),
        Some(j) => {
            let token_set: SlackTokenSet =
                serde_json::from_str(&j).map_err(|e| e.to_string())?;
            Ok(Some(SlackTokenInfo {
                team_id: token_set.team.id,
                team_name: token_set.team.name,
                user_id: token_set.authed_user.id,
            }))
        }
    }
}

#[tauri::command]
pub async fn slack_disconnect(_state: State<'_, AppState>) -> Result<(), String> {
    keychain_delete(SLACK_KEYCHAIN_KEY).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_slack_channels(
    state: State<'_, AppState>,
    cursor: Option<String>,
) -> Result<SlackChannelListResponse, String> {
    let token_set = load_token_set().map_err(|e| e.to_string())?;
    let api = state.api.read().await;
    slack::list_channels(&api.http, &token_set.access_token, cursor.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_slack_history(
    state: State<'_, AppState>,
    channel_id: String,
    cursor: Option<String>,
    oldest: Option<String>,
) -> Result<SlackMessageListResponse, String> {
    let token_set = load_token_set().map_err(|e| e.to_string())?;
    let api = state.api.read().await;
    slack::get_channel_history(
        &api.http,
        &token_set.access_token,
        &channel_id,
        cursor.as_deref(),
        oldest.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_slack_user(
    state: State<'_, AppState>,
    user_id: String,
) -> Result<SlackUser, String> {
    let token_set = load_token_set().map_err(|e| e.to_string())?;
    let api = state.api.read().await;
    slack::get_user(&api.http, &token_set.access_token, &user_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_slack_message(
    state: State<'_, AppState>,
    channel_id: String,
    text: String,
) -> Result<(), String> {
    let token_set = load_token_set().map_err(|e| e.to_string())?;
    let api = state.api.read().await;
    slack::post_message(&api.http, &token_set.access_token, &channel_id, &text)
        .await
        .map_err(|e| e.to_string())
}

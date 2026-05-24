use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::auth::{keychain, oauth};
use crate::AppState;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub email: String,
    pub display_name: String,
    pub picture_url: Option<String>,
}

#[tauri::command]
pub async fn start_oauth_flow(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<AccountInfo, String> {
    let pkce = oauth::generate_pkce();
    let client_id = state.client_id.clone();
    let client_secret = state.client_secret.clone();
    let auth_url = oauth::build_auth_url(&client_id, &pkce);

    // Open the auth URL in the default browser
    tauri_plugin_opener::open_url(&auth_url, None::<&str>)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    // Start the callback server and wait for the code
    let state_value = pkce.state.clone();
    let code = oauth::run_oauth_callback_server(state_value)
        .await
        .map_err(|e| e.to_string())?;

    // Exchange code for tokens
    let api_client = state.api.read().await;
    let token_resp = oauth::exchange_code(
        &api_client.http,
        &code,
        &pkce.verifier,
        &client_id,
        &client_secret,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Fetch user info
    let user_info = oauth::fetch_user_info(&api_client.http, &token_resp.access_token)
        .await
        .map_err(|e| e.to_string())?;
    drop(api_client);

    let token_set = oauth::token_response_to_set(token_resp, None, user_info)
        .map_err(|e| e.to_string())?;
    let missing_scopes = token_set.missing_required_scopes();
    if !missing_scopes.is_empty() {
        return Err(format!(
            "Google did not grant required scopes. Reconfigure OAuth consent and retry. Missing: {}",
            missing_scopes.join(", ")
        ));
    }

    // Store in keychain
    keychain::store_token(&token_set).map_err(|e| e.to_string())?;

    // Update app state
    let api_client = state.api.write().await;
    api_client
        .oauth_state
        .write()
        .await
        .add_or_update(token_set.clone());

    // Persist account to DB
    {
        let db = state.db.lock().await;
        crate::db::queries::upsert_account(
            &db,
            &token_set.email,
            &token_set.display_name,
            token_set.picture_url.as_deref(),
        )
        .map_err(|e| e.to_string())?;
    }

    // Emit auth complete event
    let _ = app.emit("auth::complete", &token_set.email);

    // Track session expiry (24 hours from now)
    let expires_at_ms = (chrono::Utc::now() + chrono::Duration::hours(24))
        .timestamp_millis();
    {
        let db = state.db.lock().await;
        if let Err(e) = crate::db::queries::upsert_session_expiry(&db, &token_set.email, expires_at_ms) {
            eprintln!("Failed to upsert session expiry: {}", e);
        }
    }
    let _ = app.emit("auth::session_started", serde_json::json!({
        "email": &token_set.email,
        "expiresAt": expires_at_ms
    }));

    Ok(AccountInfo {
        email: token_set.email,
        display_name: token_set.display_name,
        picture_url: token_set.picture_url,
    })
}

#[tauri::command]
pub async fn get_current_account(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<Option<AccountInfo>, String> {
    {
        let api_client = state.api.read().await;
        let oauth_state = api_client.oauth_state.read().await;
        if let Some(token) = oauth_state.current_token() {
            return Ok(Some(AccountInfo {
                email: token.email.clone(),
                display_name: token.display_name.clone(),
                picture_url: token.picture_url.clone(),
            }));
        }
    }

    // If the frontend asks before the setup restore event arrives, recover here.
    // If the Keychain item was manually deleted, remove the stale DB row and
    // return None so the login screen can be shown immediately.
    let accounts = {
        let db = state.db.lock().await;
        crate::db::queries::list_accounts(&db).map_err(|e| e.to_string())?
    };

    for (email, _, _) in accounts {
        match keychain::load_token(&email) {
            Ok(Some(token)) if token.has_required_scopes() => {
                let api_client = state.api.read().await;
                api_client
                    .oauth_state
                    .write()
                    .await
                    .add_or_update(token.clone());
                let _ = app.emit("auth::restored", &token.email);

                // Track session expiry (24 hours from now)
                let expires_at_ms = (chrono::Utc::now() + chrono::Duration::hours(24))
                    .timestamp_millis();
                {
                    let db = state.db.lock().await;
                    if let Err(e) = crate::db::queries::upsert_session_expiry(&db, &token.email, expires_at_ms) {
                        eprintln!("Failed to upsert session expiry: {}", e);
                    }
                }
                let _ = app.emit("auth::session_started", serde_json::json!({
                    "email": &token.email,
                    "expiresAt": expires_at_ms
                }));

                return Ok(Some(AccountInfo {
                    email: token.email,
                    display_name: token.display_name,
                    picture_url: token.picture_url,
                }));
            }
            Ok(Some(_)) | Ok(None) => {
                let _ = keychain::delete_token(&email);
                let db = state.db.lock().await;
                let _ = crate::db::queries::delete_account(&db, &email);
                let _ = app.emit("auth::signed_out", &email);
            }
            Err(err) => {
                let _ = app.emit("auth::restore_failed", &email);
                return Err(err.to_string());
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<AccountInfo>, String> {
    let db = state.db.lock().await;
    let accounts = crate::db::queries::list_accounts(&db).map_err(|e| e.to_string())?;
    Ok(accounts
        .into_iter()
        .map(|(email, display_name, picture_url)| AccountInfo {
            email,
            display_name,
            picture_url,
        })
        .collect())
}

#[tauri::command]
pub async fn switch_account(
    state: State<'_, AppState>,
    email: String,
    app: tauri::AppHandle,
) -> Result<AccountInfo, String> {
    // Try to load from keychain
    let token = match keychain::load_token(&email).map_err(|e| e.to_string())? {
        Some(token) => token,
        None => {
            let db = state.db.lock().await;
            crate::db::queries::delete_account(&db, &email).map_err(|e| e.to_string())?;
            return Err(format!(
                "No stored Keychain token for {}. Please sign in again.",
                email
            ));
        }
    };

    if !token.has_required_scopes() {
        keychain::delete_token(&email).map_err(|e| e.to_string())?;
        {
            let db = state.db.lock().await;
            crate::db::queries::delete_account(&db, &email).map_err(|e| e.to_string())?;
        }
        return Err(format!(
            "Stored Google token is missing required scopes. Please sign in again for {}.",
            email
        ));
    }

    let api_client = state.api.write().await;
    api_client
        .oauth_state
        .write()
        .await
        .add_or_update(token.clone());

    // Track session expiry (24 hours from now)
    let expires_at_ms = (chrono::Utc::now() + chrono::Duration::hours(24))
        .timestamp_millis();
    {
        let db = state.db.lock().await;
        if let Err(e) = crate::db::queries::upsert_session_expiry(&db, &token.email, expires_at_ms) {
            eprintln!("Failed to upsert session expiry: {}", e);
        }
    }
    let _ = app.emit("auth::session_started", serde_json::json!({
        "email": &token.email,
        "expiresAt": expires_at_ms
    }));

    Ok(AccountInfo {
        email: token.email,
        display_name: token.display_name,
        picture_url: token.picture_url,
    })
}

#[tauri::command]
pub async fn sign_out(
    state: State<'_, AppState>,
    email: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    keychain::delete_token(&email).map_err(|e| e.to_string())?;
    {
        let db = state.db.lock().await;
        crate::db::queries::delete_account(&db, &email).map_err(|e| e.to_string())?;
    }
    let api_client = state.api.read().await;
    let mut oauth = api_client.oauth_state.write().await;
    oauth.accounts.retain(|t| t.email != email);
    if oauth.current_email.as_deref() == Some(&email) {
        oauth.current_email = oauth.accounts.first().map(|t| t.email.clone());
    }
    let _ = app.emit("auth::signed_out", &email);
    Ok(())
}

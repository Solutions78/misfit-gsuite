use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::auth::{keychain, oauth};
use crate::AppState;
use crate::error::AppError;

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

    let token_set = oauth::token_response_to_set(token_resp, None, user_info);

    // Store in keychain
    keychain::store_token(&token_set).map_err(|e| e.to_string())?;

    // Update app state
    let mut api_client = state.api.write().await;
    api_client.oauth_state.write().await.add_or_update(token_set.clone());

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

    Ok(AccountInfo {
        email: token_set.email,
        display_name: token_set.display_name,
        picture_url: token_set.picture_url,
    })
}

#[tauri::command]
pub async fn get_current_account(
    state: State<'_, AppState>,
) -> Result<Option<AccountInfo>, String> {
    let api_client = state.api.read().await;
    let oauth_state = api_client.oauth_state.read().await;
    let token = oauth_state.current_token();
    Ok(token.map(|t| AccountInfo {
        email: t.email.clone(),
        display_name: t.display_name.clone(),
        picture_url: t.picture_url.clone(),
    }))
}

#[tauri::command]
pub async fn list_accounts(
    state: State<'_, AppState>,
) -> Result<Vec<AccountInfo>, String> {
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
) -> Result<AccountInfo, String> {
    // Try to load from keychain
    let token = keychain::load_token(&email)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("No stored token for {}", email))?;

    let api_client = state.api.write().await;
    api_client.oauth_state.write().await.add_or_update(token.clone());

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
    let api_client = state.api.read().await;
    let mut oauth = api_client.oauth_state.write().await;
    oauth.accounts.retain(|t| t.email != email);
    if oauth.current_email.as_deref() == Some(&email) {
        oauth.current_email = oauth.accounts.first().map(|t| t.email.clone());
    }
    let _ = app.emit("auth::signed_out", &email);
    Ok(())
}

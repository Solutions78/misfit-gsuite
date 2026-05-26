use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::auth::{keychain, oauth, TokenSet};
use crate::AppState;

const KEYCHAIN_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub email: String,
    pub display_name: String,
    pub picture_url: Option<String>,
}

async fn load_keychain_token(email: String, target: &str) -> Result<Option<TokenSet>, String> {
    crate::logging::info(target, format!("loading Keychain token email={email}"));
    let log_email = email.clone();
    let read_task = tokio::task::spawn_blocking(move || {
        keychain::load_token(&email).map_err(|e| e.to_string())
    });

    tokio::time::timeout(
        std::time::Duration::from_secs(KEYCHAIN_TIMEOUT_SECS),
        read_task,
    )
    .await
    .map_err(|_| {
        let message =
            format!("Timed out reading Google token from macOS Keychain for {log_email}.");
        crate::logging::error(target, &message);
        message
    })?
    .map_err(|e| {
        let message = e.to_string();
        crate::logging::error(target, format!("Keychain token read join error={message}"));
        message
    })?
    .map_err(|e| {
        crate::logging::error(
            target,
            format!("Keychain token read failed email={log_email} error={e}"),
        );
        e
    })
}

async fn delete_keychain_token_best_effort(email: String, target: &str) {
    let log_email = email.clone();
    let delete_task = tokio::task::spawn_blocking(move || {
        keychain::delete_token(&email).map_err(|e| e.to_string())
    });

    match tokio::time::timeout(
        std::time::Duration::from_secs(KEYCHAIN_TIMEOUT_SECS),
        delete_task,
    )
    .await
    {
        Ok(Ok(Ok(()))) => {
            crate::logging::info(target, format!("Keychain token deleted email={log_email}"));
        }
        Ok(Ok(Err(e))) => {
            crate::logging::error(
                target,
                format!("Keychain token delete failed email={log_email} error={e}"),
            );
        }
        Ok(Err(e)) => {
            crate::logging::error(
                target,
                format!("Keychain token delete join error email={log_email} error={e}"),
            );
        }
        Err(_) => {
            crate::logging::error(
                target,
                format!("Timed out deleting Google token from macOS Keychain for {log_email}."),
            );
        }
    }
}

#[tauri::command]
pub async fn start_oauth_flow(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<AccountInfo, String> {
    crate::logging::info("auth.oauth", "start_oauth_flow begin");
    let pkce = oauth::generate_pkce();
    let client_id = state.client_id.lock().await.clone();
    let client_secret = state.client_secret.lock().await.clone();
    crate::logging::info(
        "auth.oauth",
        format!(
            "credentials loaded client_id_present={} client_secret_present={}",
            !client_id.is_empty(),
            !client_secret.is_empty()
        ),
    );
    if client_id.is_empty() || client_secret.is_empty() {
        let message = "Google OAuth credentials are missing. Open Settings/Setup and save the OAuth client ID and secret again.".to_string();
        crate::logging::error("auth.oauth", &message);
        return Err(message);
    }
    let auth_url = oauth::build_auth_url(&client_id, &pkce);

    // Open the auth URL in the default browser
    tauri_plugin_opener::open_url(&auth_url, None::<&str>).map_err(|e| {
        let message = format!("Failed to open browser: {}", e);
        crate::logging::error("auth.oauth", &message);
        message
    })?;
    crate::logging::info("auth.oauth", "browser opened for Google OAuth");

    // Start the callback server and wait for the code
    let state_value = pkce.state.clone();
    crate::logging::info("auth.oauth", "waiting for OAuth callback");
    let code = oauth::run_oauth_callback_server(state_value)
        .await
        .map_err(|e| {
            let message = e.to_string();
            crate::logging::error(
                "auth.oauth",
                format!("OAuth callback failed error={message}"),
            );
            message
        })?;
    crate::logging::info("auth.oauth", "OAuth callback received");

    // Exchange code for tokens
    crate::logging::info("auth.oauth", "exchanging OAuth code for token");
    let api_client = state.api.read().await;
    let token_resp = oauth::exchange_code(
        &api_client.http,
        &code,
        &pkce.verifier,
        &client_id,
        &client_secret,
    )
    .await
    .map_err(|e| {
        let message = e.to_string();
        crate::logging::error(
            "auth.oauth",
            format!("token exchange failed error={message}"),
        );
        message
    })?;
    crate::logging::info("auth.oauth", "token exchange complete");

    // Fetch user info
    crate::logging::info("auth.oauth", "fetching Google user info");
    let user_info = oauth::fetch_user_info(&api_client.http, &token_resp.access_token)
        .await
        .map_err(|e| {
            let message = e.to_string();
            crate::logging::error(
                "auth.oauth",
                format!("user info fetch failed error={message}"),
            );
            message
        })?;
    drop(api_client);
    crate::logging::info(
        "auth.oauth",
        format!("user info fetched email={}", user_info.email),
    );

    let token_set = oauth::token_response_to_set(token_resp, None, user_info).map_err(|e| {
        let message = e.to_string();
        crate::logging::error(
            "auth.oauth",
            format!("token conversion failed error={message}"),
        );
        message
    })?;
    let missing_scopes = token_set.missing_required_scopes();
    if !missing_scopes.is_empty() {
        let message = format!(
            "Google did not grant required scopes. Reconfigure OAuth consent and retry. Missing: {}",
            missing_scopes.join(", ")
        );
        crate::logging::error("auth.oauth", &message);
        return Err(message);
    }
    crate::logging::info(
        "auth.oauth",
        format!(
            "token set ready email={} scopes_count={}",
            token_set.email,
            token_set.scopes.len()
        ),
    );

    // Store in Keychain. The macOS Keychain APIs are blocking and may display
    // a system approval prompt, so never run them on the async executor.
    crate::logging::info(
        "auth.oauth",
        format!("storing token in Keychain email={}", token_set.email),
    );
    let token_for_keychain = token_set.clone();
    tokio::task::spawn_blocking(move || {
        keychain::store_token(&token_for_keychain).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| {
        let message = e.to_string();
        crate::logging::error("auth.oauth", format!("Keychain store join error={message}"));
        message
    })?
    .map_err(|e| {
        crate::logging::error("auth.oauth", format!("Keychain store failed error={e}"));
        e
    })?;
    crate::logging::info("auth.oauth", "Keychain token store complete");

    // Update app state. We only need the nested OAuthState lock here; taking
    // the outer ApiClient write lock can stall behind long-running read locks
    // from background sync/knowledge-graph tasks and leave the login screen
    // stuck on "Signing in…" after the browser callback succeeds.
    let oauth_state = {
        let api_client = state.api.read().await;
        api_client.oauth_state.clone()
    };
    oauth_state.write().await.add_or_update(token_set.clone());
    crate::logging::info("auth.oauth", "in-memory OAuth state updated");

    // Persist account to DB
    {
        let db = state.db.lock().await;
        crate::db::queries::upsert_account(
            &db,
            &token_set.email,
            &token_set.display_name,
            token_set.picture_url.as_deref(),
        )
        .map_err(|e| {
            let message = e.to_string();
            crate::logging::error(
                "auth.oauth",
                format!("account DB upsert failed error={message}"),
            );
            message
        })?;
    }
    crate::logging::info(
        "auth.oauth",
        format!("account persisted email={}", token_set.email),
    );

    // Emit auth complete event
    let _ = app.emit("auth::complete", &token_set.email);
    crate::logging::info(
        "auth.oauth",
        format!("emitted auth::complete email={}", token_set.email),
    );

    // Track session expiry (24 hours from now)
    let expires_at_ms = (chrono::Utc::now() + chrono::Duration::hours(24)).timestamp_millis();
    {
        let db = state.db.lock().await;
        if let Err(e) =
            crate::db::queries::upsert_session_expiry(&db, &token_set.email, expires_at_ms)
        {
            crate::logging::error(
                "auth.oauth",
                format!("failed to upsert session expiry error={e}"),
            );
        }
    }
    let _ = app.emit(
        "auth::session_started",
        serde_json::json!({
            "email": &token_set.email,
            "expiresAt": expires_at_ms
        }),
    );
    crate::logging::info(
        "auth.oauth",
        format!("login complete email={}", token_set.email),
    );

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
    crate::logging::info("auth.current", "get_current_account begin");
    {
        let api_client = state.api.read().await;
        let oauth_state = api_client.oauth_state.read().await;
        if let Some(token) = oauth_state.current_token() {
            crate::logging::info(
                "auth.current",
                format!("returning in-memory account email={}", token.email),
            );
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
    let emails = {
        let db = state.db.lock().await;
        crate::db::queries::list_known_auth_emails(&db).map_err(|e| {
            let message = e.to_string();
            crate::logging::error(
                "auth.current",
                format!("list_known_auth_emails failed error={message}"),
            );
            message
        })?
    };
    crate::logging::info(
        "auth.current",
        format!("known auth emails count={}", emails.len()),
    );

    for email in emails {
        match load_keychain_token(email.clone(), "auth.current").await {
            Ok(Some(token)) if token.has_required_scopes() => {
                crate::logging::info(
                    "auth.current",
                    format!("Keychain token loaded email={}", token.email),
                );
                let api_client = state.api.read().await;
                api_client
                    .oauth_state
                    .write()
                    .await
                    .add_or_update(token.clone());
                let _ = app.emit("auth::restored", &token.email);

                {
                    let db = state.db.lock().await;
                    if let Err(e) = crate::db::queries::upsert_account(
                        &db,
                        &token.email,
                        &token.display_name,
                        token.picture_url.as_deref(),
                    ) {
                        crate::logging::error(
                            "auth.current",
                            format!("failed to heal account row error={e}"),
                        );
                    }
                }

                // Track session expiry (24 hours from now)
                let expires_at_ms =
                    (chrono::Utc::now() + chrono::Duration::hours(24)).timestamp_millis();
                {
                    let db = state.db.lock().await;
                    if let Err(e) =
                        crate::db::queries::upsert_session_expiry(&db, &token.email, expires_at_ms)
                    {
                        crate::logging::error(
                            "auth.current",
                            format!("failed to upsert session expiry error={e}"),
                        );
                    }
                }
                let _ = app.emit(
                    "auth::session_started",
                    serde_json::json!({
                        "email": &token.email,
                        "expiresAt": expires_at_ms
                    }),
                );

                return Ok(Some(AccountInfo {
                    email: token.email,
                    display_name: token.display_name,
                    picture_url: token.picture_url,
                }));
            }
            Ok(Some(_)) | Ok(None) => {
                crate::logging::warn(
                    "auth.current",
                    format!("missing/invalid Keychain token; clearing email={email}"),
                );
                delete_keychain_token_best_effort(email.clone(), "auth.current").await;
                let db = state.db.lock().await;
                let _ = crate::db::queries::delete_account(&db, &email);
                let _ = app.emit("auth::signed_out", &email);
            }
            Err(err) => {
                crate::logging::error(
                    "auth.current",
                    format!("Keychain load failed email={email} error={err}"),
                );
                let _ = app.emit("auth::restore_failed", &email);
                return Err(err.to_string());
            }
        }
    }

    crate::logging::info("auth.current", "no current account available");
    Ok(None)
}

#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<AccountInfo>, String> {
    let db = state.db.lock().await;
    let accounts = crate::db::queries::list_accounts(&db).map_err(|e| e.to_string())?;
    crate::logging::info(
        "auth.accounts",
        format!("list_accounts count={}", accounts.len()),
    );
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
    let token = match load_keychain_token(email.clone(), "auth.switch").await? {
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
        delete_keychain_token_best_effort(email.clone(), "auth.switch").await;
        {
            let db = state.db.lock().await;
            crate::db::queries::delete_account(&db, &email).map_err(|e| e.to_string())?;
        }
        return Err(format!(
            "Stored Google token is missing required scopes. Please sign in again for {}.",
            email
        ));
    }

    let oauth_state = {
        let api_client = state.api.read().await;
        api_client.oauth_state.clone()
    };
    oauth_state.write().await.add_or_update(token.clone());

    // Track session expiry (24 hours from now)
    let expires_at_ms = (chrono::Utc::now() + chrono::Duration::hours(24)).timestamp_millis();
    {
        let db = state.db.lock().await;
        if let Err(e) = crate::db::queries::upsert_session_expiry(&db, &token.email, expires_at_ms)
        {
            eprintln!("Failed to upsert session expiry: {}", e);
        }
    }
    let _ = app.emit(
        "auth::session_started",
        serde_json::json!({
            "email": &token.email,
            "expiresAt": expires_at_ms
        }),
    );

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

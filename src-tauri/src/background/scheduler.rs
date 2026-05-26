use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::interval;

use crate::AppState;

#[allow(dead_code)]
const TOKEN_REFRESH_CHECK_SECS: u64 = 60 * 4; // Check every 4 minutes

#[allow(dead_code)]
pub async fn start_token_refresh_scheduler(state: Arc<AppState>, app: AppHandle) {
    let mut ticker = interval(Duration::from_secs(TOKEN_REFRESH_CHECK_SECS));
    loop {
        ticker.tick().await;
        let api = state.api.read().await;
        let token = {
            let oauth = api.oauth_state.read().await;
            oauth.current_token().cloned()
        };
        if let Some(token) = token {
            if token.is_expired() {
                match crate::auth::oauth::refresh_token(
                    &api.http,
                    &token.refresh_token,
                    &state.client_id.lock().await,
                    &state.client_secret.lock().await,
                )
                .await
                {
                    Ok(resp) => {
                        match crate::auth::oauth::token_response_to_set(
                            resp,
                            Some(token.refresh_token.clone()),
                            crate::auth::oauth::UserInfo {
                                sub: Some(token.google_user_id.clone()),
                                email: token.email.clone(),
                                name: Some(token.display_name.clone()),
                                picture: token.picture_url.clone(),
                            },
                        ) {
                            Ok(mut new_token) => {
                                if new_token.scopes.is_empty() {
                                    new_token.scopes = token.scopes.clone();
                                }
                                api.oauth_state.write().await.add_or_update(new_token);
                            }
                            Err(e) => {
                                eprintln!("Token build failed: {}", e);
                                let _ = app.emit("auth::token_expired", ());
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Token refresh failed: {}", e);
                        let _ = app.emit("auth::token_expired", ());
                    }
                }
            }
        }
    }
}

#[allow(dead_code)]
pub async fn start_kg_nightly_scheduler(app: tauri::AppHandle) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60 * 60 * 24));
    interval.tick().await; // skip first tick — don't run delta sync on app startup
    loop {
        interval.tick().await;

        let state = app.state::<crate::AppState>();

        // Only run if authenticated
        let is_auth = {
            let api = state.api.read().await;
            let oauth = api.oauth_state.read().await;
            oauth.current_token().is_some()
        };
        if !is_auth {
            continue;
        }

        // Delta sync
        {
            let api = state.api.read().await;
            if let Err(e) = crate::kg::crawler::run_delta_sync(&api, &state.db, &app).await {
                eprintln!("KG nightly delta sync error: {}", e);
            }
        }

        // Re-enrich any pending/changed files
        {
            let api = state.api.read().await;
            if let Err(e) = crate::kg::enricher::run_enrichment_batch(&api, &state.db, &app).await {
                eprintln!("KG nightly enrichment error: {}", e);
            }
        }
    }
}

use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::interval;
use tauri::Manager;

use crate::AppState;

const TOKEN_REFRESH_CHECK_SECS: u64 = 60 * 4; // Check every 4 minutes

/// Proactively refresh tokens before they expire so API calls never fail mid-session.
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
                    &state.client_id,
                    &state.client_secret,
                )
                .await
                {
                    Ok(resp) => {
                        let new_token = crate::auth::oauth::token_response_to_set(
                            resp,
                            Some(token.refresh_token.clone()),
                            crate::auth::oauth::UserInfo {
                                email: token.email.clone(),
                                name: Some(token.display_name.clone()),
                                picture: token.picture_url.clone(),
                            },
                        );
                        let _ = crate::auth::keychain::store_token(&new_token);
                        api.oauth_state.write().await.add_or_update(new_token);
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

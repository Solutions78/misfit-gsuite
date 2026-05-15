use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};

use crate::auth::{oauth, OAuthState, TokenSet};
use crate::error::AppError;

pub struct ApiClient {
    pub http: reqwest::Client,
    pub oauth_state: Arc<RwLock<OAuthState>>,
    pub client_id: String,
    pub client_secret: String,
    pub refresh_lock: Mutex<()>,
}

impl ApiClient {
    pub fn new(client_id: String, client_secret: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            http,
            oauth_state: Arc::new(RwLock::new(OAuthState::new())),
            client_id,
            client_secret,
            refresh_lock: Mutex::new(()),
        }
    }

    /// Get a valid access token for the current account, refreshing if needed.
    pub async fn access_token(&self) -> Result<String, AppError> {
        // Fast path: token is valid
        {
            let state = self.oauth_state.read().await;
            let token = state.current_token().ok_or(AppError::NotAuthenticated)?;
            let missing_scopes = token.missing_required_scopes();
            if !missing_scopes.is_empty() {
                return Err(AppError::Auth(format!(
                    "Stored Google token is missing required scopes. Sign in again to grant: {}",
                    missing_scopes.join(", ")
                )));
            }
            if !token.is_expired() {
                return Ok(token.access_token.clone());
            }
        }

        // Slow path: token is expired, need to refresh.
        // Use a lock to ensure only one thread performs the refresh.
        let _guard = self.refresh_lock.lock().await;

        // Check again: another thread might have refreshed it while we waited for the lock.
        let state = self.oauth_state.read().await;
        let token = state
            .current_token()
            .ok_or(AppError::NotAuthenticated)?
            .clone();
        drop(state);

        let missing_scopes = token.missing_required_scopes();
        if !missing_scopes.is_empty() {
            return Err(AppError::Auth(format!(
                "Stored Google token is missing required scopes. Sign in again to grant: {}",
                missing_scopes.join(", ")
            )));
        }

        if token.is_expired() {
            self.refresh_current_token(&token).await
        } else {
            Ok(token.access_token.clone())
        }
    }

    async fn refresh_current_token(&self, token: &TokenSet) -> Result<String, AppError> {
        let resp = oauth::refresh_token(
            &self.http,
            &token.refresh_token,
            &self.client_id,
            &self.client_secret,
        )
        .await?;

        let mut new_token = oauth::token_response_to_set(
            resp,
            Some(token.refresh_token.clone()),
            oauth::UserInfo {
                sub: Some(token.google_user_id.clone()),
                email: token.email.clone(),
                name: Some(token.display_name.clone()),
                picture: token.picture_url.clone(),
            },
        );

        if new_token.scopes.is_empty() {
            new_token.scopes = token.scopes.clone();
        }

        let access = new_token.access_token.clone();

        let mut state = self.oauth_state.write().await;
        state.add_or_update(new_token);

        Ok(access)
    }

    /// Make an authorized GET request with exponential backoff on 429/503.
    pub async fn get(&self, url: &str) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| self.http.get(url).bearer_auth(&token).send())
            .await
    }

    /// Make an authorized POST request with exponential backoff.
    pub async fn post<T: serde::Serialize>(
        &self,
        url: &str,
        body: &T,
    ) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| self.http.post(url).bearer_auth(&token).json(body).send())
            .await
    }

    /// Make an authorized PUT request.
    pub async fn put<T: serde::Serialize>(
        &self,
        url: &str,
        body: &T,
    ) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| self.http.put(url).bearer_auth(&token).json(body).send())
            .await
    }

    /// Make an authorized DELETE request.
    pub async fn delete(&self, url: &str) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| self.http.delete(url).bearer_auth(&token).send())
            .await
    }

    async fn with_backoff<F, Fut>(&self, f: F) -> Result<reqwest::Response, AppError>
    where
        F: Fn() -> Fut,
        Fut: std::future::Future<Output = Result<reqwest::Response, reqwest::Error>>,
    {
        let mut delay = Duration::from_millis(500);
        for attempt in 0..5 {
            let resp = f().await?;
            let status = resp.status();
            if status == 429 || status == 503 {
                if attempt < 4 {
                    tokio::time::sleep(delay).await;
                    delay *= 2;
                    continue;
                }
            }
            if !status.is_success() {
                let code = status.as_u16();
                let message = resp.text().await.unwrap_or_default();
                return Err(AppError::Api {
                    status: code,
                    message,
                });
            }
            return Ok(resp);
        }
        Err(AppError::Other("Max retries exceeded".to_string()))
    }
}

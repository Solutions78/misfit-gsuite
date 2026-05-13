use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;

use crate::auth::{keychain, oauth, OAuthState, TokenSet};
use crate::error::AppError;

pub struct ApiClient {
    pub http: reqwest::Client,
    pub oauth_state: Arc<RwLock<OAuthState>>,
    pub client_id: String,
    pub client_secret: String,
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
        }
    }

    /// Get a valid access token for the current account, refreshing if needed.
    pub async fn access_token(&self) -> Result<String, AppError> {
        let state = self.oauth_state.read().await;
        let token = state.current_token().ok_or(AppError::NotAuthenticated)?.clone();
        drop(state);

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

        let new_token = oauth::token_response_to_set(
            resp,
            Some(token.refresh_token.clone()),
            oauth::UserInfo {
                email: token.email.clone(),
                name: Some(token.display_name.clone()),
                picture: token.picture_url.clone(),
            },
        );

        let access = new_token.access_token.clone();
        keychain::store_token(&new_token)?;

        let mut state = self.oauth_state.write().await;
        state.add_or_update(new_token);

        Ok(access)
    }

    /// Make an authorized GET request with exponential backoff on 429/503.
    pub async fn get(&self, url: &str) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| {
            self.http.get(url).bearer_auth(&token).send()
        })
        .await
    }

    /// Make an authorized POST request with exponential backoff.
    pub async fn post<T: serde::Serialize>(
        &self,
        url: &str,
        body: &T,
    ) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| {
            self.http.post(url).bearer_auth(&token).json(body).send()
        })
        .await
    }

    /// Make an authorized PUT request.
    pub async fn put<T: serde::Serialize>(
        &self,
        url: &str,
        body: &T,
    ) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| {
            self.http.put(url).bearer_auth(&token).json(body).send()
        })
        .await
    }

    /// Make an authorized DELETE request.
    pub async fn delete(&self, url: &str) -> Result<reqwest::Response, AppError> {
        let token = self.access_token().await?;
        self.with_backoff(|| {
            self.http.delete(url).bearer_auth(&token).send()
        })
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
                return Err(AppError::Api { status: code, message });
            }
            return Ok(resp);
        }
        Err(AppError::Other("Max retries exceeded".to_string()))
    }
}

use axum::{extract::Query, response::Html, routing::get, Router};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};

use crate::error::AppError;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REDIRECT_URI_DEV: &str = "http://localhost:9004/oauth2callback";
const OAUTH_PORT: u16 = 9004;

pub const SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
    "https://www.googleapis.com/auth/chat.messages",
    "https://www.googleapis.com/auth/chat.messages.create",
    "https://www.googleapis.com/auth/chat.memberships.readonly",
    "https://www.googleapis.com/auth/chat.spaces.readonly",
    "https://www.googleapis.com/auth/chat.spaces.create",
    "https://www.googleapis.com/auth/contacts.readonly",
    "https://www.googleapis.com/auth/directory.readonly",
    "https://www.googleapis.com/auth/generative-language.retriever",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
    "openid",
    "email",
    "profile",
];

// Only enforce scopes that have been on the OAuth consent screen from day one.
// Adding a new scope here forces every existing user to re-authenticate, so only
// list scopes after they've been granted on the GCP consent screen.
pub const REQUIRED_REAUTH_SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/chat.messages",
    "https://www.googleapis.com/auth/chat.spaces.readonly",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenSet {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: DateTime<Utc>,
    pub email: String,
    pub display_name: String,
    pub picture_url: Option<String>,
    pub scopes: Vec<String>,
    #[serde(default)]
    pub google_user_id: String,
}

impl TokenSet {
    pub fn is_expired(&self) -> bool {
        Utc::now() + Duration::minutes(5) >= self.expires_at
    }

    pub fn missing_required_scopes(&self) -> Vec<&'static str> {
        REQUIRED_REAUTH_SCOPES
            .iter()
            .copied()
            .filter(|scope| !self.scopes.iter().any(|granted| granted == scope))
            .collect()
    }

    pub fn has_required_scopes(&self) -> bool {
        self.missing_required_scopes().is_empty()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthState {
    pub accounts: Vec<TokenSet>,
    pub current_email: Option<String>,
}

impl OAuthState {
    pub fn new() -> Self {
        Self {
            accounts: Vec::new(),
            current_email: None,
        }
    }

    pub fn current_token(&self) -> Option<&TokenSet> {
        self.current_email
            .as_ref()
            .and_then(|email| self.accounts.iter().find(|t| &t.email == email))
    }

    pub fn add_or_update(&mut self, token: TokenSet) {
        let email = token.email.clone();
        if let Some(existing) = self.accounts.iter_mut().find(|t| t.email == email) {
            *existing = token;
        } else {
            self.accounts.push(token);
        }
        self.current_email = Some(email);
    }
}

#[derive(Deserialize)]
struct CallbackParams {
    code: Option<String>,
    error: Option<String>,
    state: Option<String>,
}

#[derive(Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub scope: Option<String>,
}

#[derive(Deserialize)]
pub struct UserInfo {
    pub sub: Option<String>,
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

pub struct PkceChallenge {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
}

pub fn generate_pkce() -> PkceChallenge {
    let mut verifier_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut verifier_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);

    PkceChallenge {
        verifier,
        challenge,
        state,
    }
}

pub fn build_auth_url(client_id: &str, pkce: &PkceChallenge) -> String {
    let scope = SCOPES.join(" ");
    let params = [
        ("client_id", client_id),
        ("redirect_uri", REDIRECT_URI_DEV),
        ("response_type", "code"),
        ("scope", &scope),
        ("access_type", "offline"),
        ("prompt", "consent"),
        ("code_challenge", &pkce.challenge),
        ("code_challenge_method", "S256"),
        ("state", &pkce.state),
    ];
    let query = params
        .iter()
        .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    format!("{}?{}", GOOGLE_AUTH_URL, query)
}

pub async fn exchange_code(
    client: &reqwest::Client,
    code: &str,
    verifier: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<TokenResponse, AppError> {
    let params = [
        ("code", code),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("redirect_uri", REDIRECT_URI_DEV),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier),
    ];

    let resp = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await?
        .error_for_status()?
        .json::<TokenResponse>()
        .await?;

    Ok(resp)
}

pub async fn refresh_token(
    client: &reqwest::Client,
    refresh_token: &str,
    client_id: &str,
    client_secret: &str,
) -> Result<TokenResponse, AppError> {
    let params = [
        ("refresh_token", refresh_token),
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("grant_type", "refresh_token"),
    ];

    let resp = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await?
        .error_for_status()?
        .json::<TokenResponse>()
        .await?;

    Ok(resp)
}

pub async fn fetch_user_info(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<UserInfo, AppError> {
    let resp = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(access_token)
        .send()
        .await?
        .error_for_status()?
        .json::<UserInfo>()
        .await?;
    Ok(resp)
}

pub async fn run_oauth_callback_server(expected_state: String) -> Result<String, AppError> {
    let (tx, rx) = oneshot::channel::<Result<String, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let tx_clone = tx.clone();
    let expected_state_clone = expected_state.clone();

    let app = Router::new().route(
        "/oauth2callback",
        get(move |Query(params): Query<CallbackParams>| {
            let tx = tx_clone.clone();
            let expected = expected_state_clone.clone();
            async move {
                let result = if let Some(err) = params.error {
                    Err(format!("OAuth error: {}", err))
                } else if params.state.as_deref() != Some(&expected) {
                    Err("State mismatch — possible CSRF".to_string())
                } else if let Some(code) = params.code {
                    Ok(code)
                } else {
                    Err("No code received".to_string())
                };

                if let Some(sender) = tx.lock().await.take() {
                    let _ = sender.send(result);
                }

                Html(
                    r#"<html><body style="font-family:system-ui;text-align:center;padding:60px">
                    <h2>✅ Signed in successfully!</h2>
                    <p>You can close this tab and return to Misfit GSuite.</p>
                    <script>setTimeout(()=>window.close(),2000)</script>
                </body></html>"#
                        .to_string(),
                )
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", OAUTH_PORT))
        .await
        .map_err(|e| AppError::Other(format!("Cannot bind OAuth port {}: {}", OAUTH_PORT, e)))?;

    let server = axum::serve(listener, app);

    let server_handle = tokio::spawn(async move {
        let _ = server.await;
    });

    let code = rx
        .await
        .map_err(|_| AppError::Auth("OAuth callback channel dropped".to_string()))?
        .map_err(|e| AppError::Auth(e))?;

    server_handle.abort();

    Ok(code)
}

pub fn token_response_to_set(
    resp: TokenResponse,
    existing_refresh: Option<String>,
    user_info: UserInfo,
) -> TokenSet {
    let refresh_token = resp.refresh_token.or(existing_refresh).unwrap_or_default();
    let expires_at = Utc::now() + Duration::seconds(resp.expires_in);
    let scopes = resp
        .scope
        .map(|s| s.split_whitespace().map(String::from).collect())
        .unwrap_or_default();

    TokenSet {
        access_token: resp.access_token,
        refresh_token,
        expires_at,
        google_user_id: user_info.sub.unwrap_or_default(),
        email: user_info.email,
        display_name: user_info.name.unwrap_or_default(),
        picture_url: user_info.picture,
        scopes,
    }
}

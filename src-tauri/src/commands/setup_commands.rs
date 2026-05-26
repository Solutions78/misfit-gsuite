use tauri::State;

use crate::auth::keychain;
use crate::AppState;

const APP_CLIENT_ID_KEY: &str = "misfit-gsuite/app/client_id";
const APP_CLIENT_SECRET_KEY: &str = "misfit-gsuite/app/client_secret";

/// Called on first run to persist the user-supplied GCP credentials.
/// Stores both values in the macOS Keychain (blocking — will prompt the user
/// for Keychain access), then hot-patches the running AppState so OAuth works
/// immediately without requiring a restart.
#[tauri::command]
pub async fn save_app_credentials(
    state: State<'_, AppState>,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    crate::logging::info(
        "setup.credentials",
        format!(
            "save_app_credentials begin client_id_present={} client_secret_present={}",
            !client_id.is_empty(),
            !client_secret.is_empty()
        ),
    );

    // Keychain writes are synchronous and block until the user approves the
    // system dialog. Run them on a dedicated blocking thread so we don't
    // stall the async executor (which would cause the frontend to hang).
    let id_clone = client_id.clone();
    let secret_clone = client_secret.clone();
    tokio::task::spawn_blocking(move || {
        keychain::store_secret(APP_CLIENT_ID_KEY, &id_clone).map_err(|e| e.to_string())?;
        keychain::store_secret(APP_CLIENT_SECRET_KEY, &secret_clone).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| {
        let message = e.to_string();
        crate::logging::error(
            "setup.credentials",
            format!("save_app_credentials join error={message}"),
        );
        message
    })?
    .map_err(|e| {
        crate::logging::error(
            "setup.credentials",
            format!("save_app_credentials keychain write error={e}"),
        );
        e
    })?;

    // Patch the live AppState so the OAuth flow picks up the new values
    // immediately without requiring a restart.
    *state.client_id.lock().await = client_id.clone();
    *state.client_secret.lock().await = client_secret.clone();

    let mut api = state.api.write().await;
    api.client_id = client_id;
    api.client_secret = client_secret;

    crate::logging::info("setup.credentials", "save_app_credentials complete");
    Ok(())
}

/// Returns true if GCP credentials exist in the Keychain.
/// The frontend calls this on startup to decide whether to show the setup screen.
#[tauri::command]
pub async fn has_app_credentials(state: State<'_, AppState>) -> Result<bool, String> {
    crate::logging::info("setup.credentials", "has_app_credentials begin");

    // If credentials are already present in AppState (for example injected at
    // build time from .env), do not touch Keychain at all. Reading Keychain can
    // block behind a macOS approval dialog; doing it unnecessarily here was
    // leaving startup stuck on the setup/auth spinner.
    let existing_client_id = state.client_id.lock().await.clone();
    let existing_client_secret = state.client_secret.lock().await.clone();
    if !existing_client_id.is_empty() && !existing_client_secret.is_empty() {
        crate::logging::info(
            "setup.credentials",
            "has_app_credentials using already-loaded credentials; skipping Keychain read",
        );
        return Ok(true);
    }

    let read_task = tokio::task::spawn_blocking(|| {
        let id = keychain::load_secret(APP_CLIENT_ID_KEY).map_err(|e| e.to_string())?;
        let secret = keychain::load_secret(APP_CLIENT_SECRET_KEY).map_err(|e| e.to_string())?;
        Ok::<(Option<String>, Option<String>), String>((id, secret))
    });

    let creds = tokio::time::timeout(std::time::Duration::from_secs(15), read_task)
        .await
        .map_err(|_| {
            let message =
                "Timed out reading Google OAuth app credentials from macOS Keychain.".to_string();
            crate::logging::error("setup.credentials", &message);
            message
        })?
        .map_err(|e| {
            let message = e.to_string();
            crate::logging::error(
                "setup.credentials",
                format!("has_app_credentials join error={message}"),
            );
            message
        })?
        .map_err(|e| {
            crate::logging::error(
                "setup.credentials",
                format!("has_app_credentials keychain read error={e}"),
            );
            e
        })?;

    let (Some(client_id), Some(client_secret)) = creds else {
        crate::logging::warn(
            "setup.credentials",
            "has_app_credentials missing credentials",
        );
        return Ok(false);
    };

    // Hot-patch state now that the frontend has safely asked for credentials.
    *state.client_id.lock().await = client_id.clone();
    *state.client_secret.lock().await = client_secret.clone();

    let mut api = state.api.write().await;
    api.client_id = client_id;
    api.client_secret = client_secret;

    crate::logging::info(
        "setup.credentials",
        "has_app_credentials loaded and patched state",
    );
    Ok(true)
}

/// Loads the stored credentials from the Keychain.
/// Kept only for CLI/debug tooling; app startup must not call this directly.
#[allow(dead_code)]
pub fn load_app_credentials() -> (String, String) {
    let id = keychain::load_secret(APP_CLIENT_ID_KEY)
        .ok()
        .flatten()
        .unwrap_or_default();
    let secret = keychain::load_secret(APP_CLIENT_SECRET_KEY)
        .ok()
        .flatten()
        .unwrap_or_default();
    (id, secret)
}

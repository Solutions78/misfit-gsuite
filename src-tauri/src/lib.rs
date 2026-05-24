mod api;
mod auth;
mod background;
mod commands;
mod db;
mod error;

use rusqlite::Connection;
use tauri::{Emitter, Manager};
use tokio::sync::{Mutex, RwLock};

use crate::api::client::ApiClient;

pub struct AppState {
    pub api: RwLock<ApiClient>,
    pub db: Mutex<Connection>,
    pub client_id: String,
    pub client_secret: String,
    pub proxy_base: String,
    pub proxy_app_token: String,
    pub sync_lock: Mutex<()>,
}

// Safety: rusqlite::Connection is Send. We guard it with Mutex<> ensuring
// exclusive access, so sharing the reference across threads (Sync) is safe.
unsafe impl Sync for AppState {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // In dev, load .env from the working directory so `npm run tauri dev` works
    // without setting env vars in the shell. In release builds the values are
    // baked in at compile time via env!() below and dotenv() is a no-op.
    dotenvy::dotenv().ok();

    // Credentials are baked into the binary at compile time from the build
    // environment. The env!() macro fails the build (not the runtime) if the
    // variable is unset, giving a clear error at `npm run tauri build`.
    // In dev, dotenvy above loads .env first so std::env::var() is used as
    // the runtime source; env!() provides the compile-time fallback for release.
    let client_id =
        std::env::var("GOOGLE_CLIENT_ID").unwrap_or_else(|_| env!("GOOGLE_CLIENT_ID").to_string());
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .unwrap_or_else(|_| env!("GOOGLE_CLIENT_SECRET").to_string());

    let proxy_base = std::env::var("PROXY_BASE_URL")
        .unwrap_or_else(|_| option_env!("PROXY_BASE_URL").unwrap_or("").to_string());
    let proxy_app_token = std::env::var("PROXY_APP_TOKEN")
        .unwrap_or_else(|_| option_env!("PROXY_APP_TOKEN").unwrap_or("").to_string());

    let db_path = dirs_next::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.modularmisfits.gsuite")
        .join("cache.db");

    std::fs::create_dir_all(db_path.parent().unwrap()).ok();

    let conn = Connection::open(&db_path).expect("Failed to open SQLite database");
    db::initialize(&conn).expect("Failed to initialize database schema");

    let api_client = ApiClient::new(client_id.clone(), client_secret.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .manage(AppState {
            api: RwLock::new(api_client),
            db: Mutex::new(conn),
            client_id: client_id.clone(),
            client_secret: client_secret.clone(),
            proxy_base,
            proxy_app_token,
            sync_lock: Mutex::new(()),
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // Give ApiClient a reference to the AppHandle so it can emit
            // auth::token_revoked when a refresh token is rejected (400).
            {
                let state = app.state::<AppState>();
                tauri::async_runtime::block_on(async {
                    state.api.write().await.set_app_handle(handle.clone());
                });
            }

            // Restore tokens for previously logged-in accounts from keychain,
            // then start background periodic sync.
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<AppState>();
                let emails = {
                    let db_guard = state.db.lock().await;
                    crate::db::queries::list_accounts(&db_guard)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|(email, _, _)| email)
                        .collect::<Vec<_>>()
                };

                let mut restored_emails = Vec::new();
                let mut stale_emails = Vec::new();

                for email in &emails {
                    match crate::auth::keychain::load_token(email) {
                        Ok(Some(token)) if token.has_required_scopes() => {
                            let api = state.api.read().await;
                            api.oauth_state.write().await.add_or_update(token);
                            restored_emails.push(email.clone());
                        }
                        Ok(Some(_)) | Ok(None) => {
                            // Stored account is no longer usable (usually missing newly added
                            // OAuth scopes). Clear it so the frontend shows the login screen
                            // instead of waiting forever on a token that cannot be restored.
                            let _ = crate::auth::keychain::delete_token(email);
                            stale_emails.push(email.clone());
                        }
                        Err(err) => {
                            eprintln!("Failed to restore token for {}: {}", email, err);
                            let _ = handle.emit("auth::restore_failed", email);
                        }
                    }
                }

                if !stale_emails.is_empty() {
                    let db_guard = state.db.lock().await;
                    for email in &stale_emails {
                        let _ = crate::db::queries::delete_account(&db_guard, email);
                        let _ = handle.emit("auth::signed_out", email);
                    }
                }

                if let Some(email) = restored_emails.first() {
                    let _ = handle.emit("auth::restored", email);
                }

                // Periodic sync: every 30 seconds, call sync_inbox via the state handle
                let sync_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
                    interval.tick().await; // skip first immediate tick — frontend does initial sync
                    loop {
                        interval.tick().await;
                        let state = sync_handle.state::<AppState>();
                        let email = {
                            let api = state.api.read().await;
                            let oauth = api.oauth_state.read().await;
                            oauth
                                .current_token()
                                .map(|t| t.email.clone())
                                .unwrap_or_default()
                        };
                        if email.is_empty() {
                            continue;
                        }

                        // Refresh token if needed
                        {
                            let api = state.api.read().await;
                            let _ = api.access_token().await;
                        }

                        // Run incremental sync
                        if let Err(e) = crate::commands::gmail_commands::sync_inbox_internal(
                            &state,
                            &sync_handle,
                        )
                        .await
                        {
                            eprintln!("Background sync error: {}", e);
                        }
                    }
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            commands::auth_commands::start_oauth_flow,
            commands::auth_commands::get_current_account,
            commands::auth_commands::list_accounts,
            commands::auth_commands::switch_account,
            commands::auth_commands::sign_out,
            // Gmail
            commands::gmail_commands::list_threads,
            commands::gmail_commands::list_thread_summaries,
            commands::gmail_commands::search_thread_summaries,
            commands::gmail_commands::get_thread,
            commands::gmail_commands::get_email_view,
            commands::gmail_commands::get_thread_view,
            commands::gmail_commands::get_message,
            commands::gmail_commands::search_threads,
            commands::gmail_commands::send_message,
            commands::gmail_commands::create_draft,
            commands::gmail_commands::modify_message,
            commands::gmail_commands::trash_message,
            commands::gmail_commands::star_message,
            commands::gmail_commands::archive_message,
            commands::gmail_commands::mark_read,
            commands::gmail_commands::list_labels,
            commands::gmail_commands::get_attachment,
            commands::gmail_commands::create_label,
            commands::gmail_commands::setup_gmail_watch,
            commands::gmail_commands::sync_inbox,
            commands::gmail_commands::drain_pending_ops,
            // Drive
            commands::drive_commands::list_drive_files,
            commands::drive_commands::list_drive_files_recursive,
            commands::drive_commands::list_shared_drives,
            commands::drive_commands::open_drive_file,
            commands::drive_commands::create_drive_folder,
            commands::drive_commands::delete_drive_file,
            // Docs
            commands::docs_commands::get_document,
            commands::docs_commands::save_document,
            commands::docs_commands::create_document,
            commands::gemini_docs_commands::gemini_chat_with_search,
            // Calendar
            commands::calendar_commands::list_calendars,
            commands::calendar_commands::list_events,
            commands::calendar_commands::create_event,
            commands::calendar_commands::update_event,
            commands::calendar_commands::delete_event,
            commands::calendar_commands::respond_to_event,
            // Chat
            commands::chat_commands::list_spaces,
            commands::chat_commands::list_space_members,
            commands::chat_commands::setup_chat_space,
            commands::chat_commands::upload_chat_attachment,
            commands::chat_commands::list_chat_messages,
            commands::chat_commands::send_chat_message,
            commands::chat_commands::search_chat_contacts,
            commands::chat_commands::delete_chat_space,
            // Gemini
            commands::gemini_commands::gemini_chat,
            commands::gemini_commands::generate_email_reply,
            commands::gemini_commands::organize_inbox,
            commands::gemini_commands::generate_daily_report,
            // Slack
            commands::slack_commands::start_slack_oauth_flow,
            commands::slack_commands::slack_exchange_code,
            commands::slack_commands::slack_get_token,
            commands::slack_commands::slack_disconnect,
            commands::slack_commands::list_slack_channels,
            commands::slack_commands::get_slack_history,
            commands::slack_commands::get_slack_user,
            commands::slack_commands::send_slack_message,
            // Fireflies
            commands::fireflies_commands::list_fireflies_meetings,
            commands::fireflies_commands::get_fireflies_meeting,
            commands::fireflies_commands::list_fireflies_channels,
            commands::fireflies_commands::move_fireflies_meetings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod api;
mod auth;
mod background;
mod commands;
mod db;
mod error;

use tokio::sync::{Mutex, RwLock};
use rusqlite::Connection;
use tauri::{Emitter, Manager};

use crate::api::client::ApiClient;

pub struct AppState {
    pub api: RwLock<ApiClient>,
    pub db: Mutex<Connection>,
    pub client_id: String,
    pub client_secret: String,
}

// Safety: rusqlite::Connection is Send. We guard it with Mutex<> ensuring
// exclusive access, so sharing the reference across threads (Sync) is safe.
unsafe impl Sync for AppState {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .unwrap_or_else(|_| "YOUR_CLIENT_ID_HERE".to_string());
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
        .unwrap_or_else(|_| "YOUR_CLIENT_SECRET_HERE".to_string());

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
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // Restore tokens for previously logged-in accounts from keychain
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

                for email in &emails {
                    if let Ok(Some(token)) = crate::auth::keychain::load_token(email) {
                        let api = state.api.read().await;
                        api.oauth_state.write().await.add_or_update(token);
                    }
                }

                if !emails.is_empty() {
                    let _ = handle.emit("auth::restored", &emails[0]);
                }
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
            commands::gmail_commands::get_thread,
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
            commands::gmail_commands::setup_gmail_watch,
            // Calendar
            commands::calendar_commands::list_calendars,
            commands::calendar_commands::list_events,
            commands::calendar_commands::create_event,
            commands::calendar_commands::update_event,
            commands::calendar_commands::delete_event,
            commands::calendar_commands::respond_to_event,
            // Chat
            commands::chat_commands::list_spaces,
            commands::chat_commands::list_chat_messages,
            commands::chat_commands::send_chat_message,
            // Gemini
            commands::gemini_commands::gemini_chat,
            commands::gemini_commands::generate_email_reply,
            commands::gemini_commands::organize_inbox,
            commands::gemini_commands::generate_daily_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

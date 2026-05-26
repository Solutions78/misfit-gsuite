mod api;
mod auth;
mod background;
mod commands;
mod db;
mod error;
mod kg;
mod logging;

use rusqlite::Connection;
use tauri::Manager;
use tokio::sync::{Mutex, RwLock};

use crate::api::client::ApiClient;

pub struct AppState {
    pub api: RwLock<ApiClient>,
    pub db: Mutex<Connection>,
    pub client_id: Mutex<String>,
    pub client_secret: Mutex<String>,
    pub proxy_base: String,
    pub proxy_app_token: String,
    pub sync_lock: Mutex<()>,
}

// Safety: rusqlite::Connection is Send. We guard it with Mutex<> ensuring
// exclusive access, so sharing the reference across threads (Sync) is safe.
unsafe impl Sync for AppState {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_path = crate::logging::init();
    crate::logging::info(
        "app",
        format!(
            "starting Misfit GSuite version={} log_path={}",
            env!("CARGO_PKG_VERSION"),
            log_path.display()
        ),
    );

    // Do not read the macOS Keychain before the Tauri event loop exists.
    // Security.framework can block waiting for user approval/Touch ID, and doing
    // that here freezes app launch before the UI can show an auth prompt.
    //
    // In production these start empty and `has_app_credentials` loads the
    // Keychain values on a blocking worker once the frontend is running. In dev,
    // build.rs can still inject .env values for a no-setup workflow.
    let client_id = option_env!("GOOGLE_CLIENT_ID").unwrap_or("").to_string();
    let client_secret = option_env!("GOOGLE_CLIENT_SECRET")
        .unwrap_or("")
        .to_string();
    let proxy_base = option_env!("PROXY_BASE_URL").unwrap_or("").to_string();
    let proxy_app_token = option_env!("PROXY_APP_TOKEN").unwrap_or("").to_string();
    crate::logging::info(
        "app",
        format!(
            "initial credential state client_id_present={} client_secret_present={} proxy_present={} proxy_token_present={}",
            !client_id.is_empty(),
            !client_secret.is_empty(),
            !proxy_base.is_empty(),
            !proxy_app_token.is_empty()
        ),
    );

    let db_path = dirs_next::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.modularmisfits.gsuite")
        .join("cache.db");

    std::fs::create_dir_all(db_path.parent().unwrap()).ok();

    let conn = Connection::open(&db_path).expect("Failed to open SQLite database");
    db::initialize(&conn).expect("Failed to initialize database schema");
    crate::logging::info(
        "app",
        format!("database initialized path={}", db_path.display()),
    );

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
            client_id: Mutex::new(client_id.clone()),
            client_secret: Mutex::new(client_secret.clone()),
            proxy_base,
            proxy_app_token,
            sync_lock: Mutex::new(()),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            crate::logging::info("app.setup", "tauri setup entered");

            // Give ApiClient a reference to the AppHandle so it can emit
            // auth::token_revoked when a refresh token is rejected (400).
            {
                let state = app.state::<AppState>();
                tauri::async_runtime::block_on(async {
                    state.api.write().await.set_app_handle(handle.clone());
                });
            }
            crate::logging::info("app.setup", "api app_handle installed");

            // Do not touch the Keychain during setup. The frontend triggers
            // has_app_credentials() and get_current_account() after the window
            // is visible, which gives macOS somewhere to display Keychain /
            // Touch ID approval prompts. Doing it here caused invisible
            // Security.framework waits and made login look frozen.
            tauri::async_runtime::spawn(async move {
                crate::logging::info(
                    "auth.restore",
                    "startup Keychain restore deferred to frontend get_current_account",
                );

                // ── Knowledge Graph Startup Manager ─────────────────────────
                let kg_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state = kg_handle.state::<AppState>();

                    // Small delay to let initial sync stabilize
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                    let conn = state.db.lock().await;
                    if let Ok(crawl_state) = crate::db::kg_queries::get_crawl_state(&conn) {
                        if crawl_state.crawl_status == "running" {
                            crate::logging::info("kg", "detected interrupted crawl; resuming");
                            let api_guard = state.api.read().await;
                            let _ = crate::kg::crawler::run_full_crawl(
                                &api_guard, &state.db, &kg_handle,
                            )
                            .await;
                        }
                    }

                    // Always trigger enrichment batch check on startup
                    let pending =
                        crate::db::kg_queries::get_pending_enrichment_count(&conn).unwrap_or(0);
                    if pending > 0 {
                        crate::logging::info(
                            "kg",
                            format!(
                                "found pending enrichment files count={}; starting batch",
                                pending
                            ),
                        );
                        let api_guard = state.api.read().await;
                        let _ = crate::kg::enricher::run_enrichment_batch(
                            &api_guard, &state.db, &kg_handle,
                        )
                        .await;
                    }
                });

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
                            crate::logging::error(
                                "background.sync",
                                format!("background sync error={e}"),
                            );
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
            // Setup
            commands::setup_commands::save_app_credentials,
            commands::setup_commands::has_app_credentials,
            // Logs
            commands::log_commands::get_log_file_path,
            commands::log_commands::read_recent_logs,
            commands::log_commands::clear_logs,
            commands::log_commands::write_frontend_log,
            // Knowledge Graph
            commands::kg_commands::start_kg_crawl,
            commands::kg_commands::get_kg_status,
            commands::kg_commands::get_kg_graph,
            commands::kg_commands::get_kg_node,
            commands::kg_commands::set_kg_tier,
            commands::kg_commands::get_kg_tier,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

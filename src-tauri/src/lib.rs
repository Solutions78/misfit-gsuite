mod api;
mod auth;
mod background;
mod commands;
mod db;
mod error;
mod kg;
mod logging;

use rusqlite::Connection;
use tauri::{Emitter, Manager};
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

/// Internal shared initialization logic for both UI and Headless modes.
fn init_app_context() -> (AppState, ApiClient) {
    dotenvy::dotenv().ok();
    let _ = crate::logging::init();

    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    let proxy_base = std::env::var("PROXY_BASE_URL").unwrap_or_default();
    let proxy_app_token = std::env::var("PROXY_APP_TOKEN").unwrap_or_default();

    let db_path = dirs_next::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("com.modularmisfits.gsuite")
        .join("cache.db");

    std::fs::create_dir_all(db_path.parent().unwrap()).ok();

    let conn = Connection::open(&db_path).expect("Failed to open SQLite database");
    db::initialize(&conn).expect("Failed to initialize database schema");

    let api_client = ApiClient::new(client_id.clone(), client_secret.clone());

    let state = AppState {
        api: RwLock::new(api_client.clone()),
        db: Mutex::new(conn),
        client_id: Mutex::new(client_id),
        client_secret: Mutex::new(client_secret),
        proxy_base,
        proxy_app_token,
        sync_lock: Mutex::new(()),
    };

    (state, api_client)
}

/// Headless Worker Mode: Runs Knowledge Graph synthesis without a UI.
pub fn run_worker() {
    let (state, _) = init_app_context();
    crate::logging::info("worker", "starting headless enrichment worker");

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        // 1. Restore the primary account from Keychain
        let emails = {
            let db_guard = state.db.lock().await;
            crate::db::queries::list_accounts(&db_guard)
                .unwrap_or_default()
                .into_iter()
                .map(|(email, _, _)| email)
                .collect::<Vec<_>>()
        };

        let mut authenticated = false;
        for email in &emails {
            match crate::auth::keychain::load_token(email) {
                Ok(Some(token)) if token.has_required_scopes() => {
                    let api = state.api.read().await;
                    api.oauth_state.write().await.add_or_update(token);
                    authenticated = true;
                    crate::logging::info("worker", format!("restored session for {email}"));
                    break;
                }
                _ => {}
            }
        }

        if !authenticated {
            crate::logging::error("worker", "no valid session found in Keychain. Please log in via the UI first.");
            return;
        }

        // 2. Start the synthesis loop
        // We use a dummy AppHandle since enrichment logic usually emits progress.
        // For headless, those emissions will just be ignored.
        // Actually, we need to bypass emitting or mock it.
        // Our current KG functions require AppHandle. We can use a trick to get a 'dead' handle or refactor.
        // In Tauri v2, you can't easily get an AppHandle without starting the app.
        // Let's refactor the KG engine slightly to accept Option<&AppHandle>.
        
        crate::logging::info("worker", "commencing background synthesis batch");
        
        // Loop until enrichment is complete
        loop {
            let conn = state.db.lock().await;
            let pending = crate::db::kg_queries::get_pending_enrichment_count(&conn).unwrap_or(0);
            let crawl_state = crate::db::kg_queries::get_crawl_state(&conn);
            drop(conn);

            let is_crawling = if let Ok(ref cs) = crawl_state { cs.crawl_status == "running" } else { false };

            if pending == 0 && !is_crawling {
                crate::logging::info("worker", "no more work detected. worker shutting down.");
                break;
            }

            let api_guard = state.api.read().await;
            
            // Run a single batch of enrichment
            // Note: I'm passing a null-style handle or I'll refactor the logic below.
            // For now, I'll use a hacky way to allow None in the KG modules.
            
            if let Err(e) = crate::kg::enricher::run_enrichment_batch_headless(&api_guard, &state.db).await {
                crate::logging::error("worker", format!("enrichment error: {e}"));
                tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (state, _) = init_app_context();
    
    crate::logging::info(
        "app",
        format!(
            "starting Misfit GSuite version={}",
            env!("CARGO_PKG_VERSION")
        ),
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .manage(state)
        .setup(|app| {
            let handle = app.handle().clone();
            crate::logging::info("app.setup", "tauri setup entered");

            {
                let state = app.state::<AppState>();
                tauri::async_runtime::block_on(async {
                    state.api.write().await.set_app_handle(handle.clone());
                });
            }

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
                for email in &emails {
                    match crate::auth::keychain::load_token(email) {
                        Ok(Some(token)) if token.has_required_scopes() => {
                            let api = state.api.read().await;
                            api.oauth_state.write().await.add_or_update(token);
                            restored_emails.push(email.clone());
                        }
                        _ => {}
                    }
                }

                if let Some(email) = restored_emails.first() {
                    let _ = handle.emit("auth::restored", email);
                    crate::logging::info("auth.restore", format!("restored session for {email}"));
                }

                let kg_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let state = kg_handle.state::<AppState>();
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                    let (should_resume, pending_enrich) = {
                        let conn = state.db.lock().await;
                        let _ = crate::db::kg_queries::cleanup_stuck_nodes(&conn);
                        let resume = if let Ok(cs) = crate::db::kg_queries::get_crawl_state(&conn) {
                            cs.crawl_status == "running"
                        } else {
                            false
                        };
                        let pending =
                            crate::db::kg_queries::get_pending_enrichment_count(&conn).unwrap_or(0);
                        (resume, pending)
                    };

                    if should_resume {
                        crate::logging::info("kg.manager", "resuming interrupted crawl");
                        let api_guard = state.api.read().await;
                        let _ =
                            crate::kg::crawler::run_full_crawl(&api_guard, &state.db, &kg_handle)
                                .await;
                    }

                    if pending_enrich > 0 {
                        crate::logging::info(
                            "kg.manager",
                            format!("starting enrichment batch for {pending_enrich} files"),
                        );
                        let api_guard = state.api.read().await;
                        let _ = crate::kg::enricher::run_enrichment_batch(
                            &api_guard, &state.db, &kg_handle,
                        )
                        .await;
                    }
                });

                let sync_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
                    interval.tick().await;
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
                        {
                            let api = state.api.read().await;
                            let _ = api.access_token().await;
                        }
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
            commands::auth_commands::start_oauth_flow,
            commands::auth_commands::get_current_account,
            commands::auth_commands::list_accounts,
            commands::auth_commands::switch_account,
            commands::auth_commands::sign_out,
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
            commands::drive_commands::list_drive_files,
            commands::drive_commands::list_drive_files_recursive,
            commands::drive_commands::list_shared_drives,
            commands::drive_commands::open_drive_file,
            commands::drive_commands::create_drive_folder,
            commands::drive_commands::delete_drive_file,
            commands::docs_commands::get_document,
            commands::docs_commands::save_document,
            commands::docs_commands::create_document,
            commands::gemini_docs_commands::gemini_chat_with_search,
            commands::calendar_commands::list_calendars,
            commands::calendar_commands::list_events,
            commands::calendar_commands::create_event,
            commands::calendar_commands::update_event,
            commands::calendar_commands::delete_event,
            commands::calendar_commands::respond_to_event,
            commands::chat_commands::list_spaces,
            commands::chat_commands::list_space_members,
            commands::chat_commands::setup_chat_space,
            commands::chat_commands::upload_chat_attachment,
            commands::chat_commands::list_chat_messages,
            commands::chat_commands::send_chat_message,
            commands::chat_commands::search_chat_contacts,
            commands::chat_commands::delete_chat_space,
            commands::gemini_commands::gemini_chat,
            commands::gemini_commands::generate_email_reply,
            commands::gemini_commands::organize_inbox,
            commands::gemini_commands::generate_daily_report,
            commands::setup_commands::save_app_credentials,
            commands::setup_commands::has_app_credentials,
            commands::log_commands::get_log_file_path,
            commands::log_commands::read_recent_logs,
            commands::log_commands::clear_logs,
            commands::log_commands::write_frontend_log,
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

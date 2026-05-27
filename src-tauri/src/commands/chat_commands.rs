use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::api::chat::{
    self, Attachment, ChatMessage, ContactSuggestion, Membership, MessageListResponse, Space,
    UploadAttachmentResponse,
};
use crate::AppState;

static CHAT_DISPLAY_NAME_WORKER_RUNNING: AtomicBool = AtomicBool::new(false);
const CHAT_DISPLAY_NAME_BATCH_LIMIT: i64 = 6;
const CHAT_DISPLAY_NAME_RESOLVE_TIMEOUT_SECS: u64 = 20;

#[tauri::command]
pub async fn list_spaces(state: State<'_, AppState>, app: AppHandle) -> Result<Vec<Space>, String> {
    let api = state.api.read().await;
    let account_email = {
        let oauth = api.oauth_state.read().await;
        oauth.current_token().map(|token| token.email.clone())
    };

    let mut spaces = chat::list_spaces(&api).await.map_err(|e| e.to_string())?;
    drop(api);

    if let Some(email) = account_email {
        let db = state.db.lock().await;
        let hidden =
            crate::db::queries::list_hidden_chat_spaces(&db, &email).map_err(|e| e.to_string())?;
        let display_cache = crate::db::queries::list_chat_display_name_cache(&db, &email)
            .map_err(|e| e.to_string())?;

        let mut visible_spaces = Vec::with_capacity(spaces.len());
        for mut space in spaces {
            if hidden.contains(&space.name) {
                continue;
            }

            let api_name = usable_display_name(space.display_name.as_deref());
            if let Some(display_name) = api_name {
                crate::db::queries::mark_chat_display_name_resolved(
                    &db,
                    &email,
                    &space.name,
                    space.space_type.as_deref(),
                    space.single_user_bot_dm.unwrap_or(false),
                    &display_name,
                )
                .map_err(|e| e.to_string())?;
                space.display_name = Some(display_name);
                visible_spaces.push(space);
                continue;
            }

            if let Some(cached) = display_cache.get(&space.name) {
                if cached.status == "hidden_empty" {
                    continue;
                }
                if cached.status == "resolved" {
                    if let Some(display_name) = usable_display_name(cached.display_name.as_deref())
                    {
                        space.display_name = Some(display_name);
                        visible_spaces.push(space);
                        continue;
                    }
                }
            }

            crate::db::queries::queue_chat_display_name_resolution(
                &db,
                &email,
                &space.name,
                space.space_type.as_deref(),
                space.single_user_bot_dm.unwrap_or(false),
            )
            .map_err(|e| e.to_string())?;
            visible_spaces.push(space);
        }
        spaces = visible_spaces;
        drop(db);

        start_chat_display_name_worker(app, email);
    }

    Ok(spaces)
}

fn usable_display_name(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn start_chat_display_name_worker(app: AppHandle, account_email: String) {
    if CHAT_DISPLAY_NAME_WORKER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        crate::logging::info(
            "chat.display_names",
            format!("worker started account={account_email}"),
        );

        loop {
            let state = app.state::<AppState>();
            let jobs = {
                let db = state.db.lock().await;
                match crate::db::queries::list_due_chat_display_name_jobs(
                    &db,
                    &account_email,
                    CHAT_DISPLAY_NAME_BATCH_LIMIT,
                ) {
                    Ok(jobs) => jobs,
                    Err(err) => {
                        crate::logging::error(
                            "chat.display_names",
                            format!("failed to load due jobs error={err}"),
                        );
                        Vec::new()
                    }
                }
            };

            if jobs.is_empty() {
                let next_retry_at = {
                    let db = state.db.lock().await;
                    crate::db::queries::next_chat_display_name_retry_at(&db, &account_email)
                        .unwrap_or(None)
                };

                let Some(next_retry_at) = next_retry_at else {
                    break;
                };

                let now = chrono::Utc::now().timestamp();
                let sleep_secs = (next_retry_at - now).clamp(5, 3_600) as u64;
                tokio::time::sleep(Duration::from_secs(sleep_secs)).await;
                continue;
            }

            let changed = resolve_chat_display_name_jobs(&app, &account_email, jobs).await;
            if changed > 0 {
                let _ = app.emit("chat::display_names_updated", changed);
            }

            tokio::time::sleep(Duration::from_secs(5)).await;
        }

        crate::logging::info(
            "chat.display_names",
            format!("worker stopped account={account_email}"),
        );
        CHAT_DISPLAY_NAME_WORKER_RUNNING.store(false, Ordering::SeqCst);
    });
}

async fn resolve_chat_display_name_jobs(
    app: &AppHandle,
    account_email: &str,
    jobs: Vec<crate::db::queries::CachedChatDisplayName>,
) -> usize {
    enum Update {
        Resolved {
            job: crate::db::queries::CachedChatDisplayName,
            display_name: String,
        },
        HiddenEmpty {
            job: crate::db::queries::CachedChatDisplayName,
        },
        Failed {
            job: crate::db::queries::CachedChatDisplayName,
            error: String,
        },
    }

    let state = app.state::<AppState>();
    let mut updates = Vec::with_capacity(jobs.len());
    {
        let api = state.api.read().await;
        for job in jobs {
            let space = Space {
                name: job.space_name.clone(),
                display_name: None,
                space_type: job.space_type.clone(),
                single_user_bot_dm: Some(job.single_user_bot_dm),
                threaded: None,
            };

            let result = tokio::time::timeout(
                Duration::from_secs(CHAT_DISPLAY_NAME_RESOLVE_TIMEOUT_SECS),
                chat::resolve_space_display_name_for_cache(&api, &space),
            )
            .await;

            match result {
                Ok(resolution) if resolution.hide => updates.push(Update::HiddenEmpty { job }),
                Ok(resolution) => {
                    if let Some(display_name) =
                        usable_display_name(resolution.display_name.as_deref())
                    {
                        updates.push(Update::Resolved { job, display_name });
                    } else {
                        updates.push(Update::Failed {
                            job,
                            error: "no display name resolved".to_string(),
                        });
                    }
                }
                Err(_) => updates.push(Update::Failed {
                    job,
                    error: "display-name resolution timed out".to_string(),
                }),
            }
        }
    }

    let mut changed = 0;
    let db = state.db.lock().await;
    for update in updates {
        match update {
            Update::Resolved { job, display_name } => {
                if crate::db::queries::mark_chat_display_name_resolved(
                    &db,
                    account_email,
                    &job.space_name,
                    job.space_type.as_deref(),
                    job.single_user_bot_dm,
                    &display_name,
                )
                .is_ok()
                {
                    changed += 1;
                }
            }
            Update::HiddenEmpty { job } => {
                if crate::db::queries::mark_chat_display_name_hidden_empty(
                    &db,
                    account_email,
                    &job.space_name,
                    job.space_type.as_deref(),
                    job.single_user_bot_dm,
                )
                .is_ok()
                {
                    changed += 1;
                }
            }
            Update::Failed { job, error } => {
                let _ = crate::db::queries::mark_chat_display_name_failed(
                    &db,
                    account_email,
                    &job.space_name,
                    &error,
                );
            }
        }
    }

    if changed > 0 {
        crate::logging::info(
            "chat.display_names",
            format!("resolved/updated display names count={changed}"),
        );
    }
    changed
}

#[tauri::command]
pub async fn list_space_members(
    state: State<'_, AppState>,
    space_name: String,
) -> Result<Vec<Membership>, String> {
    let api = state.api.read().await;
    chat::list_members(&api, &space_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn setup_chat_space(
    state: State<'_, AppState>,
    space: Space,
    memberships: Vec<Membership>,
) -> Result<Space, String> {
    let api = state.api.read().await;
    chat::setup_space(&api, space, memberships)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upload_chat_attachment(
    state: State<'_, AppState>,
    space_name: String,
    filename: String,
    mime_type: String,
    data: Vec<u8>,
) -> Result<UploadAttachmentResponse, String> {
    let api = state.api.read().await;
    chat::upload_attachment(&api, &space_name, &filename, &mime_type, data)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_chat_messages(
    state: State<'_, AppState>,
    space_name: String,
    page_token: Option<String>,
    page_size: Option<u32>,
) -> Result<MessageListResponse, String> {
    let api = state.api.read().await;
    chat::list_messages(
        &api,
        &space_name,
        page_token.as_deref(),
        page_size.unwrap_or(50),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_chat_message(
    state: State<'_, AppState>,
    space_name: String,
    text: String,
    attachments: Option<Vec<Attachment>>,
) -> Result<ChatMessage, String> {
    let api = state.api.read().await;
    chat::send_message(&api, &space_name, text, attachments)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_chat_contacts(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<ContactSuggestion>, String> {
    let api = state.api.read().await;
    chat::search_contacts(&api, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_chat_space(
    state: State<'_, AppState>,
    space_name: String,
) -> Result<(), String> {
    let api = state.api.read().await;
    let account_email = {
        let oauth = api.oauth_state.read().await;
        oauth
            .current_token()
            .map(|token| token.email.clone())
            .ok_or_else(|| "Not authenticated".to_string())?
    };
    drop(api);

    let db = state.db.lock().await;
    crate::db::queries::hide_chat_space(&db, &account_email, &space_name).map_err(|e| e.to_string())
}

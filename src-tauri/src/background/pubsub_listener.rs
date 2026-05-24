use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time::interval;

use crate::api::client::ApiClient;
use crate::AppState;

#[allow(dead_code)]
const WATCH_RENEW_INTERVAL_SECS: u64 = 60 * 60 * 24 * 6; // 6 days
#[allow(dead_code)]
const PUBSUB_POLL_INTERVAL_SECS: u64 = 15;

#[allow(dead_code)]
async fn pull_pubsub(
    client: &ApiClient,
    project_id: &str,
    subscription_id: &str,
) -> Result<Vec<String>, String> {
    let token = client.access_token().await.map_err(|e| e.to_string())?;
    let url = format!(
        "https://pubsub.googleapis.com/v1/projects/{}/subscriptions/{}:pull",
        project_id, subscription_id
    );
    let body = serde_json::json!({ "maxMessages": 10 });
    let resp = client
        .http
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let mut ack_ids = Vec::new();
    if let Some(messages) = data["receivedMessages"].as_array() {
        for msg in messages {
            if let Some(ack_id) = msg["ackId"].as_str() {
                ack_ids.push(ack_id.to_string());
            }
        }
    }

    // Acknowledge received messages
    if !ack_ids.is_empty() {
        let ack_url = format!(
            "https://pubsub.googleapis.com/v1/projects/{}/subscriptions/{}:acknowledge",
            project_id, subscription_id
        );
        let ack_body = serde_json::json!({ "ackIds": ack_ids });
        let _ = client
            .http
            .post(&ack_url)
            .bearer_auth(&token)
            .json(&ack_body)
            .send()
            .await;
    }

    Ok(ack_ids)
}

#[allow(dead_code)]
pub async fn start_gmail_push_listener(
    state: Arc<AppState>,
    app: AppHandle,
    project_id: String,
    subscription_id: String,
    pubsub_topic: String,
) {
    let mut poll_interval = interval(Duration::from_secs(PUBSUB_POLL_INTERVAL_SECS));
    let mut renew_interval = interval(Duration::from_secs(WATCH_RENEW_INTERVAL_SECS));

    loop {
        tokio::select! {
            _ = poll_interval.tick() => {
                let api = state.api.read().await;
                match pull_pubsub(&api, &project_id, &subscription_id).await {
                    Ok(ack_ids) if !ack_ids.is_empty() => {
                        // New Gmail notifications received — emit event to trigger inbox refresh
                        let _ = app.emit("mail::new_messages", ack_ids.len());
                    }
                    _ => {}
                }
            }
            _ = renew_interval.tick() => {
                // Renew Gmail watch (expires every 7 days max)
                let api = state.api.read().await;
                match crate::api::gmail::watch(&api, &pubsub_topic).await {
                    Ok(watch_resp) => {
                        let _ = app.emit("mail::watch_renewed", &watch_resp.history_id);
                    }
                    Err(e) => {
                        eprintln!("Gmail watch renewal failed: {}", e);
                    }
                }
            }
        }
    }
}

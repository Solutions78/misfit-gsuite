use crate::error::AppError;
use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirefliesSummary {
    pub keywords: Option<Vec<String>>,
    // Fireflies returns action_items and outline as plain strings, not arrays
    pub action_items: Option<String>,
    pub outline: Option<String>,
    pub overview: Option<String>,
    pub short_summary: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirefliesSentence {
    pub index: u32,
    pub speaker_name: Option<String>,
    pub text: String,
    // Fireflies returns start_time as a String
    pub start_time: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirefliesMeeting {
    pub id: String,
    pub title: Option<String>,
    // Fireflies returns date as Float (ms since epoch) — serialise as f64 to frontend
    pub date: Option<f64>,
    // Fireflies returns duration as Float (minutes)
    pub duration: Option<f64>,
    pub summary: Option<FirefliesSummary>,
    pub transcript: Option<Vec<FirefliesSentence>>,
    pub participants: Option<Vec<String>>,
    pub video_url: Option<String>,
    pub channel_id: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirefliesListResponse {
    pub transcripts: Vec<FirefliesMeeting>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirefliesChannel {
    pub id: String,
    pub title: String,
    pub is_private: Option<bool>,
}

// Raw GraphQL response shapes
#[derive(Debug, Deserialize)]
struct GqlResponse<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Debug, Deserialize)]
struct GqlError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct TranscriptsData {
    transcripts: Option<Vec<FirefliesMeetingRaw>>,
}

#[derive(Debug, Deserialize)]
struct TranscriptData {
    transcript: Option<FirefliesMeetingRaw>,
}

#[derive(Debug, Deserialize)]
struct ChannelsData {
    channels: Option<Vec<FirefliesChannelRaw>>,
}

#[derive(Debug, Deserialize)]
struct FirefliesChannelRaw {
    id: String,
    title: Option<String>,
    is_private: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct UpdateMeetingChannelData {
    #[allow(dead_code)]
    update_meeting_channel: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct FirefliesMeetingRaw {
    id: String,
    title: Option<String>,
    date: Option<f64>,
    duration: Option<f64>,
    summary: Option<FirefliesSummaryRaw>,
    // Fireflies GraphQL field is "sentences", not "transcript"
    sentences: Option<Vec<FirefliesSentenceRaw>>,
    participants: Option<Vec<String>>,
    video_url: Option<String>,
    channel_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FirefliesSummaryRaw {
    keywords: Option<Vec<String>>,
    action_items: Option<String>,
    outline: Option<String>,
    overview: Option<String>,
    short_summary: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FirefliesSentenceRaw {
    index: u32,
    speaker_name: Option<String>,
    text: String,
    start_time: Option<String>,
}

fn raw_to_meeting(r: FirefliesMeetingRaw) -> FirefliesMeeting {
    FirefliesMeeting {
        id: r.id,
        title: r.title,
        date: r.date,
        duration: r.duration,
        summary: r.summary.map(|s| FirefliesSummary {
            keywords: s.keywords,
            action_items: s.action_items,
            outline: s.outline,
            overview: s.overview,
            short_summary: s.short_summary,
        }),
        transcript: r.sentences.map(|sentences| {
            sentences
                .into_iter()
                .map(|s| FirefliesSentence {
                    index: s.index,
                    speaker_name: s.speaker_name,
                    text: s.text,
                    start_time: s.start_time,
                })
                .collect()
        }),
        participants: r.participants,
        video_url: r.video_url,
        channel_id: r.channel_id,
    }
}

/// List recent Fireflies meetings via the proxy.
#[allow(dead_code)]
pub async fn list_meetings(
    http: &reqwest::Client,
    proxy_base: &str,
    app_token: &str,
    limit: u32,
) -> Result<Vec<FirefliesMeeting>, AppError> {
    let url = format!("{}/fireflies/graphql", proxy_base);
    let query = "query ListTranscripts($limit: Int!) { transcripts(limit: $limit) { id title date duration participants video_url channel_id summary { keywords action_items outline overview short_summary } } }";
    let body = serde_json::json!({ "query": query, "variables": { "limit": limit } });

    let resp = http
        .post(&url)
        .header("X-App-Token", app_token)
        .json(&body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api { status, message: text });
    }

    let raw: GqlResponse<TranscriptsData> = resp.json().await?;

    if let Some(errors) = raw.errors {
        if !errors.is_empty() {
            return Err(AppError::Api {
                status: 400,
                message: errors.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; "),
            });
        }
    }

    let meetings = raw
        .data
        .and_then(|d| d.transcripts)
        .unwrap_or_default()
        .into_iter()
        .map(raw_to_meeting)
        .collect();

    Ok(meetings)
}

/// Get a single Fireflies meeting by ID via the proxy.
#[allow(dead_code)]
pub async fn get_meeting(
    http: &reqwest::Client,
    proxy_base: &str,
    app_token: &str,
    id: &str,
) -> Result<FirefliesMeeting, AppError> {
    let url = format!("{}/fireflies/graphql", proxy_base);
    let query = "query GetTranscript($id: String!) { transcript(id: $id) { id title date duration participants video_url channel_id summary { keywords action_items outline overview short_summary } sentences { index speaker_name text start_time } } }";
    let body = serde_json::json!({ "query": query, "variables": { "id": id } });

    let resp = http
        .post(&url)
        .header("X-App-Token", app_token)
        .json(&body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api { status, message: text });
    }

    let raw: GqlResponse<TranscriptData> = resp.json().await?;

    if let Some(errors) = raw.errors {
        if !errors.is_empty() {
            return Err(AppError::Api {
                status: 400,
                message: errors.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; "),
            });
        }
    }

    let meeting = raw
        .data
        .and_then(|d| d.transcript)
        .ok_or_else(|| AppError::Other(format!("Fireflies meeting not found: {}", id)))?;

    Ok(raw_to_meeting(meeting))
}

/// List Fireflies channels (folders) via the proxy.
#[allow(dead_code)]
pub async fn list_channels(
    http: &reqwest::Client,
    proxy_base: &str,
    app_token: &str,
) -> Result<Vec<FirefliesChannel>, AppError> {
    let url = format!("{}/fireflies/graphql", proxy_base);
    let body = serde_json::json!({
        "query": "{ channels { id title is_private } }"
    });

    let resp = http
        .post(&url)
        .header("X-App-Token", app_token)
        .json(&body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api { status, message: text });
    }

    let raw: GqlResponse<ChannelsData> = resp.json().await?;

    if let Some(errors) = raw.errors {
        if !errors.is_empty() {
            return Err(AppError::Api {
                status: 400,
                message: errors.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; "),
            });
        }
    }

    let channels = raw
        .data
        .and_then(|d| d.channels)
        .unwrap_or_default()
        .into_iter()
        .map(|c| FirefliesChannel {
            id: c.id,
            title: c.title.unwrap_or_else(|| "Untitled".to_string()),
            is_private: c.is_private,
        })
        .collect();

    Ok(channels)
}

/// Move up to 5 meetings into a channel via the proxy.
#[allow(dead_code)]
pub async fn move_meetings_to_channel(
    http: &reqwest::Client,
    proxy_base: &str,
    app_token: &str,
    transcript_ids: &[String],
    channel_id: &str,
) -> Result<(), AppError> {
    let url = format!("{}/fireflies/graphql", proxy_base);
    let query = "mutation MoveMeetings($transcript_ids: [String!]!, $channel_id: String!) { updateMeetingChannel(transcript_ids: $transcript_ids, channel_id: $channel_id) { id } }";
    let body = serde_json::json!({
        "query": query,
        "variables": {
            "transcript_ids": transcript_ids,
            "channel_id": channel_id
        }
    });

    let resp = http
        .post(&url)
        .header("X-App-Token", app_token)
        .json(&body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api { status, message: text });
    }

    let raw: GqlResponse<serde_json::Value> = resp.json().await?;

    if let Some(errors) = raw.errors {
        if !errors.is_empty() {
            return Err(AppError::Api {
                status: 400,
                message: errors.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; "),
            });
        }
    }

    Ok(())
}

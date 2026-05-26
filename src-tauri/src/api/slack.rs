use crate::error::AppError;
use serde::{Deserialize, Serialize};
use tracing::{debug, error, warn};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackTopic {
    pub value: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackChannel {
    pub id: String,
    pub name: String,
    pub is_private: bool,
    pub is_im: bool,
    pub is_mpim: bool,
    pub is_member: bool,
    pub num_members: Option<u32>,
    pub topic: Option<SlackTopic>,
    pub purpose: Option<SlackTopic>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackReaction {
    pub name: String,
    pub count: u32,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackFile {
    pub id: String,
    pub name: Option<String>,
    pub title: Option<String>,
    pub mimetype: Option<String>,
    pub url_private: Option<String>,
    pub url_private_download: Option<String>,
    pub permalink: Option<String>,
    pub thumb_64: Option<String>,
    pub thumb_80: Option<String>,
    pub thumb_160: Option<String>,
    pub thumb_360: Option<String>,
    pub thumb_480: Option<String>,
    pub thumb_720: Option<String>,
    pub thumb_960: Option<String>,
    pub thumb_1024: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackMessage {
    pub ts: String,
    pub user: Option<String>,
    pub text: Option<String>,
    pub reply_count: Option<u32>,
    pub reactions: Option<Vec<SlackReaction>>,
    pub files: Option<Vec<SlackFile>>,
    pub subtype: Option<String>,
    pub username: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackProfile {
    pub display_name: Option<String>,
    pub display_name_normalized: Option<String>,
    pub real_name: Option<String>,
    pub real_name_normalized: Option<String>,
    pub image_48: Option<String>,
    pub image_72: Option<String>,
    pub email: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackUser {
    pub id: String,
    pub name: String,
    pub real_name: Option<String>,
    pub profile: SlackProfile,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackTeam {
    pub id: String,
    pub name: String,
    pub domain: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackAuthedUser {
    pub id: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackTokenSet {
    pub access_token: String,
    pub team: SlackTeam,
    pub authed_user: SlackAuthedUser,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackChannelListResponse {
    pub channels: Vec<SlackChannel>,
    pub next_cursor: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlackMessageListResponse {
    pub messages: Vec<SlackMessage>,
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

// Raw API response shapes (snake_case from Slack)
#[derive(Debug, Deserialize)]
struct SlackBaseResponse {
    ok: bool,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackOAuthResponse {
    ok: bool,
    error: Option<String>,
    access_token: Option<String>,
    team: Option<SlackTeamRaw>,
    authed_user: Option<SlackAuthedUserRaw>,
}

#[derive(Debug, Deserialize)]
struct SlackTeamRaw {
    id: String,
    name: String,
    domain: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackAuthedUserRaw {
    id: String,
    access_token: Option<String>, // present when user_scope used (no bot token)
}

#[derive(Debug, Deserialize)]
struct SlackChannelListRaw {
    ok: bool,
    error: Option<String>,
    channels: Option<Vec<SlackChannelRaw>>,
    response_metadata: Option<SlackResponseMetadata>,
}

#[derive(Debug, Deserialize)]
struct SlackChannelRaw {
    id: String,
    name: Option<String>, // absent on IM/MPIM channels
    user: Option<String>, // present on IM channels instead of name
    is_private: Option<bool>,
    is_im: Option<bool>,
    is_mpim: Option<bool>,
    is_member: Option<bool>,
    num_members: Option<u32>,
    topic: Option<SlackTopicRaw>,
    purpose: Option<SlackTopicRaw>,
}

#[derive(Debug, Deserialize)]
struct SlackTopicRaw {
    value: String,
}

#[derive(Debug, Deserialize)]
struct SlackResponseMetadata {
    next_cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackHistoryRaw {
    ok: bool,
    error: Option<String>,
    messages: Option<Vec<SlackMessageRaw>>,
    has_more: Option<bool>,
    response_metadata: Option<SlackResponseMetadata>,
}

#[derive(Debug, Deserialize)]
struct SlackMessageRaw {
    ts: String,
    user: Option<String>,
    text: Option<String>,
    reply_count: Option<u32>,
    reactions: Option<Vec<SlackReactionRaw>>,
    files: Option<Vec<SlackFileRaw>>,
    subtype: Option<String>,
    username: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackReactionRaw {
    name: String,
    count: u32,
}

#[derive(Debug, Deserialize)]
struct SlackFileRaw {
    id: String,
    name: Option<String>,
    title: Option<String>,
    mimetype: Option<String>,
    url_private: Option<String>,
    url_private_download: Option<String>,
    permalink: Option<String>,
    thumb_64: Option<String>,
    thumb_80: Option<String>,
    thumb_160: Option<String>,
    thumb_360: Option<String>,
    thumb_480: Option<String>,
    thumb_720: Option<String>,
    thumb_960: Option<String>,
    thumb_1024: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SlackUserInfoRaw {
    ok: bool,
    error: Option<String>,
    user: Option<SlackUserRaw>,
}

#[derive(Debug, Deserialize)]
struct SlackUserRaw {
    id: String,
    name: String,
    real_name: Option<String>,
    profile: Option<SlackProfileRaw>,
}

#[derive(Debug, Deserialize)]
struct SlackProfileRaw {
    display_name: Option<String>,
    display_name_normalized: Option<String>,
    real_name: Option<String>,
    real_name_normalized: Option<String>,
    image_48: Option<String>,
    image_72: Option<String>,
    email: Option<String>,
}

fn check_ok(ok: bool, error: Option<&str>) -> Result<(), AppError> {
    if !ok {
        Err(AppError::Api {
            status: 400,
            message: error.unwrap_or("Unknown Slack error").to_string(),
        })
    } else {
        Ok(())
    }
}

/// Exchange an OAuth code for a Slack token via the proxy.
#[allow(dead_code)]
pub async fn exchange_code(
    http: &reqwest::Client,
    proxy_base: &str,
    app_token: &str,
    code: &str,
    redirect_uri: &str,
) -> Result<SlackTokenSet, AppError> {
    let url = format!("{}/slack/oauth", proxy_base);
    let body = serde_json::json!({ "code": code, "redirect_uri": redirect_uri });

    let resp = http
        .post(&url)
        .header("X-App-Token", app_token)
        .json(&body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: text,
        });
    }

    let raw: SlackOAuthResponse = resp.json().await?;
    check_ok(raw.ok, raw.error.as_deref())?;

    let team_raw = raw
        .team
        .ok_or_else(|| AppError::Other("Missing team in Slack OAuth response".into()))?;
    let authed_user_raw = raw
        .authed_user
        .ok_or_else(|| AppError::Other("Missing authed_user in Slack OAuth response".into()))?;

    // User-scope-only flows put the token in authed_user.access_token;
    // bot+user flows put it at the top level. Prefer the user token.
    let access_token = authed_user_raw
        .access_token
        .or(raw.access_token)
        .ok_or_else(|| AppError::Other("Missing access_token in Slack OAuth response".into()))?;

    Ok(SlackTokenSet {
        access_token,
        team: SlackTeam {
            id: team_raw.id,
            name: team_raw.name,
            domain: team_raw.domain.unwrap_or_default(),
        },
        authed_user: SlackAuthedUser {
            id: authed_user_raw.id,
        },
    })
}

/// List Slack channels (all types) using a user token directly against Slack API.
#[allow(dead_code)]
pub async fn list_channels(
    http: &reqwest::Client,
    user_token: &str,
    cursor: Option<&str>,
) -> Result<SlackChannelListResponse, AppError> {
    let mut url = "https://slack.com/api/conversations.list?types=public_channel,private_channel,im,mpim&limit=200&exclude_archived=true".to_string();
    if let Some(c) = cursor {
        if !c.is_empty() {
            url.push_str(&format!("&cursor={}", c));
        }
    }

    let resp = http.get(&url).bearer_auth(user_token).send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: text,
        });
    }

    let raw: SlackChannelListRaw = resp.json().await?;
    check_ok(raw.ok, raw.error.as_deref())?;

    let channels = raw
        .channels
        .unwrap_or_default()
        .into_iter()
        .map(|c| {
            let is_im = c.is_im.unwrap_or(false);
            let is_mpim = c.is_mpim.unwrap_or(false);
            // IM channels have no name — use the peer user ID or a placeholder
            let name = c
                .name
                .unwrap_or_else(|| c.user.clone().unwrap_or_else(|| c.id.clone()));
            SlackChannel {
                id: c.id,
                name,
                is_private: c.is_private.unwrap_or(false) || is_im || is_mpim,
                is_im,
                is_mpim,
                is_member: c.is_member.unwrap_or(true),
                num_members: c.num_members,
                topic: c.topic.map(|t| SlackTopic { value: t.value }),
                purpose: c.purpose.map(|p| SlackTopic { value: p.value }),
            }
        })
        .collect();

    let next_cursor = raw
        .response_metadata
        .and_then(|m| m.next_cursor)
        .filter(|s| !s.is_empty());

    Ok(SlackChannelListResponse {
        channels,
        next_cursor,
    })
}

/// Get message history for a channel.
#[allow(dead_code)]
pub async fn get_channel_history(
    http: &reqwest::Client,
    user_token: &str,
    channel_id: &str,
    cursor: Option<&str>,
    oldest: Option<&str>,
) -> Result<SlackMessageListResponse, AppError> {
    let mut url = format!(
        "https://slack.com/api/conversations.history?channel={}&limit=50",
        channel_id
    );
    if let Some(c) = cursor {
        if !c.is_empty() {
            url.push_str(&format!("&cursor={}", c));
        }
    }
    if let Some(o) = oldest {
        if !o.is_empty() {
            url.push_str(&format!("&oldest={}", o));
        }
    }

    let resp = http.get(&url).bearer_auth(user_token).send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: text,
        });
    }

    let raw: SlackHistoryRaw = resp.json().await?;
    check_ok(raw.ok, raw.error.as_deref())?;

    let messages = raw
        .messages
        .unwrap_or_default()
        .into_iter()
        .map(|m| SlackMessage {
            ts: m.ts,
            user: m.user,
            text: m.text,
            reply_count: m.reply_count,
            reactions: m.reactions.map(|rs| {
                rs.into_iter()
                    .map(|r| SlackReaction {
                        name: r.name,
                        count: r.count,
                    })
                    .collect()
            }),
            files: m.files.map(|fs| {
                fs.into_iter()
                    .map(|f| SlackFile {
                        id: f.id,
                        name: f.name,
                        title: f.title,
                        mimetype: f.mimetype,
                        url_private: f.url_private,
                        url_private_download: f.url_private_download,
                        permalink: f.permalink,
                        thumb_64: f.thumb_64,
                        thumb_80: f.thumb_80,
                        thumb_160: f.thumb_160,
                        thumb_360: f.thumb_360,
                        thumb_480: f.thumb_480,
                        thumb_720: f.thumb_720,
                        thumb_960: f.thumb_960,
                        thumb_1024: f.thumb_1024,
                    })
                    .collect()
            }),
            subtype: m.subtype,
            username: m.username,
        })
        .collect();

    let next_cursor = raw
        .response_metadata
        .and_then(|m| m.next_cursor)
        .filter(|s| !s.is_empty());

    Ok(SlackMessageListResponse {
        messages,
        has_more: raw.has_more.unwrap_or(false),
        next_cursor,
    })
}

/// Fetch a private Slack file through the backend so the request can include
/// the Slack bearer token. Browser <img> tags cannot attach that auth header.
#[allow(dead_code)]
pub async fn fetch_file_data_url(
    http: &reqwest::Client,
    user_token: &str,
    file_url: &str,
) -> Result<String, AppError> {
    debug!("Fetching Slack file: {}", file_url);

    let parsed = url::Url::parse(file_url)
        .map_err(|e| AppError::Other(format!("Invalid Slack file URL: {}", e)))?;

    if parsed.scheme() != "https" {
        return Err(AppError::Other("Slack file URL must use HTTPS".into()));
    }

    let host = parsed.host_str().unwrap_or_default();
    // Broaden whitelist to include all common Slack asset domains
    let is_slack_host = host == "slack.com"
        || host.ends_with(".slack.com")
        || host == "slack-edge.com"
        || host.ends_with(".slack-edge.com")
        || host == "slack-imgs.com"
        || host.ends_with(".slack-imgs.com")
        || host == "slack-core.com"
        || host.ends_with(".slack-core.com")
        || host == "slack-redir.net"
        || host.ends_with(".slack-redir.net");

    if !is_slack_host {
        warn!("Refusing to fetch non-Slack file host: {}", host);
        return Err(AppError::Other(format!(
            "Refusing to fetch non-Slack file host: {}",
            host
        )));
    }

    let resp = http.get(file_url).bearer_auth(user_token).send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        error!("Slack file fetch failed: {} - {}", status, text);
        return Err(AppError::Api {
            status,
            message: text,
        });
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .filter(|v| !v.trim().is_empty())
        .unwrap_or("application/octet-stream")
        .trim()
        .to_string();

    debug!("Fetched file content type: {}", content_type);
    let bytes = resp.bytes().await?;

    use base64::{engine::general_purpose::STANDARD, Engine};
    Ok(format!(
        "data:{};base64,{}",
        content_type,
        STANDARD.encode(bytes)
    ))
}

/// Get info for a single Slack user.
#[allow(dead_code)]
pub async fn get_user(
    http: &reqwest::Client,
    user_token: &str,
    user_id: &str,
) -> Result<SlackUser, AppError> {
    let url = format!("https://slack.com/api/users.info?user={}", user_id);

    let resp = http.get(&url).bearer_auth(user_token).send().await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: text,
        });
    }

    let raw: SlackUserInfoRaw = resp.json().await?;
    check_ok(raw.ok, raw.error.as_deref())?;

    let u = raw
        .user
        .ok_or_else(|| AppError::Other("Missing user in Slack response".into()))?;

    let profile = u.profile.unwrap_or(SlackProfileRaw {
        display_name: None,
        display_name_normalized: None,
        real_name: None,
        real_name_normalized: None,
        image_48: None,
        image_72: None,
        email: None,
    });

    Ok(SlackUser {
        id: u.id,
        name: u.name,
        real_name: u.real_name,
        profile: SlackProfile {
            display_name: profile.display_name,
            display_name_normalized: profile.display_name_normalized,
            real_name: profile.real_name,
            real_name_normalized: profile.real_name_normalized,
            image_48: profile.image_48,
            image_72: profile.image_72,
            email: profile.email,
        },
    })
}

/// Post a message to a Slack channel.
#[allow(dead_code)]
pub async fn post_message(
    http: &reqwest::Client,
    user_token: &str,
    channel_id: &str,
    text: &str,
) -> Result<(), AppError> {
    let body = serde_json::json!({ "channel": channel_id, "text": text });

    let resp = http
        .post("https://slack.com/api/chat.postMessage")
        .bearer_auth(user_token)
        .json(&body)
        .send()
        .await?;

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Api {
            status,
            message: text,
        });
    }

    let raw: SlackBaseResponse = resp.json().await?;
    check_ok(raw.ok, raw.error.as_deref())?;

    Ok(())
}

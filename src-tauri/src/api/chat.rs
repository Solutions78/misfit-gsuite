use std::collections::{HashMap, HashSet};

use futures::future::join_all;
use serde::{Deserialize, Serialize};

use crate::api::client::ApiClient;
use crate::error::AppError;

const CHAT_BASE: &str = "https://chat.googleapis.com/v1";
const PEOPLE_BASE: &str = "https://people.googleapis.com/v1";

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub name: Option<String>,
    pub display_name: Option<String>,
    #[serde(rename = "type")]
    pub user_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Space {
    pub name: String,
    pub display_name: Option<String>,
    pub space_type: Option<String>,
    pub single_user_bot_dm: Option<bool>,
    pub threaded: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceListResponse {
    pub spaces: Option<Vec<Space>>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Membership {
    pub name: String,
    pub state: Option<String>,
    pub role: Option<String>,
    pub member: Option<User>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MembershipListResponse {
    pub memberships: Option<Vec<Membership>>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetUpSpaceRequest {
    pub space: Space,
    pub memberships: Option<Vec<Membership>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub name: String,
    pub sender: Option<User>,
    pub create_time: Option<String>,
    pub last_update_time: Option<String>,
    pub delete_time: Option<String>,
    pub text: Option<String>,
    pub formatted_text: Option<String>,
    pub thread: Option<ChatThread>,
    pub thread_reply: Option<bool>,
    pub attachments: Option<Vec<Attachment>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: Option<String>,
    pub content_name: Option<String>,
    pub content_type: Option<String>,
    pub attachment_data_ref: Option<AttachmentDataRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDataRef {
    pub resource_name: String,
    pub attachment_upload_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThread {
    pub name: Option<String>,
    pub thread_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageListResponse {
    pub messages: Option<Vec<ChatMessage>>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub text: String,
    pub attachments: Option<Vec<Attachment>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadAttachmentResponse {
    pub attachment_data_ref: AttachmentDataRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSuggestion {
    pub resource_name: Option<String>,
    pub display_name: String,
    pub email: String,
    pub photo_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PeopleBatchGetResponse {
    pub responses: Option<Vec<PersonResponse>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PeopleSearchContactsResponse {
    pub results: Option<Vec<PersonSearchResult>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PeopleSearchDirectoryResponse {
    pub people: Option<Vec<Person>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonSearchResult {
    pub person: Option<Person>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonResponse {
    pub person: Option<Person>,
    pub requested_resource_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Person {
    pub resource_name: Option<String>,
    pub names: Option<Vec<PersonName>>,
    pub email_addresses: Option<Vec<PersonEmailAddress>>,
    pub photos: Option<Vec<PersonPhoto>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonName {
    pub display_name: Option<String>,
    pub unstructured_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonEmailAddress {
    pub value: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonPhoto {
    pub url: Option<String>,
}

struct BotDmResolution {
    pub display_name: Option<String>,
    pub hide: bool,
}

// ── API functions ──────────────────────────────────────────────────────────

pub async fn list_spaces(client: &ApiClient) -> Result<Vec<Space>, AppError> {
    let url = format!("{}/spaces?pageSize=100", CHAT_BASE);
    let resp = client.get(&url).await?.json::<SpaceListResponse>().await?;
    let mut spaces = resp.spaces.unwrap_or_default();

    // Get the current user's Google user ID for reliable self-exclusion.
    let self_user_id = current_google_user_id(client).await;

    // Resolve display names for DM and GROUP_CHAT spaces that have no displayName.
    // Bot DMs often don't expose a displayName, so infer their app name from
    // their own messages. Empty bot DMs are hidden from the local list.
    let needs_resolve: Vec<usize> = spaces
        .iter()
        .enumerate()
        .filter(|(_, s)| {
            let t = s.space_type.as_deref();
            (t == Some("DIRECT_MESSAGE") || t == Some("GROUP_CHAT"))
                && s.display_name
                    .as_deref()
                    .map(|n| n.is_empty())
                    .unwrap_or(true)
        })
        .map(|(i, _)| i)
        .collect();

    if !needs_resolve.is_empty() {
        let futs: Vec<_> = needs_resolve
            .iter()
            .map(|&i| {
                let name = spaces[i].name.clone();
                let is_dm = spaces[i].space_type.as_deref() == Some("DIRECT_MESSAGE");
                let is_bot_dm = spaces[i].single_user_bot_dm.unwrap_or(false);
                let self_id = self_user_id.clone();
                async move {
                    if is_bot_dm {
                        let resolution = resolve_bot_dm_display_name(client, &name).await;
                        (i, resolution.display_name, resolution.hide)
                    } else {
                        (
                            i,
                            resolve_space_display_name(client, &name, is_dm, self_id.as_deref())
                                .await,
                            false,
                        )
                    }
                }
            })
            .collect();

        let results = join_all(futs).await;
        let mut keep_space = vec![true; spaces.len()];
        for (i, display_name, hide) in results {
            if hide {
                keep_space[i] = false;
                continue;
            }
            if let Some(dn) = display_name {
                spaces[i].display_name = Some(dn);
            }
        }
        spaces = spaces
            .into_iter()
            .enumerate()
            .filter_map(|(i, space)| keep_space.get(i).copied().unwrap_or(true).then_some(space))
            .collect();
    }

    Ok(spaces)
}

pub async fn search_contacts(
    client: &ApiClient,
    query: &str,
) -> Result<Vec<ContactSuggestion>, AppError> {
    let query = query.trim();
    if query.len() < 2 {
        return Ok(Vec::new());
    }

    let read_mask = urlencoding::encode("names,emailAddresses,photos");
    let encoded_query = urlencoding::encode(query);
    let contacts_url = format!(
        "{}/people:searchContacts?query={}&readMask={}&pageSize=8",
        PEOPLE_BASE, encoded_query, read_mask
    );
    let directory_url = format!(
        "{}/people:searchDirectoryPeople?query={}&readMask={}&pageSize=8&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT",
        PEOPLE_BASE, encoded_query, read_mask
    );

    let (contacts, directory) =
        tokio::join!(client.get(&contacts_url), client.get(&directory_url),);

    let mut suggestions = Vec::new();

    match contacts {
        Ok(resp) => {
            let page = resp.json::<PeopleSearchContactsResponse>().await?;
            for result in page.results.unwrap_or_default() {
                if let Some(person) = result.person {
                    if let Some(contact) = contact_suggestion_from_person(&person) {
                        suggestions.push(contact);
                    }
                }
            }
        }
        Err(err) => eprintln!("People contacts search failed: {}", err),
    }

    match directory {
        Ok(resp) => {
            let page = resp.json::<PeopleSearchDirectoryResponse>().await?;
            for person in page.people.unwrap_or_default() {
                if let Some(contact) = contact_suggestion_from_person(&person) {
                    suggestions.push(contact);
                }
            }
        }
        Err(err) => eprintln!("People directory search failed: {}", err),
    }

    let mut seen_emails = HashSet::new();
    suggestions.retain(|contact| seen_emails.insert(contact.email.to_lowercase()));
    suggestions.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    suggestions.truncate(12);
    Ok(suggestions)
}

async fn current_google_user_id(client: &ApiClient) -> Option<String> {
    let state = client.oauth_state.read().await;
    state
        .current_token()
        .map(|t| t.google_user_id.clone())
        .filter(|id| !id.is_empty())
}

async fn resolve_bot_dm_display_name(client: &ApiClient, space_name: &str) -> BotDmResolution {
    let url = format!("{}/{}/messages?pageSize=20", CHAT_BASE, space_name);
    let page = match client.get(&url).await {
        Ok(resp) => resp.json::<MessageListResponse>().await.ok(),
        Err(err) => {
            eprintln!(
                "Failed to inspect bot DM messages for {}: {}",
                space_name, err
            );
            None
        }
    };

    let messages = page.and_then(|page| page.messages).unwrap_or_default();
    if messages.is_empty() {
        return BotDmResolution {
            display_name: None,
            hide: true,
        };
    }

    let display_name = messages
        .iter()
        .filter_map(|message| message.text.as_deref())
        .find_map(infer_bot_display_name_from_text)
        .or_else(|| {
            messages.iter().find_map(|message| {
                message
                    .sender
                    .as_ref()
                    .and_then(|sender| display_label(sender.display_name.as_deref()))
            })
        })
        .or_else(|| Some("Bot chat".to_string()));

    BotDmResolution {
        display_name,
        hide: false,
    }
}

async fn resolve_space_display_name(
    client: &ApiClient,
    space_name: &str,
    is_dm: bool,
    self_user_id: Option<&str>,
) -> Option<String> {
    let url = format!("{}/{}/members?pageSize=20", CHAT_BASE, space_name);
    let resp = client
        .get(&url)
        .await
        .ok()?
        .json::<MembershipListResponse>()
        .await
        .ok()?;

    // The Chat API members list returns members whose `member.name` is like "users/{id}".
    // Exclude self by user ID (most reliable), exclude bots by type.
    let self_resource = self_user_id.map(|id| format!("users/{}", id));

    let humans: Vec<User> = resp
        .memberships
        .unwrap_or_default()
        .into_iter()
        .filter_map(|m| m.member)
        .filter(|u| u.user_type.as_deref() != Some("BOT"))
        .filter(|u| {
            // Exclude self by resource name if we have the user ID
            if let Some(ref self_res) = self_resource {
                u.name.as_deref().map(|n| n != self_res).unwrap_or(true)
            } else {
                true
            }
        })
        .collect();

    let unresolved_user_names = humans
        .iter()
        .filter(|u| display_label(u.display_name.as_deref()).is_none())
        .filter_map(|u| u.name.clone())
        .collect::<Vec<_>>();

    let people_names = match resolve_user_display_names(client, &unresolved_user_names).await {
        Ok(names) => names,
        Err(err) => {
            eprintln!(
                "Failed to resolve Chat member names via People API: {}",
                err
            );
            HashMap::new()
        }
    };

    let human_names: Vec<String> = humans
        .into_iter()
        .filter_map(|u| {
            if let Some(label) = display_label(u.display_name.as_deref()) {
                return Some(label);
            }

            let name = u.name.as_deref()?;
            people_names
                .get(name)
                .cloned()
                .or_else(|| user_resource_fallback(name))
        })
        .collect();

    if human_names.is_empty() && is_dm {
        return infer_display_name_from_recent_messages(client, space_name, &unresolved_user_names)
            .await;
    }

    if human_names.is_empty() {
        return None;
    }
    if is_dm {
        Some(human_names.into_iter().next().unwrap())
    } else {
        Some(human_names.join(", "))
    }
}

async fn resolve_user_display_names(
    client: &ApiClient,
    chat_user_names: &[String],
) -> Result<HashMap<String, String>, AppError> {
    let mut seen = HashSet::new();
    let mut people_resource_names = Vec::new();

    for chat_user_name in chat_user_names {
        if let Some(people_resource_name) = chat_user_to_people_resource(chat_user_name) {
            if seen.insert(people_resource_name.clone()) {
                people_resource_names.push(people_resource_name);
            }
        }
    }

    let mut resolved = HashMap::new();
    for chunk in people_resource_names.chunks(200) {
        let mut query = vec![
            format!(
                "personFields={}",
                urlencoding::encode("names,emailAddresses,photos")
            ),
            "sources=READ_SOURCE_TYPE_PROFILE".to_string(),
            "sources=READ_SOURCE_TYPE_CONTACT".to_string(),
            "sources=READ_SOURCE_TYPE_DOMAIN_CONTACT".to_string(),
            "sources=READ_SOURCE_TYPE_OTHER_CONTACT".to_string(),
        ];

        for resource_name in chunk {
            query.push(format!(
                "resourceNames={}",
                urlencoding::encode(resource_name)
            ));
        }

        let url = format!("{}/people:batchGet?{}", PEOPLE_BASE, query.join("&"));
        let batch = client
            .get(&url)
            .await?
            .json::<PeopleBatchGetResponse>()
            .await?;

        for response in batch.responses.unwrap_or_default() {
            let people_resource_name = response
                .person
                .as_ref()
                .and_then(|p| p.resource_name.as_deref())
                .or(response.requested_resource_name.as_deref());
            let display_name = response.person.as_ref().and_then(best_person_display_name);

            if let (Some(people_resource_name), Some(display_name)) =
                (people_resource_name, display_name)
            {
                if let Some(chat_user_name) = people_resource_to_chat_user(people_resource_name) {
                    resolved.insert(chat_user_name, display_name);
                }
            }
        }
    }

    Ok(resolved)
}

fn display_label(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn best_person_display_name(person: &Person) -> Option<String> {
    person
        .names
        .as_deref()
        .and_then(|names| {
            names.iter().find_map(|name| {
                display_label(name.display_name.as_deref())
                    .or_else(|| display_label(name.unstructured_name.as_deref()))
            })
        })
        .or_else(|| {
            person.email_addresses.as_deref().and_then(|emails| {
                emails.iter().find_map(|email| {
                    display_label(email.display_name.as_deref())
                        .or_else(|| display_label(email.value.as_deref()))
                })
            })
        })
}

fn contact_suggestion_from_person(person: &Person) -> Option<ContactSuggestion> {
    let email = best_person_email(person)?;
    let display_name = best_person_display_name(person).unwrap_or_else(|| email.clone());

    Some(ContactSuggestion {
        resource_name: person.resource_name.clone(),
        display_name,
        email,
        photo_url: best_person_photo(person),
    })
}

fn best_person_email(person: &Person) -> Option<String> {
    person.email_addresses.as_deref().and_then(|emails| {
        emails
            .iter()
            .find_map(|email| display_label(email.value.as_deref()))
    })
}

fn best_person_photo(person: &Person) -> Option<String> {
    person.photos.as_deref().and_then(|photos| {
        photos
            .iter()
            .find_map(|photo| display_label(photo.url.as_deref()))
    })
}

fn chat_user_to_people_resource(chat_user_name: &str) -> Option<String> {
    let user_id = chat_user_name.strip_prefix("users/")?;
    if user_id.is_empty() || user_id == "app" {
        return None;
    }

    Some(format!("people/{}", user_id))
}

fn people_resource_to_chat_user(people_resource_name: &str) -> Option<String> {
    people_resource_name
        .strip_prefix("people/")
        .filter(|user_id| !user_id.is_empty())
        .map(|user_id| format!("users/{}", user_id))
}

fn user_resource_fallback(chat_user_name: &str) -> Option<String> {
    let fallback = chat_user_name
        .strip_prefix("users/")
        .unwrap_or(chat_user_name)
        .trim()
        .split('/')
        .next_back()
        .filter(|value| !value.is_empty() && *value != "app")
        .map(ToOwned::to_owned)?;

    // A raw Google user ID is not a useful display name. If People/Directory
    // resolution fails, leave the label empty so higher-level fallbacks can
    // infer a human-readable label or show "Unknown direct message".
    if fallback.len() >= 12 && fallback.chars().all(|c| c.is_ascii_digit()) {
        None
    } else {
        Some(fallback)
    }
}

async fn infer_display_name_from_recent_messages(
    client: &ApiClient,
    space_name: &str,
    target_user_names: &[String],
) -> Option<String> {
    let url = format!("{}/{}/messages?pageSize=50", CHAT_BASE, space_name);
    let page = client
        .get(&url)
        .await
        .ok()?
        .json::<MessageListResponse>()
        .await
        .ok()?;

    for message in page.messages.unwrap_or_default() {
        let sender_name = message
            .sender
            .as_ref()
            .and_then(|sender| sender.name.as_ref());
        if !target_user_names.is_empty()
            && !sender_name
                .map(|sender| target_user_names.iter().any(|target| target == sender))
                .unwrap_or(false)
        {
            continue;
        }

        if let Some(inferred) = message
            .text
            .as_deref()
            .and_then(extract_self_introduction_name)
        {
            return Some(inferred);
        }
    }

    None
}

fn extract_self_introduction_name(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let markers = [
        "my name is ",
        "this is ",
        "it's ",
        "it’s ",
        "i'm ",
        "i’m ",
        "i am ",
    ];

    markers.iter().find_map(|marker| {
        let index = lower.find(marker)?;
        parse_name_candidate(&text[index + marker.len()..])
    })
}

fn parse_name_candidate(candidate: &str) -> Option<String> {
    let mut parts = Vec::new();
    let stopwords = [
        "a", "an", "and", "at", "checking", "for", "from", "here", "in", "is", "just", "lol", "on",
        "the", "to", "with",
    ];

    for raw in candidate.split_whitespace().take(4) {
        let trimmed =
            raw.trim_matches(|c: char| !(c.is_alphanumeric() || c == '-' || c == '\'' || c == '’'));
        if trimmed.is_empty() {
            continue;
        }

        let lower = trimmed.to_lowercase();
        if stopwords.contains(&lower.as_str()) {
            break;
        }

        if !looks_like_name_token(trimmed) {
            if parts.is_empty() {
                return None;
            }
            break;
        }

        parts.push(trimmed.to_string());

        if raw.ends_with('.') || raw.ends_with('!') || raw.ends_with('?') || raw.ends_with(',') {
            break;
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn looks_like_name_token(value: &str) -> bool {
    value
        .chars()
        .next()
        .map(|c| c.is_uppercase())
        .unwrap_or(false)
}

fn infer_bot_display_name_from_text(text: &str) -> Option<String> {
    extract_between_case_insensitive(text, "welcome to the ", " app")
        .or_else(|| extract_between_case_insensitive(text, "connect your ", " account"))
        .or_else(|| extract_after_case_insensitive(text, "thanks for chatting with "))
        .or_else(|| extract_after_case_insensitive(text, "thanks for chattingw with "))
        .and_then(clean_bot_display_name)
}

fn extract_between_case_insensitive(text: &str, start: &str, end: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start_idx = lower.find(start)? + start.len();
    let rest_lower = &lower[start_idx..];
    let end_idx = rest_lower.find(end)?;
    text.get(start_idx..start_idx + end_idx)
        .map(ToOwned::to_owned)
}

fn extract_after_case_insensitive(text: &str, start: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let start_idx = lower.find(start)? + start.len();
    let rest = text.get(start_idx..)?;
    let end_idx = rest
        .find(|c: char| c == '\n' || c == '\r' || c == '!' || c == '.' || c == ',' || c == ':')
        .unwrap_or(rest.len());
    Some(rest[..end_idx].to_string())
}

fn clean_bot_display_name(value: String) -> Option<String> {
    let cleaned = value
        .trim()
        .trim_matches(|c: char| c == '*' || c == '_' || c == '`' || c.is_ascii_punctuation())
        .trim();

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

async fn hydrate_message_sender_display_names(client: &ApiClient, page: &mut MessageListResponse) {
    let Some(messages) = page.messages.as_mut() else {
        return;
    };

    let unresolved_user_names = messages
        .iter()
        .filter_map(|message| message.sender.as_ref())
        .filter(|sender| sender.user_type.as_deref() != Some("BOT"))
        .filter(|sender| display_label(sender.display_name.as_deref()).is_none())
        .filter_map(|sender| sender.name.clone())
        .collect::<Vec<_>>();

    let people_names = match resolve_user_display_names(client, &unresolved_user_names).await {
        Ok(names) => names,
        Err(err) => {
            eprintln!(
                "Failed to resolve Chat sender names via People API: {}",
                err
            );
            return;
        }
    };

    for message in messages.iter_mut() {
        let Some(sender) = message.sender.as_mut() else {
            continue;
        };

        if display_label(sender.display_name.as_deref()).is_some() {
            continue;
        }

        let Some(name) = sender.name.as_deref() else {
            continue;
        };

        if let Some(display_name) = people_names
            .get(name)
            .cloned()
            .or_else(|| user_resource_fallback(name))
        {
            sender.display_name = Some(display_name);
        }
    }

    let mut inferred_names = HashMap::new();
    for message in messages.iter() {
        let Some(sender_name) = message
            .sender
            .as_ref()
            .and_then(|sender| sender.name.as_ref())
        else {
            continue;
        };

        if people_names.contains_key(sender_name) || inferred_names.contains_key(sender_name) {
            continue;
        }

        if let Some(display_name) = message
            .text
            .as_deref()
            .and_then(extract_self_introduction_name)
        {
            inferred_names.insert(sender_name.clone(), display_name);
        }
    }

    if inferred_names.is_empty() {
        return;
    }

    for message in messages.iter_mut() {
        let Some(sender) = message.sender.as_mut() else {
            continue;
        };

        if display_label(sender.display_name.as_deref()).is_some() {
            continue;
        }

        let Some(name) = sender.name.as_deref() else {
            continue;
        };

        if let Some(display_name) = inferred_names.get(name) {
            sender.display_name = Some(display_name.clone());
        }
    }
}

pub async fn list_members(
    client: &ApiClient,
    space_name: &str,
) -> Result<Vec<Membership>, AppError> {
    let url = format!("{}/{}/members?pageSize=100", CHAT_BASE, space_name);
    let resp = client
        .get(&url)
        .await?
        .json::<MembershipListResponse>()
        .await?;
    let mut memberships = resp.memberships.unwrap_or_default();

    let unresolved_user_names = memberships
        .iter()
        .filter_map(|membership| membership.member.as_ref())
        .filter(|member| member.user_type.as_deref() != Some("BOT"))
        .filter(|member| display_label(member.display_name.as_deref()).is_none())
        .filter_map(|member| member.name.clone())
        .collect::<Vec<_>>();

    let people_names = resolve_user_display_names(client, &unresolved_user_names)
        .await
        .unwrap_or_default();

    for membership in &mut memberships {
        let Some(member) = membership.member.as_mut() else {
            continue;
        };

        if display_label(member.display_name.as_deref()).is_some() {
            continue;
        }

        let Some(name) = member.name.as_deref() else {
            continue;
        };

        if let Some(display_name) = people_names
            .get(name)
            .cloned()
            .or_else(|| user_resource_fallback(name))
        {
            member.display_name = Some(display_name);
        }
    }

    Ok(memberships)
}

pub async fn setup_space(
    client: &ApiClient,
    space: Space,
    memberships: Vec<Membership>,
) -> Result<Space, AppError> {
    let url = format!("{}/spaces:setup", CHAT_BASE);
    let body = SetUpSpaceRequest {
        space,
        memberships: Some(memberships),
    };
    let mut space = client.post(&url, &body).await?.json::<Space>().await?;

    if (space.space_type.as_deref() == Some("DIRECT_MESSAGE")
        || space.space_type.as_deref() == Some("GROUP_CHAT"))
        && space
            .display_name
            .as_deref()
            .map(|name| name.trim().is_empty())
            .unwrap_or(true)
    {
        if let Some(display_name) = resolve_space_display_name(
            client,
            &space.name,
            space.space_type.as_deref() == Some("DIRECT_MESSAGE"),
            current_google_user_id(client).await.as_deref(),
        )
        .await
        {
            space.display_name = Some(display_name);
        }
    }

    Ok(space)
}

pub async fn upload_attachment(
    client: &ApiClient,
    space_name: &str,
    filename: &str,
    mime_type: &str,
    data: Vec<u8>,
) -> Result<UploadAttachmentResponse, AppError> {
    let url = format!(
        "https://chat.googleapis.com/upload/v1/{}/attachments:upload?uploadType=multipart",
        space_name
    );

    let boundary = "misfit_gsuite_boundary";
    let mut body = Vec::new();

    // Metadata Part
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    let metadata = serde_json::json!({ "filename": filename });
    body.extend_from_slice(metadata.to_string().as_bytes());
    body.extend_from_slice(b"\r\n");

    // Media Part
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(format!("Content-Type: {}\r\n\r\n", mime_type).as_bytes());
    body.extend_from_slice(&data);
    body.extend_from_slice(b"\r\n");

    // End Boundary
    body.extend_from_slice(format!("--{}--\r\n", boundary).as_bytes());

    let token = client.access_token().await?;
    let resp = client
        .http
        .post(&url)
        .bearer_auth(&token)
        .header(
            "Content-Type",
            format!("multipart/related; boundary={}", boundary),
        )
        .body(body)
        .send()
        .await?
        .error_for_status()?
        .json::<UploadAttachmentResponse>()
        .await?;

    Ok(resp)
}

pub async fn list_messages(
    client: &ApiClient,
    space_name: &str,
    page_token: Option<&str>,
    page_size: u32,
) -> Result<MessageListResponse, AppError> {
    let mut url = format!(
        "{}/{}/messages?pageSize={}",
        CHAT_BASE, space_name, page_size
    );
    if let Some(token) = page_token {
        url.push_str(&format!("&pageToken={}", urlencoding::encode(token)));
    }
    let mut page = client
        .get(&url)
        .await?
        .json::<MessageListResponse>()
        .await?;
    hydrate_message_sender_display_names(client, &mut page).await;
    Ok(page)
}

pub async fn send_message(
    client: &ApiClient,
    space_name: &str,
    text: String,
    attachments: Option<Vec<Attachment>>,
) -> Result<ChatMessage, AppError> {
    let url = format!("{}/{}/messages", CHAT_BASE, space_name);
    let body = SendMessageRequest { text, attachments };
    let resp = client
        .post(&url, &body)
        .await?
        .json::<ChatMessage>()
        .await?;
    Ok(resp)
}

use serde::{Deserialize, Serialize};

use crate::api::client::ApiClient;
use crate::error::AppError;

const CALENDAR_BASE: &str = "https://www.googleapis.com/calendar/v3";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarListEntry {
    pub id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub background_color: Option<String>,
    pub foreground_color: Option<String>,
    pub primary: Option<bool>,
    pub access_role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarList {
    pub items: Option<Vec<CalendarListEntry>>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDateTime {
    pub date: Option<String>,
    pub date_time: Option<String>,
    pub time_zone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attendee {
    pub email: String,
    pub display_name: Option<String>,
    pub response_status: Option<String>,
    pub self_: Option<bool>,
    pub organizer: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConferenceData {
    pub entry_points: Option<Vec<serde_json::Value>>,
    pub conference_solution: Option<serde_json::Value>,
    pub conference_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recurrence {
    pub recurrence: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: Option<EventDateTime>,
    pub end: Option<EventDateTime>,
    pub attendees: Option<Vec<Attendee>>,
    pub organizer: Option<serde_json::Value>,
    pub recurrence: Option<Vec<String>>,
    pub recurring_event_id: Option<String>,
    pub status: Option<String>,
    pub html_link: Option<String>,
    pub conference_data: Option<ConferenceData>,
    pub color_id: Option<String>,
    pub all_day: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventListResponse {
    pub items: Option<Vec<CalendarEvent>>,
    pub next_page_token: Option<String>,
    pub next_sync_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewEvent {
    pub summary: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub start: EventDateTime,
    pub end: EventDateTime,
    pub attendees: Option<Vec<serde_json::Value>>,
    pub recurrence: Option<Vec<String>>,
    pub conference_data_version: Option<u32>,
}

pub async fn list_calendars(client: &ApiClient) -> Result<Vec<CalendarListEntry>, AppError> {
    let url = format!("{}/users/me/calendarList?maxResults=250", CALENDAR_BASE);
    let resp = client.get(&url).await?.json::<CalendarList>().await?;
    Ok(resp.items.unwrap_or_default())
}

pub async fn list_events(
    client: &ApiClient,
    calendar_id: &str,
    time_min: &str,
    time_max: &str,
    max_results: u32,
) -> Result<Vec<CalendarEvent>, AppError> {
    let url = format!(
        "{}/calendars/{}/events?timeMin={}&timeMax={}&maxResults={}&singleEvents=true&orderBy=startTime",
        CALENDAR_BASE,
        urlencoding::encode(calendar_id),
        urlencoding::encode(time_min),
        urlencoding::encode(time_max),
        max_results
    );
    let resp = client.get(&url).await?.json::<EventListResponse>().await?;
    Ok(resp.items.unwrap_or_default())
}

pub async fn get_event(
    client: &ApiClient,
    calendar_id: &str,
    event_id: &str,
) -> Result<CalendarEvent, AppError> {
    let url = format!(
        "{}/calendars/{}/events/{}",
        CALENDAR_BASE,
        urlencoding::encode(calendar_id),
        urlencoding::encode(event_id)
    );
    let resp = client.get(&url).await?.json::<CalendarEvent>().await?;
    Ok(resp)
}

pub async fn create_event(
    client: &ApiClient,
    calendar_id: &str,
    event: &NewEvent,
) -> Result<CalendarEvent, AppError> {
    let mut url = format!(
        "{}/calendars/{}/events",
        CALENDAR_BASE,
        urlencoding::encode(calendar_id)
    );
    if event.conference_data_version.is_some() {
        url.push_str("?conferenceDataVersion=1");
    }
    let resp = client.post(&url, event).await?.json::<CalendarEvent>().await?;
    Ok(resp)
}

pub async fn update_event(
    client: &ApiClient,
    calendar_id: &str,
    event_id: &str,
    event: &serde_json::Value,
) -> Result<CalendarEvent, AppError> {
    let url = format!(
        "{}/calendars/{}/events/{}",
        CALENDAR_BASE,
        urlencoding::encode(calendar_id),
        urlencoding::encode(event_id)
    );
    let resp = client.put(&url, event).await?.json::<CalendarEvent>().await?;
    Ok(resp)
}

pub async fn delete_event(
    client: &ApiClient,
    calendar_id: &str,
    event_id: &str,
) -> Result<(), AppError> {
    let url = format!(
        "{}/calendars/{}/events/{}",
        CALENDAR_BASE,
        urlencoding::encode(calendar_id),
        urlencoding::encode(event_id)
    );
    client.delete(&url).await?;
    Ok(())
}

pub async fn respond_to_event(
    client: &ApiClient,
    calendar_id: &str,
    event_id: &str,
    user_email: &str,
    status: &str,
) -> Result<CalendarEvent, AppError> {
    let event = get_event(client, calendar_id, event_id).await?;
    let mut event_json = serde_json::to_value(&event)?;

    if let Some(attendees) = event_json.get_mut("attendees").and_then(|a| a.as_array_mut()) {
        for attendee in attendees.iter_mut() {
            if attendee.get("email").and_then(|e| e.as_str()) == Some(user_email) {
                attendee["responseStatus"] = serde_json::Value::String(status.to_string());
            }
        }
    }

    update_event(client, calendar_id, event_id, &event_json).await
}

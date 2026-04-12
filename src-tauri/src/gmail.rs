//! Gmail connector: OAuth 2.0 and read-only email fetch.

pub mod commands {
    /// Returns the resolved credentials path for display. Always succeeds on Windows.
    #[tauri::command]
    pub fn gmail_credentials_path_display() -> String {
        #[cfg(windows)]
        {
            if let Ok(appdata) = std::env::var("APPDATA") {
                return format!(
                    "{}\\com.avatars.app\\data\\connections\\enabled\\gmail\\credentials.json",
                    appdata
                );
            }
        }
        #[cfg(not(windows))]
        {
            if let Ok(home) = std::env::var("HOME") {
                return format!(
                    "{}/.config/com.avatars.app/data/connections/enabled/gmail/credentials.json",
                    home
                );
            }
        }
        "credentials.json".to_string()
    }

    #[tauri::command]
    pub fn gmail_credentials_path(app: tauri::AppHandle) -> Result<String, String> {
        super::credentials_path(&app).map(|p| p.to_string_lossy().to_string())
    }

    #[tauri::command]
    pub fn is_gmail_enabled(app: tauri::AppHandle) -> bool {
        super::is_gmail_enabled(&app)
    }

    #[tauri::command]
    pub fn has_gmail_tokens(app: tauri::AppHandle) -> bool {
        super::has_gmail_tokens(&app)
    }

    #[tauri::command]
    pub fn start_gmail_oauth(app: tauri::AppHandle) -> Result<(), String> {
        super::start_gmail_oauth(app)
    }

    #[tauri::command]
    pub fn fetch_gmail_recent(app: tauri::AppHandle, limit: Option<u32>) -> Result<Vec<super::GmailMessage>, String> {
        super::fetch_gmail_recent(app, limit.unwrap_or(10))
    }

    #[tauri::command]
    pub fn fetch_calendar_upcoming(app: tauri::AppHandle, days: Option<u32>) -> Result<Vec<super::CalendarEvent>, String> {
        super::fetch_calendar_upcoming(app, days.unwrap_or(30))
    }

    #[tauri::command]
    pub fn fetch_contacts(app: tauri::AppHandle, limit: Option<u32>) -> Result<Vec<super::Contact>, String> {
        super::fetch_contacts(app, limit.unwrap_or(50))
    }
}

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tiny_http::{Response, Server};
use url::Url;

const GOOGLE_SCOPES: &str = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/contacts.readonly";
const GMAIL_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE: &str = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_API_BASE: &str = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const PEOPLE_API_BASE: &str = "https://people.googleapis.com/v1/people/me/connections";

#[derive(Debug, Deserialize)]
pub struct GmailCredentials {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GmailTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GmailMessage {
    pub id: String,
    pub from: String,
    pub subject: String,
    pub snippet: String,
    pub date: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start: u64,
    pub end: u64,
    pub location: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub birthday: Option<String>,
}

fn gmail_connections_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(_) => {
            #[cfg(windows)]
            {
                std::env::var("APPDATA")
                    .map(PathBuf::from)
                    .map_err(|_| "APPDATA not set".to_string())?
                    .join("com.avatars.app")
            }
            #[cfg(not(windows))]
            return Err("app_data_dir unavailable".to_string());
        }
    };
    let dir = base
        .join("data")
        .join("connections")
        .join("enabled")
        .join("gmail");
    Ok(dir)
}

pub fn credentials_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(gmail_connections_dir(app)?.join("credentials.json"))
}

fn tokens_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(gmail_connections_dir(app)?.join("tokens.json"))
}

pub fn is_gmail_enabled(app: &AppHandle) -> bool {
    credentials_path(app)
        .map(|p| p.exists())
        .unwrap_or(false)
}

pub fn has_gmail_tokens(app: &AppHandle) -> bool {
    tokens_path(app).map(|p| p.exists()).unwrap_or(false)
}

fn load_credentials(app: &AppHandle) -> Result<GmailCredentials, String> {
    let path = credentials_path(app)?;
    let raw = fs::read_to_string(&path).map_err(|e| format!("Credentials read: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Credentials parse: {}", e))
}

fn load_tokens(app: &AppHandle) -> Result<GmailTokens, String> {
    let path = tokens_path(app)?;
    let raw = fs::read_to_string(&path).map_err(|e| format!("Tokens read: {}", e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Tokens parse: {}", e))
}

fn save_tokens(app: &AppHandle, tokens: &GmailTokens) -> Result<(), String> {
    let dir = gmail_connections_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Create dir: {}", e))?;
    let path = tokens_path(app)?;
    let raw = serde_json::to_string_pretty(tokens).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("Write tokens: {}", e))
}

fn pkce_code_verifier() -> String {
    let bytes: Vec<u8> = (0..32).map(|_| rand::random::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(&bytes)
}

fn pkce_code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    URL_SAFE_NO_PAD.encode(digest)
}

pub fn start_gmail_oauth(app: AppHandle) -> Result<(), String> {
    let creds = load_credentials(&app)?;
    let verifier = pkce_code_verifier();
    let challenge = pkce_code_challenge(&verifier);

    let redirect_port = 5174u16;
    let redirect_uri = format!("http://127.0.0.1:{}/oauth/callback", redirect_port);

    let auth_url = Url::parse_with_params(
        GMAIL_AUTH_URL,
        &[
            ("client_id", &creds.client_id),
            ("redirect_uri", &redirect_uri),
            ("response_type", &"code".to_string()),
            ("scope", &GOOGLE_SCOPES.to_string()),
            ("code_challenge", &challenge),
            ("code_challenge_method", &"S256".to_string()),
            ("access_type", &"offline".to_string()),
            ("prompt", &"consent".to_string()),
        ],
    )
    .map_err(|e| e.to_string())?;

    let auth_url_str = auth_url.to_string();

    let _code_received: Mutex<Option<String>> = Mutex::new(None);

    let server = Server::http(("127.0.0.1", redirect_port)).map_err(|e| e.to_string())?;

    let (tx, rx) = std::sync::mpsc::channel();
    let server_handle = server;
    std::thread::spawn(move || {
        if let Ok(Some(request)) = server_handle.recv_timeout(std::time::Duration::from_secs(120)) {
            let path = request.url().to_string();
            let code = Url::parse(&format!("http://localhost{}", path))
                .ok()
                .and_then(|u| {
                    u.query_pairs()
                        .find(|(k, _)| k == "code")
                        .map(|(_, v)| v.to_string())
                });
            if let Some(c) = code {
                let _ = tx.send(c);
            }
            let body = r#"<!DOCTYPE html><html><body><h1>Success!</h1><p>You can close this window.</p></body></html>"#;
            let response = Response::from_string(body).with_status_code(200);
            let _ = request.respond(response);
        }
    });

    open::that(&auth_url_str).map_err(|e| format!("Open browser: {}", e))?;

    let code = rx.recv_timeout(std::time::Duration::from_secs(120))
        .map_err(|_| "OAuth timeout: no code received")?;

    let client = reqwest::blocking::Client::new();
    let token_resp = client
        .post(GMAIL_TOKEN_URL)
        .form(&[
            ("client_id", creds.client_id.as_str()),
            ("client_secret", creds.client_secret.as_str()),
            ("code", &code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", &redirect_uri),
            ("code_verifier", &verifier),
        ])
        .send()
        .map_err(|e| format!("Token request: {}", e))?;

    let status = token_resp.status();
    let body = token_resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Token error: {}", body));
    }

    #[derive(Deserialize)]
    struct TokenResponse {
        access_token: String,
        refresh_token: Option<String>,
        expires_in: u64,
    }
    let tr: TokenResponse = serde_json::from_str(&body).map_err(|e| format!("Token parse: {}", e))?;
    let expires_at = Some(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + tr.expires_in);

    let tokens = GmailTokens {
        access_token: tr.access_token,
        refresh_token: tr.refresh_token,
        expires_in: tr.expires_in,
        expires_at,
    };
    save_tokens(&app, &tokens)?;
    Ok(())
}

fn refresh_if_needed(app: &AppHandle) -> Result<String, String> {
    let mut tokens = load_tokens(app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let expires_at = tokens.expires_at.unwrap_or(0);
    if expires_at > now && expires_at - now > 300 {
        return Ok(tokens.access_token.clone());
    }

    let creds = load_credentials(app)?;
    let refresh = tokens
        .refresh_token
        .as_ref()
        .ok_or("No refresh token")?;

    let client = reqwest::blocking::Client::new();
    let resp = client
        .post(GMAIL_TOKEN_URL)
        .form(&[
            ("client_id", creds.client_id.as_str()),
            ("client_secret", creds.client_secret.as_str()),
            ("refresh_token", refresh.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Refresh error: {}", body));
    }

    #[derive(Deserialize)]
    struct RefreshResponse {
        access_token: String,
        expires_in: u64,
    }
    let rr: RefreshResponse = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    tokens.access_token = rr.access_token.clone();
    tokens.expires_at = Some(now + rr.expires_in);
    save_tokens(app, &tokens)?;
    Ok(rr.access_token)
}

pub fn fetch_gmail_recent(app: AppHandle, limit: u32) -> Result<Vec<GmailMessage>, String> {
    let access_token = refresh_if_needed(&app)?;

    let client = reqwest::blocking::Client::new();
    let list_resp = client
        .get(&format!("{}/messages?maxResults={}", GMAIL_API_BASE, limit))
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .map_err(|e| e.to_string())?;

    if !list_resp.status().is_success() {
        let err = list_resp.text().unwrap_or_default();
        return Err(format!("Gmail list: {}", err));
    }

    #[derive(Deserialize)]
    struct MessageList {
        messages: Option<Vec<MessageRef>>,
    }
    #[derive(Deserialize)]
    struct MessageRef {
        id: String,
    }

    let list: MessageList = list_resp.json().map_err(|e| e.to_string())?;
    let refs = list.messages.unwrap_or_default();

    let mut out = Vec::new();
    for r in refs {
        let msg_url = format!(
            "{}/messages/{}?format=metadata&metadataHeaders=From&metadataHeaders=Subject",
            GMAIL_API_BASE, r.id
        );
        let msg_resp = client
            .get(&msg_url)
            .header("Authorization", format!("Bearer {}", access_token))
            .send()
            .map_err(|e| e.to_string())?;

        if !msg_resp.status().is_success() {
            continue;
        }

        #[derive(Deserialize)]
        struct MessageFull {
            id: String,
            snippet: Option<String>,
            internal_date: Option<String>,
            payload: Option<MessagePayload>,
        }
        #[derive(Deserialize)]
        struct MessagePayload {
            headers: Option<Vec<Header>>,
        }
        #[derive(Deserialize)]
        struct Header {
            name: String,
            value: String,
        }

        let msg: MessageFull = msg_resp.json().map_err(|e| e.to_string())?;
        let mut from = String::new();
        let mut subject = String::new();
        if let Some(p) = msg.payload {
            for h in p.headers.unwrap_or_default() {
                match h.name.as_str() {
                    "From" => from = h.value,
                    "Subject" => subject = h.value,
                    _ => {}
                }
            }
        }
        let date = msg
            .internal_date
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);

        out.push(GmailMessage {
            id: msg.id,
            from,
            subject,
            snippet: msg.snippet.unwrap_or_default(),
            date,
        });
    }
    Ok(out)
}

fn parse_calendar_timestamp(val: &serde_json::Value) -> u64 {
    if let Some(s) = val.get("dateTime").and_then(|v| v.as_str()) {
        if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
            return dt.with_timezone(&Utc).timestamp_millis() as u64;
        }
    }
    if let Some(s) = val.get("date").and_then(|v| v.as_str()) {
        if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
            if let Some(ndt) = d.and_hms_opt(0, 0, 0) {
                let dt = Utc.from_utc_datetime(&ndt);
                return dt.timestamp_millis() as u64;
            }
        }
    }
    0
}

pub fn fetch_calendar_upcoming(app: AppHandle, days: u32) -> Result<Vec<CalendarEvent>, String> {
    let days = days.max(1).min(365);
    let access_token = refresh_if_needed(&app)?;

    let now = Utc::now();
    let time_min = now.to_rfc3339();
    let time_max = (now + chrono::Duration::days(days as i64)).to_rfc3339();

    let url = format!(
        "{}?timeMin={}&timeMax={}&maxResults=50&singleEvents=true&orderBy=startTime",
        CALENDAR_API_BASE,
        urlencoding::encode(&time_min),
        urlencoding::encode(&time_max)
    );

    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err = resp.text().unwrap_or_default();
        return Err(format!("Calendar: {}", err));
    }

    #[derive(Deserialize)]
    struct EventsResponse {
        items: Option<Vec<CalendarEventRaw>>,
    }
    #[derive(Deserialize)]
    struct CalendarEventRaw {
        id: String,
        summary: Option<String>,
        start: serde_json::Value,
        end: serde_json::Value,
        location: Option<String>,
    }

    let body: EventsResponse = resp.json().map_err(|e| e.to_string())?;
    let items = body.items.unwrap_or_default();

    let out: Vec<CalendarEvent> = items
        .into_iter()
        .map(|e| CalendarEvent {
            id: e.id,
            title: e.summary.unwrap_or_else(|| "(No title)".to_string()),
            start: parse_calendar_timestamp(&e.start),
            end: parse_calendar_timestamp(&e.end),
            location: e.location,
        })
        .collect();

    Ok(out)
}

pub fn fetch_contacts(app: AppHandle, limit: u32) -> Result<Vec<Contact>, String> {
    let access_token = refresh_if_needed(&app)?;

    let url = format!(
        "{}?personFields=names,emailAddresses,birthdays&pageSize={}",
        PEOPLE_API_BASE,
        limit.min(100)
    );

    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err = resp.text().unwrap_or_default();
        return Err(format!("Contacts: {}", err));
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ConnectionsResponse {
        connections: Option<Vec<PersonRaw>>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PersonRaw {
        resource_name: Option<String>,
        names: Option<Vec<NameRaw>>,
        email_addresses: Option<Vec<EmailRaw>>,
        birthdays: Option<Vec<BirthdayRaw>>,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct NameRaw {
        display_name: Option<String>,
        given_name: Option<String>,
        family_name: Option<String>,
    }
    #[derive(Deserialize)]
    struct EmailRaw {
        value: Option<String>,
    }
    #[derive(Deserialize)]
    struct BirthdayRaw {
        date: Option<DateRaw>,
    }
    #[derive(Deserialize)]
    struct DateRaw {
        month: Option<u32>,
        day: Option<u32>,
        year: Option<u32>,
    }

    let body: ConnectionsResponse = resp.json().map_err(|e| e.to_string())?;
    let conns = body.connections.unwrap_or_default();

    let out: Vec<Contact> = conns
        .into_iter()
        .map(|p| {
            let id = p
                .resource_name
                .unwrap_or_default()
                .trim_start_matches("people/")
                .to_string();
            let name = p
                .names
                .and_then(|n| n.into_iter().next())
                .and_then(|n| {
                    n.display_name
                        .or_else(|| {
                            [n.given_name, n.family_name]
                                .into_iter()
                                .flatten()
                                .collect::<Vec<_>>()
                                .join(" ")
                                .into()
                        })
                })
                .unwrap_or_else(|| "(No name)".to_string());
            let email = p
                .email_addresses
                .and_then(|e| e.into_iter().next())
                .and_then(|e| e.value);
            let birthday = p.birthdays.and_then(|b| b.into_iter().next()).and_then(|b| {
                b.date.map(|d| {
                    let m = d.month.unwrap_or(0);
                    let day = d.day.unwrap_or(0);
                    match d.year {
                        Some(y) => format!("{:04}-{:02}-{:02}", y, m, day),
                        None => format!("{:02}-{:02}", m, day),
                    }
                })
            });
            Contact {
                id,
                name,
                email,
                birthday,
            }
        })
        .collect();

    Ok(out)
}

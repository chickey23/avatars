//! Read-only Wikidata API helpers (wbsearchentities + SPARQL).
//! User-Agent policy: https://wikidata.wikimedia.org/wiki/Wikidata:Data_access

use serde::Serialize;
use std::time::Duration;

const WD_USER_AGENT: &str = "Avatars/0.1 (https://github.com/; Wikidata read-only)";
const HTTP_TIMEOUT_SECS: u64 = 18;

fn blocking_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent(WD_USER_AGENT)
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WikidataSearchEntity {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
}

/// MediaWiki `wbsearchentities` (items only, English labels).
#[tauri::command]
pub fn wikidata_search_entities(query: String, limit: Option<u32>) -> Result<Vec<WikidataSearchEntity>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let lim = limit.unwrap_or(8).min(20).max(1);
    let client = blocking_client()?;
    let resp = client
        .get("https://www.wikidata.org/w/api.php")
        .query(&[
            ("action", "wbsearchentities"),
            ("format", "json"),
            ("language", "en"),
            ("type", "item"),
            ("search", q),
            ("limit", &lim.to_string()),
        ])
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("wikidata search HTTP {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    if let Some(info) = v.get("error").and_then(|e| e.get("info")).and_then(|i| i.as_str()) {
        return Err(info.to_string());
    }
    let empty: Vec<serde_json::Value> = vec![];
    let arr = v
        .get("search")
        .and_then(|s| s.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&empty);
    let mut out = Vec::new();
    for item in arr {
        let id = item
            .get("id")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if id.is_empty() || !id.starts_with('Q') {
            continue;
        }
        let label = item
            .get("label")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        let description = item
            .get("description")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        out.push(WikidataSearchEntity {
            id,
            label,
            description,
        });
    }
    Ok(out)
}

/// Wikidata Query Service read (JSON results).
#[tauri::command]
pub fn wikidata_sparql(sparql: String) -> Result<serde_json::Value, String> {
    let q = sparql.trim();
    if q.is_empty() {
        return Err("sparql_empty".to_string());
    }
    let client = blocking_client()?;
    let resp = client
        .get("https://query.wikidata.org/sparql")
        .query(&[("query", q), ("format", "json")])
        .header(reqwest::header::ACCEPT, "application/sparql-results+json")
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "wikidata sparql HTTP {}: {}",
            status,
            body.chars().take(200).collect::<String>()
        ));
    }
    serde_json::from_str(&body).map_err(|e| e.to_string())
}

//! Targeted multi-provider search: configured MediaWiki wikis → Wikipedia →
//! Tavily (optional key) → Google Custom Search JSON API (optional key + daily cap).

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::platform_cache::{read_platform_file, write_platform_file};

const CONFIG_FILE: &str = "targeted_search_config.json";
const USAGE_FILE: &str = "targeted_search_usage.json";
const HTTP_TIMEOUT_SECS: u64 = 12;
const USER_AGENT: &str = "Avatars/0.1 (personal desktop; targeted search)";
/// Aligns with Google Programmable Search free-tier ballpark; user may lower in config.
const DEFAULT_GOOGLE_DAILY_CAP: u32 = 100;
const DEFAULT_TAVILY_DAILY_CAP: u32 = 50;
const DEFAULT_MAX_RESULTS: u32 = 8;
const PER_WIKI_FETCH: u32 = 5;

// --- Tuning knobs (refine filters later) ------------------------------------

#[allow(dead_code)]
const MIN_SNIPPET_CHARS: usize = 0; // Tuning knob for later minimum snippet length

// ----------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TargetedSearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetedSearchResponse {
    pub hits: Vec<TargetedSearchHit>,
    pub providers_tried: Vec<String>,
    pub notices: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TargetedSearchConfig {
    #[serde(default)]
    wiki_bases: Vec<String>,
    #[serde(default = "default_wikipedia_lang")]
    wikipedia_lang: String,
    #[serde(default)]
    google: GoogleConfigSection,
    #[serde(default)]
    tavily: TavilyConfigSection,
}

impl Default for TargetedSearchConfig {
    fn default() -> Self {
        Self {
            wiki_bases: Vec::new(),
            wikipedia_lang: default_wikipedia_lang(),
            google: GoogleConfigSection::default(),
            tavily: TavilyConfigSection::default(),
        }
    }
}

fn default_wikipedia_lang() -> String {
    "en".to_string()
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GoogleConfigSection {
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    cx: String,
    #[serde(default = "default_google_cap")]
    daily_cap: u32,
}

impl Default for GoogleConfigSection {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            cx: String::new(),
            daily_cap: DEFAULT_GOOGLE_DAILY_CAP,
        }
    }
}

fn default_google_cap() -> u32 {
    DEFAULT_GOOGLE_DAILY_CAP
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TavilyConfigSection {
    #[serde(default)]
    api_key: String,
    #[serde(default = "default_tavily_cap")]
    daily_cap: u32,
}

impl Default for TavilyConfigSection {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            daily_cap: DEFAULT_TAVILY_DAILY_CAP,
        }
    }
}

fn default_tavily_cap() -> u32 {
    DEFAULT_TAVILY_DAILY_CAP
}

#[derive(Debug, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct TargetedSearchUsage {
    #[serde(default)]
    google: DayCount,
    #[serde(default)]
    tavily: DayCount,
}

#[derive(Debug, Deserialize, Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct DayCount {
    #[serde(default)]
    day: String,
    #[serde(default)]
    count: u32,
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

fn utc_day_string() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn load_config() -> TargetedSearchConfig {
    match read_platform_file(CONFIG_FILE) {
        Ok(Some(raw)) => serde_json::from_str(&raw).unwrap_or_default(),
        _ => TargetedSearchConfig::default(),
    }
}

fn load_usage() -> TargetedSearchUsage {
    match read_platform_file(USAGE_FILE) {
        Ok(Some(raw)) => serde_json::from_str(&raw).unwrap_or_default(),
        _ => TargetedSearchUsage::default(),
    }
}

fn save_usage(u: &TargetedSearchUsage) -> Result<(), String> {
    let s = serde_json::to_string_pretty(u).map_err(|e| e.to_string())?;
    write_platform_file(USAGE_FILE, &s)
}

fn strip_html_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&#039;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn mediawiki_api_endpoint(base: &str) -> Option<String> {
    let b = base.trim().trim_end_matches('/');
    if b.is_empty() {
        return None;
    }
    Some(if b.contains("fandom.com") {
        format!("{}/api.php", b)
    } else {
        format!("{}/w/api.php", b)
    })
}

fn wiki_article_url(wiki_base: &str, title: &str) -> String {
    let b = wiki_base.trim().trim_end_matches('/');
    let t = title.trim().replace(' ', "_");
    format!("{}/wiki/{}", b, urlencoding::encode(&t))
}

fn wikipedia_api_url(lang: &str) -> String {
    let l = lang.trim();
    let l = if l.is_empty() { "en" } else { l };
    format!("https://{}.wikipedia.org/w/api.php", l)
}

fn search_mediawiki_one(
    client: &reqwest::blocking::Client,
    wiki_base: &str,
    query: &str,
    limit: u32,
) -> Result<Vec<TargetedSearchHit>, String> {
    let api = mediawiki_api_endpoint(wiki_base).ok_or_else(|| "bad wiki base".to_string())?;
    let resp = client
        .get(&api)
        .query(&[
            ("action", "query"),
            ("list", "search"),
            ("srsearch", query),
            ("srlimit", &limit.to_string()),
            ("format", "json"),
            ("srprop", "snippet"),
        ])
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("mediawiki HTTP {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    if let Some(err) = v.get("error").and_then(|e| e.get("info")).and_then(|i| i.as_str()) {
        return Err(err.to_string());
    }
    let empty: Vec<serde_json::Value> = vec![];
    let arr = v
        .get("query")
        .and_then(|q| q.get("search"))
        .and_then(|s| s.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&empty);
    let host = wiki_base
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("wiki");
    let mut out = Vec::new();
    for item in arr {
        let title = item
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        if title.is_empty() {
            continue;
        }
        let raw_snip = item
            .get("snippet")
            .and_then(|s| s.as_str())
            .unwrap_or("");
        let snippet = strip_html_tags(raw_snip);
        if title.is_empty() {
            continue;
        }
        let url = wiki_article_url(wiki_base, &title);
        out.push(TargetedSearchHit {
            title,
            url,
            snippet,
            source: format!("mediawiki:{host}"),
        });
    }
    Ok(out)
}

fn search_tavily(
    client: &reqwest::blocking::Client,
    api_key: &str,
    query: &str,
    max: u32,
) -> Result<Vec<TargetedSearchHit>, String> {
    let body = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "search_depth": "basic",
        "max_results": max,
    });
    let resp = client
        .post("https://api.tavily.com/search")
        .json(&body)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("tavily HTTP {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let empty: Vec<serde_json::Value> = vec![];
    let arr = v
        .get("results")
        .and_then(|r| r.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&empty);
    let mut out = Vec::new();
    for item in arr {
        let title = item
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        let url = item
            .get("url")
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string();
        let snippet = item
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();
        if title.is_empty() && url.is_empty() {
            continue;
        }
        out.push(TargetedSearchHit {
            title,
            url,
            snippet,
            source: "tavily".to_string(),
        });
    }
    Ok(out)
}

fn search_google_cse(
    client: &reqwest::blocking::Client,
    api_key: &str,
    cx: &str,
    query: &str,
    max: u32,
) -> Result<Vec<TargetedSearchHit>, String> {
    let resp = client
        .get("https://www.googleapis.com/customsearch/v1")
        .query(&[
            ("key", api_key),
            ("cx", cx),
            ("q", query),
            ("num", &max.min(10).to_string()),
        ])
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let txt = resp.text().unwrap_or_default();
        return Err(format!("google CSE HTTP error: {txt}"));
    }
    let v: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let empty: Vec<serde_json::Value> = vec![];
    let arr = v
        .get("items")
        .and_then(|i| i.as_array())
        .map(|a| a.as_slice())
        .unwrap_or(&empty);
    let mut out = Vec::new();
    for item in arr {
        let title = item
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();
        let url = item
            .get("link")
            .and_then(|l| l.as_str())
            .unwrap_or("")
            .to_string();
        let snippet = item
            .get("snippet")
            .and_then(|s| s.as_str())
            .or_else(|| item.get("htmlSnippet").and_then(|s| s.as_str()))
            .unwrap_or("");
        let snippet = strip_html_tags(snippet);
        if title.is_empty() && url.is_empty() {
            continue;
        }
        out.push(TargetedSearchHit {
            title,
            url,
            snippet,
            source: "google_cse".to_string(),
        });
    }
    Ok(out)
}

/// Returns `true` when Google should be skipped (missing key or at cap); pushes notices.
fn google_precheck(
    cfg: &GoogleConfigSection,
    usage: &TargetedSearchUsage,
    notices: &mut Vec<String>,
) -> bool {
    let key = cfg.api_key.trim();
    let cx = cfg.cx.trim();
    if key.is_empty() || cx.is_empty() {
        notices.push("google_not_configured".to_string());
        return true;
    }
    let today = utc_day_string();
    let g = &usage.google;
    let count = if g.day == today { g.count } else { 0 };
    if count >= cfg.daily_cap {
        notices.push("google_daily_cap_reached".to_string());
        notices.push("add_or_rotate_provider".to_string());
        return true;
    }
    false
}

/// Returns `true` when Tavily should be skipped.
fn tavily_precheck(
    cfg: &TavilyConfigSection,
    usage: &TargetedSearchUsage,
    notices: &mut Vec<String>,
) -> bool {
    let key = cfg.api_key.trim();
    if key.is_empty() {
        return true;
    }
    let today = utc_day_string();
    let t = &usage.tavily;
    let count = if t.day == today { t.count } else { 0 };
    if count >= cfg.daily_cap {
        notices.push("tavily_daily_cap_reached".to_string());
        notices.push("add_or_rotate_provider".to_string());
        return true;
    }
    false
}

fn bump_google_usage(usage: &mut TargetedSearchUsage) {
    let today = utc_day_string();
    if usage.google.day != today {
        usage.google.day = today.clone();
        usage.google.count = 0;
    }
    usage.google.count = usage.google.count.saturating_add(1);
}

fn bump_tavily_usage(usage: &mut TargetedSearchUsage) {
    let today = utc_day_string();
    if usage.tavily.day != today {
        usage.tavily.day = today.clone();
        usage.tavily.count = 0;
    }
    usage.tavily.count = usage.tavily.count.saturating_add(1);
}

fn merge_cap_usage_for_day(usage: &mut TargetedSearchUsage) {
    let today = utc_day_string();
    if usage.google.day != today {
        usage.google.day = today.clone();
        usage.google.count = 0;
    }
    if usage.tavily.day != today {
        usage.tavily.day = today.clone();
        usage.tavily.count = 0;
    }
}

#[tauri::command]
pub fn targeted_search_query(
    query: String,
    max_results: Option<u32>,
) -> Result<TargetedSearchResponse, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(TargetedSearchResponse {
            hits: vec![],
            providers_tried: vec![],
            notices: vec!["query_empty".to_string()],
        });
    }

    let max_results = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, 20);

    let cfg = load_config();
    let mut usage = load_usage();
    merge_cap_usage_for_day(&mut usage);

    let client = http_client()?;
    let mut hits: Vec<TargetedSearchHit> = Vec::new();
    let mut providers_tried: Vec<String> = Vec::new();
    let mut notices: Vec<String> = Vec::new();

    // 1) Configured MediaWiki wikis
    for base in &cfg.wiki_bases {
        if hits.len() as u32 >= max_results {
            break;
        }
        let base = base.trim();
        if base.is_empty() {
            continue;
        }
        let label = format!("mediawiki:{base}");
        providers_tried.push(label.clone());
        let need = max_results.saturating_sub(hits.len() as u32).min(PER_WIKI_FETCH);
        match search_mediawiki_one(&client, base, q, need) {
            Ok(mut v) => hits.append(&mut v),
            Err(e) => notices.push(format!("mediawiki_error:{base}:{e}")),
        }
    }

    // 2) Wikipedia
    if (hits.len() as u32) < max_results {
        let wp_api = wikipedia_api_url(&cfg.wikipedia_lang);
        let wp_base = wp_api
            .trim_end_matches("/w/api.php")
            .to_string();
        providers_tried.push(format!("wikipedia:{}", cfg.wikipedia_lang));
        let need = max_results.saturating_sub(hits.len() as u32).min(PER_WIKI_FETCH);
        match search_mediawiki_one(&client, &wp_base, q, need) {
            Ok(mut v) => hits.append(&mut v),
            Err(e) => notices.push(format!("wikipedia_error:{e}")),
        }
    }

    // 3) Tavily (optional key + cap)
    if (hits.len() as u32) < max_results {
        if !tavily_precheck(&cfg.tavily, &usage, &mut notices) {
            providers_tried.push("tavily".into());
            let need = max_results.saturating_sub(hits.len() as u32);
            match search_tavily(
                &client,
                cfg.tavily.api_key.trim(),
                q,
                need.min(10),
            ) {
                Ok(mut v) => {
                    bump_tavily_usage(&mut usage);
                    hits.append(&mut v);
                }
                Err(e) => notices.push(format!("tavily_error:{e}")),
            }
        }
    }

    // 4) Google CSE
    if (hits.len() as u32) < max_results {
        if !google_precheck(&cfg.google, &usage, &mut notices) {
            providers_tried.push("google_cse".into());
            let need = max_results.saturating_sub(hits.len() as u32);
            match search_google_cse(
                &client,
                cfg.google.api_key.trim(),
                cfg.google.cx.trim(),
                q,
                need,
            ) {
                Ok(mut v) => {
                    bump_google_usage(&mut usage);
                    hits.append(&mut v);
                }
                Err(e) => notices.push(format!("google_cse_error:{e}")),
            }
        }
    }

    // Trim to max_results
    hits.truncate(max_results as usize);

    if hits.is_empty() {
        notices.push("no_hits_try_different_query_or_provider".to_string());
    }

    save_usage(&usage)?;

    Ok(TargetedSearchResponse {
        hits,
        providers_tried,
        notices,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn google_precheck_missing_key() {
        let mut notices = vec![];
        let cfg = GoogleConfigSection::default();
        let usage = TargetedSearchUsage::default();
        assert!(google_precheck(&cfg, &usage, &mut notices));
        assert!(notices.contains(&"google_not_configured".into()));
    }

    #[test]
    fn google_precheck_at_cap() {
        let mut notices = vec![];
        let cfg = GoogleConfigSection {
            api_key: "k".into(),
            cx: "cx".into(),
            daily_cap: 2,
        };
        let today = utc_day_string();
        let usage = TargetedSearchUsage {
            google: DayCount {
                day: today.clone(),
                count: 2,
            },
            tavily: DayCount::default(),
        };
        assert!(google_precheck(&cfg, &usage, &mut notices));
        assert!(notices.iter().any(|n| n == "google_daily_cap_reached"));
    }

    #[test]
    fn bump_google_resets_new_day() {
        let mut usage = TargetedSearchUsage {
            google: DayCount {
                day: "1999-01-01".into(),
                count: 99,
            },
            tavily: DayCount::default(),
        };
        bump_google_usage(&mut usage);
        assert_eq!(usage.google.count, 1);
        assert_eq!(usage.google.day, utc_day_string());
    }

    #[test]
    fn strip_html_basic() {
        assert_eq!(
            strip_html_tags("a<span>b</span>c"),
            "abc"
        );
    }
}

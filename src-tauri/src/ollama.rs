use std::time::Duration;

const OLLAMA_TAGS: &str = "http://127.0.0.1:11434/api/tags";
const OLLAMA_GENERATE: &str = "http://127.0.0.1:11434/api/generate";
const OLLAMA_EMBED: &str = "http://127.0.0.1:11434/api/embed";
const OLLAMA_EMBEDDINGS_LEGACY: &str = "http://127.0.0.1:11434/api/embeddings";
const DEFAULT_EMBED_MODEL: &str = "nomic-embed-text";

fn http_client_short() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .ok()
}

fn http_client_long() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .ok()
}

/// Successful `GET /api/tags` parse; empty vec means Ollama is up but has no models. `None` if unreachable or bad payload.
async fn fetch_model_names_ok(client: &reqwest::Client) -> Option<Vec<String>> {
    let resp = client.get(OLLAMA_TAGS).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let json = resp.json::<serde_json::Value>().await.ok()?;
    Some(
        json.get("models")
            .and_then(|m| m.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    )
}

/// Parses `GET /api/tags` JSON and returns model names (e.g. `llama3.2:latest`).
async fn model_names_from_tags(client: &reqwest::Client) -> Vec<String> {
    fetch_model_names_ok(client).await.unwrap_or_default()
}

/// Tri-state: `no_server` (unreachable / bad response), `no_models` (Ollama up, zero models), `ready` (≥1 model).
#[tauri::command]
pub async fn ollama_presence() -> String {
    let Some(client) = http_client_short() else {
        return "no_server".to_string();
    };
    match fetch_model_names_ok(&client).await {
        None => "no_server".to_string(),
        Some(names) if names.is_empty() => "no_models".to_string(),
        Some(_) => "ready".to_string(),
    }
}

#[tauri::command]
pub async fn ollama_reachable() -> bool {
    ollama_presence().await == "ready"
}

#[tauri::command]
pub async fn ollama_list_models() -> Vec<String> {
    let Some(client) = http_client_short() else {
        return vec![];
    };
    model_names_from_tags(&client).await
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaGenPayload {
    pub model: Option<String>,
    pub prompt: String,
}

#[tauri::command]
pub async fn ollama_generate(payload: OllamaGenPayload) -> Result<String, String> {
    let Some(client) = http_client_long() else {
        return Err("HTTP client unavailable".to_string());
    };
    let model_name = match payload.model {
        Some(ref m) if !m.trim().is_empty() => m.trim().to_string(),
        _ => {
            let names = model_names_from_tags(&client).await;
            if names.is_empty() {
                eprintln!("[ollama] ollama_generate: no models pulled; run `ollama pull <model>`");
                return Err("no models pulled (run `ollama pull <model>`)".to_string());
            }
            names[0].clone()
        }
    };

    let body = serde_json::json!({
        "model": model_name,
        "prompt": payload.prompt,
        "stream": false,
    });

    let resp = client
        .post(OLLAMA_GENERATE)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        eprintln!("[ollama] generate HTTP {}: {}", status, text);
        let tail: String = text.chars().take(180).collect();
        return Err(format!("HTTP {}: {}", status.as_u16(), tail));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("invalid JSON: {}", e))?;
    let Some(response) = json.get("response").and_then(|v| v.as_str()) else {
        return Err("missing response field".to_string());
    };
    let trimmed = response.trim();
    if trimmed.is_empty() {
        return Err("empty response".to_string());
    }
    Ok(trimmed.to_string())
}

fn parse_embedding_json(json: &serde_json::Value) -> Option<Vec<f64>> {
    if let Some(arr) = json.get("embedding").and_then(|v| v.as_array()) {
        let v: Vec<f64> = arr.iter().filter_map(|x| x.as_f64()).collect();
        return if v.is_empty() { None } else { Some(v) };
    }
    if let Some(outer) = json.get("embeddings").and_then(|v| v.as_array()) {
        if let Some(inner) = outer.first().and_then(|v| v.as_array()) {
            let v: Vec<f64> = inner.iter().filter_map(|x| x.as_f64()).collect();
            return if v.is_empty() { None } else { Some(v) };
        }
    }
    None
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaEmbedPayload {
    pub model: String,
    pub input: String,
}

#[tauri::command]
pub async fn ollama_embed(payload: OllamaEmbedPayload) -> Result<Vec<f64>, String> {
    let Some(client) = http_client_long() else {
        return Err("HTTP client unavailable".to_string());
    };
    let model_name = payload.model.trim();
    let model_name = if model_name.is_empty() {
        DEFAULT_EMBED_MODEL.to_string()
    } else {
        model_name.to_string()
    };
    let input = payload.input.trim().to_string();
    if input.is_empty() {
        return Err("empty input".to_string());
    }

    let body_embed = serde_json::json!({
        "model": model_name,
        "input": input,
        "truncate": true,
    });
    let resp = client
        .post(OLLAMA_EMBED)
        .header("Content-Type", "application/json")
        .json(&body_embed)
        .send()
        .await
        .map_err(|e| format!("embed request failed: {}", e))?;

    let json: serde_json::Value = if resp.status().is_success() {
        resp.json().await.map_err(|e| format!("invalid JSON: {}", e))?
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if status.as_u16() == 404 {
            let body_legacy = serde_json::json!({
                "model": model_name,
                "prompt": input,
            });
            let resp2 = client
                .post(OLLAMA_EMBEDDINGS_LEGACY)
                .header("Content-Type", "application/json")
                .json(&body_legacy)
                .send()
                .await
                .map_err(|e| format!("embeddings request failed: {}", e))?;
            if !resp2.status().is_success() {
                let status = resp2.status();
                let t = resp2.text().await.unwrap_or_default();
                let tail: String = t.chars().take(180).collect();
                return Err(format!("HTTP {}: {}", status.as_u16(), tail));
            }
            resp2
                .json()
                .await
                .map_err(|e| format!("invalid JSON: {}", e))?
        } else {
            let tail: String = text.chars().take(180).collect();
            return Err(format!("HTTP {}: {}", status.as_u16(), tail));
        }
    };

    parse_embedding_json(&json).ok_or_else(|| "missing embedding field".to_string())
}

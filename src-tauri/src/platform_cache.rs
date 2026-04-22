//! Platform durable cache (source snapshots, project store, drafts) under the app data tree.
//! Invoked from `src/services/platform/` via Tauri. Writes use a `.tmp` sibling then
//! `rename` so readers never observe a truncated file.

use std::fs;
use std::path::{Path, PathBuf};

/// Hardcoded filename allowlist — prevents path traversal via the `source` argument.
const ALLOWED_FILENAMES: &[&str] = &[
    "source_cache.email.json",
    "source_cache.calendar.json",
    "source_cache.contacts.json",
    "platform_store.json",
    "platform_drafts.json",
];

fn platform_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("no local data directory (dirs::data_local_dir)")?;
    let dir = base.join("avatars").join("data").join("platform");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn resolve_path(filename: &str) -> Result<PathBuf, String> {
    if !ALLOWED_FILENAMES.contains(&filename) {
        return Err(format!("platform_cache: filename not allowed: {filename}"));
    }
    Ok(platform_data_dir()?.join(filename))
}

fn atomic_write(path: &Path, payload: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, payload).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Returns file contents when present, `None` when the file does not exist.
#[tauri::command]
pub fn platform_cache_read(filename: String) -> Result<Option<String>, String> {
    let path = resolve_path(&filename)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

/// Atomic replace-write. Caller supplies a fully-formed JSON payload.
#[tauri::command]
pub fn platform_cache_write(filename: String, payload: String) -> Result<(), String> {
    let path = resolve_path(&filename)?;
    atomic_write(&path, &payload)
}

/// Directory for user diagnostics ("where are my caches?"). Best-effort string.
#[tauri::command]
pub fn platform_cache_dir_display() -> Result<String, String> {
    Ok(platform_data_dir()?.display().to_string())
}

//! Shared world metadata JSON under `%LOCALAPPDATA%/avatars/data/metadata/world_metadata.json` (see SPEC § Shared Metadata).

use std::fs;
use std::path::PathBuf;

fn metadata_file_path() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("no local data directory (dirs::data_local_dir)")?;
    let dir = base.join("avatars").join("data").join("metadata");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("world_metadata.json"))
}

/// Returns file contents if the file exists, else `None`.
#[tauri::command]
pub fn world_metadata_read() -> Result<Option<String>, String> {
    let path = metadata_file_path()?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn world_metadata_write(payload: String) -> Result<(), String> {
    let path = metadata_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, payload).map_err(|e| e.to_string())
}

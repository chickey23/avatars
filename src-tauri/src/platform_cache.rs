//! Tauri commands for platform durable cache; I/O lives in `avatars-platform-storage`.

use avatars_platform_storage::{
    platform_data_dir, read_platform_file, write_platform_file,
};

/// Returns file contents when present, `None` when the file does not exist.
#[tauri::command]
pub fn platform_cache_read(filename: String) -> Result<Option<String>, String> {
    read_platform_file(&filename)
}

/// Atomic replace-write. Caller supplies a fully-formed JSON payload.
#[tauri::command]
pub fn platform_cache_write(filename: String, payload: String) -> Result<(), String> {
    write_platform_file(&filename, &payload)
}

/// Directory for user diagnostics ("where are my caches?"). Best-effort string.
#[tauri::command]
pub fn platform_cache_dir_display() -> Result<String, String> {
    Ok(platform_data_dir()?.display().to_string())
}

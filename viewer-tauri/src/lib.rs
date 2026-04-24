use std::fs;
use std::path::PathBuf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            platform_cache_read,
            platform_cache_dir_display,
            world_metadata_read,
            world_metadata_dir_display,
        ])
        .run(tauri::generate_context!())
        .expect("error while running avatars companion");
}

#[tauri::command]
fn platform_cache_read(filename: String) -> Result<Option<String>, String> {
    avatars_platform_storage::read_platform_file(&filename)
}

#[tauri::command]
fn platform_cache_dir_display() -> Result<String, String> {
    Ok(avatars_platform_storage::platform_data_dir()?.display().to_string())
}

/// Same path as main app `world_metadata_read` (read-only here).
#[tauri::command]
fn world_metadata_read() -> Result<Option<String>, String> {
    let path = world_metadata_path()?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn world_metadata_dir_display() -> Result<String, String> {
    Ok(world_metadata_path()?
        .parent()
        .ok_or("world_metadata path has no parent")?
        .display()
        .to_string())
}

fn world_metadata_path() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("no local data directory (dirs::data_local_dir)")?;
    let dir = base.join("avatars").join("data").join("metadata");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("world_metadata.json"))
}

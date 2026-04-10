//! Open URLs and paths in default applications.

#[tauri::command]
pub fn open_external(path_or_url: String) -> Result<(), String> {
    open::that(&path_or_url).map_err(|e| format!("Open failed: {}", e))
}

#[tauri::command]
pub fn get_user_paths() -> Result<UserPaths, String> {
    #[cfg(windows)]
    {
        let userprofile = std::env::var("USERPROFILE")
            .map_err(|_| "USERPROFILE not set")?;
        let onedrive_pictures = format!("{}\\OneDrive\\Pictures\\Screenshots", userprofile);
        Ok(UserPaths {
            downloads: format!("{}\\Downloads", userprofile),
            screenshots: onedrive_pictures,
        })
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var("HOME").map_err(|_| "HOME not set")?;
        Ok(UserPaths {
            downloads: format!("{}/Downloads", home),
            screenshots: format!("{}/Pictures/Screenshots", home),
        })
    }
}

#[derive(serde::Serialize)]
pub struct UserPaths {
    pub downloads: String,
    pub screenshots: String,
}

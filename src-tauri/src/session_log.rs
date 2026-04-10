//! Session logs on disk under the local data directory (see `session_logs_dir`).
//! At most 100 `*.log` files in the folder; when a new session would exceed that,
//! all existing logs are zipped into `archives/session_logs_<timestamp>.zip` and removed.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Utc;
use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

const MAX_LOG_FILES: usize = 100;

fn session_logs_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir().ok_or("no local data directory (dirs::data_local_dir)")?;
    Ok(base.join("avatars").join("session_logs"))
}

static CURRENT_LOG: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLogBeginResult {
    pub archived: bool,
    pub archive_note: Option<String>,
    pub current_file: String,
    pub log_dir: String,
    pub already_started: bool,
}

fn list_log_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .map(|x| x.eq_ignore_ascii_case("log"))
                .unwrap_or(false)
        })
        .collect();
    files.sort();
    Ok(files)
}

fn zip_log_files(files: &[PathBuf], zip_path: &Path) -> Result<(), String> {
    let file = fs::File::create(zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let opts = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for (i, path) in files.iter().enumerate() {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown.log");
        let inner = format!("{:03}_{}", i, name);
        let data = fs::read(path).map_err(|e| format!("read {}: {}", path.display(), e))?;
        zip.start_file(inner, opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(&data).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Start a new session log file. If ≥100 `.log` files exist, archives them all to a zip and clears them first.
#[tauri::command]
pub fn session_log_begin_session() -> Result<SessionLogBeginResult, String> {
    {
        let guard = CURRENT_LOG.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            let dir = session_logs_dir()?;
            return Ok(SessionLogBeginResult {
                archived: false,
                archive_note: None,
                current_file: "(unchanged)".to_string(),
                log_dir: dir.to_string_lossy().into_owned(),
                already_started: true,
            });
        }
    }

    let base = session_logs_dir()?;
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let archives = base.join("archives");
    fs::create_dir_all(&archives).map_err(|e| e.to_string())?;

    let mut files = list_log_files(&base)?;
    let mut archived = false;
    let mut archive_note = None;

    if files.len() >= MAX_LOG_FILES {
        let ts = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
        let zip_path = archives.join(format!("session_logs_{}.zip", ts));
        zip_log_files(&files, &zip_path)?;
        let n = files.len();
        for p in &files {
            let _ = fs::remove_file(p);
        }
        archived = true;
        archive_note = Some(format!(
            "Archived {} session log file(s) to {}",
            n,
            zip_path.display()
        ));
        files.clear();
    }

    let fname = format!("session_{}.log", Utc::now().timestamp_millis());
    let path = base.join(&fname);
    fs::File::create(&path).map_err(|e| e.to_string())?;

    {
        let mut guard = CURRENT_LOG.lock().map_err(|e| e.to_string())?;
        *guard = Some(path);
    }

    Ok(SessionLogBeginResult {
        archived,
        archive_note,
        current_file: fname,
        log_dir: base.to_string_lossy().into_owned(),
        already_started: false,
    })
}

#[tauri::command]
pub fn session_log_append(line: String) -> Result<(), String> {
    let path = CURRENT_LOG
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "session log not started; call session_log_begin_session first".to_string())?;

    let mut f = OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", line).map_err(|e| e.to_string())?;
    Ok(())
}

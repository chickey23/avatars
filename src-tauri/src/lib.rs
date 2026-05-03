mod platform_cache;
mod targeted_search;
mod wikidata;
mod gmail;
mod ollama;
mod session_log;
mod shell;
mod world_metadata;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            shell::open_external,
            shell::get_user_paths,
            gmail::commands::gmail_credentials_path_display,
            gmail::commands::gmail_credentials_path,
            gmail::commands::is_gmail_enabled,
            gmail::commands::has_gmail_tokens,
            gmail::commands::start_gmail_oauth,
            gmail::commands::fetch_gmail_recent,
            gmail::commands::gmail_fetch_message_body,
            gmail::commands::fetch_calendar_upcoming,
            gmail::commands::fetch_contacts,
            ollama::ollama_presence,
            ollama::ollama_reachable,
            ollama::ollama_list_models,
            ollama::ollama_generate,
            ollama::ollama_embed,
            session_log::session_log_begin_session,
            session_log::session_log_append,
            world_metadata::world_metadata_read,
            world_metadata::world_metadata_write,
            platform_cache::platform_cache_read,
            platform_cache::platform_cache_write,
            platform_cache::platform_cache_dir_display,
            targeted_search::targeted_search_query,
            targeted_search::wiki_extract_batch,
            wikidata::wikidata_search_entities,
            wikidata::wikidata_sparql,
        ])
        .run(tauri::generate_context!())
        .expect("error while running avatars application");
}

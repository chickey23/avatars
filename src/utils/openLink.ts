/**
 * Open a URL in the browser or a local path in the file explorer.
 * In Tauri: uses open_external command.
 * In browser: window.open for URLs; local paths are not supported.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export async function openLink(urlOrPath: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { pathOrUrl: urlOrPath });
  } else {
    // Browser: only URLs work
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      window.open(urlOrPath, "_blank", "noopener,noreferrer");
    }
  }
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  PLATFORM_CACHE_FILES,
  PLATFORM_DRAFTS_FILE,
  PLATFORM_STORE_FILE,
  TARGETED_SEARCH_CONFIG_FILE,
  TARGETED_SEARCH_USAGE_FILE,
} from "../services/platform/constants";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

const PLATFORM_FILE_OPTIONS: { label: string; value: string }[] = [
  ...Object.entries(PLATFORM_CACHE_FILES).map(([key, value]) => ({
    label: `Source cache: ${key}`,
    value,
  })),
  { label: "Project / task store", value: PLATFORM_STORE_FILE },
  { label: "Drafts", value: PLATFORM_DRAFTS_FILE },
  { label: "Targeted search config", value: TARGETED_SEARCH_CONFIG_FILE },
  { label: "Targeted search usage", value: TARGETED_SEARCH_USAGE_FILE },
];

export function RawPlatformJsonPanel() {
  if (!isTauri()) {
    return (
      <div className="companion-gate">
        <p>
          <strong>Raw file reads use Tauri.</strong> Open the Companion with{" "}
          <code className="companion-code">npm run tauri:dev:viewer</code> to inspect allowlisted
          platform JSON.
        </p>
      </div>
    );
  }
  return <RawPlatformJsonPanelInner />;
}

function RawPlatformJsonPanelInner() {
  const defaultFile = useMemo(
    () => PLATFORM_FILE_OPTIONS[0]?.value ?? PLATFORM_STORE_FILE,
    []
  );
  const [platformDir, setPlatformDir] = useState<string>("");
  const [filename, setFilename] = useState(defaultFile);
  const [body, setBody] = useState<string>("");
  const [error, setError] = useState<string>("");

  const refreshDir = useCallback(async () => {
    try {
      const dir = await invoke<string>("platform_cache_dir_display");
      setPlatformDir(dir);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const loadFile = useCallback(async (name: string) => {
    setError("");
    setBody("");
    try {
      const raw = await invoke<string | null>("platform_cache_read", { filename: name });
      if (raw == null || raw === "") {
        setBody(raw === null ? "(file missing or empty)" : "");
        return;
      }
      try {
        setBody(JSON.stringify(JSON.parse(raw), null, 2));
      } catch {
        setBody(raw);
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refreshDir();
  }, [refreshDir]);

  useEffect(() => {
    void loadFile(filename);
  }, [filename, loadFile]);

  return (
    <div>
      <p className="companion-p">
        Read-only allowlisted files under the platform data directory. Same files as
        the main app’s on-disk store.
      </p>
      <p className="viewer-path" title="Platform JSON directory">
        {platformDir || "…"}
      </p>
      <div className="viewer-toolbar">
        <label htmlFor="companion-raw-file">File</label>
        <select
          id="companion-raw-file"
          value={filename}
          onChange={(e) => {
            setFilename(e.target.value);
          }}
        >
          {PLATFORM_FILE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void refreshDir()}>
          Refresh path
        </button>
        <button type="button" onClick={() => void loadFile(filename)}>
          Reload file
        </button>
      </div>
      {error ? <p className="viewer-error">{error}</p> : null}
      <pre className="viewer-pre">{body}</pre>
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import {
  clearSessionLog,
  formatSessionLogLine,
  getSessionLogSnapshot,
  subscribeSessionLog,
} from "../services/sessionLog";

type Props = {
  onClose: () => void;
  /** Windows: `%LOCALAPPDATA%\\avatars\\session_logs` */
  diskLogDir?: string | null;
};

export function SessionLogPanel({ onClose, diskLogDir }: Props) {
  const [, bump] = useState(0);
  useEffect(() => subscribeSessionLog(() => bump((n) => n + 1)), []);

  const snapshot = getSessionLogSnapshot();
  const text = snapshot.map(formatSessionLogLine).join("\n");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).catch(console.error);
  }, [text]);

  const handleClear = useCallback(() => {
    clearSessionLog();
  }, []);

  return (
    <div
      className="session-log-overlay"
      role="dialog"
      aria-labelledby="session-log-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="session-log-modal" onClick={(e) => e.stopPropagation()}>
        <div className="session-log-header">
          <h2 id="session-log-title">Session log</h2>
          <p className="session-log-sub">
            In-memory buffer (below) mirrors disk in Tauri. Disk folder (persistent session files,
            max 100 then zip archive + alert):{" "}
            {diskLogDir ? (
              <code className="session-log-path">{diskLogDir}</code>
            ) : (
              <span className="session-log-path-muted">initializing or browser build…</span>
            )}
          </p>
          <button
            type="button"
            className="session-log-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="session-log-actions">
          <button type="button" className="session-log-btn" onClick={handleCopy}>
            Copy all
          </button>
          <button type="button" className="session-log-btn session-log-btn-muted" onClick={handleClear}>
            Clear
          </button>
        </div>
        <pre className="session-log-body" aria-live="polite">
          {text || "(empty — use the app; Ollama/Gmail actions will appear here.)"}
        </pre>
      </div>
    </div>
  );
}

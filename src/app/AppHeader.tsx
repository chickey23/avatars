import { AGENT_CAPABILITIES } from "../data/agentCapabilities";
import { useAppContentView } from "./appContentViewContext";

export function AppHeader() {
  const m = useAppContentView();
  return (
    <header className="header">
      <div className="header-left">
        <h1>Avatars</h1>
        <p className="subtitle">
          Local-first avatars with grounded Gmail, calendar, contacts, and world
          memory.
        </p>
        <ul
          className="header-capabilities"
          aria-label="Agent capabilities"
        >
          {AGENT_CAPABILITIES.map((c) => (
            <li key={c.label} title={c.detail}>
              {c.label}
            </li>
          ))}
        </ul>
        <div className="env-indicator" title="Runtime environment">
          <span className={`env-tag ${m.envTauri ? "env-ok" : "env-warn"}`}>
            Tauri: {m.envTauri ? "✓" : "✗"}
          </span>
          <button
            type="button"
            className={`env-tag env-tag-btn ollama-env ${
              m.ollamaPresence === "checking"
                ? "env-warn"
                : m.ollamaPresence === "ready"
                  ? "env-ok"
                  : m.ollamaPresence === "no_models"
                    ? "env-warn"
                    : "env-error"
            }`}
            onClick={() => void m.refreshOllama()}
            title={
              m.ollamaPresence === "checking"
                ? "Checking Ollama (127.0.0.1:11434)…"
                : m.ollamaPresence === "ready"
                  ? `Ollama ready (127.0.0.1:11434). Models: ${m.ollamaModels.slice(0, 6).join(", ")}${m.ollamaModels.length > 6 ? "…" : ""}${
                      m.ollamaLastCheckedAt
                        ? `\nLast checked: ${new Date(m.ollamaLastCheckedAt).toLocaleTimeString()}`
                        : ""
                    }\nClick to refresh`
                  : m.ollamaPresence === "no_models"
                    ? `Ollama is running but no models are installed. Run: ollama pull <name>${
                        m.ollamaLastCheckedAt
                          ? `\nLast checked: ${new Date(m.ollamaLastCheckedAt).toLocaleTimeString()}`
                          : ""
                      }\nClick to refresh`
                    : `Cannot reach Ollama at 127.0.0.1:11434 (server not running or unreachable).${
                        m.ollamaLastCheckedAt
                          ? `\nLast checked: ${new Date(m.ollamaLastCheckedAt).toLocaleTimeString()}`
                          : ""
                      }\nClick to refresh`
            }
          >
            Ollama:{" "}
            {m.ollamaPresence === "checking"
              ? "…"
              : m.ollamaPresence === "ready"
                ? "✓"
                : m.ollamaPresence === "no_models"
                  ? "!"
                  : "✗"}
          </button>
          <button
            type="button"
            className="env-tag env-tag-btn session-log-open-btn"
            onClick={() => m.setSessionLogOpen(true)}
            title="Session log — connectivity, Ollama/Tauri, chat pipeline (this session)"
          >
            Log
          </button>
        </div>
      </div>
    </header>
  );
}

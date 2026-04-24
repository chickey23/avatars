import { useCallback, useState } from "react";
import { CompanionLibrary } from "./CompanionLibrary";
import { CompanionLocalData } from "./CompanionLocalData";
import { RawPlatformJsonPanel } from "./RawPlatformJsonPanel";

type CompanionTab = "library" | "data" | "raw";

export function ViewerApp() {
  const [tab, setTab] = useState<CompanionTab>("library");

  const onRestart = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div className="companion-app">
      <header className="companion-header">
        <div className="companion-header-top">
          <h1 className="companion-title">Companion App</h1>
          <button
            type="button"
            className="companion-restart"
            onClick={onRestart}
            title="Reload the app (re-read disk data on next load)"
          >
            Restart
          </button>
        </div>
        <p className="companion-sub">
          Offline library and read-only local data. This is not the main Avatars window — open Avatars
          for chat, workshops, and editing.
        </p>
        <nav className="companion-tabs" aria-label="Companion sections">
          <button
            type="button"
            className={tab === "library" ? "companion-tab companion-tab--active" : "companion-tab"}
            onClick={() => setTab("library")}
          >
            Library
          </button>
          <button
            type="button"
            className={tab === "data" ? "companion-tab companion-tab--active" : "companion-tab"}
            onClick={() => setTab("data")}
          >
            My data
          </button>
          <button
            type="button"
            className={tab === "raw" ? "companion-tab companion-tab--active" : "companion-tab"}
            onClick={() => setTab("raw")}
          >
            Raw files
          </button>
        </nav>
      </header>

      <main className="companion-main">
        {tab === "library" ? <CompanionLibrary /> : null}
        {tab === "data" ? <CompanionLocalData /> : null}
        {tab === "raw" ? <RawPlatformJsonPanel /> : null}
      </main>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { migrateWorldMetadataDoc } from "../services/worldMetadata/backend";
import type { WorldMetadataDoc } from "../services/worldMetadata/types";
import { PLATFORM_STORE_FILE } from "../services/platform/constants";
import { parsePlatformStoreJson } from "./parseLocalData";
import type { PlatformStoreDoc } from "../services/platform/store";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export function CompanionLocalData() {
  const [error, setError] = useState<string>("");
  const [platformDir, setPlatformDir] = useState<string>("");
  const [metadataDir, setMetadataDir] = useState<string>("");
  const [worldMeta, setWorldMeta] = useState<WorldMetadataDoc | null>(null);
  const [platformStore, setPlatformStore] = useState<PlatformStoreDoc | null>(null);
  const [rawWorldMeta, setRawWorldMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isTauri()) return;
    setLoading(true);
    setError("");
    try {
      const pDir = await invoke<string>("platform_cache_dir_display");
      setPlatformDir(pDir);
      const mDir = await invoke<string>("world_metadata_dir_display");
      setMetadataDir(mDir);
      const wm = await invoke<string | null>("world_metadata_read");
      setRawWorldMeta(wm);
      if (wm?.trim()) {
        setWorldMeta(migrateWorldMetadataDoc(JSON.parse(wm)));
      } else {
        setWorldMeta(null);
      }
      const ps = await invoke<string | null>("platform_cache_read", {
        filename: PLATFORM_STORE_FILE,
      });
      if (ps?.trim()) {
        setPlatformStore(parsePlatformStoreJson(ps));
      } else {
        setPlatformStore(null);
      }
    } catch (e) {
      setError(String(e));
      setWorldMeta(null);
      setPlatformStore(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTauri()) void load();
  }, [load]);

  if (!isTauri()) {
    return (
      <div className="companion-gate">
        <p>
          <strong>Local data is only available in the desktop Companion build.</strong>
        </p>
        <p className="companion-dim">
          Run <code className="companion-code">npm run tauri:dev:viewer</code> to open the Companion App with Tauri, then
          return to <strong>My data</strong> to read <code className="companion-code">world_metadata.json</code> and
          the platform store from disk (same locations as the main Avatars app).
        </p>
      </div>
    );
  }

  return (
    <div className="companion-local">
      {loading ? <p className="companion-dim">Loading…</p> : null}
      {error ? <p className="viewer-error">{error}</p> : null}
      <div className="companion-path-block">
        <h2 className="companion-h2">Platform directory</h2>
        <p className="viewer-path" title="Platform JSON">
          {platformDir || "…"}
        </p>
        <h2 className="companion-h2">Metadata directory</h2>
        <p className="viewer-path" title="World metadata">
          {metadataDir || "…"}
        </p>
        <button type="button" className="companion-btn" onClick={() => void load()}>
          Reload
        </button>
      </div>

      <section className="companion-section" aria-labelledby="wm-head">
        <h2 id="wm-head" className="companion-h2">
          World metadata
        </h2>
        {rawWorldMeta == null || !rawWorldMeta.trim() ? (
          <p className="companion-dim">No <code className="companion-code">world_metadata.json</code> on disk yet, or file is empty.</p>
        ) : worldMeta ? (
          <>
            <h3 className="companion-h3">User profile</h3>
            <ul className="companion-kv">
              <li>
                <span>Display name</span> {worldMeta.userProfile.displayName ?? "—"}
              </li>
              <li>
                <span>Pronouns</span> {worldMeta.userProfile.pronouns ?? "—"}
              </li>
              <li>
                <span>Notes</span> {worldMeta.userProfile.notes?.trim() ? worldMeta.userProfile.notes : "—"}
              </li>
            </ul>
            <h3 className="companion-h3">Projects ({Object.keys(worldMeta.projects).length})</h3>
            <ul className="companion-list">
              {Object.entries(worldMeta.projects).map(([id, p]) => (
                <li key={id}>
                  <code className="companion-code">{id}</code> — <strong>{p.title}</strong>
                  {p.summary ? <div className="companion-dim companion-wrap">{p.summary}</div> : null}
                </li>
              ))}
            </ul>
            <h3 className="companion-h3">People ({Object.keys(worldMeta.people).length})</h3>
            <ul className="companion-list">
              {Object.entries(worldMeta.people).map(([id, p]) => (
                <li key={id}>
                  <code className="companion-code">{id}</code>
                  {p.userTags?.length ? (
                    <div className="companion-dim">Tags: {p.userTags.join(", ")}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="viewer-error">Could not parse world metadata.</p>
        )}
      </section>

      <section className="companion-section" aria-labelledby="ps-head">
        <h2 id="ps-head" className="companion-h2">
          Platform project / task store
        </h2>
        {platformStore ? (
          <>
            <p className="companion-dim">
              Schema v{String(platformStore.schemaVersion)} — {Object.keys(platformStore.projects).length} project(s),{" "}
              {Object.keys(platformStore.tasks).length} task(s)
            </p>
            <h3 className="companion-h3">Projects</h3>
            <ul className="companion-list">
              {Object.values(platformStore.projects).map((p) => (
                <li key={p.id}>
                  <strong>{p.title}</strong> <code className="companion-code">({p.id})</code>
                  <span className="companion-dim"> — {p.status}</span>
                  {p.ownerAvatarId ? (
                    <div className="companion-dim">Owner avatar: {p.ownerAvatarId}</div>
                  ) : null}
                </li>
              ))}
            </ul>
            <h3 className="companion-h3">Tasks (summary)</h3>
            <ul className="companion-list">
              {Object.values(platformStore.tasks).map((t) => (
                <li key={t.id}>
                  {t.title} <code className="companion-code">({t.id})</code>
                  <span className="companion-dim"> — {t.status}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="companion-dim">No or invalid {PLATFORM_STORE_FILE}.</p>
        )}
      </section>
    </div>
  );
}

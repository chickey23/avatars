import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { migrateWorldMetadataDoc } from "../services/worldMetadata/backend";
import type {
  KnowledgeDiscoveryRunRecord,
  KnowledgeSetMemberCandidateRecord,
  KnowledgeSetRecord,
  WorldMetadataDoc,
} from "../services/worldMetadata/types";
import { PLATFORM_STORE_FILE } from "../services/platform/constants";
import { parsePlatformStoreJson } from "./parseLocalData";
import type { PlatformStoreDoc } from "../services/platform/store";

const MAX_CANDIDATES_SHOWN = 40;
const MAX_RUNS_SHOWN = 5;
const MAX_SOURCE_LINES_IN_UI = 8;
const MAX_NOTICES_SHOWN = 6;

function sortedKnowledgeSetEntries(
  sets: Record<string, KnowledgeSetRecord> | undefined
): [string, KnowledgeSetRecord][] {
  if (!sets) return [];
  return Object.entries(sets).sort((a, b) => a[0].localeCompare(b[0]));
}

function formatFetchedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function recentDiscoveryRuns(
  runs: KnowledgeDiscoveryRunRecord[] | undefined
): KnowledgeDiscoveryRunRecord[] {
  if (!runs?.length) return [];
  return [...runs].sort((a, b) => b.at - a.at).slice(0, MAX_RUNS_SHOWN);
}

function candidateEntriesSorted(
  cands: Record<string, KnowledgeSetMemberCandidateRecord> | undefined
): KnowledgeSetMemberCandidateRecord[] {
  if (!cands) return [];
  return Object.values(cands).sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    return a.displayName.localeCompare(b.displayName);
  });
}

function CompanionCuratedAssertionsSection({
  assertions,
}: {
  assertions: WorldMetadataDoc["curatedAssertions"];
}) {
  const rows = Object.values(assertions ?? {}).sort((a, b) =>
    a.object.localeCompare(b.object)
  );
  if (rows.length === 0) {
    return (
      <>
        <h3 className="companion-h3">Curated assertions (0)</h3>
        <p className="companion-dim">
          No curated assertions on disk yet. The main app can seed bundled rows and merge new ones
          into world metadata.
        </p>
      </>
    );
  }

  return (
    <>
      <h3 className="companion-h3">Curated assertions ({rows.length})</h3>
      <ul className="companion-list">
        {rows.map((r) => (
          <li key={r.id}>
            <strong>{r.object}</strong> — {r.assertion}
            <span className="companion-dim">
              {" "}
              (certainty {String(r.certainty)}, source: {r.source?.trim() ? r.source : "—"})
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function CompanionKnowledgeSetsSection({
  knowledgeSets,
}: {
  knowledgeSets: WorldMetadataDoc["knowledgeSets"];
}) {
  const entries = sortedKnowledgeSetEntries(knowledgeSets);
  if (entries.length === 0) {
    return (
      <>
        <h3 className="companion-h3">Knowledge sets (0)</h3>
        <p className="companion-dim">
          No knowledge sets on disk yet. Set discovery in the main Avatars app saves roster and run
          history here.
        </p>
      </>
    );
  }

  return (
    <>
      <h3 className="companion-h3">Knowledge sets ({entries.length})</h3>
      <ul className="companion-list companion-knowledge-sets">
        {entries.map(([mapKey, rec]) => (
          <li key={mapKey}>
            <details className="companion-set-details">
              <summary className="companion-set-summary">
                <strong>{rec.label?.trim() ? rec.label : "—"}</strong>{" "}
                <code className="companion-code">{rec.setKey}</code>
                <span className="companion-dim">
                  {" "}
                  — {rec.members.length} member(s)
                  {rec.memberCandidates
                    ? `, ${Object.keys(rec.memberCandidates).length} candidate(s)`
                    : ""}
                  {rec.discoveryRuns?.length ? `, ${rec.discoveryRuns.length} run(s)` : ""}
                </span>
              </summary>
              <div className="companion-set-body">
                {rec.sourceQid ? (
                  <p className="companion-p companion-dim">
                    Source work: <code className="companion-code">{rec.sourceQid}</code>
                  </p>
                ) : null}
                <p className="companion-p companion-dim">Fetched: {formatFetchedAt(rec.fetchedAt)}</p>
                {rec.provenance?.length ? (
                  <p className="companion-p companion-dim">
                    Provenance: {rec.provenance.join(" · ")}
                  </p>
                ) : null}

                <h4 className="companion-h4">Members</h4>
                {rec.members.length === 0 ? (
                  <p className="companion-dim">No resolved members in this record.</p>
                ) : (
                  <ul className="companion-list">
                    {rec.members.map((m, i) => (
                      <li key={`${m.name}-${m.qid ?? i}`}>
                        <strong>{m.name}</strong>
                        {m.qid ? (
                          <>
                            {" "}
                            <code className="companion-code">{m.qid}</code>
                          </>
                        ) : null}
                        {m.actor ? <span className="companion-dim"> — voice: {m.actor}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}

                {rec.memberCandidates && Object.keys(rec.memberCandidates).length > 0 ? (
                  <>
                    <h4 className="companion-h4">Candidates</h4>
                    <ul className="companion-list">
                      {candidateEntriesSorted(rec.memberCandidates)
                        .slice(0, MAX_CANDIDATES_SHOWN)
                        .map((c) => (
                          <li key={c.normalizedKey}>
                            <span className="companion-code">{c.status}</span> — {c.displayName}
                            {c.qid ? (
                              <>
                                {" "}
                                <code className="companion-code">{c.qid}</code>
                              </>
                            ) : null}
                          </li>
                        ))}
                    </ul>
                    {Object.keys(rec.memberCandidates).length > MAX_CANDIDATES_SHOWN ? (
                      <p className="companion-dim">
                        +{Object.keys(rec.memberCandidates).length - MAX_CANDIDATES_SHOWN} more not
                        shown.
                      </p>
                    ) : null}
                  </>
                ) : null}

                {rec.discoveryRuns?.length ? (
                  <>
                    <h4 className="companion-h4">Recent discovery runs (up to {MAX_RUNS_SHOWN})</h4>
                    <ul className="companion-list companion-run-list">
                      {recentDiscoveryRuns(rec.discoveryRuns).map((run) => (
                        <li key={run.runId}>
                          <div>
                            <code className="companion-code">{run.sourceKind ?? "—"}</code>
                            <span className="companion-dim"> — {formatFetchedAt(run.at)}</span>
                          </div>
                          <div className="companion-wrap companion-dim">Query: {run.query}</div>
                          <div className="companion-dim">
                            Extracted names: {run.extractedNames.length}
                            {run.workQid ? (
                              <>
                                {" "}
                                · work <code className="companion-code">{run.workQid}</code>
                              </>
                            ) : null}
                          </div>
                          {run.notices.length > 0 ? (
                            <div className="companion-dim">
                              Notices:{" "}
                              {run.notices.slice(0, MAX_NOTICES_SHOWN).join("; ")}
                              {run.notices.length > MAX_NOTICES_SHOWN
                                ? ` (+${run.notices.length - MAX_NOTICES_SHOWN} more)`
                                : ""}
                            </div>
                          ) : null}
                          {run.sourceLines.length > 0 ? (
                            <pre className="companion-run-source companion-wrap">
                              {run.sourceLines.length <= MAX_SOURCE_LINES_IN_UI
                                ? run.sourceLines.join("\n")
                                : `${run.sourceLines.slice(0, MAX_SOURCE_LINES_IN_UI).join("\n")}\n… (${run.sourceLines.length - MAX_SOURCE_LINES_IN_UI} more lines truncated)`}
                            </pre>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

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
            <CompanionCuratedAssertionsSection assertions={worldMeta.curatedAssertions} />
            <CompanionKnowledgeSetsSection knowledgeSets={worldMeta.knowledgeSets} />
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

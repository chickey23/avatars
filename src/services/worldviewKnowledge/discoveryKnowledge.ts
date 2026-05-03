/**
 * Merge incremental discovery runs and member candidates into knowledge sets.
 */

import type {
  DiscoverySourceKind,
  KnowledgeDiscoveryRunRecord,
  KnowledgeSetMemberCandidateRecord,
  KnowledgeSetRecord,
} from "../worldMetadata/types";
import { contractLog } from "../sessionLog/contractLog";
import { getKnowledgeSet, upsertKnowledgeSet } from "./store";

const MAX_RUNS = 50;

export function normalizeMemberCandidateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[''`]/g, "")
    .trim();
}

function newRunId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * When replacing with a Wikidata-authoritative roster, keep incremental fields.
 */
export function mergeKnowledgeSetPreserveIncremental(
  prev: KnowledgeSetRecord | null,
  next: KnowledgeSetRecord
): KnowledgeSetRecord {
  if (!prev) return next;
  return {
    ...next,
    discoveryRuns: prev.discoveryRuns,
    memberCandidates: prev.memberCandidates,
    setCompositionTags: next.setCompositionTags ?? prev.setCompositionTags,
    excludedWikidataWorkQids:
      next.excludedWikidataWorkQids ?? prev.excludedWikidataWorkQids,
  };
}

/** Normalize Wikidata item id for `excludedWikidataWorkQids` (uppercase `Q` + digits). */
export function normalizeWikidataWorkQidForExclude(raw: string): string | null {
  const id = raw.replace(/^wd:/i, "").trim().toUpperCase();
  if (!/^Q\d+$/i.test(id)) return null;
  return id;
}

/**
 * Merge excluded work QIDs into the knowledge set for this discovery key (persists via world metadata).
 * Creates a minimal shell row when none exists yet (e.g. failed pick before any successful roster write).
 */
export function recordExcludedWikidataWorkQids(
  setKey: string,
  qids: string[],
  labelFallback: string
): void {
  const normalized = [
    ...new Set(
      qids
        .map((q) => normalizeWikidataWorkQidForExclude(q))
        .filter((x): x is string => Boolean(x))
    ),
  ].sort();
  if (normalized.length === 0) return;

  const prev = getKnowledgeSet(setKey);
  const merged = [
    ...new Set([...(prev?.excludedWikidataWorkQids ?? []), ...normalized]),
  ].sort();

  if (prev) {
    upsertKnowledgeSet(
      mergeKnowledgeSetPreserveIncremental(prev, {
        ...prev,
        excludedWikidataWorkQids: merged,
      })
    );
    return;
  }

  const shell: KnowledgeSetRecord = {
    setKey,
    label: labelFallback.trim().slice(0, 400) || setKey,
    members: [],
    fetchedAt: Date.now(),
    provenance: ["wikidata:exclusion_shell"],
    setCompositionTags: [],
    excludedWikidataWorkQids: merged,
  };
  upsertKnowledgeSet(mergeKnowledgeSetPreserveIncremental(null, shell));
}

export type AppendDiscoveryRunInput = {
  setKey: string;
  /** Used when creating a new shell record. */
  labelFallback: string;
  query: string;
  notices: string[];
  sourceLines: string[];
  extractedNames: string[];
  workQid?: string;
  workLabel?: string;
  relatedSetHints?: string[];
  sourceKind?: DiscoverySourceKind;
};

/**
 * Appends one run and merges extracted names into memberCandidates (suggested if new).
 */
export function appendSetDiscoveryRun(input: AppendDiscoveryRunInput): void {
  const {
    setKey,
    labelFallback,
    query,
    notices,
    sourceLines,
    extractedNames,
    workQid,
    workLabel,
    relatedSetHints,
  } = input;
  const now = Date.now();
  const runId = newRunId();
  const run: KnowledgeDiscoveryRunRecord = {
    runId,
    at: now,
    query,
    notices: [...notices],
    sourceLines: [...sourceLines],
    extractedNames: [...extractedNames],
    workQid,
    workLabel,
    relatedSetHints: relatedSetHints?.length ? [...relatedSetHints] : undefined,
    sourceKind: input.sourceKind,
    acceptedMemberCount: 0,
  };

  const prev = getKnowledgeSet(setKey);
  const prevRuns = prev?.discoveryRuns ?? [];
  const nextRuns = [...prevRuns, run].slice(-MAX_RUNS);

  const candidates: Record<string, KnowledgeSetMemberCandidateRecord> = {
    ...(prev?.memberCandidates ?? {}),
  };

  for (const raw of extractedNames) {
    const displayName = raw.replace(/\s+/g, " ").trim();
    if (!displayName) continue;
    const normalizedKey = normalizeMemberCandidateKey(displayName);
    if (!normalizedKey) continue;
    const existing = candidates[normalizedKey];
    if (existing) {
      const seen = new Set(existing.seenInRunIds);
      if (!seen.has(runId)) {
        candidates[normalizedKey] = {
          ...existing,
          seenInRunIds: [...existing.seenInRunIds, runId],
        };
      }
      continue;
    }
    candidates[normalizedKey] = {
      displayName,
      normalizedKey,
      status: "suggested",
      descriptors: [],
      seenInRunIds: [runId],
    };
  }

  const base: KnowledgeSetRecord =
    prev ??
    ({
      setKey,
      label: labelFallback,
      members: [],
      fetchedAt: now,
      provenance: [],
    } satisfies KnowledgeSetRecord);

  upsertKnowledgeSet({
    ...base,
    label: base.label || labelFallback,
    discoveryRuns: nextRuns,
    memberCandidates: candidates,
    fetchedAt: now,
  });
}

function normalizeQueryForRanking(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Reorder Wikidata discovery phrases: try queries that previously led to accepted
 * members first (stable sort; ties keep planner order).
 */
export function rankDiscoveryQueriesForWikidata(
  ks: KnowledgeSetRecord | null,
  queries: readonly string[]
): string[] {
  if (!queries.length) return [];
  if (!ks?.discoveryRuns?.length) return [...queries];
  const scores = new Map<string, number>();
  for (const run of ks.discoveryRuns) {
    if (run.sourceKind !== "wikidata_auto" && run.sourceKind !== "wikidata_work_pick") {
      continue;
    }
    const acc = run.acceptedMemberCount ?? 0;
    if (acc <= 0) continue;
    const k = normalizeQueryForRanking(run.query);
    scores.set(k, (scores.get(k) ?? 0) + acc);
  }
  const indexed = queries.map((q, i) => ({
    q,
    i,
    s: scores.get(normalizeQueryForRanking(q)) ?? 0,
  }));
  indexed.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    return a.i - b.i;
  });
  return indexed.map((x) => x.q);
}

function creditDiscoveryRunForAcceptedCandidate(
  ks: KnowledgeSetRecord,
  cand: KnowledgeSetMemberCandidateRecord
): KnowledgeDiscoveryRunRecord[] | null {
  const runs = ks.discoveryRuns ?? [];
  if (runs.length === 0 || cand.seenInRunIds.length === 0) return null;
  const byId = new Map(runs.map((r) => [r.runId, r]));
  const matching = cand.seenInRunIds
    .map((id) => byId.get(id))
    .filter((r): r is KnowledgeDiscoveryRunRecord => !!r)
    .filter((r) =>
      r.extractedNames.some((n) => normalizeMemberCandidateKey(n) === cand.normalizedKey)
    );
  if (matching.length === 0) return null;
  const credited = matching.reduce((a, b) => (a.at >= b.at ? a : b));
  contractLog(
    "worldview_knowledge",
    "discovery_accept",
    `setKey=${ks.setKey} runId=${credited.runId} sourceKind=${credited.sourceKind ?? ""}`,
    { level: "info" }
  );
  return runs.map((r) =>
    r.runId === credited.runId
      ? { ...r, acceptedMemberCount: (r.acceptedMemberCount ?? 0) + 1 }
      : r
  );
}

export function setMemberCandidateStatus(
  setKey: string,
  normalizedKey: string,
  status: KnowledgeSetMemberCandidateRecord["status"]
): boolean {
  const prev = getKnowledgeSet(setKey);
  if (!prev?.memberCandidates?.[normalizedKey]) return false;
  const cand = prev.memberCandidates[normalizedKey]!;
  let discoveryRunsOut = prev.discoveryRuns;
  if (status === "task_spawned" && cand.status === "suggested") {
    const patched = creditDiscoveryRunForAcceptedCandidate(prev, cand);
    if (patched) discoveryRunsOut = patched;
  }
  const nextCandidates = { ...prev.memberCandidates };
  nextCandidates[normalizedKey] = {
    ...cand,
    status,
  };
  upsertKnowledgeSet({
    ...prev,
    memberCandidates: nextCandidates,
    discoveryRuns: discoveryRunsOut,
    fetchedAt: Date.now(),
  });
  return true;
}

/**
 * Pending = suggested. Order: newest run's extractedNames first (in list order),
 * then older runs, then any remaining suggested keys alphabetically by displayName.
 */
export function listOrderedPendingCandidates(
  ks: KnowledgeSetRecord | null
): KnowledgeSetMemberCandidateRecord[] {
  if (!ks?.memberCandidates) return [];
  const pending = new Map(
    Object.entries(ks.memberCandidates).filter(
      ([, c]) => c.status === "suggested"
    )
  );
  if (pending.size === 0) return [];

  const orderedKeys: string[] = [];
  const runs = [...(ks.discoveryRuns ?? [])].sort((a, b) => b.at - a.at);
  for (const run of runs) {
    for (const raw of run.extractedNames) {
      const k = normalizeMemberCandidateKey(raw);
      if (pending.has(k) && !orderedKeys.includes(k)) orderedKeys.push(k);
    }
  }
  const rest = [...pending.keys()]
    .filter((k) => !orderedKeys.includes(k))
    .sort((a, b) =>
      (pending.get(a)!.displayName || "").localeCompare(
        pending.get(b)!.displayName || "",
        undefined,
        { sensitivity: "base" }
      )
    );
  orderedKeys.push(...rest);
  return orderedKeys.map((k) => pending.get(k)!);
}

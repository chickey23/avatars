import type { AvatarCreationPlan } from "../complexTasks/avatarCreationPlanner";
import { discoveryQueriesForPlan } from "../complexTasks/avatarCreationPlanner";
import {
  discoverySetKeyForPlan,
  resolveWikidataCastMembers,
  wikidataResultToKnowledgeSet,
} from "../knowledgeBase/wikidataResolve";
import type { KnowledgeSetRecord } from "../worldMetadata/types";
import {
  mergeKnowledgeSetPreserveIncremental,
  rankDiscoveryQueriesForWikidata,
} from "../worldviewKnowledge/discoveryKnowledge";
import { getKnowledgeSet, upsertKnowledgeSet } from "../worldviewKnowledge/store";

const MIN_WIKIDATA_CAST = 3;

function upsertKnowledgeSetMerged(next: KnowledgeSetRecord): void {
  const prev = getKnowledgeSet(next.setKey);
  upsertKnowledgeSet(mergeKnowledgeSetPreserveIncremental(prev, next));
}

/**
 * Try Wikidata P1441/P725 resolution across discovery queries. Persists a
 * merged knowledge set (preserving incremental discoveryRuns / memberCandidates)
 * when a full cast (>= MIN_WIKIDATA_CAST) or a partial roster (>= 1) is found.
 */
export async function populateSetFromWikidataForPlan(
  plan: AvatarCreationPlan
): Promise<{
  subjectNames: string[];
  detailLines: string[];
  notices: string[];
  usedWikidata: boolean;
  /** True when fewer than MIN_WIKIDATA_CAST members (still persisted). */
  partialRoster: boolean;
  /** Best work label for discovery-run hints (if any). */
  workLabelHint?: string;
  workQidHint?: string;
  /** Wikidata search phrase that produced the roster (for audit). */
  successfulQuery?: string;
}> {
  const setKey = discoverySetKeyForPlan(plan);
  const queries = rankDiscoveryQueriesForWikidata(
    getKnowledgeSet(setKey),
    discoveryQueriesForPlan(plan)
  );

  const mergedNotices: string[] = [];
  let best: {
    resolved: Awaited<ReturnType<typeof resolveWikidataCastMembers>>;
    query: string;
  } | null = null;

  for (const q of queries) {
    const resolved = await resolveWikidataCastMembers(q);
    mergedNotices.push(...resolved.notices);
    const ks = wikidataResultToKnowledgeSet(plan, resolved);
    if (
      ks &&
      resolved.members.length >= MIN_WIKIDATA_CAST &&
      resolved.workQid
    ) {
      upsertKnowledgeSetMerged(ks);
      const detailLines = resolved.members.map((m) => {
        const voice = m.actor ? ` (voice: ${m.actor})` : "";
        return `- ${m.name}${voice} (${m.qid})`;
      });
      return {
        subjectNames: resolved.members.map((m) => m.name),
        detailLines,
        notices: [...resolved.notices, "wikidata_resolved"],
        usedWikidata: true,
        partialRoster: false,
        workLabelHint: resolved.workLabel,
        workQidHint: resolved.workQid,
        successfulQuery: q,
      };
    }
    if (
      resolved.workQid &&
      resolved.members.length > 0 &&
      (!best || resolved.members.length > best.resolved.members.length)
    ) {
      best = { resolved, query: q };
    }
  }

  if (best) {
    const ks = wikidataResultToKnowledgeSet(plan, best.resolved);
    if (ks) {
      upsertKnowledgeSetMerged(ks);
      const detailLines = best.resolved.members.map((m) => {
        const voice = m.actor ? ` (voice: ${m.actor})` : "";
        return `- ${m.name}${voice} (${m.qid})`;
      });
      return {
        subjectNames: best.resolved.members.map((m) => m.name),
        detailLines,
        notices: [...best.resolved.notices, "wikidata_partial_roster"],
        usedWikidata: true,
        partialRoster: best.resolved.members.length < MIN_WIKIDATA_CAST,
        workLabelHint: best.resolved.workLabel,
        workQidHint: best.resolved.workQid,
        successfulQuery: best.query,
      };
    }
  }

  return {
    subjectNames: [],
    detailLines: [],
    notices: [...new Set(mergedNotices)],
    usedWikidata: false,
    partialRoster: false,
  };
}

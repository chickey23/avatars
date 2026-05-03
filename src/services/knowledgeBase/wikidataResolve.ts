import type { AvatarCreationPlan } from "../complexTasks/avatarCreationPlanner";
import type { KnowledgeSetMemberRecord, KnowledgeSetRecord } from "../worldMetadata/types";
import {
  invokeWikidataSearchEntities,
  invokeWikidataSparql,
  type WikidataSearchEntity,
} from "./wikidataInvoke";

const WD_UA = "Avatars/0.1 (https://github.com/; Wikidata read-only)";

export type WikidataTransport = {
  searchEntities: (
    query: string,
    limit?: number
  ) => Promise<WikidataSearchEntity[]>;
  sparql: (sparql: string) => Promise<unknown>;
};

async function defaultSearch(
  query: string,
  limit?: number
): Promise<WikidataSearchEntity[]> {
  const fromInvoke = (await invokeWikidataSearchEntities(query, limit)) ?? [];
  if (fromInvoke.length > 0) return fromInvoke;
  try {
    return await wikidataFetchTransport().searchEntities(query, limit);
  } catch {
    return [];
  }
}

async function defaultSparql(sparql: string): Promise<unknown> {
  const fromInvoke = await invokeWikidataSparql(sparql);
  if (fromInvoke != null) return fromInvoke;
  try {
    return await wikidataFetchTransport().sparql(sparql);
  } catch {
    return null;
  }
}

/** Node / probe: direct HTTPS (same endpoints as Tauri). */
export function wikidataFetchTransport(): WikidataTransport {
  return {
    async searchEntities(query: string, limit = 8) {
      const lim = Math.min(20, Math.max(1, limit));
      const url = new URL("https://www.wikidata.org/w/api.php");
      url.searchParams.set("action", "wbsearchentities");
      url.searchParams.set("format", "json");
      url.searchParams.set("language", "en");
      url.searchParams.set("type", "item");
      url.searchParams.set("search", query.trim());
      url.searchParams.set("limit", String(lim));
      const res = await fetch(url.toString(), { headers: { "User-Agent": WD_UA } });
      if (!res.ok) throw new Error(`wikidata search HTTP ${res.status}`);
      const v = (await res.json()) as {
        error?: { info?: string };
        search?: WikidataSearchEntity[];
      };
      if (v.error?.info) throw new Error(v.error.info);
      return v.search ?? [];
    },
    async sparql(sparql: string) {
      const url = new URL("https://query.wikidata.org/sparql");
      url.searchParams.set("query", sparql);
      url.searchParams.set("format", "json");
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": WD_UA,
          Accept: "application/sparql-results+json",
        },
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`sparql HTTP ${res.status}: ${body.slice(0, 200)}`);
      return JSON.parse(body) as unknown;
    },
  };
}

export type WikidataSetMember = KnowledgeSetMemberRecord & { qid: string };

export type WikidataResolveResult = {
  workQid: string;
  workLabel: string;
  members: WikidataSetMember[];
  notices: string[];
};

export function discoverySetKeyForPlan(plan: AvatarCreationPlan): string {
  const q = (plan.discoveryQuery ?? plan.originalRequest).trim();
  const base =
    q
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "set";
  return `${base}_${plan.planId.slice(0, 8)}`;
}

function normalizeQueryTokens(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreWorkCandidate(e: WikidataSearchEntity, qNorm: string): number {
  let s = 0;
  const lab = e.label.toLowerCase();
  const desc = (e.description ?? "").toLowerCase();
  const qTokens = qNorm.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const qTokenSet = new Set(qTokens);

  if (/\bepisode\b/.test(desc) && !/\bseries\b/.test(desc)) s -= 8;
  if (/\btelevision series\b/.test(desc) || /\banimated series\b/.test(desc))
    s += 5;
  if (/\banimated\b/.test(desc)) s += 2;
  if (/\bfilm\b/.test(desc) || /\bmovie\b/.test(desc)) s += 3;
  if (/\bsong\b/.test(desc) || /\bsingle\b/.test(desc) || /\balbum\b/.test(desc))
    s -= 12;

  /** Same-name collisions: penalize pro-wrestling entities when the query looks fiction-framed. */
  const fictionQueryCue = [
    "legion",
    "doom",
    "comic",
    "marvel",
    "batman",
    "superman",
    "super",
    "villain",
    "hero",
    "character",
    "cartoon",
    "animated",
  ].some((t) => qTokenSet.has(t));
  if (
    fictionQueryCue &&
    /\b(wrestling|wrestlers?|tag team|professional wrestling|sports entertainment|road warriors)\b/.test(
      desc
    )
  ) {
    s -= 22;
  }

  /** Modest boost only when description and query both suggest comic/fiction work (no global +fiction). */
  const comicFictionDesc =
    /\b(comic book|dc comics|dc universe|super friends|supervillain|fictional character)\b/.test(
      desc
    );
  if (
    comicFictionDesc &&
    fictionQueryCue &&
    qTokens.some((t) => lab.includes(t))
  ) {
    s += 8;
  }

  for (const t of qTokens) {
    if (lab.includes(t)) s += 2;
  }
  return s;
}

const MIN_CAST_ROWS_TO_ACCEPT = 3;
const MAX_WORK_CANDIDATES_TO_TRY = 5;

const defaultWikidataTransport: WikidataTransport = {
  searchEntities: defaultSearch,
  sparql: defaultSparql,
};

/**
 * Wikidata entity search + `scoreWorkCandidate` ranking (no SPARQL).
 */
export async function searchRankedWorks(
  query: string,
  transport: WikidataTransport = defaultWikidataTransport
): Promise<{ ranked: WikidataSearchEntity[]; notices: string[] }> {
  const q = query.trim();
  if (!q) return { ranked: [], notices: ["query_empty"] };
  let entities: WikidataSearchEntity[];
  try {
    entities = await transport.searchEntities(q, 12);
  } catch (e) {
    return {
      ranked: [],
      notices: [
        "wikidata_search_error",
        e instanceof Error ? e.message : String(e),
      ],
    };
  }
  if (entities.length === 0) {
    return { ranked: [], notices: ["wikidata_no_entities"] };
  }
  const { ranked, notices } = rankWorkEntities(entities, q);
  return { ranked, notices };
}

/**
 * P1441 (+ optional P725) cast rows for a single work QID.
 */
export async function resolveCastForWork(
  workQid: string,
  transport: WikidataTransport = defaultWikidataTransport
): Promise<{ members: WikidataSetMember[]; notices: string[] }> {
  const id = workQid.replace(/^wd:/i, "").trim();
  if (!/^Q\d+$/i.test(id)) {
    return { members: [], notices: ["work_qid_invalid"] };
  }
  let sparqlJson: unknown;
  try {
    sparqlJson = await transport.sparql(buildCastSparql(id));
  } catch (e) {
    return {
      members: [],
      notices: [
        "wikidata_sparql_error",
        e instanceof Error ? e.message : String(e),
      ],
    };
  }
  if (sparqlJson == null) {
    return { members: [], notices: ["wikidata_sparql_unavailable"] };
  }
  return { members: parseSparqlBindings(sparqlJson), notices: [] };
}

function rankWorkEntities(
  entities: WikidataSearchEntity[],
  query: string
): { ranked: WikidataSearchEntity[]; notices: string[] } {
  if (entities.length === 0) return { ranked: [], notices: [] };
  const qNorm = normalizeQueryTokens(query);
  const scored = entities.map((e) => ({
    e,
    s: scoreWorkCandidate(e, qNorm),
  }));
  scored.sort((a, b) => b.s - a.s);
  const notices: string[] = [];
  const top = scored[0]!;
  const second = scored[1];
  if (second && Math.abs(top.s - second.s) <= 1 && top.s > 0) {
    notices.push("wikidata_ambiguous_top2");
  }
  if (top.s < 0) {
    notices.push("wikidata_low_confidence_pick");
  }
  return { ranked: scored.map((x) => x.e), notices };
}

function bindingUriToQid(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const val = (v as { value?: string }).value;
  if (!val || typeof val !== "string") return null;
  const m = val.match(/(Q\d+)$/);
  return m ? m[1]! : null;
}

function bindingLiteral(v: unknown): string | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as { value?: string };
  return typeof o.value === "string" ? o.value : undefined;
}

function buildCastSparql(workQid: string): string {
  return `
SELECT DISTINCT ?character ?characterLabel ?va ?vaLabel WHERE {
  BIND(wd:${workQid} AS ?work)
  ?character wdt:P1441 ?work .
  OPTIONAL { ?character wdt:P725 ?va . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 80
`.trim();
}

function parseSparqlBindings(json: unknown): WikidataSetMember[] {
  const root = json as {
    results?: { bindings?: Record<string, unknown>[] };
  };
  const rows = root.results?.bindings ?? [];
  const byChar = new Map<string, WikidataSetMember>();
  for (const row of rows) {
    const charQ = bindingUriToQid(row.character);
    if (!charQ) continue;
    const name =
      bindingLiteral(row.characterLabel)?.trim() || charQ;
    const vaQ = bindingUriToQid(row.va);
    const actor = bindingLiteral(row.vaLabel)?.trim();
    const prev = byChar.get(charQ);
    if (prev) {
      if (actor && !prev.actor) {
        prev.actor = actor;
        prev.actorQid = vaQ ?? undefined;
      }
      continue;
    }
    byChar.set(charQ, {
      name,
      qid: charQ,
      actor,
      actorQid: vaQ ?? undefined,
      descriptors: [],
    });
  }
  return [...byChar.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "en")
  );
}

/**
 * Resolve fictional cast for a work query via Wikidata (P1441 + optional P725).
 * Returns empty members when not in Tauri or when search/SPARQL yields nothing.
 */
export async function resolveWikidataCastMembers(
  query: string,
  transport: WikidataTransport = defaultWikidataTransport
): Promise<WikidataResolveResult> {
  const q = query.trim();
  const notices: string[] = [];
  if (!q) {
    return { workQid: "", workLabel: "", members: [], notices: ["query_empty"] };
  }
  const { ranked, notices: searchNotices } = await searchRankedWorks(q, transport);
  if (ranked.length === 0) {
    return {
      workQid: "",
      workLabel: "",
      members: [],
      notices: searchNotices,
    };
  }
  notices.push(...searchNotices);

  let best: WikidataResolveResult = {
    workQid: ranked[0]!.id,
    workLabel: ranked[0]!.label,
    members: [],
    notices: [],
  };

  const maxTries = Math.min(MAX_WORK_CANDIDATES_TO_TRY, ranked.length);
  for (let i = 0; i < maxTries; i++) {
    const entity = ranked[i]!;
    const cast = await resolveCastForWork(entity.id, transport);
    if (cast.notices.includes("wikidata_sparql_error")) {
      return {
        workQid: entity.id,
        workLabel: entity.label,
        members: [],
        notices: [...notices, ...cast.notices],
      };
    }
    if (cast.notices.includes("wikidata_sparql_unavailable")) {
      return {
        workQid: entity.id,
        workLabel: entity.label,
        members: [],
        notices: [...notices, ...cast.notices],
      };
    }
    const members = cast.members;
    if (members.length >= MIN_CAST_ROWS_TO_ACCEPT) {
      const outNotices = [...notices];
      if (i > 0) outNotices.push("wikidata_alt_work_pick");
      return {
        workQid: entity.id,
        workLabel: entity.label,
        members,
        notices: outNotices,
      };
    }
    if (members.length > best.members.length) {
      best = {
        workQid: entity.id,
        workLabel: entity.label,
        members,
        notices: [],
      };
    }
  }

  if (best.members.length === 0) {
    notices.push("wikidata_no_cast_rows");
  }
  return {
    workQid: best.workQid,
    workLabel: best.workLabel,
    members: best.members,
    notices,
  };
}

export function wikidataResultToKnowledgeSet(
  plan: AvatarCreationPlan,
  resolved: WikidataResolveResult
): KnowledgeSetRecord | null {
  if (!resolved.workQid || resolved.members.length === 0) return null;
  const setKey = discoverySetKeyForPlan(plan);
  return {
    setKey,
    label: resolved.workLabel,
    setCompositionTags: [],
    members: resolved.members.map((m) => ({
      name: m.name,
      qid: m.qid,
      actor: m.actor,
      actorQid: m.actorQid,
      descriptors: m.descriptors ?? [],
    })),
    sourceQid: resolved.workQid,
    fetchedAt: Date.now(),
    provenance: [`wikidata:${resolved.workQid}`],
  };
}

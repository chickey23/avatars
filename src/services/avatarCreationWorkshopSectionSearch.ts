/**
 * Per-section targeted searches for Avatar Creation workshop → builder references.
 * Total provider usage is roughly 7 × perSectionMax per "Use selected in new avatar".
 */

import { formatInternetContextLine } from "./internetContextLines";
import {
  runTargetedSearch,
  type TargetedSearchHit,
} from "./targetedSearch";

export type AvatarBuilderInternetSectionRefs = {
  id: string;
  label: string;
  lines: string[];
};

/** Ordered sections aligned with the avatar builder fields. */
export const AVATAR_BUILDER_INTERNET_SECTIONS: readonly {
  id: string;
  label: string;
  queryTail: string;
}[] = [
  {
    id: "givenName",
    label: "Given name",
    queryTail: "official name spelling common name cited",
  },
  {
    id: "appellation",
    label: "Appellation / title",
    queryTail: "title epithet nickname honorific how they are addressed",
  },
  {
    id: "personality",
    label: "Personality",
    queryTail: "personality traits demeanor attitude mannerisms speaking style",
  },
  {
    id: "backstory",
    label: "Backstory",
    queryTail: "biography origin history timeline key events backstory",
  },
  {
    id: "interests",
    label: "Interests",
    queryTail: "hobbies interests affiliations occupations favorite topics",
  },
  {
    id: "portrait",
    label: "Portrait",
    queryTail: "official portrait character art illustration promotional image",
  },
  {
    id: "signatureColor",
    label: "Signature color",
    queryTail: "costume colors theme palette accent color trademark look",
  },
] as const;

const MAX_SITE_HOSTS = 8;

/** Unique hostnames from hit URLs (lowercase), capped for query length. */
export function hostnamesFromSearchHits(hits: TargetedSearchHit[]): string[] {
  const seen = new Set<string>();
  for (const h of hits) {
    try {
      const host = new URL(h.url.trim()).hostname.toLowerCase();
      if (host) seen.add(host);
    } catch {
      /* invalid URL */
    }
  }
  return [...seen].slice(0, MAX_SITE_HOSTS);
}

export function buildSectionQuery(
  base: string,
  sectionId: string,
  hostnames: string[]
): string {
  const b = base.trim();
  const sec = AVATAR_BUILDER_INTERNET_SECTIONS.find((s) => s.id === sectionId);
  const tail = sec?.queryTail ?? "";
  const core = [b, tail].filter(Boolean).join(" ").trim();
  if (hostnames.length === 0) return core;
  const sites = hostnames
    .slice(0, MAX_SITE_HOSTS)
    .map((h) => `site:${h}`)
    .join(" OR ");
  return `${core} (${sites})`.trim();
}

function perSectionMaxResults(internetSearchMaxResults: number): number {
  return Math.max(1, Math.min(3, internetSearchMaxResults));
}

export async function runSectionSearchesForAvatarBuilder(opts: {
  baseText: string;
  hostnames: string[];
  internetSearchMaxResults: number;
}): Promise<{
  bySection: AvatarBuilderInternetSectionRefs[];
  mergedNotices: string[];
}> {
  const max = perSectionMaxResults(opts.internetSearchMaxResults);
  const bySection: AvatarBuilderInternetSectionRefs[] = [];
  const mergedNotices: string[] = [];

  for (const def of AVATAR_BUILDER_INTERNET_SECTIONS) {
    const query = buildSectionQuery(opts.baseText, def.id, opts.hostnames);
    let resp: Awaited<ReturnType<typeof runTargetedSearch>>;
    try {
      resp = await runTargetedSearch(query, max);
    } catch (e) {
      resp = {
        hits: [],
        providersTried: [],
        notices: [`targeted_search_invoke_error:${String(e)}`],
      };
    }
    for (const n of resp.notices) {
      mergedNotices.push(`[${def.id}] ${n}`);
    }
    bySection.push({
      id: def.id,
      label: def.label,
      lines: resp.hits.map(formatInternetContextLine),
    });
  }

  return { bySection, mergedNotices };
}

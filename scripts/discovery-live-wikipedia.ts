/**
 * Dev CLI (legacy): MediaWiki search → TargetedSearchResponse → discovery filter.
 * Prefer `npm run discovery:wikidata` for structured cast lists.
 *
 *   npm run discovery:wiki -- --query "main crew of Lower Decks"
 */

import type { TargetedSearchHit, TargetedSearchResponse } from "../src/services/targetedSearch/index.ts";
import {
  deriveStopwordsFromQuery,
  discoverSetMembersFromHits,
} from "../src/services/complexTasks/avatarCreationDiscovery.ts";

type WikiSearchRow = { title: string; snippet: string };

function parseArgs(argv: string[]): {
  query: string;
  lang: string;
  max: number;
} {
  let query = "";
  let lang = "en";
  let max = 12;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--query" && argv[i + 1]) {
      query = argv[++i]!;
      continue;
    }
    if (a === "--lang" && argv[i + 1]) {
      lang = argv[++i]!;
      continue;
    }
    if (a === "--max" && argv[i + 1]) {
      max = Math.max(1, Math.min(50, parseInt(argv[++i]!, 10) || 12));
      continue;
    }
  }
  return { query, lang, max };
}

function stripWikiHtml(snippet: string): string {
  return snippet
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wikiTitleToUrl(lang: string, title: string): string {
  const path = title.replace(/ /g, "_");
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
}

async function wikiSearch(
  lang: string,
  q: string,
  srlimit: number
): Promise<TargetedSearchResponse> {
  const base = `https://${lang}.wikipedia.org/w/api.php`;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    list: "search",
    srlimit: String(srlimit),
    srsearch: q,
  });
  const url = `${base}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Avatars-discovery-probe/1.0 (dev tool)" },
  });
  if (!res.ok) {
    throw new Error(`Wikipedia HTTP ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as {
    query?: { search?: WikiSearchRow[] };
    error?: { info?: string };
  };
  if (data.error?.info) {
    throw new Error(data.error.info);
  }
  const rows = data.query?.search ?? [];
  const hits: TargetedSearchHit[] = rows.map((row) => ({
    title: `${row.title} - Wikipedia`,
    url: wikiTitleToUrl(lang, row.title),
    snippet: stripWikiHtml(row.snippet),
    source: "wikipedia",
  }));
  return {
    hits,
    providersTried: ["wikipedia"],
    notices: [],
  };
}

function formatStopwords(sw: ReadonlySet<string>): string {
  return [...sw].sort().join(", ");
}

async function main(): Promise<void> {
  const { query, lang, max } = parseArgs(process.argv.slice(2));
  if (!query.trim()) {
    console.error(
      "Usage: discovery:wiki -- --query <text> [--lang en] [--max 12]"
    );
    process.exit(1);
  }

  const q = query.trim();
  const res = await wikiSearch(lang, q, max);
  const stopwords = deriveStopwordsFromQuery(q);
  const r = discoverSetMembersFromHits(q, res);

  console.log(`Query: ${q}`);
  console.log(`Stopwords: ${formatStopwords(stopwords)}`);
  console.log(`Hits (${res.hits.length}):`);
  for (const h of res.hits) {
    console.log(`  - ${h.title}`);
    console.log(`    ${h.url}`);
    const sn = (h.snippet ?? "").trim();
    if (sn) console.log(`    ${sn.slice(0, 240)}`);
  }
  console.log(`Candidates (${r.names.length}):`);
  r.names.forEach((n, i) => console.log(`  ${i + 1}. ${n}`));
  console.log("Source lines:");
  for (const line of r.sourceLines) {
    console.log(line);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

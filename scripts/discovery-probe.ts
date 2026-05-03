/**
 * Dev CLI: run discovery filter on canned TargetedSearchResponse JSON.
 *
 *   npm run discovery:probe -- --query "main crew of Lower Decks" --hits scripts/fixtures/lower-decks-hits.json
 *   npm run discovery:probe -- --query "..." --hits -
 */

import { readFileSync } from "node:fs";
import type { TargetedSearchResponse } from "../src/services/targetedSearch/index.ts";
import {
  deriveStopwordsFromQuery,
  discoverSetMembersFromHits,
} from "../src/services/complexTasks/avatarCreationDiscovery.ts";

function parseArgs(argv: string[]): { query: string; hitsPath: string | null } {
  let query = "";
  let hitsPath: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--query" && argv[i + 1]) {
      query = argv[++i]!;
      continue;
    }
    if (a === "--hits" && argv[i + 1]) {
      hitsPath = argv[++i]!;
      continue;
    }
  }
  return { query, hitsPath };
}

function formatStopwords(sw: ReadonlySet<string>): string {
  return [...sw].sort().join(", ");
}

function main(): void {
  const { query, hitsPath } = parseArgs(process.argv.slice(2));
  if (!query || !hitsPath) {
    console.error(
      "Usage: discovery:probe -- --query <text> --hits <file.json|->"
    );
    process.exit(1);
  }

  const raw =
    hitsPath === "-"
      ? readFileSync(0, "utf8")
      : readFileSync(hitsPath, "utf8");
  const res = JSON.parse(raw) as TargetedSearchResponse;

  const stopwords = deriveStopwordsFromQuery(query);
  const r = discoverSetMembersFromHits(query, res);

  console.log(`Query: ${query}`);
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

main();

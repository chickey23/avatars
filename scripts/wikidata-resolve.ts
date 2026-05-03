/**
 * Dev CLI: resolve fictional cast via Wikidata (same logic as in-app discovery).
 *
 *   npm run discovery:wikidata -- --query "main crew of Lower Decks"
 *
 * Uses direct HTTPS (no Tauri) so it runs under Node/tsx.
 */

import {
  resolveWikidataCastMembers,
  wikidataFetchTransport,
} from "../src/services/knowledgeBase/wikidataResolve.ts";

function parseArgs(argv: string[]): { query: string } {
  let query = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--query" && argv[i + 1]) {
      query = argv[++i]!;
    }
  }
  return { query };
}

async function main(): Promise<void> {
  const { query } = parseArgs(process.argv.slice(2));
  if (!query.trim()) {
    console.error("Usage: discovery:wikidata -- --query <text>");
    process.exit(1);
  }

  const t = wikidataFetchTransport();
  const r = await resolveWikidataCastMembers(query.trim(), t);

  console.log(`Work: ${r.workLabel} (${r.workQid})`);
  if (r.notices.length) console.log(`Notices: ${r.notices.join("; ")}`);
  console.log(`Members (${r.members.length}):`);
  for (const m of r.members) {
    const voice = m.actor ? `  voice: ${m.actor}` : "";
    console.log(`  - ${m.name} (${m.qid})${voice}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

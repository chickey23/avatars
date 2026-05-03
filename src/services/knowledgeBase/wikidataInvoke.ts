/**
 * Tauri-only Wikidata API bridge (see `src-tauri/src/wikidata.rs`).
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export type WikidataSearchEntity = {
  id: string;
  label: string;
  description?: string;
};

export async function invokeWikidataSearchEntities(
  query: string,
  limit?: number
): Promise<WikidataSearchEntity[] | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<WikidataSearchEntity[]>("wikidata_search_entities", {
    query,
    limit: limit ?? null,
  });
}

export async function invokeWikidataSparql(
  sparql: string
): Promise<unknown | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<unknown>("wikidata_sparql", { sparql });
}

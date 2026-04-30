/**
 * Batch MediaWiki intro extracts for workshop → avatar builder (Tauri only).
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export type WikiExtractItem = {
  url: string;
  title: string;
  text: string;
  notices: string[];
};

export type WikiExtractBatchResponse = {
  extracts: WikiExtractItem[];
};

export async function invokeWikiExtractBatch(
  urls: string[]
): Promise<WikiExtractBatchResponse | null> {
  if (!isTauri()) {
    return null;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<WikiExtractBatchResponse>("wiki_extract_batch", {
    urls,
  });
}

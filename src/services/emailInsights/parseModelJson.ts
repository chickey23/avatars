/**
 * Best-effort JSON object extraction from a model reply (optional ```json fences).
 */
export function parseJsonObjectFromModelText(raw: string): Record<string, unknown> | null {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```/im.exec(t);
  if (fence?.[1]) {
    t = fence[1].trim();
  }
  try {
    const parsed: unknown = JSON.parse(t);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* try trailing blob */
  }
  const tail = extractTrailingJsonObject(t);
  if (!tail) return null;
  try {
    const parsed: unknown = JSON.parse(tail);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function extractTrailingJsonObject(s: string): string | null {
  const t = s.trimEnd();
  for (let start = t.lastIndexOf("{"); start >= 0; start = t.lastIndexOf("{", start - 1)) {
    const json = t.slice(start);
    try {
      JSON.parse(json);
      return json;
    } catch {
      continue;
    }
  }
  return null;
}

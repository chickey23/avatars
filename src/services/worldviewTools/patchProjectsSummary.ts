/**
 * Human-readable one-line summary for world_metadata.patch_projects activity
 * (telemetry resultPreview / switchboard tooltips).
 */

const MAX_LEN = 180;

function clamp(s: string): string {
  const t = s.trim();
  return t.length <= MAX_LEN ? t : `${t.slice(0, MAX_LEN - 1)}…`;
}

/**
 * Build summary from tool args.patch before execution (titles from payload).
 */
export function summarizePatchProjectsForActivity(
  patch: Record<string, unknown> | undefined
): string {
  if (!patch || typeof patch !== "object") {
    return clamp("0 project(s)");
  }
  const entries = Object.entries(patch).filter(([, v]) => v != null);
  const n = entries.length;
  if (n === 0) {
    return clamp("0 project(s)");
  }

  const parts: string[] = [];
  for (const [id, raw] of entries) {
    if (raw === null || typeof raw !== "object") {
      parts.push(id);
      continue;
    }
    const rec = raw as Record<string, unknown>;
    const title =
      typeof rec.title === "string" ? rec.title.trim().replace(/\s+/g, " ") : "";
    if (title) {
      parts.push(`"${title}" (${id})`);
    } else {
      parts.push(id);
    }
  }

  const full = `${n} project(s): ${parts.join(", ")}`;
  if (full.length <= MAX_LEN) {
    return full;
  }
  const first = parts[0] ?? "";
  if (n === 1) {
    return clamp(first);
  }
  const suffix = ` +${n - 1} more`;
  const budget = MAX_LEN - suffix.length;
  const head =
    first.length <= budget
      ? first
      : `${first.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
  return `${head}${suffix}`;
}

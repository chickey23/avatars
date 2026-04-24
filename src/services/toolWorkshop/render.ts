import type { ToolWorkshopAddendumItem, ToolWorkshopAddendumCategory } from "./types";
import { ADDENDUM_CATEGORY_ORDER } from "./constants";
import { loadToolWorkshopDoc } from "./persist";

function categoryRank(c: ToolWorkshopAddendumCategory): number {
  const i = ADDENDUM_CATEGORY_ORDER.indexOf(c);
  return i === -1 ? ADDENDUM_CATEGORY_ORDER.length : i;
}

/** Active items sorted for prompt merge (permission first). */
export function sortAddendaForPrompt(
  items: ToolWorkshopAddendumItem[]
): ToolWorkshopAddendumItem[] {
  return [...items].filter((x) => x.active).sort((a, b) => {
    const rc = categoryRank(a.category) - categoryRank(b.category);
    if (rc !== 0) return rc;
    return a.approvedAt - b.approvedAt;
  });
}

const HEADER = "**Tool workshop (user-approved guidance)**";

/**
 * Block appended after static worldview tool instructions in avatar prompts.
 */
export function renderWorkshopGuidanceForPrompt(): string {
  const doc = loadToolWorkshopDoc();
  const sorted = sortAddendaForPrompt(doc.activeAddenda);
  if (sorted.length === 0) return "";

  const lines: string[] = [HEADER];
  for (const item of sorted) {
    const one = item.body.trim();
    if (!one) continue;
    lines.push(`- [${item.category}] ${one}`);
  }
  if (lines.length <= 1) return "";
  return lines.join("\n");
}

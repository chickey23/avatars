import { generateWithOllama } from "../ollama";
import { appendSessionLog } from "../sessionLog";
import {
  computeToolTelemetryAggregates,
  loadToolTelemetryFromStorage,
  sortToolTelemetryEventsForDisplay,
} from "../toolTelemetry";
import type { ToolWorkshopAddendumCategory, ToolWorkshopProposal } from "./types";
import { loadToolWorkshopDoc, saveToolWorkshopDoc } from "./persist";
import {
  REFINER_SYSTEM_DEFAULT,
  buildRefinerUserPayload,
  STATIC_TOOL_INSTRUCTIONS_EXCERPT,
} from "./refinerPrompts";

const VALID_CATEGORIES: ToolWorkshopAddendumCategory[] = [
  "permission",
  "schema",
  "fetch_allowlist",
  "lexical",
  "parse",
  "other",
];

function isCategory(s: string): s is ToolWorkshopAddendumCategory {
  return VALID_CATEGORIES.includes(s as ToolWorkshopAddendumCategory);
}

function parseProposalJson(text: string): {
  summary: string;
  items: ToolWorkshopProposal["items"];
} | null {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const rawItems = o.items;
  if (!Array.isArray(rawItems)) return null;
  const items: ToolWorkshopProposal["items"] = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const cat = typeof it.category === "string" ? it.category.trim() : "";
    const bodyMarkdown =
      typeof it.bodyMarkdown === "string" ? it.bodyMarkdown.trim() : "";
    if (!isCategory(cat) || !bodyMarkdown) continue;
    const affectedTools = Array.isArray(it.affectedTools)
      ? it.affectedTools.filter((x): x is string => typeof x === "string")
      : undefined;
    const evidenceIds = Array.isArray(it.evidenceIds)
      ? it.evidenceIds.filter((x): x is string => typeof x === "string")
      : undefined;
    items.push({
      category: cat,
      bodyMarkdown,
      affectedTools,
      evidenceIds,
    });
  }
  if (!summary && items.length === 0) return null;
  return { summary: summary || "Refinement proposal", items };
}

export async function runToolWorkshopRefiner(): Promise<
  | { ok: true; proposal: ToolWorkshopProposal }
  | { ok: false; error: string }
> {
  const attemptDoc = loadToolWorkshopDoc();
  attemptDoc.lastRefinerAttemptAt = Date.now();
  saveToolWorkshopDoc(attemptDoc);

  const workshop = loadToolWorkshopDoc();
  const telemetry = loadToolTelemetryFromStorage();
  const sortedEvents = sortToolTelemetryEventsForDisplay(telemetry.events).slice(
    0,
    40
  );
  const aggregates = computeToolTelemetryAggregates(telemetry.events);

  const aggregatesText =
    aggregates.length === 0
      ? "(no aggregates yet)"
      : aggregates
          .map(
            (r) =>
              `${r.toolId} | ${r.avatarId} | ${r.errorCode ?? "ok"} | ok:${r.successCount} fail:${r.failureCount}`
          )
          .join("\n");

  const recentEventsText =
    sortedEvents.length === 0
      ? "(no events yet)"
      : sortedEvents
          .map(
            (e) =>
              `${e.id.slice(0, 8)}… | ${new Date(e.at).toISOString()} | ${e.toolId} | ${e.avatarId} | ${e.ok ? "ok" : e.errorCode ?? "fail"} | ${e.source}${e.argsPreview ? ` | ${e.argsPreview.slice(0, 120)}` : ""}`
          )
          .join("\n");

  const activeAddendaText = workshop.activeAddenda
    .filter((a) => a.active)
    .map((a) => `[${a.category}] ${a.body.slice(0, 200)}`)
    .join("\n");

  const userPayload = buildRefinerUserPayload({
    aggregatesText,
    recentEventsText,
    staticToolExcerpt: STATIC_TOOL_INSTRUCTIONS_EXCERPT,
    activeAddendaText,
    maxItems: workshop.settings.maxActiveAddenda,
    maxCharsPerItem: workshop.settings.maxAddendumItemChars,
  });

  const system =
    workshop.refinerSystemOverride?.trim() || REFINER_SYSTEM_DEFAULT;
  const prompt = `${system}\n\n---\n\n${userPayload}`;

  appendSessionLog("tool_workshop", "refiner_invocation", {
    level: "info",
    detail: `telemetry events=${telemetry.events.length}`,
  });

  const gen = await generateWithOllama({ prompt });
  if (!gen.ok) {
    appendSessionLog("tool_workshop", "refiner_failed", {
      level: "warn",
      detail: gen.error,
    });
    return { ok: false, error: gen.error };
  }

  const parsed = parseProposalJson(gen.text);
  if (!parsed) {
    appendSessionLog("tool_workshop", "refiner_parse_failed", {
      level: "warn",
      detail: gen.text.slice(0, 400),
    });
    return { ok: false, error: "Could not parse refiner JSON output." };
  }

  const proposal: ToolWorkshopProposal = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    summary: parsed.summary,
    items: parsed.items,
    rawModelText: gen.text.slice(0, 8000),
  };

  const doc = loadToolWorkshopDoc();
  doc.pendingProposals = [...doc.pendingProposals, proposal];
  doc.lastAutoRefinementAt = Date.now();
  doc.lastRefinerFailureSnapshot = telemetry.events.filter((e) => !e.ok).length;
  saveToolWorkshopDoc(doc);

  appendSessionLog("tool_workshop", "refiner_proposal_created", {
    level: "info",
    detail: `${proposal.id} items=${proposal.items.length}`,
  });

  return { ok: true, proposal };
}

/** Count non-ok telemetry events (cheap signal for threshold). */
export function countTelemetryFailures(): number {
  return loadToolTelemetryFromStorage().events.filter((e) => !e.ok).length;
}

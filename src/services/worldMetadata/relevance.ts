import type { ConversationMessage, SituationFocus } from "../../types";
import type { ProjectMetadataRecord } from "./types";

const THREAD_TAIL_DEFAULT = 15;
const MAX_OVERLAP_POINTS = 80;
const POINTS_PER_KEYWORD_HIT = 4;

function tokenize(s: string, minLen = 3): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9@.+_-]+/i)
    .filter((w) => w.length >= minLen);
}

function buildProjectCorpus(args: {
  conversationThread: ConversationMessage[];
  activeTask?: string;
  threadTailSize?: number;
}): string {
  const n = args.threadTailSize ?? THREAD_TAIL_DEFAULT;
  const tail = args.conversationThread.slice(-n);
  const parts: string[] = [];
  if (args.activeTask?.trim()) parts.push(args.activeTask.trim());
  for (const m of tail) {
    parts.push(m.content);
  }
  return parts.join(" \n ").toLowerCase();
}

function overlapScore(corpus: string, text: string): number {
  const words = new Set(tokenize(text));
  let hits = 0;
  for (const w of words) {
    if (corpus.includes(w)) hits++;
  }
  return Math.min(MAX_OVERLAP_POINTS, hits * POINTS_PER_KEYWORD_HIT);
}

/**
 * Extra lines for `relevantData` when a world-metadata project is in focus:
 * title, summary, notes (not just the short `focus: project` line).
 */
export function projectMetadataDetailLines(
  focus: SituationFocus | undefined,
  projects: Record<string, ProjectMetadataRecord>
): string[] {
  const id = focus?.project?.id;
  if (!id) return [];
  const rec = projects[id];
  if (!rec?.title?.trim()) return [];

  const lines: string[] = [
    `World metadata — project [${id}] "${rec.title.trim()}":`,
  ];
  if (rec.summary?.trim()) {
    lines.push(`  summary: ${rec.summary.trim().replace(/\s+/g, " ")}`);
  }
  if (rec.notes?.trim()) {
    const n = rec.notes.trim().replace(/\s+/g, " ");
    lines.push(`  notes: ${n.length > 800 ? `${n.slice(0, 797)}…` : n}`);
  }
  return lines;
}

/**
 * Ranked extra project one-liners (not the focused detail block).
 * `extraTopK` = 0 yields [] (legacy).
 */
export function projectMetadataExtraLines(
  focus: SituationFocus | undefined,
  projects: Record<string, ProjectMetadataRecord>,
  ctx: {
    conversationThread: ConversationMessage[];
    activeTask?: string;
    threadTailSize?: number;
  },
  extraTopK: number
): string[] {
  if (extraTopK <= 0) return [];
  const corpus = buildProjectCorpus(ctx);
  const focusId = focus?.project?.id;
  const scored = Object.entries(projects)
    .filter(([, rec]) => rec.title?.trim())
    .map(([id, rec]) => {
      const blob = `${rec.title} ${rec.summary ?? ""} ${rec.notes ?? ""}`;
      let score = overlapScore(corpus, blob);
      if (focusId && id === focusId) score += 10_000;
      return { id, rec, score };
    })
    .sort((a, b) => b.score - a.score || b.rec.updatedAt - a.rec.updatedAt);

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const { id, rec } of scored) {
    if (focusId && id === focusId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const sum = rec.summary?.trim().replace(/\s+/g, " ");
    lines.push(
      `World metadata — project [${id}] "${rec.title.trim()}"${
        sum ? ` — ${sum.length > 200 ? `${sum.slice(0, 197)}…` : sum}` : ""
      }`
    );
    if (lines.length >= extraTopK) break;
  }
  return lines;
}

/**
 * Focused project detail (if any) plus up to `extraTopK` other ranked one-liners.
 */
export function projectMetadataContextLines(
  focus: SituationFocus | undefined,
  projects: Record<string, ProjectMetadataRecord>,
  ctx: {
    conversationThread: ConversationMessage[];
    activeTask?: string;
    threadTailSize?: number;
  },
  extraTopK: number
): string[] {
  return [
    ...projectMetadataDetailLines(focus, projects),
    ...projectMetadataExtraLines(focus, projects, ctx, extraTopK),
  ];
}

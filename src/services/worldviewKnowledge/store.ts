/**
 * Typed accessors for structured knowledge sets (cast lists, etc.).
 * Persisted under `WorldMetadataDoc.knowledgeSets` — shared-shape public data
 * colocated with world metadata until a second consumer warrants extraction.
 */

import type { KnowledgeSetRecord } from "../worldMetadata/types";
import {
  getWorldMetadata,
  patchKnowledgeSets,
} from "../worldMetadata/store";

export type { KnowledgeSetRecord } from "../worldMetadata/types";

export function getKnowledgeSet(setKey: string): KnowledgeSetRecord | null {
  const sets = getWorldMetadata().knowledgeSets;
  if (!sets) return null;
  return sets[setKey] ?? null;
}

export function upsertKnowledgeSet(rec: KnowledgeSetRecord): void {
  patchKnowledgeSets({ [rec.setKey]: rec });
}

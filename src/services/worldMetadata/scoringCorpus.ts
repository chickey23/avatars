import type { SituationFocus } from "../../types";
import type { WorldMetadataDoc } from "./types";

const DEFAULT_MAX_CHARS = 2000;
const DEFAULT_MAX_PEOPLE = 16;

/**
 * Capped text from world metadata folded into context-scoring corpora (email, calendar, contacts).
 */
export function buildWorldMetadataScoringCorpus(
  doc: WorldMetadataDoc,
  focus: SituationFocus | undefined,
  opts?: { maxChars?: number; maxPeople?: number }
): string {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const maxPeople = opts?.maxPeople ?? DEFAULT_MAX_PEOPLE;
  const parts: string[] = [];
  const up = doc.userProfile;
  if (up.displayName?.trim()) parts.push(up.displayName.trim());
  if (up.notes?.trim()) parts.push(up.notes.trim().slice(0, 500));
  if (focus?.project?.id) {
    const p = doc.projects[focus.project.id];
    if (p) {
      if (p.summary?.trim()) parts.push(p.summary.trim().slice(0, 400));
      if (p.notes?.trim()) parts.push(p.notes.trim().slice(0, 400));
    }
  }
  let peopleCount = 0;
  for (const [id, p] of Object.entries(doc.people)) {
    if (peopleCount >= maxPeople) break;
    const bits: string[] = [];
    if (p.userTags?.length) bits.push(p.userTags.join(" "));
    if (p.relationshipNote?.trim()) bits.push(p.relationshipNote.trim());
    if (p.notes?.trim()) bits.push(p.notes.trim());
    if (bits.length) {
      parts.push(`person ${id}: ${bits.join(" ")}`.slice(0, 280));
      peopleCount++;
    }
  }
  const s = parts.join(" \n ").toLowerCase();
  return s.length <= maxChars ? s : s.slice(0, maxChars);
}

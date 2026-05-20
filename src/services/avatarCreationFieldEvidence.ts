/**
 * Phase B2: per builder-field confidence and follow-up search for empty fields.
 */

import type { AvatarBuilderInternetSectionRefs } from "./avatarCreationWorkshopSectionSearch";
import {
  AVATAR_BUILDER_INTERNET_SECTIONS,
  buildSectionQuery,
  hostnamesFromSearchHits,
} from "./avatarCreationWorkshopSectionSearch";
import type { AvatarBuilderSeedFieldPrefill } from "./avatarBuilderSeedPrefill";
import type { TargetedSearchHit } from "./targetedSearch";

export type FieldConfidenceLevel = "evidence" | "weak" | "empty";

export type AvatarBuilderFieldEvidenceEntry = {
  confidence: FieldConfidenceLevel;
  /** Short label for UI (e.g. first hit title). */
  sourceHint?: string;
  lineCount: number;
};

export type AvatarBuilderFieldEvidence = Partial<
  Record<string, AvatarBuilderFieldEvidenceEntry>
>;

const SECTION_TO_PREFILL: Record<string, keyof AvatarBuilderSeedFieldPrefill> = {
  givenName: "givenName",
  appellation: "appellation",
  personality: "personality",
  backstory: "description",
  interests: "interests",
  portrait: "portraitImageUrl",
  signatureColor: "accentColor",
};

function prefillHasValue(
  prefill: AvatarBuilderSeedFieldPrefill | undefined,
  key: keyof AvatarBuilderSeedFieldPrefill
): boolean {
  if (!prefill) return false;
  const v = prefill[key];
  if (Array.isArray(v)) return v.length > 0;
  return typeof v === "string" && v.trim().length > 0;
}

export function scoreFieldEvidenceFromSections(
  bySection: AvatarBuilderInternetSectionRefs[],
  prefill?: AvatarBuilderSeedFieldPrefill
): AvatarBuilderFieldEvidence {
  const out: AvatarBuilderFieldEvidence = {};
  for (const def of AVATAR_BUILDER_INTERNET_SECTIONS) {
    const sec = bySection.find((s) => s.id === def.id);
    const lines = sec?.lines ?? [];
    const prefillKey = SECTION_TO_PREFILL[def.id];
    const fromPrefill =
      prefillKey && prefillHasValue(prefill, prefillKey);
    let confidence: FieldConfidenceLevel = "empty";
    if (fromPrefill) {
      confidence = "evidence";
    } else if (lines.length >= 2) {
      confidence = "evidence";
    } else if (lines.length === 1) {
      confidence = "weak";
    }
    const sourceHint =
      lines[0]?.split(" — ")[0]?.trim().slice(0, 120) || undefined;
    out[def.id] = {
      confidence,
      sourceHint,
      lineCount: lines.length,
    };
  }
  return out;
}

export function emptyBuilderSectionIds(
  evidence: AvatarBuilderFieldEvidence
): string[] {
  return AVATAR_BUILDER_INTERNET_SECTIONS.filter(
    (d) => evidence[d.id]?.confidence === "empty"
  ).map((d) => d.id);
}

/**
 * Narrow follow-up searches for sections still empty after the first pass.
 */
export async function runFollowUpSearchesForEmptyFields(opts: {
  baseText: string;
  hostnames: string[];
  internetSearchMaxResults: number;
  emptySectionIds: string[];
  existingBySection: AvatarBuilderInternetSectionRefs[];
}): Promise<{
  mergedBySection: AvatarBuilderInternetSectionRefs[];
  mergedNotices: string[];
}> {
  const ids = opts.emptySectionIds.filter(Boolean);
  if (ids.length === 0) {
    return {
      mergedBySection: opts.existingBySection,
      mergedNotices: [],
    };
  }
  const merged = [...opts.existingBySection];
  const notices: string[] = [];
  const max = Math.max(1, Math.min(3, opts.internetSearchMaxResults));

  for (const sectionId of ids) {
    const narrowBase = `${opts.baseText} ${sectionId} detailed cited facts`;
    const query = buildSectionQuery(narrowBase, sectionId, opts.hostnames);
    const { runTargetedSearch } = await import("./targetedSearch");
    const { formatInternetContextLine } = await import("./internetContextLines");
    let resp: Awaited<ReturnType<typeof runTargetedSearch>>;
    try {
      resp = await runTargetedSearch(query, max);
    } catch (e) {
      resp = {
        hits: [],
        providersTried: [],
        notices: [`follow_up_error:${String(e)}`],
      };
    }
    for (const n of resp.notices) {
      notices.push(`[follow_up:${sectionId}] ${n}`);
    }
    const def = AVATAR_BUILDER_INTERNET_SECTIONS.find((s) => s.id === sectionId);
    const lines = resp.hits.map(formatInternetContextLine);
    const idx = merged.findIndex((s) => s.id === sectionId);
    const row: AvatarBuilderInternetSectionRefs = {
      id: sectionId,
      label: def?.label ?? sectionId,
      lines:
        idx >= 0 ? [...merged[idx]!.lines, ...lines] : lines,
    };
    if (idx >= 0) merged[idx] = row;
    else merged.push(row);
  }

  return { mergedBySection: merged, mergedNotices: notices };
}

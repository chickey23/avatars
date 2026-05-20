/**
 * Creation workshop: fetch wiki intro text once per selected URL, merge, single
 * Ollama JSON extraction to pre-fill the avatar builder; optional fallback to
 * per-section targeted search.
 */

import type { AvatarBuilderSeedFieldPrefill } from "./avatarBuilderSeedPrefill";
import {
  runSectionSearchesForAvatarBuilder,
  hostnamesFromSearchHits,
  type AvatarBuilderInternetSectionRefs,
} from "./avatarCreationWorkshopSectionSearch";
import {
  emptyBuilderSectionIds,
  runFollowUpSearchesForEmptyFields,
  scoreFieldEvidenceFromSections,
  type AvatarBuilderFieldEvidence,
} from "./avatarCreationFieldEvidence";
import { formatInternetContextLine } from "./internetContextLines";
import type { TargetedSearchHit } from "./targetedSearch/invoke";
import { invokeWikiExtractBatch } from "./targetedSearch/wikiExtractInvoke";
import { generateWithOllama, isOllamaAvailable } from "./ollama";

const MERGE_MAX_CHARS = 120_000;
const EXTRACTION_MIN_CHARS = 200;

export function stripMarkdownJsonFence(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return s;
}

export function mergeWikiPlainTextsForExtraction(
  items: { title: string; url: string; text: string }[],
  maxChars: number
): string {
  const chunks: string[] = [];
  for (const it of items) {
    const body = it.text.trim();
    if (!body) continue;
    chunks.push(
      `\n\n=== ${it.title || "(untitled)"} (${it.url}) ===\n\n${body}`
    );
  }
  let out = chunks.join("");
  if (out.length > maxChars) {
    out = out.slice(0, maxChars);
  }
  return out.trim();
}

function normalizeHex6(s: string): string | undefined {
  const t = s.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/i.test(t)) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return undefined;
}

export function parseAvatarExtractionJson(
  raw: string
): { ok: true; value: AvatarBuilderSeedFieldPrefill } | { ok: false; error: string } {
  const stripped = stripMarkdownJsonFence(raw);
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ok: false, error: "no_json_object" };
  }
  const slice = stripped.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch (e) {
    return { ok: false, error: `json_parse:${String(e)}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "not_object" };
  }
  const o = parsed as Record<string, unknown>;
  const str = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string).trim() : "";
  const arr = (k: string): string[] =>
    Array.isArray(o[k])
      ? (o[k] as unknown[])
          .filter((x) => typeof x === "string")
          .map((x) => (x as string).trim())
          .filter(Boolean)
      : [];

  const value: AvatarBuilderSeedFieldPrefill = {};
  const givenName = str("givenName");
  if (givenName) value.givenName = givenName;
  const appellation = str("appellation");
  if (appellation) value.appellation = appellation;
  const description = str("description");
  if (description) value.description = description;
  const personality = str("personality");
  if (personality) value.personality = personality;
  const tags = arr("tags");
  if (tags.length) value.tags = tags;
  const interests = arr("interests");
  if (interests.length) value.interests = interests;
  const ac = normalizeHex6(str("accentColor"));
  if (ac) value.accentColor = ac;
  const pu = str("portraitImageUrl");
  if (/^https?:\/\//i.test(pu) && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(pu)) {
    value.portraitImageUrl = pu;
  }
  return { ok: true, value };
}

function prefillIsUseful(p: AvatarBuilderSeedFieldPrefill): boolean {
  if (p.givenName?.trim()) return true;
  if ((p.description?.trim().length ?? 0) >= 48) return true;
  return false;
}

async function runOllamaFieldExtraction(
  mergedWikiText: string,
  hitSummary: string
): Promise<
  | { ok: true; value: AvatarBuilderSeedFieldPrefill }
  | { ok: false; error: string }
> {
  if (!(await isOllamaAvailable())) {
    return { ok: false, error: "ollama_unavailable" };
  }
  const corpus = mergedWikiText.slice(0, MERGE_MAX_CHARS);
  const prompt = `You fill an avatar builder form from encyclopedia-style plain text (Wikipedia-style intros). Reply with ONE JSON object only — no markdown fences, no commentary.

Corpus:
---
${corpus}
---

Context lines (search hits): ${hitSummary}

Return exactly this JSON shape (all keys required; use empty string or [] when unknown):
{"givenName":"","appellation":"","description":"","personality":"","tags":[],"interests":[],"accentColor":"","portraitImageUrl":""}

Rules:
- givenName: subject's common given / first name or best-known short name.
- appellation: title, epithet, or how they are addressed (or empty).
- description: backstory / biography in a few sentences.
- personality: traits, demeanor, mannerisms (concise).
- tags: short strings (max 12 each), max 8 entries.
- interests: concrete topics, max 10 entries.
- accentColor: only a CSS hex like #aabbcc if clearly stated; else "".
- portraitImageUrl: only a direct http(s) URL to a .png/.jpg/.webp/.gif if clearly a portrait of this subject; else "".

Ground answers in the corpus; do not invent facts not supported by the text.`;

  const gen = await generateWithOllama({ prompt });
  if (!gen.ok) {
    return { ok: false, error: gen.error };
  }
  const parsed = parseAvatarExtractionJson(gen.text);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  if (!prefillIsUseful(parsed.value)) {
    return { ok: false, error: "extraction_empty" };
  }
  return { ok: true, value: parsed.value };
}

export type WorkshopInternetApplyResult = {
  seedFieldPrefill?: AvatarBuilderSeedFieldPrefill;
  internetReferencesBySection: AvatarBuilderInternetSectionRefs[];
  fieldEvidence?: AvatarBuilderFieldEvidence;
  wikiSearchNotices?: string[];
  usedWikiExtract: boolean;
  usedOllamaExtraction: boolean;
  usedSectionSearchFallback: boolean;
  usedFollowUpSectionSearch?: boolean;
};

/**
 * Build references + optional field prefill from Creation workshop Internet picks.
 */
export async function runAvatarCreationWorkshopInternetApply(opts: {
  pickedHits: TargetedSearchHit[];
  baseText: string;
  internetSearchMaxResults: number;
  discoveryNotices: string[];
}): Promise<WorkshopInternetApplyResult> {
  const { pickedHits, baseText, internetSearchMaxResults, discoveryNotices } =
    opts;
  const wikiSearchNotices: string[] = [
    ...discoveryNotices.map((n) => `[discovery] ${n}`),
  ];

  const selectedLines = pickedHits.map(formatInternetContextLine);
  const selectedSection: AvatarBuilderInternetSectionRefs = {
    id: "selected",
    label: "Selected sources",
    lines: selectedLines,
  };

  let usedWikiExtract = false;
  let usedOllamaExtraction = false;
  let usedSectionSearchFallback = false;
  let seedFieldPrefill: AvatarBuilderSeedFieldPrefill | undefined;

  const urls = pickedHits.map((h) => h.url.trim()).filter(Boolean);
  const batch = await invokeWikiExtractBatch(urls);
  const extracts = batch?.extracts ?? [];

  for (const ex of extracts) {
    for (const n of ex.notices) {
      wikiSearchNotices.push(`[wiki_fetch] ${ex.url}: ${n}`);
    }
  }

  const textItems = extracts
    .filter((e) => e.text.trim().length > 0)
    .map((e) => ({
      title: e.title || e.url,
      url: e.url,
      text: e.text,
    }));

  if (textItems.length > 0) {
    usedWikiExtract = true;
  }

  const merged = mergeWikiPlainTextsForExtraction(textItems, MERGE_MAX_CHARS);
  const hitSummary = pickedHits
    .map((h) => `${h.title || h.url} — ${h.url}`)
    .join(" | ");

  if (merged.length >= EXTRACTION_MIN_CHARS) {
    const ext = await runOllamaFieldExtraction(merged, hitSummary);
    if (ext.ok) {
      usedOllamaExtraction = true;
      seedFieldPrefill = ext.value;
      if (seedFieldPrefill.portraitImageUrl) {
        wikiSearchNotices.push(
          `[extraction] portrait_image_url:${seedFieldPrefill.portraitImageUrl}`
        );
      }
    } else {
      wikiSearchNotices.push(`[extraction] ${ext.error}`);
    }
  } else {
    wikiSearchNotices.push(
      `[extraction] skipped_corpus_too_short:${merged.length}`
    );
  }

  let internetReferencesBySection: AvatarBuilderInternetSectionRefs[] = [
    selectedSection,
  ];

  let usedFollowUpSectionSearch = false;
  if (!usedOllamaExtraction) {
    usedSectionSearchFallback = true;
    const hostnames = hostnamesFromSearchHits(pickedHits);
    let { bySection, mergedNotices } = await runSectionSearchesForAvatarBuilder({
      baseText,
      hostnames,
      internetSearchMaxResults,
    });
    wikiSearchNotices.push(...mergedNotices);
    let evidence = scoreFieldEvidenceFromSections(bySection, seedFieldPrefill);
    const emptyIds = emptyBuilderSectionIds(evidence);
    if (emptyIds.length > 0) {
      const follow = await runFollowUpSearchesForEmptyFields({
        baseText,
        hostnames,
        internetSearchMaxResults,
        emptySectionIds: emptyIds,
        existingBySection: bySection,
      });
      bySection = follow.mergedBySection;
      wikiSearchNotices.push(...follow.mergedNotices);
      usedFollowUpSectionSearch = true;
      evidence = scoreFieldEvidenceFromSections(bySection, seedFieldPrefill);
    }
    internetReferencesBySection = [selectedSection, ...bySection];
    return {
      seedFieldPrefill,
      internetReferencesBySection,
      fieldEvidence: evidence,
      wikiSearchNotices:
        wikiSearchNotices.length > 0 ? wikiSearchNotices : undefined,
      usedWikiExtract,
      usedOllamaExtraction,
      usedSectionSearchFallback,
      usedFollowUpSectionSearch,
    };
  }

  const fieldEvidence = scoreFieldEvidenceFromSections(
    internetReferencesBySection,
    seedFieldPrefill
  );

  return {
    seedFieldPrefill,
    internetReferencesBySection,
    fieldEvidence,
    wikiSearchNotices:
      wikiSearchNotices.length > 0 ? wikiSearchNotices : undefined,
    usedWikiExtract,
    usedOllamaExtraction,
    usedSectionSearchFallback,
    usedFollowUpSectionSearch,
  };
}

import { FOCUS_ID_MATCH_BONUS } from "./focusRelevance";

export function baseRawScore(
  raw: number,
  isFocusIdMatch: boolean
): number {
  return isFocusIdMatch ? raw - FOCUS_ID_MATCH_BONUS : raw;
}

/**
 * Focus-relative 0–100 for display. When any item is a focus-id match, non-focus
 * rows normalize against max base score among non-focus rows; focus row shows 100.
 * When no focus match in batch, same as batch max normalization on base (= raw) scores.
 */
export function computeNormFocusDisplays(
  rawScores: number[],
  focusMatchFlags: boolean[]
): number[] {
  const bases = rawScores.map((r, i) =>
    baseRawScore(r, focusMatchFlags[i]!)
  );
  const hasFocus = focusMatchFlags.some(Boolean);
  if (!hasFocus) {
    const maxB = Math.max(...bases, 1);
    return bases.map((b) => Math.round((100 * b) / maxB));
  }
  const basesNonFocus = bases.filter((_, i) => !focusMatchFlags[i]!);
  const denom =
    basesNonFocus.length === 0 ? 1 : Math.max(1, ...basesNonFocus);
  return bases.map((b, i) => {
    if (focusMatchFlags[i]) return 100;
    return Math.round((100 * b) / denom);
  });
}

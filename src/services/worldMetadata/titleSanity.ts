/**
 * Guards the projects map against placeholder titles.
 *
 * LLMs sometimes copy literal placeholder values from the tool schema
 * example (e.g. `{"title":"…"}`) verbatim into `world_metadata.patch_projects`
 * patches, producing ghost projects with title "…" or "...". This module
 * centralizes the rejection rule so every sink (world_metadata merge, platform
 * `upsertProject`, seed importer, cleanup migration) shares the same verdict.
 */

/**
 * Returns true when `title` is the kind of string we should refuse to create
 * a project from: empty, only whitespace, only ellipsis / punctuation, or a
 * canonical placeholder word.
 *
 * Case-insensitive. Does not modify input; callers should still `.trim()`
 * before persisting if they want clean storage.
 */
export function isPlaceholderProjectTitle(
  title: string | null | undefined
): boolean {
  if (typeof title !== "string") return true;
  const t = title.trim();
  if (!t) return true;

  /**
   * Strings made up only of ellipsis glyphs, dots, angle brackets, or
   * whitespace. Covers "…", "...", "......", "  …  ", "<...>", etc.
   */
  if (/^[\s.…<>]+$/.test(t)) return true;

  const lower = t.toLowerCase();
  const placeholders = new Set([
    "untitled",
    "tbd",
    "to be determined",
    "placeholder",
    "example",
    "title",
    "project title",
    "new project",
    "<title>",
    "<project>",
    "<project title>",
    "title here",
    "n/a",
    "na",
  ]);
  return placeholders.has(lower);
}

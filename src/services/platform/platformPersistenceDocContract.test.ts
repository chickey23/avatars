/**
 * Keeps Rust allowlist, TypeScript filenames, and docs/PLATFORM_PERSISTENCE.md in sync.
 * See docs/READONLY_COMPANION.md for the read-only companion context.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_CACHE_FILES,
  PLATFORM_DRAFTS_FILE,
  PLATFORM_STORE_FILE,
  TARGETED_SEARCH_CONFIG_FILE,
  TARGETED_SEARCH_USAGE_FILE,
} from "./constants";

function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** Extract quoted .json filenames from the ALLOWED_FILENAMES array initializer. */
function parseAllowedFilenamesFromRust(rustSource: string): string[] {
  const marker = rustSource.includes("pub const ALLOWED_FILENAMES")
    ? "pub const ALLOWED_FILENAMES"
    : "const ALLOWED_FILENAMES";
  const start = rustSource.indexOf(marker);
  if (start === -1) {
    throw new Error(`ALLOWED_FILENAMES not found in avatars-platform-storage lib.rs`);
  }
  const fromConst = rustSource.slice(start);
  const open = fromConst.indexOf("&[");
  const close = fromConst.indexOf("];");
  if (open === -1 || close === -1 || close < open) {
    throw new Error("ALLOWED_FILENAMES array bounds not found");
  }
  const block = fromConst.slice(open, close);
  const out: string[] = [];
  const re = /"([^"]+\.json)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push(m[1]);
  }
  if (out.length === 0) {
    throw new Error("No .json filenames parsed from ALLOWED_FILENAMES");
  }
  return out;
}

function tsPlatformJsonFilenames(): Set<string> {
  return new Set([
    ...Object.values(PLATFORM_CACHE_FILES),
    PLATFORM_STORE_FILE,
    PLATFORM_DRAFTS_FILE,
    TARGETED_SEARCH_CONFIG_FILE,
    TARGETED_SEARCH_USAGE_FILE,
  ]);
}

describe("platform persistence doc contract", () => {
  it("ALLOWED_FILENAMES matches constants.ts and docs/PLATFORM_PERSISTENCE.md", () => {
    const root = repoRoot();
    const rustPath = join(root, "crates/avatars-platform-storage/src/lib.rs");
    const mdPath = join(root, "docs/PLATFORM_PERSISTENCE.md");
    const rustSrc = readFileSync(rustPath, "utf8");
    const md = readFileSync(mdPath, "utf8");

    const allowed = parseAllowedFilenamesFromRust(rustSrc);
    const rustSet = new Set(allowed);
    expect(allowed.length).toBe(rustSet.size);

    const tsSet = tsPlatformJsonFilenames();
    expect(tsSet).toEqual(rustSet);

    for (const name of allowed) {
      expect(md, `docs/PLATFORM_PERSISTENCE.md must mention ${name}`).toContain(name);
    }
  });
});

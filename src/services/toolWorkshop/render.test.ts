import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderWorkshopGuidanceForPrompt } from "./render";
import * as persist from "./persist";
import type { ToolWorkshopDoc } from "./types";
import { TOOL_WORKSHOP_SCHEMA_VERSION } from "./types";

describe("renderWorkshopGuidanceForPrompt", () => {
  const empty: ToolWorkshopDoc = {
    schemaVersion: TOOL_WORKSHOP_SCHEMA_VERSION,
    settings: {
      maxActiveAddenda: 8,
      maxAddendumItemChars: 400,
      refinerIntervalHours: 24,
      refinerFailureDeltaThreshold: 5,
      refinerAutoEnabled: false,
    },
    activeAddenda: [],
    pendingProposals: [],
  };

  beforeEach(() => {
    vi.spyOn(persist, "loadToolWorkshopDoc").mockReturnValue(empty);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty string when no active addenda", () => {
    expect(renderWorkshopGuidanceForPrompt()).toBe("");
  });

  it("renders permission category before other categories", () => {
    vi.spyOn(persist, "loadToolWorkshopDoc").mockReturnValue({
      ...empty,
      activeAddenda: [
        {
          id: "1",
          category: "lexical",
          body: "Lex rule",
          approvedAt: 1,
          active: true,
        },
        {
          id: "2",
          category: "permission",
          body: "Perm rule",
          approvedAt: 2,
          active: true,
        },
      ],
    });
    const out = renderWorkshopGuidanceForPrompt();
    expect(out).toContain("[permission]");
    expect(out.indexOf("[permission]")).toBeLessThan(out.indexOf("[lexical]"));
  });
});

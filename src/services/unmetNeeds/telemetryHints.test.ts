import { describe, expect, it } from "vitest";
import {
  extractPatchProjectHintsFromPreview,
  suggestRelatedProjectIdFromTelemetryEvent,
} from "./telemetryHints";
import type { ToolTelemetryEvent } from "../toolTelemetry/types";

describe("extractPatchProjectHintsFromPreview", () => {
  it("parses titled pairs", () => {
    const h = extractPatchProjectHintsFromPreview(
      `2 project(s): "Kitchen" (proj_a), "Yard" (proj_b)`
    );
    expect(h.ids).toEqual(["proj_a", "proj_b"]);
    expect(h.firstQuotedTitle).toBe("Kitchen");
  });

  it("parses legacy id-only list", () => {
    const h = extractPatchProjectHintsFromPreview(`2 project(s): x1, y2`);
    expect(h.ids).toEqual(["x1", "y2"]);
  });
});

describe("suggestRelatedProjectIdFromTelemetryEvent", () => {
  it("returns single id for patch_projects", () => {
    const e: ToolTelemetryEvent = {
      id: "1",
      at: 1,
      toolId: "world_metadata.patch_projects",
      avatarId: "a",
      source: "patch",
      ok: true,
      resultPreview: `1 project(s): "Solo" (only_one)`,
    };
    expect(suggestRelatedProjectIdFromTelemetryEvent(e)).toBe("only_one");
  });

  it("returns undefined when multiple ids", () => {
    const e: ToolTelemetryEvent = {
      id: "1",
      at: 1,
      toolId: "world_metadata.patch_projects",
      avatarId: "a",
      source: "patch",
      ok: true,
      resultPreview: `2 project(s): "A" (p1), "B" (p2)`,
    };
    expect(suggestRelatedProjectIdFromTelemetryEvent(e)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { buildCursorHandoffMarkdown } from "./buildHandoff";
import type { UnmetNeedItem } from "../unmetNeeds/types";

describe("buildCursorHandoffMarkdown", () => {
  it("includes stable sections and telemetry ids", () => {
    const item: UnmetNeedItem = {
      id: "need-1",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      title: "Test gap",
      status: "open",
      remediation: "new_source",
      linkedTelemetryEventIds: ["evt-a", "evt-b"],
    };
    const md = buildCursorHandoffMarkdown(item);
    expect(md).toContain("# Source / capability handoff — Test gap");
    expect(md).toContain("## Tool telemetry event ids");
    expect(md).toContain("`evt-a`");
    expect(md).toContain("src/connectors/");
    expect(md).toContain("Workshops → Unmet Needs");
  });
});

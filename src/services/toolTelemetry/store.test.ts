import { describe, expect, it } from "vitest";
import {
  computeToolTelemetryAggregates,
  isPermissionErrorCode,
  sortToolTelemetryEventsForDisplay,
} from "./store";
import type { ToolTelemetryEvent } from "./types";

describe("toolTelemetry store", () => {
  it("isPermissionErrorCode recognizes policy codes", () => {
    expect(isPermissionErrorCode("permission_denied")).toBe(true);
    expect(isPermissionErrorCode("permission_denied_projects")).toBe(true);
    expect(isPermissionErrorCode("bad patch")).toBe(false);
  });

  it("computeToolTelemetryAggregates groups by avatar, tool, outcome", () => {
    const events: ToolTelemetryEvent[] = [
      {
        id: "1",
        at: 1,
        toolId: "world_metadata.patch_projects",
        avatarId: "muse",
        source: "patch",
        ok: true,
      },
      {
        id: "2",
        at: 2,
        toolId: "world_metadata.patch_projects",
        avatarId: "muse",
        source: "patch",
        ok: false,
        errorCode: "permission_denied",
        isPermissionError: true,
      },
    ];
    const agg = computeToolTelemetryAggregates(events);
    expect(agg.length).toBe(2);
    const okRow = agg.find((r) => r.errorCode == null);
    const denyRow = agg.find((r) => r.errorCode === "permission_denied");
    expect(okRow?.successCount).toBe(1);
    expect(denyRow?.failureCount).toBe(1);
  });

  it("sortToolTelemetryEventsForDisplay puts permission errors first", () => {
    const events: ToolTelemetryEvent[] = [
      {
        id: "a",
        at: 10,
        toolId: "t1",
        avatarId: "x",
        source: "patch",
        ok: false,
        errorCode: "bad patch",
      },
      {
        id: "b",
        at: 5,
        toolId: "t2",
        avatarId: "x",
        source: "patch",
        ok: false,
        errorCode: "permission_denied",
        isPermissionError: true,
      },
    ];
    const s = sortToolTelemetryEventsForDisplay(events);
    expect(s[0]!.id).toBe("b");
  });

  it("computeToolTelemetryAggregates sets lastResultPreview from newest event in bucket", () => {
    const events: ToolTelemetryEvent[] = [
      {
        id: "a",
        at: 100,
        toolId: "world_metadata.patch_projects",
        avatarId: "muse",
        source: "patch",
        ok: true,
        resultPreview: "older preview",
      },
      {
        id: "b",
        at: 200,
        toolId: "world_metadata.patch_projects",
        avatarId: "muse",
        source: "patch",
        ok: true,
        resultPreview: "newest wins",
      },
    ];
    const agg = computeToolTelemetryAggregates(events);
    const okRow = agg.find((r) => r.errorCode == null);
    expect(okRow?.lastResultPreview).toBe("newest wins");
  });

  it("computeToolTelemetryAggregates uses argsPreview for failure bucket when no resultPreview", () => {
    const events: ToolTelemetryEvent[] = [
      {
        id: "x",
        at: 1,
        toolId: "t",
        avatarId: "a1",
        source: "parse",
        ok: false,
        errorCode: "bad",
        argsPreview: "failed args snippet",
      },
    ];
    const agg = computeToolTelemetryAggregates(events);
    expect(agg[0]?.lastResultPreview).toBe("failed args snippet");
  });
});

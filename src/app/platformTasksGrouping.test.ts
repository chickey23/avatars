import { describe, expect, it } from "vitest";
import { groupPlatformTasksByProjectId } from "./platformTasksGrouping";
import type { PlatformTaskRecord } from "../services/platform/store";

function task(
  overrides: Partial<PlatformTaskRecord> & Pick<PlatformTaskRecord, "id" | "projectId" | "title">
): PlatformTaskRecord {
  return {
    status: "open",
    workflowStatus: "open",
    createdAt: 1,
    updatedAt: 1,
    history: [],
    ...overrides,
  } as PlatformTaskRecord;
}

describe("groupPlatformTasksByProjectId", () => {
  it("groups by projectId and sorts titles", () => {
    const out = groupPlatformTasksByProjectId({
      a: task({
        id: "a",
        projectId: "P1",
        title: "Zebra",
      }),
      b: task({
        id: "b",
        projectId: "P1",
        title: "Alpha",
      }),
      c: task({
        id: "c",
        projectId: "P2",
        title: "Solo",
      }),
    });
    expect(out.P1?.map((t) => t.title)).toEqual(["Alpha", "Zebra"]);
    expect(out.P2?.map((t) => t.id)).toEqual(["c"]);
  });

  it("includes capability id and notes on summaries", () => {
    const out = groupPlatformTasksByProjectId({
      a: task({
        id: "a",
        projectId: "P1",
        title: "T",
        notes: "hello",
        requiredCapability: { id: "avatar_creation", kind: "tool" },
      }),
    });
    expect(out.P1?.[0]?.requiredCapability?.id).toBe("avatar_creation");
    expect(out.P1?.[0]?.notes).toBe("hello");
  });

  it("skips tasks with empty projectId", () => {
    const out = groupPlatformTasksByProjectId({
      x: task({ id: "x", projectId: "", title: "Orphan" }),
    });
    expect(Object.keys(out)).toHaveLength(0);
  });
});

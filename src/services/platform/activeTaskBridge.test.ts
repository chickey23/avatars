import { describe, expect, it } from "vitest";
import { deriveActiveTaskFromPlatform } from "./activeTaskBridge";
import {
  PLATFORM_STORE_SCHEMA_VERSION,
  type PlatformStoreDoc,
} from "./store";

describe("deriveActiveTaskFromPlatform", () => {
  it("uses focused project open task title", () => {
    const store: PlatformStoreDoc = {
      schemaVersion: PLATFORM_STORE_SCHEMA_VERSION,
      migrations: {},
      projects: {
        p1: {
          id: "p1",
          title: "Firefly crew",
          status: "active",
          authorUserId: "user",
          createdAt: 1,
          updatedAt: 1,
          history: [],
        },
      },
      tasks: {
        t1: {
          id: "t1",
          projectId: "p1",
          title: "Create avatar: Mal",
          status: "open",
          workflowStatus: "open",
          authorUserId: "user",
          createdAt: 1,
          updatedAt: 1,
          history: [],
        },
      },
    };
    expect(
      deriveActiveTaskFromPlatform(store, { project: { id: "p1" } }, undefined)
    ).toBe("Firefly crew: Create avatar: Mal");
  });
});

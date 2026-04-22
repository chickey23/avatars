/**
 * Gate test — simulates the user removing the default system avatar row. With the
 * default monitor registry installed and no avatars carrying any
 * `monitor:*` / `tool_owner:*` / `system` tags, the polled registry must
 * report the required contracts as unclaimed and
 * `buildUnclaimedContractsWarning` must produce a single warning post that
 * falls back to the *first system avatar present*. Here we supply a plain,
 * tagless catalog to exercise the no-system-avatar path returning null (the
 * warning silently stands down because there's no one to author it).
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { Avatar } from "../../types";
import {
  __resetDefaultMonitorsForTests,
  installDefaultMonitors,
  pollAll,
  buildUnclaimedContractsWarning,
} from ".";

const mk = (id: string, systemTags?: string[]): Avatar =>
  ({
    id,
    processName: id,
    givenName: id,
    appellation: id,
    description: "",
    tags: [],
    personality: "",
    interests: [],
    assignedTasks: [],
    opinions: {},
    systemTags,
  }) as Avatar;

describe("installDefaultMonitors — no-system-avatar gate", () => {
  beforeEach(() => {
    __resetDefaultMonitorsForTests();
  });

  it("reports the required contracts as unclaimed when no one wears the tags", async () => {
    installDefaultMonitors();
    const catalog = [mk("alice"), mk("bob")];
    const result = await pollAll("startup", catalog);

    expect(result.unclaimed).toEqual(
      expect.arrayContaining([
        "unassigned_projects",
        "due_and_snoozed_items",
        "source_runner:email",
        "source_runner:calendar",
        "source_runner:contacts",
      ]),
    );
    expect(result.postsByMonitor).toEqual([]);

    const warn = buildUnclaimedContractsWarning({
      catalog,
      unclaimed: result.unclaimed,
      duplicate: result.duplicate,
    });
    expect(warn).toBeNull();
  });

  it("surfaces a single warning post when at least one system avatar is present", async () => {
    installDefaultMonitors();
    const catalog = [mk("alice"), mk("substitute", ["system"])];
    const result = await pollAll("startup", catalog);

    const warn = buildUnclaimedContractsWarning({
      catalog,
      unclaimed: result.unclaimed,
      duplicate: result.duplicate,
    });
    expect(warn).not.toBeNull();
    expect(warn?.authorAvatarId).toBe("substitute");
    expect(warn?.post.content).toContain("unassigned_projects");
    expect(warn?.post.content).toContain("due_and_snoozed_items");
    expect(warn?.post.content).toContain("source_runner:email");
  });

  it("reports every required contract as claimed when tagged defaults are present", async () => {
    installDefaultMonitors();
    const catalog = [
      mk("steward", [
        "system",
        "tool_owner:drafts",
        "monitor:unclaimed_contracts",
      ]),
      mk("timekeeper", ["system", "monitor:due_and_snoozed_items"]),
      mk("inbox_steward", ["system", "monitor:source_runner:email"]),
      mk("calendar_steward", ["system", "monitor:source_runner:calendar"]),
      mk("contacts_keeper", ["system", "monitor:source_runner:contacts"]),
      mk("upm", ["system", "monitor:unassigned_projects"]),
    ];
    const result = await pollAll("startup", catalog);
    expect(result.unclaimed).toEqual([]);
    expect(result.duplicate).toEqual([]);
  });

  it("re-tagging a steward avatar transfers the contract claimant", async () => {
    installDefaultMonitors();
    /** Original tag holder for source_runner:calendar. */
    const before = [
      mk("calendar_steward", ["system", "monitor:source_runner:calendar"]),
    ];
    let result = await pollAll("startup", before);
    expect(result.unclaimed).not.toContain("source_runner:calendar");

    /** Drop the tag from calendar_steward and grant it to a different avatar. */
    const after = [
      mk("calendar_steward", ["system"]),
      mk("muse", ["monitor:source_runner:calendar"]),
    ];
    result = await pollAll("startup", after);
    expect(result.unclaimed).not.toContain("source_runner:calendar");
    /** And removing all holders makes it unclaimed. */
    result = await pollAll("startup", [mk("calendar_steward", ["system"])]);
    expect(result.unclaimed).toContain("source_runner:calendar");
  });
});

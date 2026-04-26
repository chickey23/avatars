import { beforeEach, describe, expect, it } from "vitest";
import type { Avatar } from "../types";
import {
  buildCapabilityGroupRows,
  buildStewardshipWorkshopRows,
  getAvatarCapabilities,
  getAvatarStewardships,
  registeredNonGroupToolIds,
  stewardshipLabel,
  toolCapabilityLabel,
} from "./avatarOperations";
import {
  __resetDefaultMonitorsForTests,
  installDefaultMonitors,
} from "./monitors";

const mk = (id: string, systemTags?: string[], allowedAgenticToolIds?: string[]) =>
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
    allowedAgenticToolIds,
  }) as Avatar;

describe("avatarOperations", () => {
  beforeEach(() => {
    __resetDefaultMonitorsForTests();
    installDefaultMonitors();
  });

  it("labels monitor stewardships without exposing raw tags", () => {
    const avatar = mk("hermes", ["system", "monitor:source_runner:email"], []);
    expect(stewardshipLabel("source_runner:email")).toBe("Email source runner");
    expect(getAvatarStewardships(avatar)).toEqual([
      expect.objectContaining({
        name: "source_runner:email",
        label: "Email source runner",
        required: true,
      }),
    ]);
  });

  it("separates grouped capabilities from individual tool allowlists", () => {
    const steward = mk(
      "platform",
      ["system", "tool_owner:drafts"],
      ["drafts.tasks"]
    );
    expect(getAvatarCapabilities(steward)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool_group",
          label: "Draft write tools",
        }),
        expect.objectContaining({
          kind: "tool",
          label: "Create task drafts",
        }),
      ])
    );
    expect(toolCapabilityLabel("gmail.fetch_message_body")).toBe(
      "Fetch Gmail message body"
    );
    expect(registeredNonGroupToolIds()).toContain("gmail.fetch_message_body");
    expect(registeredNonGroupToolIds()).not.toContain("drafts.tasks");
  });

  it("builds workshop rows with unclaimed and duplicate status", () => {
    const rows = buildStewardshipWorkshopRows([
      mk("a", ["monitor:source_runner:email"]),
      mk("b", ["monitor:source_runner:email"]),
    ]);
    expect(rows.find((row) => row.name === "source_runner:email")).toEqual(
      expect.objectContaining({ status: "duplicate" })
    );
    expect(rows.find((row) => row.name === "source_runner:calendar")).toEqual(
      expect.objectContaining({ status: "unclaimed" })
    );
  });

  it("builds capability group rows from tool owner tags", () => {
    const rows = buildCapabilityGroupRows([
      mk("platform", ["tool_owner:drafts"]),
      mk("exchequer", ["tool_owner:avatar_creation"]),
    ]);
    expect(rows.find((row) => row.group === "drafts")).toEqual(
      expect.objectContaining({
        label: "Draft write tools",
        status: "claimed",
      })
    );
    expect(rows.find((row) => row.group === "avatar_creation")).toEqual(
      expect.objectContaining({
        label: "Avatar creation workshop",
        status: "claimed",
      })
    );
  });
});

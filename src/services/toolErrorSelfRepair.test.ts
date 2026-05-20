import { describe, expect, it } from "vitest";
import {
  attemptMissingArgRepairForResults,
  buildTrustedRepairArgs,
  classifyToolError,
  missingRequiredFieldsForTool,
} from "./toolErrorSelfRepair";
import type { WorldviewToolCall } from "./worldviewTools/parse";

describe("toolErrorSelfRepair", () => {
  it("classifies missing open_draft args", () => {
    expect(classifyToolError("missing seedText and wikiQuery")).toBe(
      "missing_required_args"
    );
    expect(
      missingRequiredFieldsForTool(
        "avatars.workshop.open_draft",
        "missing seedText and wikiQuery"
      )
    ).toEqual(["seedText", "wikiQuery"]);
  });

  it("builds trusted args for open_draft from user message", () => {
    const args = buildTrustedRepairArgs({
      userContent: "please create an avatar for Ada Lovelace",
      toolName: "avatars.workshop.open_draft",
      error: "missing seedText and wikiQuery",
      requiredFields: ["seedText", "wikiQuery"],
      existingArgs: {},
    });
    expect(args?.wikiQuery).toContain("Ada Lovelace");
    expect(args?.seedText).toContain("create an avatar");
  });

  it("repairs one failed tool per turn", () => {
    const tools: WorldviewToolCall[] = [
      { name: "avatars.workshop.open_draft", args: {} },
    ];
    const results = [
      { name: "avatars.workshop.open_draft", ok: false, error: "missing seedText and wikiQuery" },
    ];
    const repair = attemptMissingArgRepairForResults(tools, results, {
      userContent: "create avatar for Neo",
    });
    expect(repair?.repairedTool.name).toBe("avatars.workshop.open_draft");
    expect(repair?.repairedTool.args).toMatchObject({ wikiQuery: expect.any(String) });
  });
});

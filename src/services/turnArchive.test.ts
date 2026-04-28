import { describe, expect, it } from "vitest";
import type { Avatar } from "../types";
import {
  buildCompactTurnRecord,
  formatTurnMetaLine,
  getTurnLogDetailLines,
} from "./turnArchive";

const avatars = [
  {
    id: "blessed_exchequer",
    givenName: "The Blessed Exchequer",
  },
] as Avatar[];

describe("turnArchive routing diagnostics", () => {
  it("records and formats avatar creation offer decisions", () => {
    const turn = buildCompactTurnRecord(
      "u1",
      "please create an avatar for belanna torres",
      undefined,
      undefined,
      [
        {
          depth: 0,
          responderIds: ["blessed_exchequer"],
          selection: "forced_primary",
        },
      ],
      [
        {
          avatarId: "blessed_exchequer",
          content: "I prepared an avatar creation draft offer below.",
          replySource: "ollama",
          promptDebug: {
            ruleBlockIds: ["global-brief", "global-safe", "tone-in-character"],
            turnToolIntent: "creation",
            worldviewParsedToolIntentNames: [],
            worldviewExecutedToolNames: [],
          },
          postTurnUi: {
            navigateAvatarCreationWorkshop: {
              wikiQuery: "belanna torres",
              seedText: "please create an avatar for belanna torres",
            },
          },
          postTurnUiReason: "creation_generic_reply_fallback",
        },
      ]
    );

    expect(formatTurnMetaLine(turn)).toContain("ui:avatar_creation_offer");
    const lines = getTurnLogDetailLines(turn, avatars);
    expect(lines).toContain(
      "The Blessed Exchequer logic: source ollama · intent creation -> expected avatars.workshop.open_draft"
    );
    expect(lines).toContain(
      "The Blessed Exchequer tools: parsed none; executed none"
    );
    expect(lines).toContain(
      "The Blessed Exchequer post-turn UI: avatar creation offer · wikiQuery=belanna torres · seedText · reason=creation_generic_reply_fallback"
    );
  });

  it("formats parse hints and tool failures for routing log inspection", () => {
    const turn = buildCompactTurnRecord(
      "u2",
      "create an avatar",
      undefined,
      undefined,
      [
        {
          depth: 0,
          responderIds: ["blessed_exchequer"],
          selection: "forced_primary",
        },
      ],
      [
        {
          avatarId: "blessed_exchequer",
          content: "Done.",
          replySource: "ollama",
          promptDebug: {
            turnToolIntent: "creation",
            worldviewParsedToolIntentNames: ["avatars.workshop.open_draft"],
            worldviewExecutedToolNames: [],
            worldviewParseHints: ["bad JSON fence"],
          },
          toolResolutionFailures: [
            {
              tool: "avatars.workshop.open_draft",
              error: "missing seedText and wikiQuery",
            },
          ],
        },
      ]
    );

    const lines = getTurnLogDetailLines(turn, avatars);
    expect(lines).toContain(
      "The Blessed Exchequer tools: parsed avatars.workshop.open_draft; executed none"
    );
    expect(lines).toContain("The Blessed Exchequer parse hints: bad JSON fence");
    expect(lines).toContain(
      "The Blessed Exchequer tool failure: avatars.workshop.open_draft: missing seedText and wikiQuery"
    );
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConversationMessage, SituationContext } from "../types";
import { defaultAvatars } from "../data/defaultAvatars";
import { runAvatarAgent } from "./avatarAgents";
import * as ollama from "./ollama";

vi.mock("./ollama", async (importActual) => {
  const a = await importActual<typeof import("./ollama")>();
  return {
    ...a,
    getOllamaPresence: vi.fn().mockResolvedValue("ready"),
    generateWithOllama: vi.fn(),
  };
});

function ctxWithUser(content: string): SituationContext {
  const msg: ConversationMessage = {
    id: "u1",
    role: "user",
    content,
    timestamp: Date.now(),
  };
  return {
    conversationThread: [msg],
    recentEvents: [],
    cuesAndTriggers: [],
    replyToUserMessageId: "u1",
  };
}

describe("runAvatarAgent structured tools", () => {
  beforeEach(() => {
    vi.mocked(ollama.generateWithOllama).mockReset();
    vi.mocked(ollama.getOllamaPresence).mockResolvedValue("ready");
  });

  it("parses open_draft and sets postTurnUi", async () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    vi.mocked(ollama.generateWithOllama).mockResolvedValue({
      ok: true,
      text: 'Done.\n\n```json\n{"schema":"avatars_tools_v1","tools":[{"name":"avatars.workshop.open_draft","args":{"wikiQuery":"Neo","seedText":""}}]}\n```\n',
    });
    const r = await runAvatarAgent(exc, ctxWithUser("create an avatar for Neo"));
    expect(r.worldviewActivity?.names).toContain("avatars.workshop.open_draft");
    expect(r.postTurnUi?.navigateAvatarCreationWorkshop?.wikiQuery).toBe("Neo");
  });

  it("runs a one-shot repair when the first reply fails tool parse", async () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    vi.mocked(ollama.generateWithOllama)
      .mockResolvedValueOnce({
        ok: true,
        text: 'I will call wikipedia.search(q="Ada")',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: '```json\n{"schema":"avatars_tools_v1","tools":[{"name":"avatars.workshop.open_draft","args":{"wikiQuery":"Ada","seedText":""}}]}\n```',
      });
    const r = await runAvatarAgent(
      exc,
      ctxWithUser("please create a new avatar for Ada")
    );
    expect(ollama.generateWithOllama).toHaveBeenCalledTimes(2);
    expect(r.postTurnUi?.navigateAvatarCreationWorkshop?.wikiQuery).toBe("Ada");
  });

  it("converts workshop-opening questions into a draft offer", async () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    vi.mocked(ollama.generateWithOllama).mockResolvedValue({
      ok: true,
      text: "Would you like me to open the avatar creation workshop for Neo?",
    });

    const r = await runAvatarAgent(exc, ctxWithUser("create an avatar for Neo"));

    expect(r.content).toBe("I prepared an avatar creation draft offer below.");
    expect(r.postTurnUi?.navigateAvatarCreationWorkshop?.wikiQuery).toBe("Neo");
    expect(r.postTurnUi?.navigateAvatarCreationWorkshop?.seedText).toContain(
      "create an avatar for Neo"
    );
  });

  it("converts generic avatar-creation help into a draft offer", async () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    vi.mocked(ollama.generateWithOllama).mockResolvedValue({
      ok: true,
      text: "I can help you with creating an avatar for Belanna Torres.",
    });

    const r = await runAvatarAgent(
      exc,
      ctxWithUser("please create an avatar for belanna torres")
    );

    expect(r.content).toBe("I prepared an avatar creation draft offer below.");
    expect(r.postTurnUi?.navigateAvatarCreationWorkshop?.wikiQuery).toBe(
      "belanna torres"
    );
  });

  it("converts garbled tool prose into a draft offer (R1)", async () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    vi.mocked(ollama.generateWithOllama).mockResolvedValue({
      ok: true,
      text: 'Here is the tool:\n```json\n{"schema":"avatars_tools_v1","tools":[{"name":"avatars.workshop.open_draft","args":{',
    });

    const r = await runAvatarAgent(
      exc,
      ctxWithUser("please create an avatar for Neo")
    );

    expect(r.content).toBe("I prepared an avatar creation draft offer below.");
    expect(r.postTurnUi?.navigateAvatarCreationWorkshop?.wikiQuery).toBe("Neo");
    expect(r.postTurnUiReason).toBe("creation_garbled_tool_fallback");
  });

  it("preserves substantive creation notes while still offering the draft", async () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    vi.mocked(ollama.generateWithOllama).mockResolvedValue({
      ok: true,
      text: "Belanna Torres is a half-Klingon engineer from Star Trek: Voyager; emphasize discipline, volatility, and technical mastery.",
    });

    const r = await runAvatarAgent(
      exc,
      ctxWithUser("please create an avatar for belanna torres")
    );

    expect(r.content).toContain("half-Klingon engineer");
    expect(r.postTurnUi?.navigateAvatarCreationWorkshop?.wikiQuery).toBe(
      "belanna torres"
    );
  });
});

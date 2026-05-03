import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDiscoverSetMembers,
  mockPopulateSetFromWikidata,
  mockSearchRankedWorks,
  mockResolveCastForWork,
  mockGetOllamaPresence,
  mockSuggestSetMembersWithOllama,
} = vi.hoisted(() => ({
  mockDiscoverSetMembers: vi.fn(),
  mockPopulateSetFromWikidata: vi.fn(),
  mockSearchRankedWorks: vi.fn(),
  mockResolveCastForWork: vi.fn(),
  mockGetOllamaPresence: vi.fn(),
  mockSuggestSetMembersWithOllama: vi.fn(),
}));

vi.mock("../platform/populateSetTask", () => ({
  populateSetFromWikidataForPlan: mockPopulateSetFromWikidata,
}));

vi.mock("../knowledgeBase/wikidataResolve", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../knowledgeBase/wikidataResolve")
  >();
  return {
    ...actual,
    searchRankedWorks: mockSearchRankedWorks,
    resolveCastForWork: mockResolveCastForWork,
  };
});

vi.mock("../complexTasks/avatarCreationDiscovery", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../complexTasks/avatarCreationDiscovery")
  >();
  return {
    ...actual,
    discoverSetMembers: mockDiscoverSetMembers,
  };
});

vi.mock("../ollama", () => ({
  getOllamaPresence: mockGetOllamaPresence,
  generateWithOllama: vi.fn(),
}));

vi.mock("../complexTasks/ollamaSetMemberSuggest", () => ({
  suggestSetMembersWithOllama: mockSuggestSetMembersWithOllama,
}));
import type { Avatar, ConversationMessage } from "../../types";
import {
  __resetPlatformStoreForTests,
  getPlatformStore,
  ensurePlatformStoreLoadedSync,
} from "../platform/store";
import {
  __resetMonitorsForTests,
  pollAll,
  registerMonitor,
} from "./registry";
import {
  __resetSyntheticPostForTests,
  postMonitorPost,
  postSyntheticMessage,
  setSyntheticPostSink,
} from "./postSynthetic";
import {
  __resetSyntheticActionsForTests,
  runSyntheticAction,
} from "./actions";
import {
  setAvatarCatalogAccessor,
  __resetAvatarCatalogAccessorForTests,
} from "../avatarCreationRouting";
import {
  COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
  COMPLEX_TASK_PLANNER_MONITOR_NAME,
  COMPLEX_TASK_PLANNER_TAG,
  complexTaskPlannerMonitor,
} from "./complexTaskPlanner";
import { __resetWorldMetadataForTests } from "../worldMetadata/store";

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

function installMemoryLocalStorage(): void {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, String(value));
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => data.clear(),
    },
  });
}

describe("complexTaskPlannerMonitor", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
    mockResolveCastForWork.mockReset();
    __resetWorldMetadataForTests();
    __resetPlatformStoreForTests();
    ensurePlatformStoreLoadedSync();
    __resetMonitorsForTests();
    __resetSyntheticPostForTests();
    __resetSyntheticActionsForTests();
    __resetAvatarCatalogAccessorForTests();
    mockPopulateSetFromWikidata.mockResolvedValue({
      subjectNames: [],
      detailLines: [],
      notices: [],
      usedWikidata: false,
      partialRoster: false,
    });
    mockDiscoverSetMembers.mockResolvedValue({
      names: [],
      sourceLines: [],
      notices: [],
    });
    mockSearchRankedWorks.mockResolvedValue({ ranked: [], notices: [] });
    mockResolveCastForWork.mockResolvedValue({
      members: [{ name: "StubChar", qid: "Q9001", descriptors: [] }],
      notices: [],
    });
    mockGetOllamaPresence.mockResolvedValue("no_server");
    mockSuggestSetMembersWithOllama.mockResolvedValue({
      names: [],
      sourceLines: [],
      notices: ["ollama_not_ready:no_server"],
    });
  });

  afterEach(() => {
    mockDiscoverSetMembers.mockClear();
    mockPopulateSetFromWikidata.mockClear();
    mockSearchRankedWorks.mockClear();
    mockResolveCastForWork.mockClear();
    mockGetOllamaPresence.mockClear();
    mockSuggestSetMembersWithOllama.mockClear();
  });

  it("posts a review card for a named avatar creation request", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Alice, Bob, and Carol",
        timestamp: 1,
      },
    });

    expect(result.postsByMonitor).toHaveLength(1);
    const post = result.postsByMonitor[0]!.posts[0]!;
    expect(post.content).toContain("Alice, Bob, Carol");
    expect(post.actions?.map((a) => a.label)).toContain("Create tasks");
  });

  it("posts a set discovery card for implicit cast-style chat when explicit parser is null", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u_implicit",
        content: "Who was in The Princess Bride?",
        timestamp: 1,
      },
    });

    expect(result.postsByMonitor).toHaveLength(1);
    const post = result.postsByMonitor[0]!.posts[0]!;
    expect(post.content).toContain("set discovery");
    expect(post.actions?.map((a) => a.label)).toEqual(
      expect.arrayContaining(["Search members", "Not now"])
    );
  });

  it("attributes the review card to primaryAvatarId when routable", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("muse", []),
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "What is the cast of Galaxy Quest?",
        timestamp: 1,
      },
      primaryAvatarId: "muse",
    });

    const post = result.postsByMonitor[0]!.posts[0]!;
    expect(post.avatarId).toBe("muse");
  });

  it("uses the fallback avatar when no catalog row claims the monitor tag", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [mk(COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID, ["system"])];

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Alice and Bob",
        timestamp: 1,
      },
    });

    const post = result.postsByMonitor[0]!.posts[0]!;
    expect(post.avatarId).toBe(COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID);
    expect(result.unclaimed).toEqual([]);
  });

  it("creates one project and one task per named avatar when accepted", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Alice, Bob, and Carol",
        timestamp: 1,
      },
    });
    postMonitorPost(result.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const prompt = posted[0]!;
    const action = prompt.syntheticActions!.find((a) =>
      a.id.startsWith("create_avatar_tasks:")
    )!;

    await runSyntheticAction(prompt, action);

    const store = getPlatformStore();
    const projects = Object.values(store.projects);
    const tasks = Object.values(store.tasks);
    expect(projects).toHaveLength(1);
    expect(tasks.map((t) => t.title).sort()).toEqual([
      "Create avatar: Alice",
      "Create avatar: Bob",
      "Create avatar: Carol",
    ]);
    expect(tasks.every((t) => t.requiredCapability?.id === "avatar_creation")).toBe(
      true
    );
    expect(tasks.every((t) => t.notes?.includes("seedText:"))).toBe(true);
    expect(tasks.every((t) => t.notes?.includes("wikiQuery:"))).toBe(true);
    expect(posted.at(-1)?.content).toContain("Created");
  });

  it("posts Search members action for set_discovery plan", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });

    const post = result.postsByMonitor[0]!.posts[0]!;
    expect(post.content).toContain("Firefly");
    expect(post.actions?.map((a) => a.label)).toEqual(
      expect.arrayContaining(["Search members", "Not now"])
    );
    expect(mockDiscoverSetMembers).not.toHaveBeenCalled();
  });

  it("posts a Wikidata work pick card when populate fails and ranked works exist", async () => {
    mockPopulateSetFromWikidata.mockResolvedValue({
      subjectNames: [],
      detailLines: [],
      notices: [],
      usedWikidata: false,
      partialRoster: false,
    });
    mockSearchRankedWorks.mockResolvedValue({
      ranked: [
        { id: "Q100", label: "Example Series A", description: "TV show" },
        { id: "Q200", label: "Example Series B", description: "Film" },
      ],
      notices: [],
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    const searchAction = review.syntheticActions!.find((a) =>
      a.id.startsWith("search_members:")
    )!;
    await runSyntheticAction(review, searchAction);

    expect(mockDiscoverSetMembers).not.toHaveBeenCalled();
    const pick = posted.find((m) => m.content.includes("CHOOSE THE SOURCE"));
    expect(pick).toBeDefined();
    expect(pick!.syntheticActions!.some((a) => a.id.startsWith("pick_wikidata_work:"))).toBe(
      true
    );
    expect(
      pick!.syntheticActions!.some((a) => a.id.startsWith("pick_wikidata_none_web:"))
    ).toBe(true);
  });

  it("prefetch excludes Wikidata works with empty cast from work-pick buttons", async () => {
    mockPopulateSetFromWikidata.mockResolvedValue({
      subjectNames: [],
      detailLines: [],
      notices: [],
      usedWikidata: false,
      partialRoster: false,
    });
    mockSearchRankedWorks.mockResolvedValue({
      ranked: [
        { id: "Q100", label: "Empty work", description: "TV show" },
        { id: "Q200", label: "Has cast", description: "Film" },
      ],
      notices: ["wikidata_ambiguous_top2"],
    });
    mockResolveCastForWork.mockImplementation(async (qid: string) => {
      const u = qid.toUpperCase();
      if (u.includes("Q100")) return { members: [], notices: [] };
      return {
        members: [{ name: "Zoe", qid: "Q9002", descriptors: [] }],
        notices: [],
      };
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    const searchAction = review.syntheticActions!.find((a) =>
      a.id.startsWith("search_members:")
    )!;
    await runSyntheticAction(review, searchAction);

    const pick = posted.find((m) => m.content.includes("CHOOSE THE SOURCE"));
    expect(pick).toBeDefined();
    const workButtons = pick!.syntheticActions!.filter((a) =>
      a.id.startsWith("pick_wikidata_work:")
    );
    expect(workButtons.some((a) => a.id.includes("Q100"))).toBe(false);
    expect(workButtons.some((a) => a.id.includes("Q200"))).toBe(true);
  });

  it("runs web discovery when user chooses none on work pick card", async () => {
    mockPopulateSetFromWikidata.mockResolvedValue({
      subjectNames: [],
      detailLines: [],
      notices: [],
      usedWikidata: false,
      partialRoster: false,
    });
    mockSearchRankedWorks.mockResolvedValue({
      ranked: [
        { id: "Q1", label: "Work A", description: "series" },
        { id: "Q2", label: "Work B", description: "series" },
      ],
      notices: [],
    });
    mockDiscoverSetMembers.mockResolvedValue({
      names: ["Pat Example"],
      sourceLines: ["- hit"],
      notices: [],
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    await runSyntheticAction(
      review,
      review.syntheticActions!.find((a) => a.id.startsWith("search_members:"))!
    );
    const pick = posted.find((m) => m.content.includes("CHOOSE THE SOURCE"))!;
    const none = pick.syntheticActions!.find((a) =>
      a.id.startsWith("pick_wikidata_none_web:")
    )!;
    await runSyntheticAction(pick, none);

    expect(mockDiscoverSetMembers).toHaveBeenCalled();
    expect(posted.some((m) => m.content.includes("Discovery for"))).toBe(true);
    expect(
      posted.some((m) => m.content.includes("**Source:** web search snippets"))
    ).toBe(true);
  });

  it("runs discovery and creates tasks when Search members then Create all pending", async () => {
    mockDiscoverSetMembers.mockResolvedValue({
      names: ["Kaylee Frye", "Simon Tam", "River Tam"],
      sourceLines: ["- hit"],
      notices: [],
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    const searchAction = review.syntheticActions!.find((a) =>
      a.id.startsWith("search_members:")
    )!;
    await runSyntheticAction(review, searchAction);

    expect(mockDiscoverSetMembers).toHaveBeenCalledTimes(1);
    const discoveryMsg = posted.find((m) => m.content.includes("Discovery for"));
    expect(discoveryMsg).toBeDefined();
    const createAll = discoveryMsg!.syntheticActions!.find((a) =>
      a.id.startsWith("create_all_pending:")
    )!;
    await runSyntheticAction(discoveryMsg!, createAll);

    const store = getPlatformStore();
    const tasks = Object.values(store.tasks);
    expect(tasks.map((t) => t.title).sort()).toEqual([
      "Create avatar: Kaylee Frye",
      "Create avatar: River Tam",
      "Create avatar: Simon Tam",
    ]);
  });

  it("includes Suggest members (local LLM) when Ollama is ready", async () => {
    mockGetOllamaPresence.mockResolvedValue("ready");
    mockDiscoverSetMembers.mockResolvedValue({
      names: ["Kaylee Frye", "Simon Tam", "River Tam"],
      sourceLines: ["- hit"],
      notices: [],
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    await runSyntheticAction(
      review,
      review.syntheticActions!.find((a) => a.id.startsWith("search_members:"))!
    );

    const discoveryMsg = posted.find((m) => m.content.includes("Discovery for"));
    expect(
      discoveryMsg?.syntheticActions?.some((a) =>
        a.id.startsWith("suggest_set_members_ollama:")
      )
    ).toBe(true);
  });

  it("Suggest members (local LLM) runs ollama suggest and posts Ollama disclaimer", async () => {
    mockGetOllamaPresence.mockResolvedValue("ready");
    mockDiscoverSetMembers.mockResolvedValue({
      names: ["Kaylee Frye", "Simon Tam", "River Tam"],
      sourceLines: ["- hit"],
      notices: [],
    });
    mockSuggestSetMembersWithOllama.mockResolvedValue({
      names: ["Hoban Washburne", "Zoë Washburne", "Shepherd Book"],
      sourceLines: ["notice: ollama_suggested", "work: Firefly"],
      notices: ["ollama_suggested"],
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    await runSyntheticAction(
      review,
      review.syntheticActions!.find((a) => a.id.startsWith("search_members:"))!
    );
    const discoveryMsg = posted.find((m) => m.content.includes("Discovery for"))!;
    const ollamaBtn = discoveryMsg.syntheticActions!.find((a) =>
      a.id.startsWith("suggest_set_members_ollama:")
    )!;
    await runSyntheticAction(discoveryMsg, ollamaBtn);

    expect(mockSuggestSetMembersWithOllama).toHaveBeenCalled();
    const ollamaDiscovery = posted.filter((m) => m.content.includes("local LLM (Ollama)"));
    expect(ollamaDiscovery.length).toBeGreaterThan(0);
    expect(ollamaDiscovery.some((m) => m.content.includes("Washburne"))).toBe(true);
  });

  it("posts discovery card without Create all when discovery returns no names", async () => {
    mockDiscoverSetMembers.mockResolvedValue({
      names: [],
      sourceLines: ["notice: tauri_only_targeted_search"],
      notices: ["tauri_only_targeted_search"],
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    const searchAction = review.syntheticActions!.find((a) =>
      a.id.startsWith("search_members:")
    )!;
    await runSyntheticAction(review, searchAction);

    const discoveryMsg = posted.find((m) => m.content.includes("Discovery for"))!;
    expect(discoveryMsg.content).toContain("No member names");
    expect(
      discoveryMsg.syntheticActions?.some((a) =>
        a.id.startsWith("create_all_pending:")
      )
    ).toBe(false);
    const emptyLabels = discoveryMsg.syntheticActions?.map((a) => a.label) ?? [];
    for (const label of ["Search again", "Skip", "Done building set"]) {
      expect(emptyLabels).toContain(label);
    }
  });

  it("allows a second Search again to re-invoke discovery", async () => {
    let discoveryCall = 0;
    mockDiscoverSetMembers.mockReset();
    mockDiscoverSetMembers.mockImplementation(async () => {
      discoveryCall += 1;
      if (discoveryCall === 1) {
        return { names: [], sourceLines: [], notices: [] };
      }
      return {
        names: ["Only One"],
        sourceLines: ["- x"],
        notices: [],
      };
    });
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const poll = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars for the main crew of Firefly",
        timestamp: 1,
      },
    });
    postMonitorPost(poll.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const review = posted[0]!;
    await runSyntheticAction(
      review,
      review.syntheticActions!.find((a) => a.id.startsWith("search_members:"))!
    );
    const firstDiscovery = posted.find((m) => m.content.includes("Discovery for"))!;
    await runSyntheticAction(
      firstDiscovery,
      firstDiscovery.syntheticActions!.find((a) =>
        a.id.startsWith("search_discovery_again:")
      )!
    );
    expect(mockDiscoverSetMembers).toHaveBeenCalledTimes(2);
    const discoveryMsgs = posted.filter((m) => m.content.includes("Discovery for"));
    expect(discoveryMsgs.length).toBe(2);
    expect(discoveryMsgs.at(-1)!.content).toContain("Only One");
  });

  it("creates two distinct projects when two different named-list prompts are accepted", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const runAccept = async (userMsgId: string, content: string) => {
      const result = await pollAll("user_turn", catalog, {
        latestUserMessage: { id: userMsgId, content, timestamp: 1 },
      });
      postMonitorPost(result.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
      const prompt = posted.at(-1)!;
      const action = prompt.syntheticActions!.find((a) =>
        a.id.startsWith("create_avatar_tasks:")
      )!;
      await runSyntheticAction(prompt, action);
    };

    await runAccept("u1", "Create avatars named Dana and Fox");
    await runAccept("u2", "Create avatars named Scully and Mulder");

    const store = getPlatformStore();
    const projects = Object.values(store.projects);
    expect(projects).toHaveLength(2);
    expect(new Set(projects.map((p) => p.id)).size).toBe(2);
  });

  it("suppresses duplicate postSyntheticMessage within dedup window for same dedupKey", () => {
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const first = postSyntheticMessage({
      avatarId: "a1",
      monitorTag: COMPLEX_TASK_PLANNER_TAG,
      content: "dup test",
      dedupKey: "dedup-test-key",
    });
    const second = postSyntheticMessage({
      avatarId: "a1",
      monitorTag: COMPLEX_TASK_PLANNER_TAG,
      content: "different body",
      dedupKey: "dedup-test-key",
    });

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(posted).toHaveLength(1);
  });

  it("sets ownerAvatarId on tasks when a non-system avatar holds tool_owner:avatar_creation", async () => {
    setAvatarCatalogAccessor(() => [
      mk("custom_steward", ["tool_owner:avatar_creation"]),
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ]);
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("custom_steward", ["tool_owner:avatar_creation"]),
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Eve and Wall-E",
        timestamp: 1,
      },
    });
    postMonitorPost(result.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const prompt = posted[0]!;
    const action = prompt.syntheticActions!.find((a) =>
      a.id.startsWith("create_avatar_tasks:")
    )!;
    await runSyntheticAction(prompt, action);

    const store = getPlatformStore();
    const tasks = Object.values(store.tasks);
    expect(tasks).toHaveLength(2);
    expect(tasks.every((t) => t.ownerAvatarId === "custom_steward")).toBe(true);
    expect(Object.values(store.projects)[0]!.ownerAvatarId).toBe("custom_steward");
  });

  it("omits ownerAvatarId when only the default system steward holds avatar_creation", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Moe and Larry",
        timestamp: 1,
      },
    });
    postMonitorPost(result.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const prompt = posted[0]!;
    const action = prompt.syntheticActions!.find((a) =>
      a.id.startsWith("create_avatar_tasks:")
    )!;
    await runSyntheticAction(prompt, action);

    const store = getPlatformStore();
    const tasks = Object.values(store.tasks);
    expect(tasks.every((t) => t.ownerAvatarId === undefined)).toBe(true);
    expect(Object.values(store.projects)[0]!.ownerAvatarId).toBeUndefined();
  });

  it("picks the first sorted id when two avatars claim tool_owner:avatar_creation", async () => {
    setAvatarCatalogAccessor(() => [
      mk("zebra_owner", ["tool_owner:avatar_creation"]),
      mk("alpha_owner", ["tool_owner:avatar_creation"]),
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ]);
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("zebra_owner", ["tool_owner:avatar_creation"]),
      mk("alpha_owner", ["tool_owner:avatar_creation"]),
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Solo",
        timestamp: 1,
      },
    });
    postMonitorPost(result.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const prompt = posted[0]!;
    const action = prompt.syntheticActions!.find((a) =>
      a.id.startsWith("create_avatar_tasks:")
    )!;
    await runSyntheticAction(prompt, action);

    const store = getPlatformStore();
    expect(Object.values(store.tasks)[0]!.ownerAvatarId).toBe("alpha_owner");
  });
});

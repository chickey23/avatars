import { afterEach, describe, expect, it, vi } from "vitest";
import { recordToolTelemetryForOllamaTurn } from "./ingest";
import * as store from "./store";

describe("recordToolTelemetryForOllamaTurn", () => {
  const appendSpy = vi.spyOn(store, "appendToolTelemetryEvent");

  afterEach(() => {
    appendSpy.mockClear();
  });

  it("records ok events with resultPreview when provided", () => {
    recordToolTelemetryForOllamaTurn({
      avatarId: "muse",
      userMessageId: "um-1",
      successes: [
        { toolId: "world_metadata.patch_projects", resultPreview: "Patched 2 projects" },
      ],
      failures: undefined,
      parseHints: undefined,
      hadMergedToolCalls: true,
      isExecutor: true,
    });
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy.mock.calls[0]![0]).toMatchObject({
      toolId: "world_metadata.patch_projects",
      ok: true,
      resultPreview: "Patched 2 projects",
      userMessageId: "um-1",
    });
  });

  it("omits empty resultPreview on success rows", () => {
    recordToolTelemetryForOllamaTurn({
      avatarId: "muse",
      successes: [{ toolId: "world_metadata.patch_projects", resultPreview: "   " }],
      failures: undefined,
      parseHints: undefined,
      hadMergedToolCalls: true,
      isExecutor: false,
    });
    expect(appendSpy.mock.calls[0]![0]).toMatchObject({
      ok: true,
      resultPreview: undefined,
    });
  });

  it("records correctToolForIntent when turnIntent is set", () => {
    recordToolTelemetryForOllamaTurn({
      avatarId: "blessed_exchequer",
      successes: [
        { toolId: "avatars.workshop.open_draft", resultPreview: "creation workshop" },
      ],
      failures: undefined,
      parseHints: undefined,
      hadMergedToolCalls: true,
      isExecutor: false,
      turnIntent: "creation",
    });
    expect(appendSpy.mock.calls[0]![0]).toMatchObject({
      ok: true,
      turnIntent: "creation",
      correctToolForIntent: true,
    });
  });
});

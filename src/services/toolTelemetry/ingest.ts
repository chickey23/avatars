import type { WorldviewToolResolutionFailure } from "../../types";
import type { ToolTelemetrySource } from "./types";
import type { TurnToolIntent } from "../turnToolIntent";
import { appendToolTelemetryEvent } from "./store";

function toolMatchesIntent(
  intent: TurnToolIntent,
  toolName: string
): boolean {
  if (intent === "creation") return toolName === "avatars.workshop.open_draft";
  if (intent === "email_fetch") return toolName === "gmail.fetch_message_body";
  if (intent === "fact_save") {
    return (
      toolName === "world_metadata.patch_projects" ||
      toolName === "world_metadata.patch_people" ||
      toolName === "user_profile.patch"
    );
  }
  return true;
}

function sourceForToolName(name: string): ToolTelemetrySource {
  if (name === "gmail.fetch_message_body") return "gmail_fetch";
  return "patch";
}

function sourceForFailure(f: WorldviewToolResolutionFailure): ToolTelemetrySource {
  if (f.tool === "lexical") return "lexical";
  if (f.tool === "gmail.fetch_message_body") return "gmail_fetch";
  return "patch";
}

/**
 * Record tool outcomes for one Ollama avatar turn (single choke point).
 */
export function recordToolTelemetryForOllamaTurn(args: {
  avatarId: string;
  userMessageId?: string;
  successes: { toolId: string; resultPreview?: string }[];
  failures: WorldviewToolResolutionFailure[] | undefined;
  parseHints: string[] | undefined;
  /** True when the model returned at least one merged tool call this turn. */
  hadMergedToolCalls: boolean;
  isExecutor: boolean;
  switchboardRoutingMode?: string;
  turnIntent?: TurnToolIntent;
}): void {
  const {
    avatarId,
    userMessageId,
    successes,
    failures,
    parseHints,
    hadMergedToolCalls,
    isExecutor,
    switchboardRoutingMode,
    turnIntent,
  } = args;

  const ctxHint = {
    isExecutor,
    switchboardRoutingMode,
  };

  for (const s of successes) {
    const preview = s.resultPreview?.trim();
    const correctToolForIntent =
      turnIntent !== undefined && turnIntent !== "none"
        ? toolMatchesIntent(turnIntent, s.toolId)
        : undefined;
    appendToolTelemetryEvent({
      toolId: s.toolId,
      avatarId,
      userMessageId,
      source: sourceForToolName(s.toolId),
      ok: true,
      resultPreview: preview || undefined,
      turnIntent,
      correctToolForIntent,
      ...ctxHint,
    });
  }

  if (failures?.length) {
    for (const f of failures) {
      appendToolTelemetryEvent({
        toolId: f.tool,
        avatarId,
        userMessageId,
        source: sourceForFailure(f),
        ok: false,
        errorCode: f.error,
        argsPreview: f.argsPreview,
        ...ctxHint,
      });
    }
  }

  if (
    parseHints &&
    parseHints.length > 0 &&
    !hadMergedToolCalls
  ) {
    appendToolTelemetryEvent({
      toolId: "avatars_tools_v1",
      avatarId,
      userMessageId,
      source: "parse",
      ok: false,
      errorCode: "parse_mismatch",
      argsPreview: parseHints.slice(0, 3).join(" | ").slice(0, 400),
      ...ctxHint,
    });
  }
}

/**
 * Per-profile tool protocol text for Ollama (machine contract), separate from chat rules.
 */

import type { Avatar } from "../../types";
import type { TurnToolIntent } from "../turnToolIntent";
import { avatarMayUseAgenticTool } from "./registry";

const PATCH_FACT_IDS = new Set([
  "world_metadata.patch_projects",
  "world_metadata.patch_people",
  "user_profile.patch",
]);

/** Full documentation when an avatar may use any default (non–group-owned) tool. */
export const FULL_GENERAL_WORLDVIEW_TOOL_INSTRUCTIONS = `Optional — structured tools: add exactly **one** markdown \`\`\`json code block at the **very end** of your reply (after conversational text). Do **not** write tool lines in prose (no "user profile.patch:" or "world_metadata.patch_projects { … }" as plain text). Use **exact** tool names below inside the JSON only.

Schema (required): "avatars_tools_v1" with a "tools" array.
\`\`\`json
{"schema":"avatars_tools_v1","tools":[{"name":"world_metadata.patch_projects","args":{"patch":{"proj_new_1":{"title":"<project title>","notes":"<optional notes>","summary":"<optional summary>"}}}}]}
\`\`\`
The \`<...>\` strings in the example above are **placeholders**; replace them with real values. Never submit literal "...", "<title>", "TBD", ellipsis characters, or similar placeholder text as a title — rows with those titles are rejected.

Exact tool names (use underscores; no spaces):
- world_metadata.patch_projects (args.patch: project id -> partial fields: title, notes, summary, etc.). For a **new** project use a fresh opaque id (e.g. proj_ plus random letters/digits); **title is required** on create. For updates, reuse ids from "World metadata — project [id]" lines in Relevant context.
- world_metadata.patch_people (args.patch: contact id -> partial person fields; use ids from contact lines or focus)
- user_profile.patch (not "user profile") (args.patch: displayName, pronouns, notes) — stable facts about the user
- gmail.fetch_message_body (args.messageId: Gmail message id exactly as in "email [id …]" lines or focus). Use when snippets or prefetched bodies are not enough to answer.
- avatars.workshop.open_draft (args: optional seedText and/or wikiQuery strings; at least one non-empty). Opens **Workshops → Creation** for the user with those hints. **Only** the avatar that holds the avatar_creation tool contract may emit this tool.

When the user shares durable facts (preferences, relationships, ongoing work, projects), include the tools block when a patch or fetch applies; omit the block if nothing should be saved or fetched.
Omit the code block if no tools apply.

**Lexical tools** (optional; may use instead of or together with the JSON block). One instruction per line (no markdown fences):
- \`AVATARS_MEM: <text>\` — durable note about the user (merged into saved profile notes).
- \`AVATARS_TOOL name=gmail.fetch_message_body messageId=<gmail id>\` — fetch full body when snippets are insufficient.`;

const TOOL_HELP_LINE: Partial<Record<string, string>> = {
  "world_metadata.patch_projects":
    '- world_metadata.patch_projects (args.patch: project id -> partial fields: title, notes, summary, etc.). For a **new** project use a fresh opaque id (e.g. proj_ plus random letters/digits); **title is required** on create. For updates, reuse ids from "World metadata — project [id]" lines in Relevant context.',
  "world_metadata.patch_people":
    "- world_metadata.patch_people (args.patch: contact id -> partial person fields; use ids from contact lines or focus)",
  "user_profile.patch":
    "- user_profile.patch (args.patch: displayName, pronouns, notes) — stable facts about the user",
  "gmail.fetch_message_body":
    '- gmail.fetch_message_body (args.messageId: Gmail message id exactly as in "email [id …]" lines or focus). Use when snippets or prefetched bodies are not enough to answer.',
  "avatars.workshop.open_draft":
    "- avatars.workshop.open_draft (args: optional seedText and/or wikiQuery strings; at least one non-empty). Opens **Workshops → Creation** for the user with those hints. **Only** the avatar that holds the avatar_creation tool contract may emit this tool.",
  "drafts.tasks":
    "- drafts.tasks (args: projectId, title, optional notes, dueAt, ownerAvatarId, rationale) — queue a task draft",
  "drafts.calendar_event":
    "- drafts.calendar_event (args: title, startAt, optional endAt, notes, attendees, rationale) — queue a calendar draft",
  "drafts.email_reply":
    "- drafts.email_reply (args: inReplyToMessageId, to[], optional cc, subject, body, rationale) — queue an email reply draft",
};

const NO_TOOLS_PROTOCOL = `**Structured tools:** This persona has no JSON write tools enabled. Do **not** emit an \`avatars_tools_v1\` block or invent APIs (e.g. wikipedia.search) in prose.`;

export type ToolProfileId =
  | "creation"
  | "patch_facts"
  | "gmail_fetch"
  | "general"
  | "none";

const MACHINE_PREAMBLE =
  "Emit exactly **one** markdown ```json code block at the **very end** of your reply (after any conversational text), **or** omit it entirely. Do **not** narrate tool names, JSON, or invented APIs (e.g. wikipedia.search, google.search) in plain prose — only inside the JSON block.";

const NEGATIVE_LINE =
  "Forbidden in prose: wikipedia.search, any `name(...)` API fantasy, or tool names outside the allowed list below.";

/**
 * Resolve which tool protocol profile applies (prompt + closing hints).
 */
export function resolveToolProfile(
  avatar: Avatar,
  turnIntent: TurnToolIntent
): ToolProfileId {
  if (avatar.allowedAgenticToolIds && avatar.allowedAgenticToolIds.length === 0) {
    return "none";
  }

  const allowed = avatar.allowedAgenticToolIds;
  const openOk = avatarMayUseAgenticTool(avatar, "avatars.workshop.open_draft");
  if (turnIntent === "creation" && openOk) {
    return "creation";
  }
  if (allowed?.length === 1 && allowed[0] === "avatars.workshop.open_draft") {
    return "creation";
  }

  const gmailOk = avatarMayUseAgenticTool(avatar, "gmail.fetch_message_body");
  if (turnIntent === "email_fetch" && gmailOk) {
    return "gmail_fetch";
  }

  if (allowed && allowed.length > 0) {
    const onlyPatch = allowed.every((id) => PATCH_FACT_IDS.has(id));
    if (onlyPatch) {
      return "patch_facts";
    }
    if (allowed.length === 1 && allowed[0] === "gmail.fetch_message_body") {
      return "gmail_fetch";
    }
  } else {
    return "general";
  }

  return "general";
}

function renderCreationProtocol(avatar: Avatar): string {
  const allowed = avatar.allowedAgenticToolIds ?? [];
  const lines: string[] = [
    MACHINE_PREAMBLE,
    "",
    NEGATIVE_LINE,
    "",
    'Schema (required): "avatars_tools_v1" with a "tools" array.',
    "```json",
    '{"schema":"avatars_tools_v1","tools":[{"name":"avatars.workshop.open_draft","args":{"wikiQuery":"<short lookup string for the character>","seedText":"<optional one-line character seed>"}}]}',
    "```",
    "Replace `<...>` placeholders with real strings; at least one of wikiQuery or seedText must be non-empty.",
    "",
    "**Avatar vs project:** Creating a fictional **avatar** or persona is **not** creating a world_metadata **project**.",
    "",
    "Exact tool names (JSON only):",
  ];
  for (const id of allowed.length ? allowed : ["avatars.workshop.open_draft"]) {
    const h = TOOL_HELP_LINE[id];
    lines.push(h ?? `- ${id}`);
  }
  lines.push("", "Omit the JSON block when this tool does not apply.");
  return lines.join("\n");
}

function renderPatchFactsProtocol(avatar: Avatar): string {
  const allowed = avatar.allowedAgenticToolIds ?? [];
  const patchIds = allowed.filter((id) => PATCH_FACT_IDS.has(id));
  const prefersProjects = patchIds.includes("world_metadata.patch_projects");
  const example = prefersProjects
    ? '{"schema":"avatars_tools_v1","tools":[{"name":"world_metadata.patch_projects","args":{"patch":{"proj_new_1":{"title":"<project title>","notes":"<optional notes>","summary":"<optional summary>"}}}}]}'
    : patchIds.includes("world_metadata.patch_people")
      ? '{"schema":"avatars_tools_v1","tools":[{"name":"world_metadata.patch_people","args":{"patch":{"contact_id":{"displayName":"<name>"}}}}]}'
      : '{"schema":"avatars_tools_v1","tools":[{"name":"user_profile.patch","args":{"patch":{"notes":"<text>"}}}]}';

  const lines: string[] = [
    MACHINE_PREAMBLE,
    "",
    NEGATIVE_LINE,
    "",
    'Schema (required): "avatars_tools_v1" with a "tools" array.',
    "```json",
    example,
    "```",
    "The `<...>` strings are **placeholders**; use real values. Never submit literal placeholder titles.",
    "",
    "Exact tool names (use **only** these in your JSON `tools` array):",
  ];
  for (const id of patchIds) {
    const h = TOOL_HELP_LINE[id];
    lines.push(h ?? `- ${id}`);
  }
  lines.push("", "Omit the JSON block when no patch applies.");
  return lines.join("\n");
}

function renderGmailFetchProtocol(avatar: Avatar): string {
  const lines: string[] = [
    MACHINE_PREAMBLE,
    "",
    NEGATIVE_LINE,
    "",
    'Schema (required): "avatars_tools_v1" with a "tools" array.',
    "```json",
    '{"schema":"avatars_tools_v1","tools":[{"name":"gmail.fetch_message_body","args":{"messageId":"<gmail message id from context>"}}]}',
    "```",
    "",
    "Exact tool names:",
    TOOL_HELP_LINE["gmail.fetch_message_body"]!,
    "",
    "**Lexical alternative (one line, no fences):**",
    "`AVATARS_TOOL name=gmail.fetch_message_body messageId=<gmail id>`",
    "",
    "Omit tools when no fetch is needed.",
  ];
  void avatar;
  return lines.join("\n");
}

function renderGeneralProtocol(avatar: Avatar): string {
  const allowed = avatar.allowedAgenticToolIds;
  if (!allowed || allowed.length === 0) {
    return FULL_GENERAL_WORLDVIEW_TOOL_INSTRUCTIONS;
  }

  const lines: string[] = [
    MACHINE_PREAMBLE,
    "",
    NEGATIVE_LINE,
    "",
    'Schema (required): "avatars_tools_v1" with a "tools" array.',
  ];
  const prefersWorkshop =
    allowed.includes("avatars.workshop.open_draft") &&
    !allowed.includes("world_metadata.patch_projects");
  if (prefersWorkshop) {
    lines.push("```json");
    lines.push(
      '{"schema":"avatars_tools_v1","tools":[{"name":"avatars.workshop.open_draft","args":{"wikiQuery":"<short wiki or web query>","seedText":"<optional one-line character seed>"}}]}'
    );
    lines.push("```");
  } else if (allowed.includes("world_metadata.patch_projects")) {
    lines.push("```json");
    lines.push(
      '{"schema":"avatars_tools_v1","tools":[{"name":"world_metadata.patch_projects","args":{"patch":{"proj_new_1":{"title":"<project title>","notes":"<optional notes>","summary":"<optional summary>"}}}}]}'
    );
    lines.push("```");
  } else {
    lines.push("```json");
    lines.push(
      `{"schema":"avatars_tools_v1","tools":[{"name":"${allowed[0]!}","args":{}}]}`
    );
    lines.push("```");
  }
  lines.push(
    "The `<...>` strings in the example above are **placeholders**; replace them with real values. Never submit literal \"...\", \"<title>\", \"TBD\", ellipsis characters, or similar placeholder text as a title — rows with those titles are rejected.",
    ""
  );
  if (!allowed.includes("world_metadata.patch_projects")) {
    lines.push(
      "**Avatar vs project:** If the user asks to create an **avatar** or fictional persona, that is **not** a request to create a world_metadata **project**. Do not use world_metadata.patch_projects unless it appears in the allowed list below.",
      ""
    );
  }
  lines.push("Exact tool names (use **only** these in your JSON `tools` array):");
  for (const id of allowed) {
    const h = TOOL_HELP_LINE[id];
    lines.push(h ?? `- ${id} (use args shape from product schema for this tool)`);
  }
  lines.push("", "Omit the JSON block entirely when none of these tools apply for this turn.");
  if (allowed.includes("gmail.fetch_message_body")) {
    lines.push(
      "",
      "**Lexical tools** (optional; may use instead of or together with the JSON block). One instruction per line (no markdown fences):",
      "- `AVATARS_TOOL name=gmail.fetch_message_body messageId=<gmail id>` — fetch full body when snippets are insufficient."
    );
  }
  return lines.join("\n");
}

/**
 * Render the machine tool protocol for the resolved profile.
 */
export function renderToolProtocol(profile: ToolProfileId, avatar: Avatar): string {
  switch (profile) {
    case "none":
      return NO_TOOLS_PROTOCOL;
    case "creation":
      return renderCreationProtocol(avatar);
    case "patch_facts":
      return renderPatchFactsProtocol(avatar);
    case "gmail_fetch":
      return renderGmailFetchProtocol(avatar);
    case "general":
    default:
      return renderGeneralProtocol(avatar);
  }
}

/**
 * @deprecated Prefer {@link renderToolProtocol} with {@link resolveToolProfile} and real {@link detectTurnToolIntent}.
 * Uses `none` intent for resolution (creation-only avatars still resolve to `creation` via allowlist).
 */
export function worldviewToolInstructionsForAvatar(avatar: Avatar): string {
  return renderToolProtocol(resolveToolProfile(avatar, "none"), avatar);
}

/**
 * When to append the allow-list hint for avatars that use the full general doc but restrict tools.
 */
export function usesExplicitAllowlistGeneralHint(avatar: Avatar): boolean {
  const a = avatar.allowedAgenticToolIds;
  return (
    !!a &&
    a.length > 0 &&
    resolveToolProfile(avatar, "none") === "general"
  );
}

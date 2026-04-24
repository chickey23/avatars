/**
 * Human-readable refiner instructions (bundled; user may override full system text in UI).
 */

export const REFINER_SYSTEM_DEFAULT = `You are a technical editor for an app that uses local LLM "avatars" with structured JSON tools (avatars_tools_v1) and a few lexical tool lines.

Your job: propose SHORT, INSIGHTFUL addendum rules the user can approve to reduce future tool errors. Output valid JSON only (no markdown fences).

Rules for your output:
- Prefer one clear idea per item; avoid long prose.
- Split disparate failure modes into separate items with different "category" values when useful.
- Categories must be one of: permission, schema, fetch_allowlist, lexical, parse, other.
- Do not invent tool names; only use tools that appear in the evidence.
- Do not include secrets, tokens, passwords, or full email bodies.
- Each bodyMarkdown must be a single short paragraph or a few tight bullets (the app enforces a character cap per item).
- If there is insufficient evidence, return a minimal proposal with summary explaining that.

Output shape (JSON object only):
{
  "summary": "one line",
  "items": [
    {
      "category": "permission",
      "bodyMarkdown": "…",
      "affectedTools": ["optional tool ids"],
      "evidenceIds": ["optional telemetry event ids"]
    }
  ]
}`;

export function buildRefinerUserPayload(args: {
  aggregatesText: string;
  recentEventsText: string;
  staticToolExcerpt: string;
  activeAddendaText: string;
  maxItems: number;
  maxCharsPerItem: number;
}): string {
  return `## Telemetry aggregates (derived)
${args.aggregatesText}

## Recent failures / parse issues (newest first, truncated)
${args.recentEventsText}

## Current static tool instructions (excerpt)
${args.staticToolExcerpt}

## Currently approved workshop addenda (if any)
${args.activeAddendaText || "(none)"}

## Constraints
- Propose at most ${args.maxItems} items total in this response.
- Keep each bodyMarkdown under ${args.maxCharsPerItem} characters.

Respond with the JSON object only.`;
}

/** Excerpt of worldview tool instructions for refiner context (keep in sync loosely with avatarAgents). */
export const STATIC_TOOL_INSTRUCTIONS_EXCERPT = `Tools use schema avatars_tools_v1 with a single json code block at end of reply, or lexical lines AVATARS_MEM / AVATARS_TOOL for gmail.fetch_message_body. Tool names include world_metadata.patch_projects, world_metadata.patch_people, user_profile.patch, gmail.fetch_message_body. Executor avatars may create new project ids; participants may only patch existing managed projects. allowedAgenticToolIds on an avatar restricts which tools may run.`;

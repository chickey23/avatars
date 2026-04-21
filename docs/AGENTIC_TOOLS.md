# Agentic tools (worldview + lexical)

**Non-normative.** Does not override [SPEC.md](../SPEC.md). Tool names and behavior are defined in code.

## Two ways to invoke tools

1. **JSON envelope** — One trailing ` ```json ` block with `{"schema":"avatars_tools_v1","tools":[...]}` (see [avatarAgents.ts](../src/services/avatarAgents.ts)).
2. **Lexical lines** — Plain lines in the model reply (outside fenced JSON), parsed by [lexicalParse.ts](../src/services/agenticTools/lexicalParse.ts). Fenced code blocks are stripped before scanning so JSON in fences is not double-parsed.

Both forms are merged and de-duplicated (`dedupeWorldviewToolCalls`) before execution. If **any** tool parses (JSON or lexical), heuristic “parse mismatch” warnings for malformed JSON are suppressed for that reply.

## Registered tool ids

| Id | Lexical form | Notes |
|----|----------------|-------|
| `user_profile.patch` | `AVATARS_MEM: <text>` | Merges into saved profile notes (append-style merge with existing notes at parse time). |
| `gmail.fetch_message_body` | `AVATARS_TOOL name=gmail.fetch_message_body messageId=<id>` | Same as JSON tool; allowlist still applies. |
| `world_metadata.patch_projects` | JSON only (in v1) | |
| `world_metadata.patch_people` | JSON only (in v1) | |

## Permissions

On each [Avatar](../src/types/index.ts), optional **`allowedAgenticToolIds`**: string array of tool ids this avatar may execute. **Omit or empty** = all registered tools allowed. Denied tools return `permission_denied` in [executeWorldviewTools](../src/services/worldviewTools/execute.ts) and Gmail fetch execution.

## Routing: single-wave + no-comment + preflight

- **`switchboardRoutingMode: "single_wave"`** — One responder wave per user turn; no opinion-matrix cascade ([switchboard.ts](../src/services/switchboard.ts)).
- **`AVATARS_NO_COMMENT`** — Machine token; if the visible reply is only this, the message is hidden (`suppressUserMessage`).
- **`preflightOllamaMinScore`** — If set on the ephemeral context, and the avatar’s routing score is **below** this threshold, Ollama is not called; reply is suppressed (see [routingScore.ts](../src/services/routingScore.ts)). **`processUserTurn` leaves this unset** so every routed avatar gets an LLM call unless you opt in (e.g. set `1` in [appStore.ts](../src/store/appStore.ts)).

## How to add a new tool

1. Add the stable **`name`** to `AGENTIC_TOOL_IDS` in [registry.ts](../src/services/agenticTools/registry.ts).
2. Implement execution in [execute.ts](../src/services/worldviewTools/execute.ts) and/or [gmailFetchTools.ts](../src/services/gmailFetchTools.ts) (or a new module called from there).
3. If lexical support is desired, extend [lexicalParse.ts](../src/services/agenticTools/lexicalParse.ts) with a strict line pattern.
4. Document the JSON `args` shape in `WORLDVIEW_TOOL_INSTRUCTIONS` in `avatarAgents.ts`.
5. Add Vitest coverage (parse + permission + execute).

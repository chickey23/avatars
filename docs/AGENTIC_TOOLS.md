# Agentic tools (worldview + lexical)

**Non-normative.** Does not override [SPEC.md](../SPEC.md). Tool names and behavior are defined in code.

## Two ways to invoke tools

1. **JSON envelope** — One trailing ` ```json ` block with `{"schema":"avatars_tools_v1","tools":[...]}`. Prompt assembly is in [`avatarAgents.ts`](../src/services/avatarAgents.ts): **Guidelines (library rules)** (chat-only) and **Tool protocol (machine contract)** are **separate** sections. Wording for each **tool profile** comes from [`toolProtocol.ts`](../src/services/agenticTools/toolProtocol.ts) (`renderToolProtocol`, `resolveToolProfile`). The closing line uses [`formatOllamaClosingInstruction`](../src/services/behaviorTuningFormat.ts) with optional `{ toolProfile, turnIntent, isExecutor }` (legacy third arg may still be a boolean `isExecutor` only).
2. **Lexical lines** — Plain lines in the model reply (outside fenced JSON), parsed by [lexicalParse.ts](../src/services/agenticTools/lexicalParse.ts). Fenced code blocks are stripped before scanning so JSON in fences is not double-parsed.

Both forms are merged and de-duplicated (`dedupeWorldviewToolCalls`) before execution. If **any** tool parses (JSON or lexical), heuristic “parse mismatch” warnings for malformed JSON are suppressed for that reply.

## Ollama prompt layout (order)

Rough top-to-bottom order inside [`buildOllamaPrompt`](../src/services/avatarAgents.ts):

1. Optional avatar preamble, persona line, tasks  
2. **Guidelines (library rules)** — AI rule blocks only (no tool schema)  
3. Relevant context, pending notifications, **Present state** (behavior tuning)  
4. Optional single-wave / response-requirement notes  
5. **Tool protocol** — profile-specific machine contract + routing executor/participant lines from `buildWorldviewToolsPrompt` + optional [Tool Workshop addenda](../src/services/toolWorkshop/render.ts)  
6. **Recent conversation** — transcript passed through [`scrubTranscriptForModel`](../src/services/modelTranscript.ts) so prior bad tool imitation is redacted for the model only (user-visible thread unchanged)  
7. **User just said** + closing instruction  

Debug: [`OllamaPromptDebug`](../src/types/index.ts) may include `recentTranscriptScrubbed` alongside the raw transcript.

## Tool profiles

[`resolveToolProfile(avatar, turnIntent)`](../src/services/agenticTools/toolProtocol.ts) picks a **`ToolProfileId`**: `creation` | `patch_facts` | `gmail_fetch` | `general` | **`none`**. **`none`** applies when `allowedAgenticToolIds` is an explicit empty array `[]` (stewards that must not emit JSON tools). [`detectTurnToolIntent`](../src/services/turnToolIntent.ts) classifies the latest user message (`creation`, `fact_save`, `email_fetch`, `none`) for profile resolution, closing text, repair gating, and telemetry.

## Parsing, repair, and diagnostics

- **Parse / strip:** [`splitWorldviewToolsFromReply`](../src/services/worldviewTools/parse.ts) — `preprocessToolReplyText` (e.g. `**json**` header, common `args"` typos), optional flat `{ schema, name, args }` lift, smart-quote loosening, trailing JSON blob.  
- **Hints:** [`diagnoseWorldviewToolReply`](../src/services/worldviewTools/diagnose.ts) — e.g. prose `wikipedia.search`, informal tool dumps.  
- **Repair pass:** If merged tools are empty, diagnosis has hints, `turnIntent !== "none"`, and an expected tool exists, [`runAvatarAgent`](../src/services/avatarAgents.ts) may call Ollama **once more** with a repair appendix and log `ollama_tool_parse_mismatch` / `ollama_tool_parse_repair` as appropriate.

**Regression fixtures:** [`worldviewTools/__fixtures__/modelReplies/`](../src/services/worldviewTools/__fixtures__/modelReplies/) and [`goldenReplies.test.ts`](../src/services/worldviewTools/goldenReplies.test.ts); integration: [`avatarAgents.toolUse.integration.test.ts`](../src/services/avatarAgents.toolUse.integration.test.ts).

## Registered tool ids

| Id | Lexical form | Notes |
|----|----------------|-------|
| `user_profile.patch` | `AVATARS_MEM: <text>` | Merges into saved profile notes (append-style merge with existing notes at parse time). |
| `gmail.fetch_message_body` | `AVATARS_TOOL name=gmail.fetch_message_body messageId=<id>` | Same as JSON tool; allowlist still applies. |
| `world_metadata.patch_projects` | JSON only (in v1) | |
| `world_metadata.patch_people` | JSON only (in v1) | |
| `avatars.workshop.open_draft` | JSON only (in v1) | Opens Workshops → Creation; gated by **`tool_owner:avatar_creation`**. |
| `drafts.tasks` | JSON only (in v1) | Canonical id for task drafts; recorded via [`execute.ts`](../src/services/worldviewTools/execute.ts). |
| `drafts.calendar_event` | JSON only (in v1) | Canonical id for calendar-event drafts. |
| `drafts.email_reply` | JSON only (in v1) | Canonical id for email-reply drafts. |

Durable draft records are stored by [`../src/services/platform/drafts.ts`](../src/services/platform/drafts.ts) (see [`../src/services/platform/`](../src/services/platform/)).

Execution is implemented in [`execute.ts`](../src/services/worldviewTools/execute.ts). Permission groups are user-facing **Capabilities**: draft tools are gated by **`tool_owner:drafts`**; workshop open_draft by **`tool_owner:avatar_creation`** on [`Avatar.systemTags`](../src/types/index.ts) (see `TOOL_GROUPS` in [`registry.ts`](../src/services/agenticTools/registry.ts)). Monitor ownership uses separate **Stewardships** (`monitor:*`) and is managed with capabilities in **Workshops → Stewardship**.

## Permissions

On each [Avatar](../src/types/index.ts), optional **`allowedAgenticToolIds`**: string array of tool ids this avatar may execute.

- **Omit** (undefined) = **Default general tools**: all registered **non–group-owned** tools allowed (subject to `tool_owner:*` tags for group tools). In **Workshops → Stewardship**, these avatars are grouped under **The Chorus**.
- **Empty array `[]`** = no JSON agentic tools for that avatar (explicit opt-out); group-owned tools still require the matching `tool_owner:<group>` tag.
- **Non-empty array** = custom allowlist; in **Workshops → Stewardship**, these avatars are grouped under **The Privileged**.

Denied tools return `permission_denied` in [executeWorldviewTools](../src/services/worldviewTools/execute.ts) and Gmail fetch execution.

**Telemetry:** successful tool rows may record `turnIntent` and `correctToolForIntent` (heuristic match vs [turnToolIntent.ts](../src/services/turnToolIntent.ts)). The Tool Workshop **Overview** shows a global intent-match summary and an **Intent match by avatar** table when data exists ([`computeToolIntentCorrectness`](../src/services/toolTelemetry/store.ts), [`computeToolIntentCorrectnessByAvatar`](../src/services/toolTelemetry/store.ts)).

## Routing: single-wave + no-comment + preflight

- **`switchboardRoutingMode: "single_wave"`** — One responder wave per user turn; no opinion-matrix cascade ([switchboard.ts](../src/services/switchboard.ts)).
- **`AVATARS_NO_COMMENT`** — Machine token; if the visible reply is only this, the message is hidden (`suppressUserMessage`).
- **`preflightOllamaMinScore`** — If set on the ephemeral context, and the avatar’s routing score is **below** this threshold, Ollama is not called; reply is suppressed (see [routingScore.ts](../src/services/routingScore.ts)). **`processUserTurn` leaves this unset** so every routed avatar gets an LLM call unless you opt in (e.g. set `1` in [appStore.ts](../src/store/appStore.ts)).

## How to add a new tool

1. Add the stable **`name`** to `AGENTIC_TOOL_IDS` in [registry.ts](../src/services/agenticTools/registry.ts). If it belongs to a permission group, update `TOOL_GROUPS` and document the `tool_owner:<group>` tag.
2. Implement execution in [execute.ts](../src/services/worldviewTools/execute.ts) and/or [gmailFetchTools.ts](../src/services/gmailFetchTools.ts) (or a new module called from there).
3. If lexical support is desired, extend [lexicalParse.ts](../src/services/agenticTools/lexicalParse.ts) with a strict line pattern.
4. Document the JSON `args` shape in **`FULL_GENERAL_WORLDVIEW_TOOL_INSTRUCTIONS`** and/or **`renderToolProtocol`** branches in [toolProtocol.ts](../src/services/agenticTools/toolProtocol.ts) (including any new **`ToolProfileId`** behavior if the tool is restricted to a subset of avatars).
5. Add Vitest coverage (parse + permission + execute). For prompt-sensitive tools, add or extend golden fixtures under [`worldviewTools/__fixtures__/modelReplies/`](../src/services/worldviewTools/__fixtures__/modelReplies/).

## Related modules (quick index)

| Module | Role |
|--------|------|
| [`avatarAgents.ts`](../src/services/avatarAgents.ts) | `runAvatarAgent`, prompt build, repair retry, telemetry hook |
| [`toolProtocol.ts`](../src/services/agenticTools/toolProtocol.ts) | Profile resolution + tool-protocol text |
| [`registry.ts`](../src/services/agenticTools/registry.ts) | Tool ids, `TOOL_GROUPS`, `avatarMayUseAgenticTool` |
| [`turnToolIntent.ts`](../src/services/turnToolIntent.ts) | User message → intent enum |
| [`modelTranscript.ts`](../src/services/modelTranscript.ts) | Scrub transcript for model |
| [`behaviorTuningFormat.ts`](../src/services/behaviorTuningFormat.ts) | Closing instruction + tuning block |
| [`worldviewTools/parse.ts`](../src/services/worldviewTools/parse.ts) | Envelope extract + preprocess |
| [`worldviewTools/diagnose.ts`](../src/services/worldviewTools/diagnose.ts) | Parse mismatch hints |

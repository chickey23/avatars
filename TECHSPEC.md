# Avatar Interface System — Technical Specification

This document lists all components and implementation details necessary to rebuild the project from scratch.

**Terminology:** See [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md) for **Agent** vs **Avatar** vs tools (e.g. Well of Souls) in prose and comments. **Platform durable paths and Tauri cache commands:** [docs/PLATFORM_PERSISTENCE.md](docs/PLATFORM_PERSISTENCE.md).

---

## 1. Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop runtime | Tauri | 2.x |
| Frontend framework | React | ^18.3.1 |
| Build tool | Vite | ^8.0.8 |
| Language (frontend) | TypeScript | ~5.6.2 |
| Language (backend) | Rust | 2021 edition |
| Package manager | npm | — |

---

## 2. Project Structure

```
Avatars/
├── index.html              # Entry HTML; root div, loads /src/main.tsx
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── src/
│   ├── main.tsx            # React entry; registers background agents, renders App
│   ├── App.tsx             # Root view; AppContent + app wiring
│   ├── App.css
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── app/                # App shell: regions, view model, chrome constants
│   │   ├── AppContent.tsx
│   │   ├── useAppContentModel.ts
│   │   ├── appContentViewContext.tsx
│   │   ├── appChromeConstants.ts
│   │   ├── AppHeader.tsx, PrimaryAvatarSidebar.tsx, ChatMainPanel.tsx, ContextPanel.tsx, AppOverlays.tsx
│   │   └── …
│   ├── components/
│   │   ├── SwitchboardViz.tsx   # Chat Visualizer (Waves) column
│   │   └── SourceCacheViz.tsx   # Storage viz (caches, Background contracts, log tail)
│   ├── context/
│   │   ├── AppProvider.tsx      # useApp() provider; startup hygiene, waves/clearChat hooks
│   │   └── useApp.ts
│   ├── connectors/
│   │   ├── index.ts        # gatherDataFromSources, dataToRelevanceStrings
│   │   ├── gmail.ts        # Gmail connector (Tauri invoke)
│   │   ├── mocks.ts
│   │   └── types.ts
│   ├── data/
│   │   └── defaultAvatars.ts
│   ├── hooks/
│   │   └── useSpeechToText.ts
│   ├── services/
│   │   ├── avatarAgents.ts
│   │   ├── avatarTags/         # systemTags helpers (system, tool_owner:*, monitor:*)
│   │   ├── backgroundAgents.ts
│   │   ├── platform/            # Durable app state (projects/tasks, drafts, source cache), scheduler, bus, routing helpers, background runners
│   │   ├── longTermTasks.ts
│   │   ├── monitors/           # Monitor registry, synthetic posts, built-in monitors (contracts, UPM, …)
│   │   ├── offline.ts
│   │   ├── ollama.ts
│   │   ├── opinionMatrix.ts
│   │   ├── situationContext.ts
│   │   ├── switchboard.ts
│   │   ├── pendingNotifications.ts  # Proactive pending queue; per-avatar scoring; release heuristics
│   │   ├── switchboardWavesQueue/   # Chat Visualizer queue: persist, operations, types
│   │   ├── sessionLog.ts           # Tauri session log helper (appendSessionLog)
│   │   ├── sessionLog/             # contractLog.ts — contract-scoped log categories (contract:*)
│   │   ├── contextScoring/email.ts
│   │   ├── contextScoring/calendar.ts
│   │   ├── contextScoring/contacts.ts
│   │   ├── worldMetadata/   # v1 JSON people overlay; localStorage backend
│   │   ├── turnArchive.ts    # Compact turn records; localStorage append + cap
│   │   └── timerCueSystem.ts
│   ├── store/
│   │   └── appStore.ts
│   ├── types/
│   │   └── index.ts
│   └── utils/
│       └── openLink.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   └── src/
│       ├── lib.rs          # Tauri entry; registers commands
│       ├── gmail.rs        # OAuth, Gmail/Calendar/People API
│       ├── ollama.rs       # ollama_reachable, ollama_generate (HTTP to 127.0.0.1:11434)
│       ├── session_log.rs  # On-disk session logs; rotation
│       └── shell.rs        # open_external, get_user_paths
└── scripts/
    ├── signature.ps1
    ├── signature.bat
    └── signature-config.json
```

---

## 3. Dependencies

### 3.1 npm (package.json)

**Dependencies:**
- `react` ^18.3.1
- `react-dom` ^18.3.1

**DevDependencies:**
- `@tauri-apps/cli` ^2.0.0
- `@tauri-apps/api` ^2.0.0
- `@types/react` ^18.3.12
- `@types/react-dom` ^18.3.1
- `@vitejs/plugin-react` ^6.0.1
- `typescript` ~5.6.2
- `vite` ^8.0.8
- `vitest` ^4.1.4

### 3.2 Cargo (src-tauri/Cargo.toml)

**Build:**
- `tauri-build` 2

**Runtime:**
- `tauri` 2
- `tauri-plugin-shell` 2
- `serde` 1 (derive)
- `serde_json` 1
- `reqwest` 0.12 (json, blocking)
- `base64` 0.22
- `rand` 0.8
- `sha2` 0.10
- `tiny_http` 0.12
- `url` 2
- `open` 5
- `chrono` 0.4
- `urlencoding` 2

**Features:**
- `custom-protocol` (default) — enables `tauri/custom-protocol`

---

## 4. Tauri Configuration

### 4.1 tauri.conf.json

- **Identifier:** `com.avatars.app`
- **Dev:** `npm run dev` → `http://localhost:5173`
- **Build:** `npm run build` → `../dist`
- **Window:** 1000×700, min 600×400
- **Shell plugin:** `open: true`

### 4.2 Capabilities (capabilities/default.json)

Permissions:
- `core:path:default`
- `core:event:default`
- `core:window:default`
- `core:app:default`
- `core:resources:default`
- `core:window:allow-set-title`
- `shell:allow-open`

---

## 5. Tauri Commands (Rust → Frontend)

| Command | Module | Purpose |
|---------|--------|---------|
| `open_external` | shell | Open URL or path in default app |
| `get_user_paths` | shell | Return `{ downloads, screenshots }` paths |
| `gmail_credentials_path_display` | gmail | Credentials path for display |
| `gmail_credentials_path` | gmail | Resolved credentials path |
| `is_gmail_enabled` | gmail | Whether credentials.json exists |
| `has_gmail_tokens` | gmail | Whether tokens.json exists |
| `start_gmail_oauth` | gmail | Start OAuth flow |
| `fetch_gmail_recent` | gmail | Fetch recent emails |
| `fetch_calendar_upcoming` | gmail | Fetch upcoming calendar events |
| `fetch_contacts` | gmail | Fetch contacts (People API) |
| `ollama_reachable` | ollama | `GET` Ollama `/api/tags` on `127.0.0.1:11434` (2s timeout); returns whether local Ollama responds |
| `ollama_generate` | ollama | `POST` `/api/generate` with model + prompt; returns response text or `null` |

---

## 6. Google OAuth & APIs

### 6.1 Credentials

**Path (Windows):** `%APPDATA%\com.avatars.app\data\connections\enabled\gmail\credentials.json`

**Path (non-Windows):** `$HOME/.config/com.avatars.app/data/connections/enabled/gmail/credentials.json`

**Format:**
```json
{
  "client_id": "...",
  "client_secret": "..."
}
```

Create OAuth 2.0 credentials in [Google Cloud Console](https://console.cloud.google.com/). Enable:
- Gmail API
- Google Calendar API
- People API

### 6.2 OAuth Scopes

- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/contacts.readonly`

### 6.3 OAuth Flow

- **Redirect URI:** `http://127.0.0.1:5174/oauth/callback`
- **Method:** PKCE (S256)
- **Callback:** Local HTTP server on port 5174; receives `?code=...`; exchanges for tokens
- **Tokens stored:** `tokens.json` in same directory as credentials

Add `http://127.0.0.1:5174/oauth/callback` to authorized redirect URIs in Google Cloud Console.

### 6.4 API Endpoints Used

- Gmail: `https://gmail.googleapis.com/gmail/v1/users/me`
- Calendar: `https://www.googleapis.com/calendar/v3/calendars/primary/events`
- People: `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,birthdays`

---

## 7. User Paths (shell.rs)

**Windows:**
- Downloads: `%USERPROFILE%\Downloads`
- Screenshots: `%USERPROFILE%\OneDrive\Pictures\Screenshots`

**Non-Windows:**
- Downloads: `$HOME/Downloads`
- Screenshots: `$HOME/Pictures/Screenshots`

---

## 8. Ollama Integration

- **Base URL:** `http://localhost:11434`
- **Default model:** `llama2`
- **Endpoints:** `/api/tags`, `/api/generate`
- **Behavior:** Optional; falls back to personality-based rules if Ollama unavailable
- **Desktop (Tauri):** Frontend uses `ollama_reachable` / `ollama_generate` so the webview does not rely on `fetch` to localhost (avoids blocked/incorrect reachability).
- **Browser dev:** `src/services/ollama.ts` uses `fetch` to the same host.
- **UI:** Main header `.env-indicator` shows **Ollama:** next to the Tauri tag (✓/✗/checking), same `env-tag` styling, fixed `min-width` to avoid layout jump on refresh; click to refresh; periodic re-check every 15s.

---

## 9. Browser / Web APIs

- **Web Speech API:** `SpeechRecognition` / `webkitSpeechRecognition` for voice input
- **localStorage:** Situation context (`avatars_situation_context`), long-term tasks (`avatars_long_term_tasks`)

---

## 10. Build & Run

### Prerequisites

- Node.js (LTS)
- Rust (stable, `rustup default stable`)
- (Optional) Ollama for local LLM

### Commands

```bash
# Install dependencies
npm install

# Dev (Vite only, no Tauri)
npm run dev

# Dev (Tauri + Vite)
npm run tauri dev

# Build frontend
npm run build

# Build Tauri app
npm run tauri build

# Run signature script
./scripts/signature.ps1   # or signature.bat
```

### First-Time Gmail Setup

1. Create OAuth credentials in Google Cloud Console.
2. Enable Gmail API, Calendar API, People API.
3. Add redirect URI `http://127.0.0.1:5174/oauth/callback`.
4. Save `credentials.json` to `%APPDATA%\com.avatars.app\data\connections\enabled\gmail\`.
5. Run app, click "Connect Gmail", complete OAuth in browser.

---

## 11. Excluded from Git (.gitignore)

- `node_modules/`
- `dist/`, `target/`
- `data/` (credentials, tokens)
- `.env`, `.env.local`, `.env.*.local`
- IDE/OS files

---

## 12. Key Implementation Details

### 12.1 Vite

- Port 5173, strictPort
- React plugin
- Ignore `**/src-tauri/**` in watch

### 12.2 TypeScript

- Target ES2020
- Imports use project-relative paths (no `@/*` alias)
- Strict mode, noUnusedLocals, noUnusedParameters

### 12.3 Data Flow

1. User sends message → user line is appended via **`useApp()`** (from [`AppProvider`](src/context/AppProvider.tsx)) and the send is **enqueued**; a drain loop runs **`processUserTurn`** in `appStore` **one turn at a time** (serialized queue).
2. **`processUserTurn`** sets ephemeral **`replyToUserMessageId`** for this turn, builds context with **`gatherDataFromSources()`** (connectors), merges focus and optional Well of Souls into **`relevantData`**, then calls **`distributeAndRespond()`**. **User-turn context scoring** (email, calendar, contacts) runs inside this path via `scoreAndFormat*` helpers in `src/services/contextScoring/`—see `docs/CONTEXT_SCORING.md`. A future **preprocessor** stage may narrow candidates before scoring (see `docs/WORLD_MODEL_AND_PREPROCESSOR.md`).
3. **`distributeAndRespond()`** selects Avatar(s), runs `runAvatarAgent`; returns `{ responses, trace }` (Switchboard trace per wave). **`onProgress` / `onAvatarComplete`** callbacks update React state so avatar messages appear **incrementally** after each responder. **`onTraceProgress`** feeds the live trace; **`onWaveChatComplete({ depth })`** fires after each wave’s responders finish (before the next cascade evaluation)—used by the **Waves** UI to settle per-row blink state.
4. Avatar agent uses Ollama if available, else personality rules; final state: responses merged into the conversation thread; **`appendTurn`** / persist; `SituationContext` saved to `localStorage` (`avatars_situation_context`).
5. One **`CompactTurnRecord`** appended via `turnArchive` (`avatars_turn_archive`).

**Further work (see SPEC § Context scoring agents):** extend scoring as **additional connectors** land; optional dedicated **background** runners for continuous ingestion—**MVP** user-turn (and proactive) ranking is already implemented for email / calendar / contacts. **Ranked relevance** stays; **mechanisms** evolve with metadata and preprocessors.

### 12.4 Focus (UI State)

- Stored in React state: `{ email?, calendar?, contact? }` with `{ id, title }`
- Read inside **`processUserTurn`** and merged into `relevantData` via `focusToRelevanceStrings` (same path as `gatherDataFromSources` output)

### 12.5 localStorage keys (frontend)

| Key | Purpose |
|-----|---------|
| `avatars_situation_context` | `SituationContext` (conversation capped to last 100 messages) |
| `avatars_turn_archive` | JSON array of `CompactTurnRecord` (append-only, capped) |
| `avatars_long_term_tasks` | Long-term tasks (see `longTermTasks.ts`) |
| `avatars_opinion_matrix` | Opinion matrix (see `opinionMatrix.ts`) |
| `avatars_switchboard_waves_queue_v1` | Chat Visualizer queue (`WavesQueueDoc` in `switchboardWavesQueue/persist.ts`); cleared on **Clear chat** |

### 12.6 Turn archive and trace types

- `CompactTurnRecord`: `id`, `ts`, `userMessageId`, `userPreview`, optional `focus`, `primaryAvatarId`, `switchboardTrace` (`SwitchboardTraceStep[]`), `replySummary`
- `SwitchboardTraceStep`: `depth`, `responderIds`, `selection` (`forced_primary` \| `tag_interest_match` \| `default_primary` \| `cascade`)
- `ChatViewMode`: `"chat"` \| `"chat_routing"` \| `"routing_log"` (chat column display)
- `turnArchive.ts`: `formatTraceOneLine`, `formatTurnMetaLine`, `getTurnLogDetailLines` (expanded inline log for `routing_log` mode); **`MAX_ENTRIES`** (default 1000) caps the archive; **`userPreview`** / reply previews are **truncated** for essence-style storage (see SPEC § Conversation archive).

### 12.7 Session logs on disk (Tauri) and rotation

- Rust: [`src-tauri/src/session_log.rs`](src-tauri/src/session_log.rs) — `MAX_LOG_FILES` (**100**). When `session_log_begin_session` runs and the session log directory already has **≥ that many** `*.log` files, **all** are written into a **deflated zip** under `archives/session_logs_<timestamp>.zip`, then deleted from the folder. This is **batch file rotation**, not content summarization.
- Frontend helper: [`src/services/sessionLog.ts`](src/services/sessionLog.ts).
- **Future:** replace the literal **100** with a **user preference** or config read at session start (see SPEC § Conversation archive). **Semantic compression** of log or turn-archive *content* (if added) is a separate pipeline from zip rotation.

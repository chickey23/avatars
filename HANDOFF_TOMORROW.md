# Handoff — 2026-04-12

## TL;DR (next session)

1. **Regression:** run **[Verification checklist](#verification-checklist)** (Ollama, WoS, cascade, queued send, session log). Optionally spot-check **proactive** sidebar: new mail → pending line + badge list + prompt block when Ollama is up.
2. **Work:** follow **[SPEC.md](SPEC.md) § Implementation Order (Active)** — **Switchboard visualization** first ([`docs/SWITCHBOARD_VISUALIZATION.md`](docs/SWITCHBOARD_VISUALIZATION.md); layout consult user). Then **shared metadata** (`data/metadata/`, Projects, UI / chat entry) toward **project execution** (e.g. `Avatar.assignedTasks`, `activeTask`, future agents). **Conversation archive** segments/chapters as follow-on. **Proactive:** timer/cue when prioritized; **sequential multi-avatar release** polish is **lower priority** (MVP acceptable). **Active Task** / **Focus Watcher**; **additional connectors** per SPEC (reference wikis/social listed as deferred supplemental sources).
3. **Dev entry:** [`start-dev.cmd`](start-dev.cmd) runs [`scripts/verify.ps1`](scripts/verify.ps1) unless `SKIP_VERIFY=1`; [`build-release.cmd`](build-release.cmd) = `tauri build` only. Stamps under [`.local/`](.local/) (gitignored).
4. **Detail:** **[PROGRESS.md](PROGRESS.md)** — status; **[docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md)** — phased roadmap (bench + popularity ordering); **[TECHSPEC.md](TECHSPEC.md) § 2** — file tree.

**Terminology:** **[docs/STYLEGUIDE.md](docs/STYLEGUIDE.md)**. **Older handoff:** **[HANDOFF.md](HANDOFF.md)**.

---

## Completed (repo state — includes prior sessions)

- **SPEC:** § **Proactive notifications and pending reactions**; Situation Context + Implementation Order cross-links; § Implemented UI (clear chat, proactive sidebar); roadmap prioritizes **visualization** and **metadata/projects**; **sequential release batch** deprioritized.
- **User-turn context scoring (MVP):** Email, **calendar**, and **contacts** — [`scoreAndFormatEmails`](src/services/contextScoring/email.ts), [`scoreAndFormatCalendarEvents`](src/services/contextScoring/calendar.ts), [`scoreAndFormatContacts`](src/services/contextScoring/contacts.ts), merged in [`processUserTurn`](src/store/appStore.ts) (`relevantData` assembly; same pattern as email). Docs: [`docs/CONTEXT_SCORING.md`](docs/CONTEXT_SCORING.md), per-source docs under [`docs/`](docs/).
- **World metadata v1:** [`src/services/worldMetadata/`](src/services/worldMetadata/) — JSON in `localStorage`, debounced persist, contact scoring overlay (see PROGRESS / CONTEXT_SCORING docs).
- **Proactive pipeline (MVP):** [`src/services/pendingNotifications.ts`](src/services/pendingNotifications.ts) — per-avatar scores for new emails (cap 3 avatars, top-K new mail per eval), `mergeProactiveEvaluation`, thread revision, `computeReleasedClusterIds`; [`processUserTurn`](src/store/appStore.ts) + [`AppContext`](src/context/AppContext.tsx) interval refresh; [`avatarAgents.ts`](src/services/avatarAgents.ts) pending block in Ollama prompt + `pendingNotificationsBlock` on debug.
- **Types / persistence:** `PendingNotification`, `userFocus`, `pendingReleaseClusterIds` (ephemeral), `proactiveProcessedEmailIds`, [`writePersistedContext`](src/store/appStore.ts), [`stripEphemeralFields`](src/store/appStore.ts).
- **Avatar sidebar UI:** Card is not a single button — **select** (name), **badge** (expand pending list), **🔍** (description + traits); **truncated** first pending line; **short** high-urgency strip above chat (sidebar pointer). **Discuss** / **Dismiss**; **Clear chat** — **no** `window.confirm` ([`AppContext.tsx`](src/context/AppContext.tsx)).
- **Dev scripts:** [`scripts/verify.ps1`](scripts/verify.ps1), [`start-dev.cmd`](start-dev.cmd), [`build-release.cmd`](build-release.cmd), [`npm run verify`](package.json), `.local/` in `.gitignore`.
- **Tests:** [`email.test.ts`](src/services/contextScoring/email.test.ts), [`calendar.test.ts`](src/services/contextScoring/calendar.test.ts), [`contacts.test.ts`](src/services/contextScoring/contacts.test.ts), [`pendingNotifications.test.ts`](src/services/pendingNotifications.test.ts).

---

## Next priorities

1. **Switchboard visualization** — Wave/trace UI per [`docs/SWITCHBOARD_VISUALIZATION.md`](docs/SWITCHBOARD_VISUALIZATION.md); **layout/visual sign-off** required (SPEC § Behavioral Instructions).
2. **Shared metadata** — SPEC [`data/metadata/`](SPEC.md) (People, Events, **Projects**); **UI** / chat entry; bridge **`assignedTasks`** and execution-oriented context — **world metadata v1** is a stepping stone in `localStorage`; on-disk / Tauri path TBD.
3. **Conversation archive** — **Archive segment / dismiss topic** and project-linked chapters (follow-on to metadata/todos).
4. **Background agents** — **Active Task** and **Focus Watcher**; extend **context scoring** as new connectors ship.
5. **Proactive (ongoing)** — Timer/cue; sequential batch **polish** when prioritized (not blocking).
6. **Additional sources** — Reference/social supplemental connectors listed in SPEC § Data Sources (deferred); Hotmail, Weather API, etc.
7. **Tests** — expand coverage (Switchboard, connectors); **signature phrase** per SPEC.

---

## Deferred (consult user before building)

- **Switchboard sound:** keep secondary to visualization and text; accessibility controls if added.
- **Archive segment, log cap, compression:** SPEC § Conversation archive; PROGRESS § Deferred; TECHSPEC § 12.7.

---

## Verification checklist

- [ ] **Tri-state:** Ollama stopped vs listening with no models vs ready — badge and Rules/Fallback messaging make sense.
- [ ] **WoS:** With “Use in chat context”, WoS text appears in **Full prompt** / relevant-data path.
- [ ] **Cascade:** Two avatars in sequence — second avatar sees prior avatar as context (thread tail).
- [ ] **Send while pending:** Queue more user messages while replies stream; order and anchors stay sane.
- [ ] **Context scoring (optional):** With Gmail data loaded, email / calendar / contacts ranked lines appear in the relevant-data path where applicable.
- [ ] **Session log:** New entries and (in Tauri) files under `%LOCALAPPDATA%\…\avatars\session_logs\` (or equivalent).
- [ ] **Verify script:** `npm run verify` — `npm install` when lock changes, `vitest`, `verify ok` in console; `.local/verify.log` append.

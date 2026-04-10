# Handoff — 2026-04-10

## TL;DR (next session)

1. **Regression:** run **[Verification checklist](#verification-checklist)** (Ollama, WoS, cascade, queued send, session log). Optionally spot-check **proactive** sidebar: new mail → pending line + badge list + prompt block when Ollama is up.
2. **Work:** follow **[SPEC.md](SPEC.md) § Implementation Order (Active)** — **calendar** (then **contacts**) context scoring like email; **proactive** follow-ups: sequential multi-avatar batch on **release**, timer/cue → same pending pipeline; Active Task / Focus Watcher; `data/metadata/` for affinity.
3. **Dev entry:** [`start-dev.cmd`](start-dev.cmd) runs [`scripts/verify.ps1`](scripts/verify.ps1) unless `SKIP_VERIFY=1`; [`build-release.cmd`](build-release.cmd) = `tauri build` only. Stamps under [`.local/`](.local/) (gitignored).
4. **Detail:** **[PROGRESS.md](PROGRESS.md)** — status; **[TECHSPEC.md](TECHSPEC.md) § 2** — file tree.

**Terminology:** **[docs/STYLEGUIDE.md](docs/STYLEGUIDE.md)**. **Older handoff:** **[HANDOFF.md](HANDOFF.md)**.

---

## Completed this session (and immediate prior in repo)

- **SPEC:** New § **Proactive notifications and pending reactions**; Situation Context + Implementation Order cross-links; § Implemented UI updated (clear chat, proactive sidebar).
- **Proactive pipeline:** [`src/services/pendingNotifications.ts`](src/services/pendingNotifications.ts) — per-avatar scores for new emails (cap 3 avatars, top-K new mail per eval), `mergeProactiveEvaluation`, thread revision, `computeReleasedClusterIds`; [`processUserTurn`](src/store/appStore.ts) + [`AppContext`](src/context/AppContext.tsx) interval refresh; [`avatarAgents.ts`](src/services/avatarAgents.ts) pending block in Ollama prompt + `pendingNotificationsBlock` on debug.
- **Types / persistence:** `PendingNotification`, `userFocus`, `pendingReleaseClusterIds` (ephemeral), `proactiveProcessedEmailIds`, [`writePersistedContext`](src/store/appStore.ts), [`stripEphemeralFields`](src/store/appStore.ts).
- **Avatar sidebar UI:** Card is not a single button — **select** (name), **badge** (expand pending list), **🔍** (description + traits); **truncated** first pending line; **short** high-urgency strip above chat (sidebar pointer). **Clear chat** — **no** `window.confirm` ([`AppContext.tsx`](src/context/AppContext.tsx)).
- **Dev scripts:** [`scripts/verify.ps1`](scripts/verify.ps1), [`start-dev.cmd`](start-dev.cmd), [`build-release.cmd`](build-release.cmd), [`npm run verify`](package.json), `.local/` in `.gitignore`.
- **Tests:** [`email.test.ts`](src/services/contextScoring/email.test.ts), [`pendingNotifications.test.ts`](src/services/pendingNotifications.test.ts).

---

## Next priorities

- **Context scoring:** Calendar → contacts (same pattern as [`contextScoring/email.ts`](src/services/contextScoring/email.ts)).
- **Proactive:** Orchestrated **sequential** reply batch after release (SPEC max 3 avatars); timer/cue queue feeding `pendingNotifications`.
- **Shared metadata** / contact affinity when ready.
- **Tests** — expand coverage; **signature phrase** per SPEC.

---

## Deferred (consult user before building)

- **Switchboard visualization / sound:** [docs/SWITCHBOARD_VISUALIZATION.md](docs/SWITCHBOARD_VISUALIZATION.md).
- **Archive segment, log cap, compression:** SPEC § Conversation archive; PROGRESS § Deferred; TECHSPEC § 12.7.

---

## Verification checklist

- [ ] **Tri-state:** Ollama stopped vs listening with no models vs ready — badge and Rules/Fallback messaging make sense.
- [ ] **WoS:** With “Use in chat context”, WoS text appears in **Full prompt** / relevant-data path.
- [ ] **Cascade:** Two avatars in sequence — second avatar sees prior avatar as context (thread tail).
- [ ] **Send while pending:** Queue more user messages while replies stream; order and anchors stay sane.
- [ ] **Session log:** New entries and (in Tauri) files under `%LOCALAPPDATA%\…\avatars\session_logs\` (or equivalent).
- [ ] **Verify script:** `npm run verify` — `npm install` when lock changes, `vitest`, `verify ok` in console; `.local/verify.log` append.

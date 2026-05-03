# Product vision and use cases

**Non-normative.** This document states **product intent**, **representative use cases**, and **user-story examples** so proposals and implementations can be checked against shared goals. It does **not** override [SPEC.md](../SPEC.md), [TECHSPEC.md](../TECHSPEC.md), or [docs/IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md). When something here conflicts with the spec, the spec wins unless the spec is explicitly revised.

**Related:** Architecture and coordination responsibilities are in SPEC (Switchboard, agent layers, proactive notifications). Agentic tools and profiles are summarized in [AGENTIC_TOOLS.md](AGENTIC_TOOLS.md). Terminology is in [STYLEGUIDE.md](STYLEGUIDE.md).

---

## Vision (what “done” looks like)

The Avatars application is meant to take **chat input** and, eventually, **always-on, context-aware voice input**, and use **defined avatars** as **knowledge agents** backed by **external and internal sources**. That knowledge is **synthesized** by avatars—often acting on **timers**, **queues**, or **background work**—into **useful discoveries** that are **brought to the user’s attention** in a controlled, understandable way.

Avatars should feel like a **collection of advisors and helpers**: collaborators with distinct roles, not a single anonymous assistant. Some synthesized information supports **real-world goals** the user cares about (projects, health, creative work, logistics, learning).

Over time, the system should gain **agentic power for independent activity** only when there is **confidence in assessing confidence** in model replies and **tool use**, plus clear **policy, approval, and stewardship** boundaries (see SPEC and workshops for ownership language).

Examples of **eventual** high-impact agentic capabilities (not promises of ship order): tools for **3D modelling and sending jobs to a 3D printer**, **online purchases**, **playing music**, **diet or exercise recommendations**, or **gentle life-rhythm nudges** (for example, suggesting it may be time for sleep). These sit on a **trust ladder**: read-only and suggest-only behaviors precede irreversible or costly side effects.

---

## Product pillars (alignment checklist)

Use these as a **short checklist** when reviewing a proposal: which pillars does it strengthen, and does it avoid undermining the others?

1. **Collaborators, not one bot** — Multiple recognizable avatars; routing and UI respect distinct roles and affinities.
2. **Grounded synthesis** — Answers and discoveries tie to **sources and context**; uncertainty and limits are visible where it matters.
3. **Proactive value** — Timers, monitors, and queues produce **actionable or noteworthy** bundles, not raw firehoses; surfacing rules match SPEC proactive notification intent.
4. **Graduated agency** — Autonomy and tool power expand with **confidence assessment**, **user approval**, and **capability/stewardship** controls—not by default.

---

## Primary use-case clusters

| Cluster | Summary |
|--------|---------|
| **Reactive assistance** | User asks in chat (later: voice); Switchboard routes; avatars respond with synthesized, source-aware help. |
| **Proactive discovery** | Background scoring and monitors detect relevant changes; pending items and notifications bring discoveries to the user. |
| **Goal pursuit** | Long-running user goals map to projects, tasks, and evidence gathering; output is summarized for decision-making. |
| **Ambient input (future)** | Voice and always-on context raise extra requirements: privacy, clear turn boundaries, and interruption policy—design must align with SPEC when introduced. |
| **Delegated actions (future)** | Physical or financial side effects require explicit risk tiers, confirmations, and auditability—see agentic tooling docs and SPEC gates. |

---

## Representative user stories (examples)

These are **illustrative**, not an exhaustive backlog. They are written so you can ask: “Does this feature support or obstruct this story?”

- **As a user**, I describe a goal or question once; avatars **watch** relevant sources and **notify** me when something important changes, with enough context to act or dismiss quickly.
- **As a user**, I send a chat message and expect the **right** advisor to lead, with others joining only when the situation warrants (cascade discipline).
- **As a user**, I want **discoveries** framed as **what changed, why it matters, and what I can do next**—not as opaque model monologues.
- **As a user**, I want **gentle life-rhythm suggestions** (sleep, movement, meals) to be **optional, qualified, and easy to turn off**, with clear separation from medical claims where applicable.
- **As a user**, I eventually want **delegated real-world actions** (print, purchase, playback) only when the system can **show rationale and confidence**, and I have **approved** the class of action or the specific step.

---

## How to use this doc in reviews

When evaluating a design or PR, ask:

1. **Vision fit** — Which pillar or cluster does this advance? Is the user outcome recognizable in the stories above?
2. **Spec fit** — Does it respect normative SPEC behavior (routing, notifications, archive, context scoring, workshops/stewardship)?
3. **Trust** — Does it assume autonomy where SPEC or tooling still require gates, approval, or explicit capability enablement?
4. **User experience** — Does it preserve the “team of advisors” feel, or collapse everything into a single undifferentiated channel?

If a proposal **extends** vision in a new direction, update **this file** and, if behavior becomes binding, follow **[SPEC-CHANGE-PROTOCOL]** in SPEC to propagate normative text where needed.

---

## Open product dimensions (intentionally unset here)

Details belong in SPEC, roadmap, or dedicated UX/policy work when you lock them in. Until then, treat these as **questions to resolve**, not as commitments in this doc:

- **Interrupt model** — Push vs inbox vs app-open-only for different urgency tiers.
- **Voice** — On-device vs cloud, wake behavior, and what context is allowed without an explicit user turn.
- **Risk tiers** — How purchases, health-adjacent advice, and device control map to approval and logging.

---

## Document maintenance

- Revise this file when **product intent** or **goal-alignment examples** change materially.
- Do not use this file alone to justify behavior that contradicts SPEC; reconcile docs or elevate requirements into SPEC per change protocol.

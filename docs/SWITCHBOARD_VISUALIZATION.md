# Switchboard visualization (future / optional)

**Non-normative.** This note does not override [SPEC.md](../SPEC.md). Any build-out of motion, layout, or sound must follow **SPEC § Behavioral Instructions** (consult the user on layout and visual choices).

## Metaphor

Imagine a **vertical column** of **ascending bubbles** — one bubble per Switchboard wave or per responder. Bubbles rise toward a “surface” at the top; when a bubble **pops** or **lands**, that moment maps to a **wave completing** or a **message appearing** in the chat column. **Avatar colors** could come from the active theme so each responder stays visually distinct.

## Mapping to the spec and code

- **SPEC** — [SPEC.md](../SPEC.md) § **Switchboard Agent Function** and § **Conversation archive and Switchboard trace** describe reactive distribution and the **`SwitchboardTraceStep`** trail per turn.
- **STYLEGUIDE** — [STYLEGUIDE.md](STYLEGUIDE.md) uses **Switchboard** as the coordination layer name; keep UI copy aligned with that terminology.
- **Trace** — Implementation records **`SwitchboardTraceStep`** (depth, responder ids, selection reason) for archive and routing views; a future visualization could mirror that structure without changing canonical behavior.

## Sounds

Optional **audio cues** per wave or per avatar are **not implemented**. If added later, they should remain secondary to readable text and trace (accessibility and user control matter).

## Status

**Not implemented — next UI priority per SPEC § Implementation Order and `PROGRESS.md`.** Bubble-column animation and timing-to-wave sync are the target; **sounds** remain optional and secondary. Layout/visual choices require explicit user consultation (**SPEC § Behavioral Instructions**) before implementation.

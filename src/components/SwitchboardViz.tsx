/**
 * Switchboard visualization — read-only projection of SwitchboardTraceStep[].
 *
 * Layout decisions (SPEC § Behavioral Instructions — recorded defaults):
 * - Placement: narrow column left of the chat message list (inside main chat column).
 * - Visibility: optional toolbar checkbox; persisted in localStorage (default off).
 * - Density: one horizontal “wave” row per trace step; small circles per responder id in that wave.
 *
 * Sound: intentionally omitted (see docs/SWITCHBOARD_VISUALIZATION.md).
 */

import type { SwitchboardTraceStep } from "../types";
import { wavesTopToBottom } from "../services/switchboardVizModel";

export type SwitchboardVizProps = {
  trace: SwitchboardTraceStep[];
  getAccentColor: (avatarId: string) => string;
  /** When true, in-flight routing; subtle pulse on the newest wave. */
  isLive?: boolean;
  reducedMotion?: boolean;
};

export function SwitchboardViz({
  trace,
  getAccentColor,
  isLive = false,
  reducedMotion = false,
}: SwitchboardVizProps) {
  const ordered = wavesTopToBottom(trace);
  if (ordered.length === 0) {
    return (
      <div className="switchboard-viz switchboard-viz--empty" aria-hidden>
        <span className="switchboard-viz-placeholder">—</span>
      </div>
    );
  }

  return (
    <div
      className={`switchboard-viz${isLive ? " switchboard-viz--live" : ""}`}
      role="img"
      aria-label={`Switchboard: ${trace.length} routing wave${trace.length === 1 ? "" : "s"}`}
    >
      <div className="switchboard-viz-surface" aria-hidden />
      <ul className="switchboard-viz-waves">
        {ordered.map((step, idx) => {
          const isNewest = idx === 0;
          return (
            <li
              key={`${step.depth}-${step.selection}-${step.responderIds.join(",")}`}
              className={`switchboard-viz-wave${
                !reducedMotion && isNewest ? " switchboard-viz-wave--enter" : ""
              }${isLive && isNewest ? " switchboard-viz-wave--pulse" : ""}`}
              title={step.selection}
            >
              <div className="switchboard-viz-responders">
                {step.responderIds.map((id) => (
                  <span
                    key={id}
                    className="switchboard-viz-bubble"
                    style={{ background: getAccentColor(id) }}
                    title={id}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

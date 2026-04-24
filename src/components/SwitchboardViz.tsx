/**
 * Switchboard Waves — persistent queue log (`switchboardWavesQueue`).
 * Motion: new rows use a short rise animation (`SWITCHBOARD_WAVE_TRAVEL_MS`); blink tier blinks unsettled waves; narrow viewports hide the column.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import type {
  WavesQueueEntry,
  WavesToolErrorEntry,
} from "../services/switchboardWavesQueue";
import {
  SWITCHBOARD_WAVE_TRAVEL_MS,
  isMonitorPromptEntry,
  isSystemCommandEntry,
  isToolErrorEntry,
  isUserEntry,
  isWorldviewEntry,
} from "../services/switchboardWavesQueue";

const WAVES_TOOL_LABEL_MAX = 28;
const WAVES_ARGS_CAPTION_CHARS = 76;

function shortenWavesToolLabel(toolId: string | undefined): string {
  const t = toolId?.trim();
  if (!t) return "";
  if (t.length <= WAVES_TOOL_LABEL_MAX) return t;
  return `${t.slice(0, WAVES_TOOL_LABEL_MAX - 1)}…`;
}

function toolErrorDisplayFields(entry: WavesToolErrorEntry): {
  toolLine: string;
  codeLine: string;
  argsCaption?: string;
  tooltip: string;
} {
  const toolRaw =
    entry.toolId?.trim() ||
    (entry.message.includes(":")
      ? entry.message.split(":")[0]!.trim()
      : "");
  const code =
    entry.errorCode?.trim() ||
    (entry.message.includes(":")
      ? entry.message.slice(entry.message.indexOf(":") + 1).trim()
      : entry.message.trim());
  const toolLine = shortenWavesToolLabel(toolRaw || "tool");
  const codeLine = (code || "failed").slice(0, 96);
  const argsCaption = entry.argsPreview
    ? entry.argsPreview.length > WAVES_ARGS_CAPTION_CHARS
      ? `${entry.argsPreview.slice(0, WAVES_ARGS_CAPTION_CHARS - 1)}…`
      : entry.argsPreview
    : undefined;
  const tooltipParts = [
    toolRaw && code ? `${toolRaw} — ${code}` : entry.message,
    entry.argsPreview ? `Args: ${entry.argsPreview}` : "",
    entry.detail && !entry.argsPreview ? entry.detail : "",
  ].filter(Boolean);
  return {
    toolLine,
    codeLine,
    argsCaption,
    tooltip: tooltipParts.join("\n").slice(0, 1400),
  };
}

export type WavesMotionTier = "full" | "blink";

export type SwitchboardVizProps = {
  entries: WavesQueueEntry[];
  getAccentColor: (avatarId: string) => string;
  motionTier: WavesMotionTier;
  reducedMotion: boolean;
  /** Wall-clock ms for travel animation (default from constants). */
  travelMs?: number;
  onActivateUserMessage?: (userMessageId: string) => void;
  /**
   * Dev or `?debugViz=1`: expose the column to assistive tech even when empty
   * (the queue-kind counts themselves render above the chat input in
   * `App.tsx`).
   */
  vizDebug?: boolean;
  /** No primary avatars: explain missing routing dots. */
  rosterEmpty?: boolean;
  /** User-turn excerpt from chat (tooltip + compact caption). */
  getUserMessagePreview?: (userMessageId: string) => string | undefined;
};

const WAVES_USER_PREVIEW_MAX = 48;

export function SwitchboardViz({
  entries,
  getAccentColor,
  motionTier,
  reducedMotion,
  travelMs = SWITCHBOARD_WAVE_TRAVEL_MS,
  onActivateUserMessage,
  vizDebug = false,
  rosterEmpty = false,
  getUserMessagePreview,
}: SwitchboardVizProps) {
  const scrollRef = useRef<HTMLUListElement>(null);
  const travelS = `${travelMs}ms`;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || entries.length === 0) return;
    const { clientHeight, scrollHeight } = el;
    if (scrollHeight > clientHeight * 0.33) {
      el.scrollTop = el.scrollHeight - el.clientHeight;
    }
  }, [entries.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || entries.length === 0) return;
    const ro = new ResizeObserver(() => {
      const { clientHeight, scrollHeight } = el;
      if (scrollHeight > clientHeight * 0.33) {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div
        className="switchboard-viz switchboard-viz--empty"
        aria-hidden={!(vizDebug || rosterEmpty)}
      >
        <div className="switchboard-viz-track switchboard-viz-track--empty">
          <div className="switchboard-viz-spine" aria-hidden />
          <span className="switchboard-viz-placeholder">—</span>
        </div>
        {rosterEmpty && (
          <p className="switchboard-viz-roster-hint" role="status">
            No primary avatars to route — add avatars in the sidebar for
            routing dots.
          </p>
        )}
      </div>
    );
  }

  const showTravel =
    motionTier === "full" && !reducedMotion;

  return (
    <div
      className="switchboard-viz"
      role="list"
      aria-label={`Chat Visualizer queue: ${entries.length} entries`}
    >
      <div className="switchboard-viz-track">
        <div className="switchboard-viz-spine" aria-hidden />
        <ul
          ref={scrollRef}
          className="switchboard-viz-waves switchboard-viz-waves--scroll"
        >
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          if (isUserEntry(entry)) {
            const raw = getUserMessagePreview?.(entry.userMessageId)
              ?.replace(/\s+/g, " ")
              .trim();
            const tip =
              raw && raw.length > 220 ? `${raw.slice(0, 217).trimEnd()}…` : raw;
            const caption =
              raw && raw.length > WAVES_USER_PREVIEW_MAX
                ? `${raw.slice(0, WAVES_USER_PREVIEW_MAX - 1).trimEnd()}…`
                : raw;
            return (
              <li
                key={entry.id}
                className={`switchboard-viz-queue-item switchboard-viz-user${
                  showTravel && isLast ? " switchboard-viz-queue-item--travel-in" : ""
                }`}
                style={
                  showTravel && isLast
                    ? ({ ["--waves-travel-duration" as string]: travelS } as CSSProperties)
                    : undefined
                }
                role="listitem"
              >
                <button
                  type="button"
                  className="switchboard-viz-user-node"
                  onClick={() => onActivateUserMessage?.(entry.userMessageId)}
                  title={tip || undefined}
                  aria-label={
                    tip ? `Scroll to your message: ${tip}` : "Scroll to your message"
                  }
                >
                  <span className="switchboard-viz-user-tick" />
                  {caption ? (
                    <span className="switchboard-viz-user-caption" aria-hidden>
                      {caption}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          }
          if (isSystemCommandEntry(entry)) {
            const c = getAccentColor(entry.avatarId);
            const icon =
              entry.status === "no_tools"
                ? "0"
                : entry.status === "queued"
                  ? "Q"
                  : entry.status === "validated"
                    ? "V"
                    : entry.status === "applied"
                      ? "+"
                      : "X";
            const statusLabel =
              entry.status === "no_tools"
                ? "no tools"
                : entry.status === "queued"
                  ? "queued"
                  : entry.status === "validated"
                    ? "validated"
                    : entry.status === "applied"
                      ? "applied"
                      : "failed";
            const tip = `System command ${statusLabel}${
              entry.detail ? `: ${entry.detail}` : ""
            }`;
            return (
              <li
                key={entry.id}
                className={`switchboard-viz-queue-item switchboard-viz-worldview switchboard-viz-worldview--cmd switchboard-viz-worldview--cmd-${entry.status}${
                  showTravel && isLast ? " switchboard-viz-queue-item--travel-in" : ""
                }`}
                role="listitem"
                title={tip}
              >
                <button
                  type="button"
                  className="switchboard-viz-worldview-hit"
                  onClick={() => onActivateUserMessage?.(entry.userMessageId)}
                  aria-label={`System command ${statusLabel}; scroll to turn`}
                >
                  <span
                    className="switchboard-viz-worldview-icon"
                    style={{ color: c }}
                    aria-hidden
                  >
                    {icon}
                  </span>
                </button>
              </li>
            );
          }
          if (isWorldviewEntry(entry)) {
            const c = getAccentColor(entry.avatarId);
            const isWarn = entry.parseStatus === "warn";
            const actionHint =
              entry.actions?.map((a) => `${a.tool}: ${a.summary}`).join(" · ") ?? "";
            const tip = isWarn
              ? `Worldview parse issue: ${entry.parseDetail ?? entry.toolSummary}`
              : actionHint
                ? `${entry.toolSummary} — ${actionHint.slice(0, 420)}`
                : `Worldview: ${entry.toolSummary}`;
            return (
              <li
                key={entry.id}
                className={`switchboard-viz-queue-item switchboard-viz-worldview${
                  isWarn ? " switchboard-viz-worldview--warn" : ""
                }${showTravel && isLast ? " switchboard-viz-queue-item--travel-in" : ""}`}
                role="listitem"
                title={tip}
              >
                <button
                  type="button"
                  className="switchboard-viz-worldview-hit"
                  onClick={() => onActivateUserMessage?.(entry.userMessageId)}
                  aria-label={
                    isWarn
                      ? "Worldview tools failed to parse; scroll to turn"
                      : "Worldview tools applied; scroll to turn"
                  }
                >
                  <span
                    className="switchboard-viz-worldview-icon"
                    style={{ color: c }}
                    aria-hidden
                  >
                    {isWarn ? "!" : "◆"}
                  </span>
                </button>
              </li>
            );
          }
          if (isMonitorPromptEntry(entry)) {
            const c = getAccentColor(entry.avatarId);
            const tip = `${entry.label}: click to scroll to the message`;
            return (
              <li
                key={entry.id}
                className={`switchboard-viz-queue-item switchboard-viz-monitor-prompt${
                  showTravel && isLast ? " switchboard-viz-queue-item--travel-in" : ""
                }`}
                role="listitem"
                title={tip}
              >
                <button
                  type="button"
                  className="switchboard-viz-worldview-hit switchboard-viz-monitor-prompt-hit"
                  onClick={() => onActivateUserMessage?.(entry.userMessageId)}
                  aria-label={`Monitor prompt (${entry.label}); scroll to message`}
                >
                  <span
                    className="switchboard-viz-worldview-icon switchboard-viz-monitor-prompt-icon"
                    style={{ color: c, borderColor: c }}
                    aria-hidden
                  >
                    ?
                  </span>
                </button>
              </li>
            );
          }
          if (isToolErrorEntry(entry)) {
            const c = getAccentColor(entry.avatarId);
            const { toolLine, codeLine, argsCaption, tooltip } =
              toolErrorDisplayFields(entry);
            return (
              <li
                key={entry.id}
                className={`switchboard-viz-queue-item switchboard-viz-tool-error${
                  showTravel && isLast ? " switchboard-viz-queue-item--travel-in" : ""
                }`}
                role="listitem"
                title={tooltip}
              >
                <button
                  type="button"
                  className="switchboard-viz-worldview-hit switchboard-viz-tool-error-hit"
                  onClick={() => onActivateUserMessage?.(entry.userMessageId)}
                  aria-label={`Tool ${toolLine} failed: ${codeLine}; scroll to turn`}
                >
                  <span
                    className="switchboard-viz-worldview-icon switchboard-viz-tool-error-icon"
                    style={{ color: c }}
                    aria-hidden
                  >
                    ?
                  </span>
                  <span className="switchboard-viz-tool-error-caption" aria-hidden>
                    <span className="switchboard-viz-tool-error-tool">
                      {toolLine}
                    </span>
                    <span className="switchboard-viz-tool-error-code">
                      {codeLine}
                    </span>
                    {argsCaption ? (
                      <span className="switchboard-viz-tool-error-args">
                        {argsCaption}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          }
          const pendingReply = !entry.settled;
          return (
            <li
              key={entry.id}
              className={`switchboard-viz-queue-item switchboard-viz-wave${
                showTravel && isLast ? " switchboard-viz-queue-item--travel-in" : ""
              }`}
              style={
                showTravel && isLast
                  ? ({ ["--waves-travel-duration" as string]: travelS } as CSSProperties)
                  : undefined
              }
              role="listitem"
              title={entry.responderIds.join(", ") || entry.selection}
            >
              <button
                type="button"
                className="switchboard-viz-wave-hit"
                onClick={() => onActivateUserMessage?.(entry.userMessageId)}
                aria-label="Routing wave; scroll to turn"
              >
                <div
                  className={`switchboard-viz-responders${
                    pendingReply
                      ? " switchboard-viz-responders--pending"
                      : ""
                  }`}
                >
                  {entry.responderIds.length === 0 ? (
                    <span
                      className="switchboard-viz-bubble switchboard-viz-bubble--empty"
                      aria-hidden
                    />
                  ) : (
                    entry.responderIds.map((id) => {
                      const c = getAccentColor(id);
                      return (
                        <span
                          key={id}
                          className="switchboard-viz-bubble"
                          style={{
                            background: c,
                            boxShadow: `0 0 0 2px ${c}, 0 2px 6px rgba(0, 0, 0, 0.45)`,
                          }}
                          title={id}
                        />
                      );
                    })
                  )}
                </div>
              </button>
            </li>
          );
        })}
        </ul>
      </div>
      {rosterEmpty && (
        <p className="switchboard-viz-roster-hint" role="status">
          No primary avatars to route — add avatars in the sidebar for routing
          dots.
        </p>
      )}
    </div>
  );
}

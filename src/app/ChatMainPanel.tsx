import { type CSSProperties } from "react";
import type { ChatViewMode } from "../types";
import type { ChatWindowStyleId } from "../theme/designTokens";
import { CHAT_WINDOW_STYLE_IDS } from "../theme/designTokens";
import { formatTurnMetaLine, getTurnLogDetailLines } from "../services/turnArchive";
import { openLink } from "../utils/openLink";
import { appendSessionLog } from "../services/sessionLog";
import { SwitchboardViz } from "../components/SwitchboardViz";
import { SourceCacheViz } from "../components/SourceCacheViz";
import { countWavesQueueByKind } from "../services/switchboardWavesQueue";
import { applyUnhelpfulDecrement } from "../services/avatarRoster";
import { runSyntheticAction } from "../services/monitors";
import {
  getAvatarPortraitObjectPosition,
  getAvatarPortraitSrc,
  getAvatarPortraitTransform,
} from "../services/avatarPortrait";
import { useAppContentView } from "./appContentViewContext";
import { useAudioVisualPulse } from "./audioVisualPulseContext";
import { WorkshopsPanel, type WorkshopTabId } from "../components/WorkshopsPanel";

const WORKSHOP_HEADER_TABS: ReadonlyArray<readonly [WorkshopTabId, string]> = [
  ["tool", "Tool"],
  ["unmet", "Unmet Needs"],
  ["source", "Source"],
  ["projects", "Projects"],
  ["creation", "Creation"],
  ["stewardship", "Stewardship"],
];

export function ChatMainPanel() {
  const m = useAppContentView();
  const pulse = useAudioVisualPulse();
  const switchboardExpanded = m.showSwitchboardViz;
  const storageExpanded = m.showSourceCacheViz;
  const switchboardColVisible = m.wavesColumnVisible;
  const storageColVisible = m.wavesColumnVisible;
  const vizRailWidthPx = 34;
  const pulseSwitchboardOnColumn =
    pulse?.anchor === "switchboard" && switchboardColVisible;
  const pulseStorageOnColumn =
    pulse?.anchor === "storage" && storageColVisible;
  const pulseMainFallback =
    pulse != null &&
    (pulse.anchor === "global" ||
      (pulse.anchor === "switchboard" && !switchboardColVisible) ||
      (pulse.anchor === "storage" && !storageColVisible) ||
      (pulse.anchor === "avatar" && !pulse.avatarId));

  return (
      <main
        className={`chat-main${
          m.selectedAvatar
            ? ` chat-frame--${m.selectedAvatar.id.replace(/[^a-z0-9_-]/gi, "")}`
            : ""
        }${pulseMainFallback ? " audio-visual-cue-active audio-visual-cue-active--fallback" : ""}`}
        style={
          {
            ["--user-chrome-color"]: m.userChromeColor,
          } as CSSProperties
        }
      >
            <div className="chat-header">
              <h2>
                {m.mainSurface === "workshops"
                  ? "Workshops"
                  : m.selectedAvatarIds.length === 0
                    ? "Conversation with all"
                    : `Conversation with ${m.chatSelectionLabel}`}
              </h2>
              <div className="chat-header-actions">
                {m.mainSurface !== "workshops" && (
                  <div className="chat-header-actions-main">
                    <label className="chat-user-chrome-label">
                      <input
                        type="color"
                        className="chat-user-chrome-swatch"
                        value={m.userChromeColor}
                        onChange={(e) => m.setUserChromeColor(e.target.value)}
                        aria-label="You"
                        title="You"
                      />
                    </label>
                    <label className="chat-view-mode-label">
                      <select
                        className="chat-view-mode-select"
                        aria-label="Chat view mode"
                        title="View"
                        value={m.chatViewMode}
                        onChange={(e) =>
                          m.setChatViewMode(e.target.value as ChatViewMode)
                        }
                      >
                        <option value="chat">Chat</option>
                        <option value="chat_routing">Chat + routing</option>
                        <option value="routing_log">Routing + log</option>
                      </select>
                    </label>
                    <label className="chat-skin-label">
                      <select
                        className="chat-view-mode-select"
                        aria-label="Chat window style"
                        title="Window"
                        value={m.chatSkin}
                        onChange={(e) =>
                          m.setChatSkin(e.target.value as ChatWindowStyleId)
                        }
                      >
                        {CHAT_WINDOW_STYLE_IDS.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="clear-chat-btn"
                      onClick={m.clearChat}
                      disabled={m.messages.length === 0}
                      title="Clear conversation (archive kept)"
                    >
                      Clear chat
                    </button>
                    <button
                      type="button"
                      className="end-topic-segment-btn"
                      onClick={m.handleEndTopicSegment}
                      disabled={
                        m.situationContext.conversationThread.filter(
                          (row) => row.role === "user"
                        )
                          .length === 0
                      }
                      title="Mark this topic as ended (distinct from Clear chat; archive kept)"
                    >
                      End topic
                    </button>
                  </div>
                )}
                {m.mainSurface === "workshops" && (
                  <nav
                    className="chat-header-actions-main workshops-hub-tabs workshops-hub-tabs--header"
                    aria-label="Workshops sections"
                  >
                    {WORKSHOP_HEADER_TABS.map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`workshops-hub-tab${
                          m.workshopTab === id ? " is-active" : ""
                        }`}
                        onClick={() => m.setWorkshopTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                )}
                <div className="chat-header-actions-toggles">
                  <button
                    type="button"
                    className="chat-surface-toggle-btn"
                    aria-pressed={m.mainSurface === "workshops"}
                    aria-label={
                      m.mainSurface === "workshops"
                        ? "Switch to chat mode"
                        : "Switch to workshop mode"
                    }
                    onClick={() =>
                      m.setMainSurface(
                        m.mainSurface === "workshops" ? "chat" : "workshops"
                      )
                    }
                    title={
                      m.mainSurface === "workshops"
                        ? "Switch to chat mode"
                        : "Switch to workshop mode"
                    }
                  >
                    {m.mainSurface === "workshops" ? "W|C" : "C|W"}
                  </button>
                </div>
              </div>
            </div>

            <div className="chat-body-row">
            {m.wavesColumnVisible && (
              <>
                <aside
                  className={`switchboard-viz-column${
                    switchboardExpanded ? "" : " switchboard-viz-column--collapsed"
                  }${
                    pulseSwitchboardOnColumn ? " audio-visual-cue-active" : ""
                  }`}
                  style={{
                    width: switchboardExpanded ? m.chatVizWidthPx : vizRailWidthPx,
                  }}
                  aria-label="Chat Visualizer routing"
                >
                  <button
                    type="button"
                    className="viz-column-titlebar"
                    aria-pressed={switchboardExpanded}
                    aria-label={
                      switchboardExpanded
                        ? "Collapse WAVES visualizer"
                        : "Expand WAVES visualizer"
                    }
                    onClick={() => m.setShowSwitchboardViz(!switchboardExpanded)}
                  >
                    WAVES
                  </button>
                  {switchboardExpanded && (
                    <SwitchboardViz
                      entries={m.wavesQueue}
                      getAccentColor={m.getAvatarVizColorForSwitchboard}
                      motionTier={m.wavesMotionTier === "blink" ? "blink" : "full"}
                      reducedMotion={m.reducedMotion}
                      vizDebug={m.vizDebug}
                      rosterEmpty={m.avatars.length === 0}
                      getUserMessagePreview={(uid) =>
                        m.messages.find((row) => row.id === uid && row.role === "user")
                          ?.content
                      }
                      onActivateUserMessage={(uid) => {
                        const row = m.chatMessagesRef.current?.querySelector(
                          `[data-message-id="${uid}"]`
                        );
                        row?.scrollIntoView({
                          block: "center",
                          behavior: "smooth",
                        });
                      }}
                    />
                  )}
                </aside>
                {switchboardExpanded && (
                  <button
                    type="button"
                    className="chat-viz-resize-handle"
                    aria-label="Resize Chat Visualizer panel"
                    aria-orientation="vertical"
                    onPointerDown={m.onVizResizePointerDown}
                    onPointerMove={m.onVizResizePointerMove}
                    onPointerUp={m.onVizResizePointerUp}
                    onPointerCancel={m.onVizResizePointerUp}
                  />
                )}
              </>
            )}
            <div className="chat-center-column">
            {m.mainSurface !== "workshops" && (
              <div
                ref={m.chatMessagesRef}
                className={`chat-messages chat-skin--${m.chatSkin}`}
              >
                {m.messages.length === 0 ? (
                  <div className="empty-state">
                    <p>
                      {m.selectedAvatarIds.length === 0
                        ? "Send a message; well-matched avatars will reply."
                        : m.selectedAvatarIds.length === 1
                          ? `Start a conversation with ${m.chatSelectionLabel}.`
                          : "Send a message to solicit replies from the selected avatars."}
                    </p>
                    {(m.chatViewMode === "chat_routing" ||
                      m.chatViewMode === "routing_log") &&
                      m.archivedTurnCount > 0 && (
                      <p className="archive-empty-hint">
                        {m.archivedTurnCount} past turn(s) in archive (conversation cleared).
                      </p>
                    )}
                  </div>
                ) : (
                  m.messages.map((msg) => {
                  const turn = msg.role === "user" ? m.turnByUserId.get(msg.id) : undefined;
                  const fromAvatar =
                    msg.role === "avatar" && msg.avatarId
                      ? m.fullAvatarCatalog.find((a) => a.id === msg.avatarId)
                      : undefined;
                  const msgPortraitSrc =
                    msg.role === "avatar" && msg.avatarId
                      ? getAvatarPortraitSrc(
                          m.situationContext.avatarPortraitSrcById,
                          msg.avatarId,
                          fromAvatar?.appearance?.portraitUrl
                        )
                      : undefined;
                  const msgPortraitObjectPosition =
                    msg.role === "avatar" && msg.avatarId
                      ? getAvatarPortraitObjectPosition(
                          m.situationContext.avatarPortraitPositionById?.[
                            msg.avatarId
                          ]
                        )
                      : undefined;
                  const msgPortraitTransform =
                    msg.role === "avatar" && msg.avatarId
                      ? getAvatarPortraitTransform(
                          m.situationContext.avatarPortraitScaleById?.[
                            msg.avatarId
                          ]
                        )
                      : undefined;
                  const msgPortraitInitial =
                    fromAvatar?.givenName?.trim().charAt(0).toUpperCase() || "?";
                  const src = msg.replySource;
                  const avatarFontClass =
                    msg.role === "avatar" &&
                    src === "ollama" &&
                    msg.avatarId &&
                    ["muse", "accomplice", "skeptic"].includes(msg.avatarId)
                      ? `message-font--${msg.avatarId}`
                      : "";
                  const sourceClass =
                    msg.role === "avatar"
                      ? src === "rules"
                        ? "message-block--rules"
                        : src === "fallback"
                          ? "message-block--fallback"
                          : src === "ollama"
                            ? "message-block--ollama"
                            : "message-block--legacy"
                      : "";
                  const textStyle =
                    msg.role === "avatar"
                      ? src === "rules" || src === "fallback"
                        ? "text-style--bodyRules"
                        : src === "ollama"
                          ? "text-style--bodyAi"
                          : "text-style--caption"
                      : "";
                  const sourceLabel =
                    msg.role === "avatar"
                      ? src === "ollama"
                        ? "Ollama"
                        : src === "rules"
                          ? "Rules"
                          : src === "fallback"
                            ? "Fallback"
                            : ""
                      : "";
                  const hoverOneLine =
                    msg.role === "user"
                      ? turn
                        ? formatTurnMetaLine(turn)
                        : msg.content.trim().slice(0, 120)
                      : msg.role === "avatar"
                        ? `${sourceLabel || String(src)} · ${msg.avatarId ?? ""} · ${new Date(
                            msg.timestamp
                          ).toLocaleTimeString()}`
                        : "";
                  const compactPromptToolbar =
                    msg.role === "avatar" &&
                    msg.promptDebug &&
                    (src === "ollama" || src === "fallback");
                  return (
                    <div
                      key={msg.id}
                      className={`message-block message-block--interactive ${
                        msg.role === "user" ? "message-block-user" : "message-block-avatar"
                      } ${compactPromptToolbar ? "message-block-avatar--compact-prompt" : ""} ${sourceClass}`}
                      data-message-id={msg.id}
                      data-avatar-id={msg.role === "avatar" ? msg.avatarId : undefined}
                      onMouseEnter={() => m.setHoverMetaMessageId(msg.id)}
                      onMouseLeave={() =>
                        m.setHoverMetaMessageId((id) =>
                          id === msg.id ? null : id
                        )
                      }
                      onClick={(e) => {
                        const t = e.target as HTMLElement;
                        if (t.closest("button, a, input, textarea, select")) return;
                        m.handleMessageRowActivate(msg);
                      }}
                    >
                      {m.hoverMetaMessageId === msg.id && hoverOneLine && (
                        <div className="message-hover-meta" title={hoverOneLine}>
                          {hoverOneLine}
                        </div>
                      )}
                      <div
                        className={`message ${msg.role}`}
                        data-avatar-id={msg.avatarId}
                      >
                        <span
                          className={`message-role${
                            msg.role === "avatar" && sourceLabel && src === "ollama"
                              ? " message-role--ollama-badge-trailing"
                              : ""
                          }`}
                        >
                          <span className="message-role-ident">
                            {msg.role === "avatar" && (
                              <span className="message-avatar-portrait" aria-hidden="true">
                                {msgPortraitSrc ? (
                                  <img
                                    src={msgPortraitSrc}
                                    alt=""
                                    className="message-avatar-portrait-img"
                                    style={{
                                      objectPosition: msgPortraitObjectPosition,
                                      transform: msgPortraitTransform,
                                      transformOrigin: msgPortraitObjectPosition,
                                    }}
                                  />
                                ) : (
                                  <span
                                    className="message-avatar-portrait-fallback"
                                    style={{
                                      background:
                                        fromAvatar?.appearance?.accentColor ??
                                        "rgba(120,120,140,0.5)",
                                    }}
                                  >
                                    {msgPortraitInitial}
                                  </span>
                                )}
                              </span>
                            )}
                            {msg.role === "user"
                              ? "You"
                              : fromAvatar?.givenName ?? "Avatar"}
                            {sourceLabel && src !== "ollama" && (
                              <span
                                className={`message-source-badge message-source-badge--${src}`}
                              >
                                {sourceLabel}
                              </span>
                            )}
                            {msg.synthetic && msg.monitorTag && (
                              <span
                                className="message-monitor-chip"
                                title={`System monitor: ${msg.monitorTag}`}
                              >
                                {msg.monitorTag}
                              </span>
                            )}
                          </span>
                          {sourceLabel && src === "ollama" && (
                            <span
                              className={`message-source-badge message-source-badge--${src}`}
                            >
                              {sourceLabel}
                            </span>
                          )}
                        </span>
                        <p
                          className={`message-content ${textStyle} ${avatarFontClass} ${
                            msg.role === "avatar" && src === "ollama" ? "message-content--ai-fx" : ""
                          } ${msg.synthetic ? "message-content--synthetic" : ""}`}
                        >
                          {msg.content}
                        </p>
                        {msg.synthetic && msg.syntheticActions && msg.syntheticActions.length > 0 && (
                          <div className="message-synthetic-actions">
                            {msg.syntheticActions.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                className="message-synthetic-action-btn"
                                title={a.hint ?? undefined}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void runSyntheticAction(msg, a);
                                }}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {msg.role === "user" && msg.emailFocusArtifacts && (
                          <div className="message-email-focus-toolbar">
                            <span
                              className={`email-focus-chip email-focus-chip--cache-${
                                msg.emailFocusArtifacts.cacheHit ? "hit" : "miss"
                              }`}
                              title={
                                msg.emailFocusArtifacts.cacheHit
                                  ? "Summary from local cache"
                                  : "Summary computed this turn"
                              }
                            >
                              {msg.emailFocusArtifacts.cacheHit
                                ? "Cached summary"
                                : "New summary"}
                            </span>
                            <span
                              className={`email-focus-chip email-focus-chip--rel-${msg.emailFocusArtifacts.relevance}`}
                              title="Model estimate: is this focused email useful for your message?"
                            >
                              {msg.emailFocusArtifacts.relevance === "relevant"
                                ? "Email: relevant"
                                : msg.emailFocusArtifacts.relevance === "irrelevant"
                                  ? "Email: low relevance"
                                  : "Email: uncertain"}
                            </span>
                            {msg.emailFocusArtifacts.openUrl && (
                              <button
                                type="button"
                                className="message-email-gmail-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openLink(msg.emailFocusArtifacts!.openUrl!);
                                }}
                              >
                                Open in Gmail
                              </button>
                            )}
                          </div>
                        )}
                        {msg.role === "avatar" &&
                          msg.promptDebug &&
                          (src === "ollama" || src === "fallback") && (
                          <div className="message-prompt-toolbar">
                            <div className="message-prompt-tools message-prompt-tools--row">
                              <button
                                type="button"
                                className={`message-prompt-toggle ${
                                  src === "fallback"
                                    ? "message-prompt-toggle--fallback"
                                    : "message-prompt-toggle--ollama"
                                }`}
                                aria-expanded={m.expandedPromptId === msg.id}
                                onClick={() =>
                                  m.setExpandedPromptId((id) =>
                                    id === msg.id ? null : msg.id
                                  )
                                }
                              >
                                <span className="message-prompt-toggle-icon" aria-hidden="true">
                                  {m.expandedPromptId === msg.id ? "▼" : "▶"}
                                </span>
                                <span>
                                  {src === "ollama"
                                    ? "Prompt sent to Ollama"
                                    : "Ollama generation failed"}
                                </span>
                              </button>
                            </div>
                            {msg.avatarId && (
                              <button
                                type="button"
                                className="message-feedback-btn message-feedback-btn--downrank"
                                title="This reply was unhelpful — lowers this avatar's automatic routing priority (local)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allIds = m.fullAvatarCatalog.map((a) => a.id);
                                  m.patchSituationContext({
                                    avatarRosterPriorityScoreById: applyUnhelpfulDecrement(
                                      m.situationContext.avatarRosterPriorityScoreById ?? {},
                                      msg.avatarId!,
                                      allIds
                                    ),
                                  });
                                  appendSessionLog("ui", "avatar_unhelpful_feedback", {
                                    level: "info",
                                    detail: msg.avatarId!,
                                  });
                                }}
                              >
                                Unhelpful reply
                              </button>
                            )}
                          </div>
                        )}
                        {msg.role === "avatar" &&
                          msg.promptDebug &&
                          (src === "ollama" || src === "fallback") &&
                          m.expandedPromptId === msg.id && (
                              <div className="message-prompt-expanded">
                                {src === "fallback" && msg.replyError && (
                                  <div
                                    className="message-prompt-error-banner"
                                    role="alert"
                                  >
                                    {msg.replyError}
                                  </div>
                                )}
                                {src === "fallback" && (
                                  <p className="message-prompt-fallback-hint">
                                    The reply text is from the{" "}
                                    <strong>template rule engine</strong> after the
                                    local LLM call failed. The prompt below was
                                    prepared for Ollama.
                                  </p>
                                )}
                                <div className="message-prompt-section-label">
                                  Full prompt
                                </div>
                                <pre className="message-prompt-full">
                                  {msg.promptDebug.fullPrompt}
                                </pre>
                                <details className="message-prompt-details">
                                  <summary>Model reply / tools parse</summary>
                                  <div className="message-prompt-parse-block">
                                    {msg.promptDebug.rawModelReply != null && (
                                      <>
                                        <div className="message-prompt-section-label">
                                          Raw model reply
                                        </div>
                                        <pre className="message-prompt-raw-model">
                                          {msg.promptDebug.rawModelReply}
                                        </pre>
                                      </>
                                    )}
                                    <div className="message-prompt-section-label">
                                      Parsed tool names (intent)
                                    </div>
                                    <p className="message-prompt-parse-line">
                                      {(msg.promptDebug.worldviewParsedToolIntentNames
                                        ?.length ?? 0) > 0
                                        ? msg.promptDebug.worldviewParsedToolIntentNames!.join(
                                            ", "
                                          )
                                        : "(none — no valid avatars_tools_v1 envelope)"}
                                    </p>
                                    <div className="message-prompt-section-label">
                                      Executed tools
                                    </div>
                                    <p className="message-prompt-parse-line">
                                      {(msg.promptDebug.worldviewExecutedToolNames
                                        ?.length ?? 0) > 0
                                        ? msg.promptDebug.worldviewExecutedToolNames!.join(
                                            ", "
                                          )
                                        : "(none)"}
                                    </p>
                                    {(msg.promptDebug.worldviewParseHints?.length ??
                                      0) > 0 && (
                                      <>
                                        <div className="message-prompt-section-label message-prompt-section-label--warn">
                                          Parse mismatch hints
                                        </div>
                                        <ul className="message-prompt-hints-list">
                                          {msg.promptDebug.worldviewParseHints!.map(
                                            (h, i) => (
                                              <li key={i}>{h}</li>
                                            )
                                          )}
                                        </ul>
                                        {msg.promptDebug.worldviewParseReason && (
                                          <p className="message-prompt-parse-reason">
                                            {msg.promptDebug.worldviewParseReason}
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </details>
                                <details className="message-prompt-details">
                                  <summary>Structured details</summary>
                                  <pre className="message-prompt-panel message-prompt-panel--json">
                                    {JSON.stringify(
                                      Object.fromEntries(
                                        Object.entries(
                                          msg.promptDebug as unknown as Record<
                                            string,
                                            unknown
                                          >
                                        ).filter(
                                          ([k]) =>
                                            k !== "fullPrompt" &&
                                            k !== "rawModelReply"
                                        )
                                      ),
                                      null,
                                      2
                                    )}
                                  </pre>
                                </details>
                                {src === "fallback" && (
                                  <p className="message-prompt-meta">
                                    For more detail, check the browser console for{" "}
                                    <code>[ollama]</code> logs.
                                  </p>
                                )}
                              </div>
                        )}
                        {msg.role === "avatar" && src === "rules" && fromAvatar && (
                          <div className="message-prompt-tools">
                            <button
                              type="button"
                              className="message-prompt-toggle"
                              aria-expanded={m.expandedPromptId === msg.id}
                              onClick={() =>
                                m.setExpandedPromptId((id) =>
                                  id === msg.id ? null : msg.id
                                )
                              }
                            >
                              {m.expandedPromptId === msg.id ? "▼" : "▶"} Why no
                              Ollama prompt?
                            </button>
                            {m.expandedPromptId === msg.id && (
                              <div className="message-prompt-panel message-prompt-panel--explainer">
                                {msg.rulesSkipReason === "no_models" ? (
                                  <p>
                                    This reply came from the{" "}
                                    <strong>template rule engine</strong> because
                                    Ollama is reachable but <strong>no models are
                                    installed</strong>. Pull a model (e.g.{" "}
                                    <code>ollama pull llama3.2</code>), then send
                                    again for local LLM generation. There is no
                                    Ollama prompt for this message.
                                  </p>
                                ) : (
                                  <p>
                                    This reply came from the{" "}
                                    <strong>template rule engine</strong>, not the
                                    local LLM, because the Ollama server was not
                                    reachable at <code>127.0.0.1:11434</code>. There
                                    is no Ollama prompt for this message.
                                  </p>
                                )}
                                <p className="message-prompt-meta">
                                  Avatar: <code>{fromAvatar.id}</code>
                                  {fromAvatar.ruleSetId && (
                                    <>
                                      {" "}
                                      · Rule set:{" "}
                                      <code>{fromAvatar.ruleSetId}</code>
                                    </>
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {msg.role === "user" &&
                        (m.chatViewMode === "chat_routing" ||
                          m.chatViewMode === "routing_log") &&
                        turn && (
                          <>
                            <div
                              className="chat-turn-meta"
                              title={formatTurnMetaLine(turn)}
                            >
                              {formatTurnMetaLine(turn)}
                            </div>
                            {m.chatViewMode === "routing_log" && (
                              <div className="chat-turn-log-detail">
                                {getTurnLogDetailLines(turn, m.fullAvatarCatalog).map(
                                  (line, i) => (
                                    <div key={i} className="chat-turn-log-line">
                                      {line}
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </>
                        )}
                      {msg.role === "avatar" &&
                        msg.synthetic &&
                        msg.monitorTag &&
                        (m.chatViewMode === "chat_routing" ||
                          m.chatViewMode === "routing_log") && (
                          <>
                            <div
                              className="chat-turn-meta chat-turn-meta--monitor"
                              title={`Synthetic monitor card: ${msg.monitorTag}`}
                            >
                              Monitor card · {msg.monitorTag}
                              {msg.syntheticActions?.length
                                ? ` · actions: ${msg.syntheticActions
                                    .map((a) => a.label)
                                    .join(", ")}`
                                : ""}
                            </div>
                            {m.chatViewMode === "routing_log" && (
                              <div className="chat-turn-log-detail chat-turn-log-detail--monitor">
                                <div className="chat-turn-log-line">
                                  Synthetic review card posted without an Ollama routing
                                  turn.
                                </div>
                              </div>
                            )}
                          </>
                        )}
                    </div>
                  );
                  })
                )}
              </div>
            )}
            {m.mainSurface === "workshops" && (
              <div
                className={`chat-workshops-embed chat-body-row--tool-workshop${
                  m.mainSurface === "workshops"
                    ? " chat-workshops-embed--full-height"
                    : ""
                }`}
              >
                <WorkshopsPanel
                  workshopTab={m.workshopTab}
                  ollamaPresence={m.ollamaPresence}
                  onRefreshOllama={m.refreshOllama}
                  messages={m.messages}
                  fullAvatarCatalog={m.fullAvatarCatalog}
                  projectsList={m.projectsList}
                  situationContext={m.situationContext}
                  patchSituationContext={m.patchSituationContext}
                  internetSearchMaxResults={
                    m.contextEntryBudgets.internetSearchMaxResults
                  }
                  onWellOfSoulsAfterGenerate={m.handleWellOfSoulsAfterGenerate}
                  onOpenAvatarBuilderFromInternet={
                    m.handleOpenAvatarBuilderFromInternet
                  }
                  creationWorkshopPrefill={m.creationWorkshopPrefill}
                />
              </div>
            )}
            </div>
            {m.wavesColumnVisible && (
              <>
                {storageExpanded && (
                  <button
                    type="button"
                    className="chat-viz-resize-handle chat-viz-resize-handle--source-cache"
                    aria-label="Resize Storage visualizer panel"
                    aria-orientation="vertical"
                    onPointerDown={m.onSourceCacheVizResizePointerDown}
                    onPointerMove={m.onSourceCacheVizResizePointerMove}
                    onPointerUp={m.onSourceCacheVizResizePointerUp}
                    onPointerCancel={m.onSourceCacheVizResizePointerUp}
                  />
                )}
                <aside
                  className={`source-cache-viz-column${
                    storageExpanded ? "" : " source-cache-viz-column--collapsed"
                  }${
                    pulseStorageOnColumn ? " audio-visual-cue-active" : ""
                  }`}
                  style={{
                    width: storageExpanded ? m.sourceCacheVizWidthPx : vizRailWidthPx,
                  }}
                  aria-label="Storage and cache diagnostics"
                >
                  <button
                    type="button"
                    className="viz-column-titlebar"
                    aria-pressed={storageExpanded}
                    aria-label={
                      storageExpanded
                        ? "Collapse STORE visualizer"
                        : "Expand STORE visualizer"
                    }
                    onClick={() => m.setShowSourceCacheViz(!storageExpanded)}
                  >
                    STORE
                  </button>
                  {storageExpanded && (
                    <SourceCacheViz
                      diagnostics={m.sourceCacheVizSnapshot.diagnostics}
                      parsedFallbackLines={
                        m.sourceCacheVizSnapshot.parsedFallbackLines
                      }
                      emailInsights={m.sourceCacheVizSnapshot.emailInsights}
                      worldMeta={m.sourceCacheVizSnapshot.worldMeta}
                      worldviewAuditTail={m.sourceCacheVizSnapshot.worldviewAuditTail}
                      wavesQueueLength={m.sourceCacheVizSnapshot.wavesQueueLength}
                      wavesStorageKey={m.sourceCacheVizSnapshot.wavesStorageKey}
                      lastUserEmailFocus={m.sourceCacheVizSnapshot.lastUserEmailFocus}
                      futureSources={m.sourceCacheVizSnapshot.futureSources}
                      onOpenWorldviewTab={m.openWorldviewTab}
                      fullAvatarCatalog={m.fullAvatarCatalog}
                    />
                  )}
                </aside>
              </>
            )}
            </div>

            <div
              className="chat-talk-tray-chrome"
              role="toolbar"
              aria-label="Routing status, Talk to tray, and session activity"
            >
              <div
                className="chat-talk-tray-chrome-left"
                role="status"
                aria-live="polite"
              >
                {m.showSwitchboardViz && m.wavesColumnVisible && m.vizDebug && (() => {
                  const counts = countWavesQueueByKind(m.wavesQueue);
                  return (
                    <span className="chat-viz-debug" aria-hidden>
                      user:{counts.user} · wave:{counts.wave} · wv:
                      {counts.worldview}
                      {counts.toolError > 0 ? ` · err:${counts.toolError}` : ""}
                      {counts.systemCommand > 0
                        ? ` · cmd:${counts.systemCommand} [n:${counts.cmdNoTools} q:${counts.cmdQueued} v:${counts.cmdValidated} a:${counts.cmdApplied} f:${counts.cmdFailed}]`
                        : ""}
                    </span>
                  );
                })()}
                {m.pendingTurnCount > 0 && (
                  <>
                    <span className="chat-pending-icon" aria-hidden>
                      ⏳
                    </span>
                    <span className="chat-pending-text">
                      {m.pendingTurnCount === 1
                        ? "Reply in progress…"
                        : `${m.pendingTurnCount} replies in progress…`}
                    </span>
                  </>
                )}
              </div>
              <div className="chat-talk-tray-chrome-center">
                <button
                  type="button"
                  className="chat-talk-tray-toggle"
                  aria-expanded={m.talkToTrayOpen}
                  aria-controls="chat-avatar-picker-region"
                  onClick={() => m.setTalkToTrayOpen(!m.talkToTrayOpen)}
                  title={m.talkToTrayOpen ? "Hide Talk to" : "Show Talk to"}
                >
                  {m.talkToTrayOpen ? "▼ Talk to" : "▶ Talk to"}
                </button>
              </div>
              <div className="chat-talk-tray-chrome-right">
                <span
                  className="chat-session-change-count"
                  title="Approximate count of durable data changes this segment (world, store, tasks, drafts, cached email summaries, etc.). Resets on Clear chat or End topic."
                >
                  Changes: {m.sessionChangeCount}
                </span>
              </div>
            </div>
            {m.talkToTrayOpen && (
            <div
              id="chat-avatar-picker-region"
              className="chat-avatar-picker"
              role="group"
              aria-label="Choose avatars to address in your next message"
            >
              <span className="chat-avatar-picker-label">Talk to</span>
              <div className="chat-avatar-picker-scroll">
                {m.fullAvatarCatalog.map((a) => {
                  const selected = m.selectedAvatarIds.includes(a.id);
                  const pSrc = getAvatarPortraitSrc(
                    m.situationContext.avatarPortraitSrcById,
                    a.id,
                    a.appearance?.portraitUrl
                  );
                  const pObjectPosition = getAvatarPortraitObjectPosition(
                    m.situationContext.avatarPortraitPositionById?.[a.id]
                  );
                  const pTransform = getAvatarPortraitTransform(
                    m.situationContext.avatarPortraitScaleById?.[a.id]
                  );
                  const pInitial =
                    a.givenName.trim().charAt(0).toUpperCase() || "?";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`chat-avatar-picker-item ${
                        selected ? "is-selected" : ""
                      }`}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Remove" : "Add"} ${a.givenName}`}
                      title={a.givenName}
                      onClick={() => m.toggleAvatarSelection(a.id)}
                    >
                      <span className="chat-avatar-picker-portrait" aria-hidden>
                        {pSrc ? (
                          <img
                            src={pSrc}
                            alt=""
                            className="chat-avatar-picker-img"
                            style={{
                              objectPosition: pObjectPosition,
                              transform: pTransform,
                              transformOrigin: pObjectPosition,
                            }}
                          />
                        ) : (
                          <span
                            className="chat-avatar-picker-fallback"
                            style={{
                              background:
                                a.appearance?.accentColor ??
                                "rgba(120,120,140,0.5)",
                            }}
                          >
                            {pInitial}
                          </span>
                        )}
                      </span>
                      <span className="chat-avatar-picker-name">{a.givenName}</span>
                    </button>
                  );
                })}
              </div>
              {m.selectedAvatarIds.length > 0 && (
                <button
                  type="button"
                  className="chat-avatar-picker-all"
                  aria-label="Use automatic routing for all chat messages"
                  title="Clear targeted avatar selection"
                  onClick={() => m.clearAvatarSelection()}
                >
                  ALL CHAT
                </button>
              )}
            </div>
            )}

            <div className="chat-input-area">
              <input
                type="text"
                value={m.inputValue}
                onChange={(e) => m.setInputValue(e.target.value)}
                onKeyDown={m.handleKeyDown}
                placeholder={m.messagePlaceholder}
                className="chat-input"
              />
              <button
                type="button"
                title={m.speech.isListening ? "Stop listening" : "Voice input"}
                className={`mic-btn ${m.speech.isListening ? "active" : ""}`}
                onClick={m.speech.isListening ? m.speech.stopListening : m.speech.startListening}
                disabled={!!m.speech.error}
              >
                {m.speech.isListening ? "●" : "🎤"}
              </button>
              <button
                onClick={m.handleSend}
                disabled={!m.inputValue.trim()}
                className="send-btn"
              >
                Send
              </button>
            </div>
      </main>
  );
}

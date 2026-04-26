import { useState, useEffect, useCallback, useRef, type ChangeEvent } from "react";
import type { Avatar } from "../types";
import { DEFAULT_ROSTER_SCORE } from "../services/avatarRoster";
import {
  DEFAULT_AVATAR_PORTRAIT_SCALE,
  MAX_AVATAR_PORTRAIT_SCALE,
  MIN_AVATAR_PORTRAIT_SCALE,
  getAvatarPortraitSrc,
  getAvatarPortraitObjectPosition,
  getAvatarPortraitTransform,
  normalizeAvatarPortraitPosition,
  normalizeAvatarPortraitScale,
  readPortraitFileAsDataUrl,
  MAX_PORTRAIT_FILE_BYTES,
  type AvatarPortraitPosition,
} from "../services/avatarPortrait";
import { PERSONALITY_TRAITS, type PersonalityTraitId } from "../theme/designTokens";
import { AI_RULE_BLOCKS, AI_RULE_SETS } from "../data/aiRulesLibrary";
import type { AvatarBuilderInternetSectionRefs } from "../services/avatarCreationWorkshopSectionSearch";
import { getAvatarOperationalRoles } from "../services/avatarOperations";

export type AvatarBuilderInitial =
  | {
      kind: "seed";
      seed: string;
      traitIds: PersonalityTraitId[];
      supplementalRules: string;
      ruleBlockIds: string[];
      /** Pinned-style lines from a single discovery run (legacy). */
      internetReferenceLines?: string[];
      /** Per–avatar-builder section hits from workshop “Use selected in new avatar”. */
      internetReferencesBySection?: AvatarBuilderInternetSectionRefs[];
      /** Provider notices from the search run that produced the references. */
      wikiSearchNotices?: string[];
    }
  | { kind: "edit"; avatar: Avatar };

type Props = {
  open: boolean;
  onClose: () => void;
  initial: AvatarBuilderInitial | null;
  /** When editing, roster priority score (0–100) from persisted context. */
  initialRosterScore?: number;
  existingUserAvatars: Avatar[];
  onSave: (payload: {
    avatar: Avatar;
    rosterScore: number;
    seedPortraitDataUrl?: string | null;
    portraitPosition?: AvatarPortraitPosition;
    portraitScale?: number;
  }) => void;
  openPortraitFilePicker: (avatarId: string) => void;
  clearPortrait: (avatarId: string) => void;
  portraitFileError: { avatarId: string; message: string } | null;
  avatarPortraitSrcById: Record<string, string> | undefined;
  avatarPortraitPositionById: Record<string, AvatarPortraitPosition> | undefined;
  avatarPortraitScaleById: Record<string, number> | undefined;
};

function splitComma(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Selected ids in library order (stable prompt merge). */
function orderedRuleBlockIds(selected: Set<string>): string[] {
  return AI_RULE_BLOCKS.filter((b) => selected.has(b.id)).map((b) => b.id);
}

function ruleBlockIdsFromAvatar(a: Avatar): Set<string> {
  if (a.ruleBlockIds?.length) {
    return new Set(a.ruleBlockIds);
  }
  const set = AI_RULE_SETS.find((s) => s.id === a.ruleSetId);
  return new Set(set?.blockIds ?? []);
}

const SIGNATURE_COLOR_PRESETS = [
  "#7dd3fc",
  "#e94560",
  "#4ecca3",
  "#a78bfa",
  "#fb923c",
  "#f472b6",
] as const;

const DEFAULT_SIGNATURE_COLOR = SIGNATURE_COLOR_PRESETS[0];

function seedHasInternetRefs(
  initial: Extract<AvatarBuilderInitial, { kind: "seed" }>
): boolean {
  if ((initial.internetReferenceLines?.length ?? 0) > 0) return true;
  return (
    initial.internetReferencesBySection?.some((s) => s.lines.length > 0) ??
    false
  );
}

function seedShowInternetBlock(
  initial: Extract<AvatarBuilderInitial, { kind: "seed" }>
): boolean {
  return (
    seedHasInternetRefs(initial) ||
    (initial.wikiSearchNotices?.length ?? 0) > 0
  );
}

function normalizeHex6(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(t)) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

export function AvatarBuilderModal({
  open,
  onClose,
  initial,
  initialRosterScore,
  existingUserAvatars,
  onSave,
  openPortraitFilePicker,
  clearPortrait,
  portraitFileError,
  avatarPortraitSrcById,
  avatarPortraitPositionById,
  avatarPortraitScaleById,
}: Props) {
  const [givenName, setGivenName] = useState("");
  const [appellation, setAppellation] = useState("");
  const [description, setDescription] = useState("");
  const [personality, setPersonality] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [interestsStr, setInterestsStr] = useState("");
  const [traits, setTraits] = useState<Set<PersonalityTraitId>>(
    () => new Set()
  );
  const [ruleBlocks, setRuleBlocks] = useState<Set<string>>(() => new Set());
  const [supplementalRules, setSupplementalRules] = useState("");
  const [rosterScore, setRosterScore] = useState(DEFAULT_ROSTER_SCORE);
  const [accentColor, setAccentColor] = useState<string>(DEFAULT_SIGNATURE_COLOR);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [seedPortraitDataUrl, setSeedPortraitDataUrl] = useState<string | null>(
    null
  );
  const [seedPortraitPosition, setSeedPortraitPosition] =
    useState<AvatarPortraitPosition>(() => ({ x: 50, y: 50 }));
  const [seedPortraitScale, setSeedPortraitScale] = useState(
    DEFAULT_AVATAR_PORTRAIT_SCALE
  );
  const [portraitPosition, setPortraitPosition] =
    useState<AvatarPortraitPosition>(() => ({ x: 50, y: 50 }));
  const [portraitScale, setPortraitScale] = useState(
    DEFAULT_AVATAR_PORTRAIT_SCALE
  );
  const [seedPortraitError, setSeedPortraitError] = useState<string | null>(null);
  const seedPortraitInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (!wasOpenRef.current) {
        setSeedPortraitDataUrl(null);
        setSeedPortraitPosition({ x: 50, y: 50 });
        setSeedPortraitScale(DEFAULT_AVATAR_PORTRAIT_SCALE);
        setSeedPortraitError(null);
      }
      wasOpenRef.current = true;
    } else {
      wasOpenRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initial) return;
    setSaveError(null);
    if (initial.kind === "seed") {
      setGivenName("");
      setAppellation("");
      setDescription(
        initial.seed.trim() ||
          (seedShowInternetBlock(initial)
            ? "Review internet references below; edit to describe this avatar."
            : "")
      );
      setPersonality("");
      setTagsStr("");
      setInterestsStr("");
      setTraits(new Set(initial.traitIds));
      setRuleBlocks(new Set(initial.ruleBlockIds));
      setSupplementalRules(initial.supplementalRules.trim());
      setRosterScore(DEFAULT_ROSTER_SCORE);
      setAccentColor(DEFAULT_SIGNATURE_COLOR);
      setPortraitPosition({ x: 50, y: 50 });
      setPortraitScale(DEFAULT_AVATAR_PORTRAIT_SCALE);
    } else {
      const a = initial.avatar;
      setGivenName(a.givenName);
      setAppellation(a.appellation);
      setDescription(a.description.trim());
      setPersonality(a.personality.trim());
      setTagsStr(a.tags.join(", "));
      setInterestsStr(a.interests.join(", "));
      const traitSet = new Set<PersonalityTraitId>();
      for (const id of a.traitIds ?? []) {
        if (PERSONALITY_TRAITS.some((t) => t.id === id)) {
          traitSet.add(id as PersonalityTraitId);
        }
      }
      setTraits(traitSet);
      setRuleBlocks(ruleBlockIdsFromAvatar(a));
      setSupplementalRules(a.supplementalRules?.trim() ?? "");
      const rs =
        typeof initialRosterScore === "number" && !Number.isNaN(initialRosterScore)
          ? Math.round(initialRosterScore)
          : DEFAULT_ROSTER_SCORE;
      setRosterScore(Math.max(0, Math.min(100, rs)));
      setAccentColor(
        normalizeHex6(a.appearance?.accentColor) ?? DEFAULT_SIGNATURE_COLOR
      );
      setPortraitPosition(
        normalizeAvatarPortraitPosition(avatarPortraitPositionById?.[a.id])
      );
      setPortraitScale(normalizeAvatarPortraitScale(avatarPortraitScaleById?.[a.id]));
    }
  }, [
    open,
    initial,
    initialRosterScore,
    avatarPortraitPositionById,
    avatarPortraitScaleById,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleTrait = useCallback((id: PersonalityTraitId) => {
    setTraits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleRuleBlock = useCallback((id: string) => {
    setRuleBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSeedPortraitFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const dataUrl = await readPortraitFileAsDataUrl(file);
      if (!dataUrl) {
        setSeedPortraitError(
          `Choose an image under ${Math.floor(MAX_PORTRAIT_FILE_BYTES / (1024 * 1024))} MB.`
        );
        return;
      }
      setSeedPortraitError(null);
      setSeedPortraitDataUrl(dataUrl);
      setSeedPortraitPosition({ x: 50, y: 50 });
      setSeedPortraitScale(DEFAULT_AVATAR_PORTRAIT_SCALE);
    },
    []
  );

  const handleSave = useCallback(() => {
    setSaveError(null);
    if (!initial) {
      setSaveError("Nothing to save.");
      return;
    }
    const name = givenName.trim();
    if (!name) {
      setSaveError("Given name is required.");
      return;
    }
    const desc = description.trim();
    const p = personality.trim();
    const appellationOut = appellation.trim() || name;
    const tags = splitComma(tagsStr);
    const interests = splitComma(interestsStr);
    const traitIdsOut = traits.size > 0 ? [...traits] : undefined;
    const supp = supplementalRules.trim() || undefined;
    const blockIdsOrdered = orderedRuleBlockIds(ruleBlocks);
    if (blockIdsOrdered.length === 0) {
      setSaveError("Select at least one AI rule block.");
      return;
    }

    const accentOut =
      normalizeHex6(accentColor) ?? DEFAULT_SIGNATURE_COLOR;

    if (initial.kind === "edit") {
      const base = initial.avatar;
      const avatar: Avatar = {
        ...base,
        givenName: name,
        appellation: appellationOut,
        description: desc.slice(0, 500) || `A custom avatar: ${name}.`,
        personality: p || "Thoughtful and in character.",
        tags,
        interests,
        ruleBlockIds: blockIdsOrdered,
        ruleSetId: undefined,
        traitIds: traitIdsOut,
        supplementalRules: supp,
        appearance: {
          ...base.appearance,
          accentColor: accentOut,
        },
      };
      const editPortraitSrc = getAvatarPortraitSrc(
        avatarPortraitSrcById,
        base.id,
        base.appearance?.portraitUrl
      );
      onSave({
        avatar,
        rosterScore,
        portraitPosition: editPortraitSrc ? portraitPosition : undefined,
        portraitScale: editPortraitSrc ? portraitScale : undefined,
      });
      onClose();
      return;
    }

    const id = crypto.randomUUID();
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 24) || "avatar";
    const processName = `${slug}-${id.slice(0, 8)}`;
    const existingIds = new Set(existingUserAvatars.map((a) => a.id));
    if (existingIds.has(id)) {
      setSaveError("Id collision; try again.");
      return;
    }

    const avatar: Avatar = {
      id,
      processName,
      givenName: name,
      appellation: appellationOut,
      description: desc.slice(0, 500) || `A custom avatar: ${name}.`,
      personality: p || "Thoughtful and in character.",
      tags,
      interests,
      assignedTasks: [],
      opinions: {},
      ruleBlockIds: blockIdsOrdered,
      traitIds: traitIdsOut,
      supplementalRules: supp,
      appearance: { accentColor: accentOut },
    };
    onSave({
      avatar,
      rosterScore,
      seedPortraitDataUrl: seedPortraitDataUrl ?? undefined,
      portraitPosition: seedPortraitDataUrl ? seedPortraitPosition : undefined,
      portraitScale: seedPortraitDataUrl ? seedPortraitScale : undefined,
    });
    onClose();
  }, [
    initial,
    rosterScore,
    givenName,
    appellation,
    description,
    personality,
    tagsStr,
    interestsStr,
    traits,
    ruleBlocks,
    supplementalRules,
    accentColor,
    existingUserAvatars,
    avatarPortraitSrcById,
    seedPortraitDataUrl,
    seedPortraitPosition,
    seedPortraitScale,
    portraitPosition,
    portraitScale,
    onSave,
    onClose,
  ]);

  const isEdit = initial?.kind === "edit";

  if (!open) return null;

  const portraitSrcForUi =
    initial?.kind === "edit"
      ? getAvatarPortraitSrc(
          avatarPortraitSrcById,
          initial.avatar.id,
          initial.avatar.appearance?.portraitUrl
        )
      : initial?.kind === "seed"
        ? seedPortraitDataUrl ?? undefined
        : undefined;
  const portraitPickLabel =
    initial?.kind === "edit"
      ? `Choose portrait image for ${initial.avatar.givenName}`
      : "Choose portrait image for new avatar";
  const portraitRemoveLabel =
    initial?.kind === "edit"
      ? `Remove portrait for ${initial.avatar.givenName}`
      : "Clear chosen portrait";
  const operationalRoles =
    initial?.kind === "edit" ? getAvatarOperationalRoles(initial.avatar) : null;
  const activePortraitPosition =
    initial?.kind === "seed" ? seedPortraitPosition : portraitPosition;
  const activePortraitScale =
    initial?.kind === "seed" ? seedPortraitScale : portraitScale;
  const portraitObjectPosition =
    getAvatarPortraitObjectPosition(activePortraitPosition);
  const portraitTransform = getAvatarPortraitTransform(activePortraitScale);
  const setActivePortraitPosition =
    initial?.kind === "seed" ? setSeedPortraitPosition : setPortraitPosition;
  const setActivePortraitScale =
    initial?.kind === "seed" ? setSeedPortraitScale : setPortraitScale;

  return (
    <div
      className="avatar-builder-overlay"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="avatar-builder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-builder-title"
      >
        <div className="avatar-builder-header">
          <h2 id="avatar-builder-title">
            {isEdit ? "Edit avatar" : "Avatar builder"}
          </h2>
          <button
            type="button"
            className="avatar-builder-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="avatar-builder-desc">
          {isEdit
            ? "Update this avatar. Changes apply to routing and prompts."
            : "Create a custom avatar. Choose AI rule blocks for prompts; supplemental rules add your Well of Souls output (or your own lines)."}
        </p>
        {initial?.kind === "seed" && seedShowInternetBlock(initial) && (
            <div className="avatar-builder-internet-refs" role="region" aria-label="Internet references">
              <h3 className="avatar-builder-signature-hint">Internet references</h3>
              {initial.wikiSearchNotices && initial.wikiSearchNotices.length > 0 ? (
                <ul className="context-internet-notices">
                  {initial.wikiSearchNotices.map((n, idx) => (
                    <li key={`ref-notice-${idx}-${n}`}>{n}</li>
                  ))}
                </ul>
              ) : null}
              {initial.internetReferencesBySection &&
              initial.internetReferencesBySection.some((s) => s.lines.length > 0)
                ? initial.internetReferencesBySection.map((sec) =>
                    sec.lines.length === 0 ? null : (
                      <div key={sec.id} className="avatar-builder-internet-refs-section">
                        <h4 className="avatar-builder-signature-hint">{sec.label}</h4>
                        <ul className="avatar-builder-internet-refs-list">
                          {sec.lines.map((line, idx) => (
                            <li key={`${sec.id}-${idx}`}>
                              <pre className="avatar-builder-internet-ref-pre">{line}</pre>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  )
                : initial.internetReferenceLines &&
                  initial.internetReferenceLines.length > 0 ? (
                  <ul className="avatar-builder-internet-refs-list">
                    {initial.internetReferenceLines.map((line, idx) => (
                      <li key={idx}>
                        <pre className="avatar-builder-internet-ref-pre">{line}</pre>
                      </li>
                    ))}
                  </ul>
                ) : null}
            </div>
          )}
        <label className="avatar-builder-label">
          Given name *
          <input
            type="text"
            className="avatar-builder-input"
            value={givenName}
            onChange={(e) => setGivenName(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="avatar-builder-label">
          Appellation / title
          <input
            type="text"
            className="avatar-builder-input"
            value={appellation}
            onChange={(e) => setAppellation(e.target.value)}
            placeholder={givenName.trim() || "Shown in the roster"}
            autoComplete="off"
          />
        </label>
        <label className="avatar-builder-label">
          Backstory / description
          <textarea
            className="avatar-builder-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </label>
        <label className="avatar-builder-label">
          Personality
          <textarea
            className="avatar-builder-textarea"
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            rows={3}
          />
        </label>
        <label className="avatar-builder-label">
          Tags (comma-separated)
          <input
            type="text"
            className="avatar-builder-input"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
          />
        </label>
        <label className="avatar-builder-label">
          Interests (comma-separated)
          <input
            type="text"
            className="avatar-builder-input"
            value={interestsStr}
            onChange={(e) => setInterestsStr(e.target.value)}
          />
        </label>
        {initial != null && (
          <div className="avatar-builder-label">
            <span>Portrait</span>
            <p className="avatar-builder-signature-hint">
              {initial.kind === "edit"
                ? "Choosing a file updates the session portrait immediately."
                : "Optional — stored when you save this new avatar."}
            </p>
            {initial.kind === "seed" && (
              <input
                ref={seedPortraitInputRef}
                type="file"
                accept="image/*"
                className="avatar-portrait-file-input"
                aria-hidden
                tabIndex={-1}
                onChange={handleSeedPortraitFileChange}
              />
            )}
            <div className="avatar-portrait-row">
              <span className="avatar-portrait avatar-portrait--large" aria-hidden="true">
                {portraitSrcForUi ? (
                  <img
                    src={portraitSrcForUi}
                    alt=""
                    className="avatar-portrait-img"
                    style={{
                      objectPosition: portraitObjectPosition,
                      transform: portraitTransform,
                      transformOrigin: portraitObjectPosition,
                    }}
                  />
                ) : (
                  <span
                    className="avatar-portrait-fallback"
                    style={{
                      background:
                        normalizeHex6(accentColor) ?? DEFAULT_SIGNATURE_COLOR,
                    }}
                  >
                    {givenName.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                )}
              </span>
              <div className="avatar-portrait-actions">
                <button
                  type="button"
                  className="avatar-portrait-choose"
                  aria-label={portraitPickLabel}
                  onClick={() => {
                    if (initial.kind === "edit") {
                      openPortraitFilePicker(initial.avatar.id);
                    } else {
                      seedPortraitInputRef.current?.click();
                    }
                  }}
                >
                  Choose image…
                </button>
                {portraitSrcForUi && (
                  <button
                    type="button"
                    className="avatar-portrait-remove"
                    aria-label={portraitRemoveLabel}
                    onClick={() => {
                      if (initial.kind === "edit") {
                        clearPortrait(initial.avatar.id);
                      } else {
                        setSeedPortraitDataUrl(null);
                        setSeedPortraitPosition({ x: 50, y: 50 });
                        setSeedPortraitScale(DEFAULT_AVATAR_PORTRAIT_SCALE);
                        setSeedPortraitError(null);
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {portraitSrcForUi && (
              <div className="avatar-portrait-position">
                <p className="avatar-builder-signature-hint">
                  Reposition for headshot framing.
                </p>
                <label className="avatar-portrait-position-row">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={MIN_AVATAR_PORTRAIT_SCALE}
                    max={MAX_AVATAR_PORTRAIT_SCALE}
                    step={0.05}
                    value={activePortraitScale}
                    onChange={(e) => {
                      const scale = Number(e.target.value);
                      setActivePortraitScale(normalizeAvatarPortraitScale(scale));
                    }}
                  />
                  <output>{activePortraitScale.toFixed(2)}x</output>
                </label>
                <label className="avatar-portrait-position-row">
                  <span>Left / right</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={activePortraitPosition.x}
                    onChange={(e) => {
                      const x = Number(e.target.value);
                      setActivePortraitPosition((prev) =>
                        normalizeAvatarPortraitPosition({ ...prev, x })
                      );
                    }}
                  />
                </label>
                <label className="avatar-portrait-position-row">
                  <span>Up / down</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={activePortraitPosition.y}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setActivePortraitPosition((prev) =>
                        normalizeAvatarPortraitPosition({ ...prev, y })
                      );
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="avatar-portrait-reset"
                  onClick={() => {
                    setActivePortraitPosition({ x: 50, y: 50 });
                    setActivePortraitScale(DEFAULT_AVATAR_PORTRAIT_SCALE);
                  }}
                >
                  Reset framing
                </button>
              </div>
            )}
            {initial.kind === "edit" &&
              portraitFileError?.avatarId === initial.avatar.id && (
                <p className="avatar-portrait-error" role="status">
                  {portraitFileError.message}
                </p>
              )}
            {initial.kind === "seed" && seedPortraitError && (
              <p className="avatar-portrait-error" role="status">
                {seedPortraitError}
              </p>
            )}
          </div>
        )}
        <div className="avatar-builder-label">
          <span>Signature color</span>
          <p className="avatar-builder-signature-hint">
            Chat visualizer dots and portrait fallback when no image is set.
          </p>
          <div className="avatar-builder-signature-row">
            {SIGNATURE_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className={`avatar-builder-swatch${
                  accentColor.toLowerCase() === c ? " is-selected" : ""
                }`}
                style={{ background: c }}
                title={c}
                aria-label={`Use signature color ${c}`}
                onClick={() => setAccentColor(c)}
              />
            ))}
            <input
              type="color"
              className="avatar-builder-color-native"
              value={normalizeHex6(accentColor) ?? DEFAULT_SIGNATURE_COLOR}
              onChange={(e) => setAccentColor(e.target.value)}
              aria-label="Pick custom signature color"
              title="Custom color"
            />
          </div>
        </div>
        <label className="avatar-builder-label">
          Roster priority (0–100)
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className="avatar-builder-input"
            value={rosterScore}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setRosterScore(
                Number.isNaN(n) ? DEFAULT_ROSTER_SCORE : Math.max(0, Math.min(100, n))
              );
            }}
          />
        </label>
        <div className="avatar-builder-traits">
          <span className="avatar-builder-label-text">Traits</span>
          <div className="avatar-builder-trait-grid">
            {PERSONALITY_TRAITS.map((t) => (
              <label key={t.id} className="avatar-builder-trait">
                <input
                  type="checkbox"
                  checked={traits.has(t.id)}
                  onChange={() => toggleTrait(t.id)}
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
        <div className="avatar-builder-traits">
          <span className="avatar-builder-label-text">AI rule blocks</span>
          <div className="avatar-builder-trait-grid">
            {AI_RULE_BLOCKS.map((b) => (
              <label key={b.id} className="avatar-builder-trait">
                <input
                  type="checkbox"
                  checked={ruleBlocks.has(b.id)}
                  onChange={() => toggleRuleBlock(b.id)}
                />
                {b.title}
              </label>
            ))}
          </div>
        </div>
        {operationalRoles && (
          <div className="avatar-builder-operational">
            <span className="avatar-builder-label-text">Operational roles</span>
            <p className="avatar-builder-signature-hint">
              Stewardships and capabilities are managed in Workshops → Stewardship.
            </p>
            <div className="avatar-builder-operational-grid">
              <section>
                <h3 className="avatar-builder-operational-heading">
                  Stewardships
                </h3>
                {operationalRoles.stewardships.length > 0 ? (
                  <div className="avatar-builder-chip-row" aria-label="Stewardships">
                    {operationalRoles.stewardships.map((role) => (
                      <span
                        key={role.tag}
                        className="avatar-builder-chip"
                        title={role.description}
                      >
                        {role.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="avatar-builder-operational-empty">None</p>
                )}
              </section>
              <section>
                <h3 className="avatar-builder-operational-heading">
                  Capabilities
                </h3>
                {operationalRoles.capabilities.length > 0 ? (
                  <div className="avatar-builder-chip-row" aria-label="Capabilities">
                    {operationalRoles.capabilities.map((role) => (
                      <span
                        key={`${role.kind}:${role.id}`}
                        className="avatar-builder-chip"
                        title={role.description}
                      >
                        {role.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="avatar-builder-operational-empty">None</p>
                )}
              </section>
            </div>
          </div>
        )}
        <label className="avatar-builder-label">
          Supplemental rules
          <textarea
            className="avatar-builder-textarea"
            value={supplementalRules}
            onChange={(e) => setSupplementalRules(e.target.value)}
            rows={5}
          />
        </label>
        {saveError && (
          <p className="avatar-builder-error" role="alert">
            {saveError}
          </p>
        )}
        <div className="avatar-builder-actions">
          <button type="button" className="avatar-builder-save" onClick={handleSave}>
            {isEdit ? "Save changes" : "Save avatar"}
          </button>
          <button type="button" className="avatar-builder-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import type { Avatar } from "../types";
import { PERSONALITY_TRAITS, type PersonalityTraitId } from "../theme/designTokens";
import { AI_RULE_BLOCKS, AI_RULE_SETS } from "../data/aiRulesLibrary";

export type AvatarBuilderInitial =
  | {
      kind: "seed";
      seed: string;
      traitIds: PersonalityTraitId[];
      supplementalRules: string;
      ruleBlockIds: string[];
    }
  | { kind: "edit"; avatar: Avatar };

type Props = {
  open: boolean;
  onClose: () => void;
  initial: AvatarBuilderInitial | null;
  existingUserAvatars: Avatar[];
  onSave: (avatar: Avatar) => void;
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

export function AvatarBuilderModal({
  open,
  onClose,
  initial,
  existingUserAvatars,
  onSave,
}: Props) {
  const [givenName, setGivenName] = useState("");
  const [appellation, setAppellation] = useState("");
  const [personality, setPersonality] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [interestsStr, setInterestsStr] = useState("");
  const [traits, setTraits] = useState<Set<PersonalityTraitId>>(
    () => new Set()
  );
  const [ruleBlocks, setRuleBlocks] = useState<Set<string>>(() => new Set());
  const [supplementalRules, setSupplementalRules] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !initial) return;
    setSaveError(null);
    if (initial.kind === "seed") {
      setGivenName("");
      setAppellation("");
      setPersonality(initial.seed.trim() || "");
      setTagsStr("");
      setInterestsStr("");
      setTraits(new Set(initial.traitIds));
      setRuleBlocks(new Set(initial.ruleBlockIds));
      setSupplementalRules(initial.supplementalRules.trim());
    } else {
      const a = initial.avatar;
      setGivenName(a.givenName);
      setAppellation(a.appellation);
      setPersonality(a.personality.trim() || a.description.trim() || "");
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
    }
  }, [open, initial]);

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

    if (initial.kind === "edit") {
      const base = initial.avatar;
      const avatar: Avatar = {
        ...base,
        givenName: name,
        appellation: appellationOut,
        description: p.slice(0, 500) || `A custom avatar: ${name}.`,
        personality: p || "Thoughtful and in character.",
        tags,
        interests,
        ruleBlockIds: blockIdsOrdered,
        ruleSetId: undefined,
        traitIds: traitIdsOut,
        supplementalRules: supp,
      };
      onSave(avatar);
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
      description: p.slice(0, 500) || `A custom avatar: ${name}.`,
      personality: p || "Thoughtful and in character.",
      tags,
      interests,
      assignedTasks: [],
      opinions: {},
      ruleBlockIds: blockIdsOrdered,
      traitIds: traitIdsOut,
      supplementalRules: supp,
    };
    onSave(avatar);
    onClose();
  }, [
    initial,
    givenName,
    appellation,
    personality,
    tagsStr,
    interestsStr,
    traits,
    ruleBlocks,
    supplementalRules,
    existingUserAvatars,
    onSave,
    onClose,
  ]);

  const isEdit = initial?.kind === "edit";

  if (!open) return null;

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
          Personality / backstory
          <textarea
            className="avatar-builder-textarea"
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            rows={4}
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

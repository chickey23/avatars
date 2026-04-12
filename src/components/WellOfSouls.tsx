import { useState, useCallback } from "react";
import { generateWithOllama } from "../services/ollama";
import { buildWellOfSoulsPrompt } from "../services/wellOfSoulsPrompt";
import {
  PERSONALITY_TRAITS,
  type PersonalityTraitId,
} from "../theme/designTokens";
import { AI_RULE_BLOCKS } from "../data/aiRulesLibrary";
import {
  createInitialWellOfSoulsRuleBlocks,
  createInitialWellOfSoulsTraits,
} from "../services/wellOfSoulsRandomInit";

export type WellOfSoulsVariant = "panel" | "modal";

function orderedRuleBlockIds(selected: Set<string>): string[] {
  return AI_RULE_BLOCKS.filter((b) => selected.has(b.id)).map((b) => b.id);
}

type Props = {
  variant?: WellOfSoulsVariant;
  onClose?: () => void;
  /** Last generated text; shown in chip / merged when “Use in chat context” is on. */
  storedRules?: string;
  onStoredRulesChange?: (text: string) => void;
  useInChat?: boolean;
  onUseInChatChange?: (v: boolean) => void;
  /** Called after a successful Generate (opens avatar builder, etc.). */
  onAfterGenerate?: (payload: {
    seed: string;
    traitIds: PersonalityTraitId[];
    ruleBlockIds: string[];
    generatedText: string;
  }) => void;
};

export function WellOfSouls({
  variant = "panel",
  onClose,
  storedRules = "",
  onStoredRulesChange,
  useInChat = false,
  onUseInChatChange,
  onAfterGenerate,
}: Props) {
  const [seed, setSeed] = useState("");
  const [traits, setTraits] = useState<Set<PersonalityTraitId>>(
    () => createInitialWellOfSoulsTraits()
  );
  const [ruleBlocks, setRuleBlocks] = useState<Set<string>>(
    () => createInitialWellOfSoulsRuleBlocks()
  );
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const run = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setOut("");
    try {
      const ruleIds = orderedRuleBlockIds(ruleBlocks);
      const prompt = buildWellOfSoulsPrompt(seed, [...traits], ruleIds);
      const gen = await generateWithOllama({ prompt });
      if (!gen.ok) {
        setErr(gen.error);
        return;
      }
      setOut(gen.text);
      onStoredRulesChange?.(gen.text);
      onAfterGenerate?.({
        seed,
        traitIds: [...traits],
        ruleBlockIds: ruleIds,
        generatedText: gen.text,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [seed, traits, ruleBlocks, onStoredRulesChange, onAfterGenerate]);

  const body = (
    <>
      <div
        className={
          variant === "modal" ? "well-of-souls-header" : "well-of-souls-panel-header"
        }
      >
        {variant === "modal" ? (
          <>
            <h2 id="well-title">Well of Souls</h2>
            <button
              type="button"
              className="well-of-souls-close"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </>
        ) : (
          <h3 id="well-title" className="well-of-souls-panel-title">
            Well of Souls
          </h3>
        )}
      </div>
      <p className="well-of-souls-desc">
        Generates suggested personality rule lines for avatars. Review and copy into your
        library or avatar settings.
      </p>
      <label className="well-of-souls-label">
        Seed / theme
        <textarea
          className="well-of-souls-textarea"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          rows={3}
          placeholder="e.g. stoic mentor, cyber-noir analyst…"
        />
      </label>
      <div className="well-of-souls-traits">
        <span className="well-of-souls-label-text">AI rule blocks</span>
        <div className="well-of-souls-trait-grid">
          {AI_RULE_BLOCKS.map((b) => (
            <label key={b.id} className="well-of-souls-trait">
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
      <div className="well-of-souls-traits">
        <span className="well-of-souls-label-text">Traits</span>
        <div className="well-of-souls-trait-grid">
          {PERSONALITY_TRAITS.map((t) => (
            <label key={t.id} className="well-of-souls-trait">
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
      {onUseInChatChange && (
        <label className="well-of-souls-use-context">
          <input
            type="checkbox"
            checked={useInChat}
            onChange={(e) => onUseInChatChange(e.target.checked)}
            disabled={!storedRules.trim()}
          />
          <span>Use in chat context</span>
        </label>
      )}
      {err && <p className="well-of-souls-error">{err}</p>}
      <div className="well-of-souls-actions">
        <button type="button" className="well-of-souls-run" onClick={run} disabled={busy}>
          {busy ? "Generating…" : "Generate"}
        </button>
        {out && (
          <button
            type="button"
            className="well-of-souls-copy"
            onClick={() => navigator.clipboard.writeText(out).catch(console.error)}
          >
            Copy output
          </button>
        )}
      </div>
      {out && <pre className="well-of-souls-output">{out}</pre>}
    </>
  );

  if (variant === "modal") {
    return (
      <div className="well-of-souls-overlay" role="dialog" aria-labelledby="well-title">
        <div className="well-of-souls-modal">{body}</div>
      </div>
    );
  }

  return (
    <div className="well-of-souls-panel" role="region" aria-labelledby="well-title">
      {body}
    </div>
  );
}

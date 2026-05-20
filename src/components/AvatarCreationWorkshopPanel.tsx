import type { SituationContext } from "../types";
import type { PersonalityTraitId } from "../theme/designTokens";
import { WellOfSouls } from "./WellOfSouls";
import { InternetSearchPanel } from "./InternetSearchPanel";
import { AI_RULE_BLOCKS } from "../data/aiRulesLibrary";
import {
  createInitialWellOfSoulsRuleBlocks,
  createInitialWellOfSoulsTraits,
} from "../services/wellOfSoulsRandomInit";
import type { AvatarBuilderInitial } from "./AvatarBuilderModal";
import { runAvatarCreationWorkshopInternetApply } from "../services/avatarCreationFromWikiSources";

function orderedRuleBlockIdsFromSet(selected: Set<string>): string[] {
  return AI_RULE_BLOCKS.filter((b) => selected.has(b.id)).map((b) => b.id);
}

export type AvatarCreationWorkshopPanelProps = {
  situationContext: SituationContext;
  patchSituationContext: (patch: Partial<SituationContext>) => void;
  internetSearchMaxResults: number;
  onWellOfSoulsAfterGenerate: (payload: {
    seed: string;
    traitIds: PersonalityTraitId[];
    ruleBlockIds: string[];
    generatedText: string;
  }) => void;
  onOpenAvatarBuilderFromInternet: (payload: {
    initial: AvatarBuilderInitial;
  }) => void;
  /** From `avatars.workshop.open_draft`; cleared when leaving Creation tab. */
  creationWorkshopPrefill: { seedText?: string; wikiQuery?: string } | null;
};

export function AvatarCreationWorkshopPanel({
  situationContext,
  patchSituationContext,
  internetSearchMaxResults,
  onWellOfSoulsAfterGenerate,
  onOpenAvatarBuilderFromInternet,
  creationWorkshopPrefill,
}: AvatarCreationWorkshopPanelProps) {
  const wikiPrefill = creationWorkshopPrefill?.wikiQuery?.trim() || null;
  const seedHint = creationWorkshopPrefill?.seedText?.trim() || "";

  return (
    <div className="avatar-creation-workshop">
      <header className="tool-workshop-header">
        <h2 className="tool-workshop-title">Creation</h2>
        <p className="tool-workshop-sub">
          Well of Souls rule generator and wiki/web search for new avatars. While a
          Well of Souls draft exists here, it is included in chat relevance; pin
          internet hits for every turn under <strong>Context → Internet</strong> if
          you use <strong>Add selected to context</strong>.
        </p>
      </header>

      {seedHint ? (
        <p className="tool-workshop-flash" role="status">
          <strong>Seed from chat:</strong> {seedHint.length > 400 ? `${seedHint.slice(0, 399)}…` : seedHint}
        </p>
      ) : null}

      {situationContext.wellOfSoulsRules?.trim() && (
        <div className="well-of-souls-context-chip" aria-live="polite">
          <span className="well-of-souls-chip-label">Well of Souls draft</span>
          <button
            type="button"
            className="well-of-souls-chip-clear"
            onClick={() => patchSituationContext({ wellOfSoulsRules: "" })}
          >
            Clear
          </button>
        </div>
      )}

      <section className="tool-workshop-section">
        <h3 className="tool-workshop-hint">Well of Souls</h3>
        <div className="context-well">
          <WellOfSouls
            variant="panel"
            storedRules={situationContext.wellOfSoulsRules ?? ""}
            onStoredRulesChange={(text) =>
              patchSituationContext({ wellOfSoulsRules: text })
            }
            onAfterGenerate={onWellOfSoulsAfterGenerate}
          />
        </div>
      </section>

      <section className="tool-workshop-section">
        <h3 className="tool-workshop-hint">Internet (wikis first)</h3>
        <InternetSearchPanel
          internetSearchMaxResults={internetSearchMaxResults}
          userInternetContextLines={situationContext.userInternetContextLines}
          onPatchPinned={(merged) =>
            patchSituationContext({ userInternetContextLines: merged })
          }
          externalQueryPrefill={wikiPrefill}
          intro={
            <>
              Search wikis → Wikipedia → Tavily (if configured) → Google CSE. Use{" "}
              <strong>Context depth → Internet</strong> in the Context column to cap
              hits per run. <strong>Add selected to context</strong> pins lines for all
              turns. <strong>Use selected in new avatar</strong> fetches Wikipedia /
              configured wiki intros once per selected URL, runs a single local Ollama pass
              to pre-fill the builder when possible, then falls back to one targeted search
              per builder section for non-wiki URLs or when extraction is unavailable.
            </>
          }
          secondaryAction={{
            label: "Use selected in new avatar",
            onApply: async ({ pickedHits, internetQuery, discoveryNotices }) => {
              const traitSet = createInitialWellOfSoulsTraits();
              const ruleSet = createInitialWellOfSoulsRuleBlocks();
              const seed =
                creationWorkshopPrefill?.seedText?.trim() ||
                wikiPrefill ||
                "";
              const baseText =
                seed.trim() ||
                wikiPrefill?.trim() ||
                internetQuery.trim() ||
                "";
              const {
                seedFieldPrefill,
                internetReferencesBySection,
                fieldEvidence,
                wikiSearchNotices,
              } = await runAvatarCreationWorkshopInternetApply({
                pickedHits,
                baseText,
                internetSearchMaxResults,
                discoveryNotices,
              });
              onOpenAvatarBuilderFromInternet({
                initial: {
                  kind: "seed",
                  seed,
                  traitIds: [...traitSet],
                  ruleBlockIds: orderedRuleBlockIdsFromSet(ruleSet),
                  supplementalRules: "",
                  internetReferencesBySection,
                  wikiSearchNotices,
                  seedFieldPrefill,
                  fieldEvidence,
                },
              });
            },
          }}
        />
      </section>
    </div>
  );
}

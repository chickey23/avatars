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
import {
  hostnamesFromSearchHits,
  runSectionSearchesForAvatarBuilder,
} from "../services/avatarCreationWorkshopSectionSearch";

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
          Well of Souls rule generator and wiki/web search for new avatars. Draft
          lines can merge into chat context from here; pin internet hits for every
          turn under <strong>Context → Internet</strong> if you use{" "}
          <strong>Add selected to context</strong>.
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
          {situationContext.useWellOfSoulsInChat && (
            <span className="well-of-souls-chip-on">In chat context</span>
          )}
          <button
            type="button"
            className="well-of-souls-chip-clear"
            onClick={() =>
              patchSituationContext({
                wellOfSoulsRules: "",
                useWellOfSoulsInChat: false,
              })
            }
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
            useInChat={situationContext.useWellOfSoulsInChat ?? false}
            onUseInChatChange={(v) =>
              patchSituationContext({ useWellOfSoulsInChat: v })
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
              hits per run.               <strong>Add selected to context</strong> pins lines for
              all turns; <strong>Use selected in new avatar</strong> runs one targeted
              search per builder section (scoped to the hosts you checked) and opens the
              avatar builder with grouped references for this creation only.
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
              const hostnames = hostnamesFromSearchHits(pickedHits);
              const { bySection, mergedNotices } =
                await runSectionSearchesForAvatarBuilder({
                  baseText,
                  hostnames,
                  internetSearchMaxResults,
                });
              const wikiSearchNotices = [
                ...discoveryNotices.map((n) => `[discovery] ${n}`),
                ...mergedNotices,
              ];
              onOpenAvatarBuilderFromInternet({
                initial: {
                  kind: "seed",
                  seed,
                  traitIds: [...traitSet],
                  ruleBlockIds: orderedRuleBlockIdsFromSet(ruleSet),
                  supplementalRules: "",
                  internetReferencesBySection: bySection,
                  wikiSearchNotices:
                    wikiSearchNotices.length > 0 ? wikiSearchNotices : undefined,
                },
              });
            },
          }}
        />
      </section>
    </div>
  );
}

import { useCallback, useState } from "react";
import type { OllamaPresence } from "../services/ollama";
import type { ConversationMessage } from "../types";
import type { Avatar } from "../types";
import type { ProjectMetadataRecord } from "../services/worldMetadata/types";
import { ToolWorkshopPanel } from "./ToolWorkshopPanel";
import { UnmetNeedsPanel } from "./UnmetNeedsPanel";
import { SourceWorkshopPanel } from "./SourceWorkshopPanel";
import { ProjectWorkshopPanel } from "./ProjectWorkshopPanel";
import { AvatarCreationWorkshopPanel } from "./AvatarCreationWorkshopPanel";
import { StewardshipWorkshopPanel } from "./StewardshipWorkshopPanel";
import type { SituationContext } from "../types";
import type { PersonalityTraitId } from "../theme/designTokens";
import type { AvatarBuilderInitial } from "./AvatarBuilderModal";

export type WorkshopTabId =
  | "tool"
  | "unmet"
  | "source"
  | "projects"
  | "creation"
  | "stewardship";

export type WorkshopsPanelProps = {
  workshopTab: WorkshopTabId;
  ollamaPresence: "checking" | OllamaPresence;
  onRefreshOllama: () => void;
  messages: ConversationMessage[];
  fullAvatarCatalog: Avatar[];
  projectsList: [string, ProjectMetadataRecord][];
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
  creationWorkshopPrefill: { seedText?: string; wikiQuery?: string } | null;
};

export function WorkshopsPanel({
  workshopTab,
  ollamaPresence,
  onRefreshOllama,
  messages,
  fullAvatarCatalog,
  projectsList,
  situationContext,
  patchSituationContext,
  internetSearchMaxResults,
  onWellOfSoulsAfterGenerate,
  onOpenAvatarBuilderFromInternet,
  creationWorkshopPrefill,
}: WorkshopsPanelProps) {
  const [hubTick, setHubTick] = useState(0);
  const bumpHub = useCallback(() => setHubTick((n) => n + 1), []);

  const resolveUserMessagePreview = useCallback(
    (userMessageId: string) => {
      const row = messages.find((m) => m.id === userMessageId && m.role === "user");
      return row?.content;
    },
    [messages]
  );

  return (
    <div className="workshops-panel">
      {workshopTab === "tool" && (
        <ToolWorkshopPanel
          ollamaPresence={ollamaPresence}
          onRefreshOllama={onRefreshOllama}
          resolveUserMessagePreview={resolveUserMessagePreview}
          onDataChanged={bumpHub}
          projectsList={projectsList}
        />
      )}
      {workshopTab === "unmet" && (
        <UnmetNeedsPanel
          tick={hubTick}
          onHubDataChanged={bumpHub}
          projectsList={projectsList}
        />
      )}
      {workshopTab === "source" && (
        <SourceWorkshopPanel tick={hubTick} onChanged={bumpHub} />
      )}
      {workshopTab === "projects" && <ProjectWorkshopPanel />}
      {workshopTab === "creation" && (
        <AvatarCreationWorkshopPanel
          situationContext={situationContext}
          patchSituationContext={patchSituationContext}
          internetSearchMaxResults={internetSearchMaxResults}
          onWellOfSoulsAfterGenerate={onWellOfSoulsAfterGenerate}
          onOpenAvatarBuilderFromInternet={onOpenAvatarBuilderFromInternet}
          creationWorkshopPrefill={creationWorkshopPrefill}
        />
      )}
      {workshopTab === "stewardship" && (
        <StewardshipWorkshopPanel
          fullAvatarCatalog={fullAvatarCatalog}
          situationContext={situationContext}
          patchSituationContext={patchSituationContext}
        />
      )}
    </div>
  );
}

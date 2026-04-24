import { useCallback, useState } from "react";
import type { OllamaPresence } from "../services/ollama";
import type { ConversationMessage } from "../types";
import type { ProjectMetadataRecord } from "../services/worldMetadata/types";
import { ToolWorkshopPanel } from "./ToolWorkshopPanel";
import { UnmetNeedsPanel } from "./UnmetNeedsPanel";
import { SourceWorkshopPanel } from "./SourceWorkshopPanel";
import { ProjectWorkshopPanel } from "./ProjectWorkshopPanel";

export type WorkshopTabId = "tool" | "unmet" | "source" | "projects";

export type WorkshopsPanelProps = {
  workshopTab: WorkshopTabId;
  setWorkshopTab: (t: WorkshopTabId) => void;
  ollamaPresence: "checking" | OllamaPresence;
  onRefreshOllama: () => void;
  messages: ConversationMessage[];
  projectsList: [string, ProjectMetadataRecord][];
};

export function WorkshopsPanel({
  workshopTab,
  setWorkshopTab,
  ollamaPresence,
  onRefreshOllama,
  messages,
  projectsList,
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
      <nav className="workshops-hub-tabs" aria-label="Workshops sections">
        {(
          [
            ["tool", "Tool"],
            ["unmet", "Unmet Needs"],
            ["source", "Source"],
            ["projects", "Projects"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`workshops-hub-tab${workshopTab === id ? " is-active" : ""}`}
            onClick={() => setWorkshopTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

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
    </div>
  );
}

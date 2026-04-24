import { useMemo, useState } from "react";
import type { UnmetNeedItem, UnmetNeedRemediation } from "../services/unmetNeeds";
import { listUnmetNeeds, updateUnmetNeed } from "../services/unmetNeeds";
import { buildCursorHandoffMarkdown } from "../services/sourceWorkshop";

export type SourceWorkshopPanelProps = {
  tick: number;
  onChanged?: () => void;
};

export function SourceWorkshopPanel({ tick, onChanged }: SourceWorkshopPanelProps) {
  const all = useMemo(() => listUnmetNeeds(), [tick]);
  const [filter, setFilter] = useState<"new_source" | "all">("new_source");
  const [flash, setFlash] = useState<string | null>(null);

  const items = useMemo(() => {
    if (filter === "all") return all;
    return all.filter((x) => x.remediation === "new_source");
  }, [all, filter]);

  const copyHandoff = async (item: UnmetNeedItem) => {
    const md = buildCursorHandoffMarkdown(item);
    try {
      await navigator.clipboard.writeText(md);
      setFlash("Copied handoff to clipboard.");
    } catch {
      setFlash("Could not copy — select and copy manually from a future export.");
    }
    window.setTimeout(() => setFlash(null), 4000);
  };

  const setRemediation = (id: string, r: UnmetNeedRemediation) => {
    updateUnmetNeed(id, { remediation: r });
    onChanged?.();
    setFlash("Updated remediation track.");
    window.setTimeout(() => setFlash(null), 2500);
  };

  return (
    <div className="source-workshop-panel">
      <header className="tool-workshop-header">
        <h2 className="tool-workshop-title">Source Workshop</h2>
        <p className="tool-workshop-sub">
          Planning and <strong>Cursor handoff</strong> for new data sources. Work
          is done outside the app; use the generated markdown in your editor.
        </p>
      </header>
      <div className="tool-workshop-form-grid">
        <label>
          List
          <select
            value={filter}
            onChange={(e) =>
              setFilter(e.target.value as "new_source" | "all")
            }
          >
            <option value="new_source">Unmet needs: new_source only</option>
            <option value="all">All unmet needs</option>
          </select>
        </label>
      </div>
      {flash && (
        <p className="tool-workshop-flash" role="status">
          {flash}
        </p>
      )}
      {items.length === 0 ? (
        <p className="tool-workshop-empty">
          No items in this list. Add from Tool → Event log, or change remediation
          on an Unmet Need to <code>new_source</code>.
        </p>
      ) : (
        <ul className="source-workshop-list">
          {items.map((it) => (
            <li key={it.id} className="source-workshop-card">
              <div className="source-workshop-card-title">{it.title}</div>
              <div className="tool-workshop-actions">
                <button
                  type="button"
                  className="tool-workshop-primary"
                  onClick={() => copyHandoff(it)}
                >
                  Copy Cursor handoff
                </button>
                {it.remediation !== "new_source" && (
                  <button
                    type="button"
                    onClick={() => setRemediation(it.id, "new_source")}
                  >
                    Mark as new_source
                  </button>
                )}
              </div>
              <p className="unmet-needs-meta">
                Status: {it.status} · Track: {it.remediation}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

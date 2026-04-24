import type { ToolTelemetryEvent } from "../toolTelemetry/types";
import { getWorldMetadata } from "../worldMetadata/store";

export type PatchProjectPreviewHints = {
  ids: string[];
  firstQuotedTitle?: string;
};

/**
 * Parse world_metadata.patch_projects activity/telemetry preview (new "Title" (id) or legacy id list).
 */
export function extractPatchProjectHintsFromPreview(
  preview: string | undefined
): PatchProjectPreviewHints {
  const text = preview?.trim() ?? "";
  if (!text) {
    return { ids: [] };
  }
  const ids: string[] = [];
  let firstQuotedTitle: string | undefined;
  const pairRe = /"([^"]*)"\s*\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(text)) !== null) {
    const titlePart = m[1]?.trim();
    const idPart = m[2]?.trim();
    if (idPart) {
      ids.push(idPart);
      if (!firstQuotedTitle && titlePart) firstQuotedTitle = titlePart;
    }
  }
  if (ids.length > 0) {
    return { ids: [...new Set(ids)], firstQuotedTitle };
  }
  const legacy = text.match(/project\(s\):\s*(.+)$/i);
  const rest = legacy?.[1]?.trim();
  if (rest) {
    for (const seg of rest.split(",").map((s) => s.trim())) {
      if (/^[\w.-]+$/.test(seg)) ids.push(seg);
    }
  }
  return { ids: [...new Set(ids)], firstQuotedTitle };
}

export function suggestUnmetNeedTitleFromTelemetryEvent(
  e: ToolTelemetryEvent
): string {
  if (e.toolId !== "world_metadata.patch_projects") {
    return `Gap: ${e.toolId}${e.ok ? "" : ` (${e.errorCode ?? "fail"})`}`;
  }
  const preview = (e.resultPreview ?? e.argsPreview ?? "").trim();
  const { ids, firstQuotedTitle } = extractPatchProjectHintsFromPreview(preview);
  if (firstQuotedTitle) {
    return `Unmet: ${firstQuotedTitle}`;
  }
  const projects = getWorldMetadata().projects;
  for (const id of ids) {
    const t = projects[id]?.title?.trim();
    if (t) return `Unmet: ${t}`;
  }
  if (ids.length === 1) {
    return `Unmet: ${ids[0]}`;
  }
  if (preview.length > 0) {
    const oneLine = preview.replace(/\s+/g, " ").trim();
    return oneLine.length <= 160 ? oneLine : `${oneLine.slice(0, 157)}…`;
  }
  return `Gap: ${e.toolId}`;
}

export function suggestRelatedProjectIdFromTelemetryEvent(
  e: ToolTelemetryEvent
): string | undefined {
  if (e.toolId !== "world_metadata.patch_projects") return undefined;
  const preview = e.resultPreview ?? e.argsPreview;
  const { ids } = extractPatchProjectHintsFromPreview(preview);
  if (ids.length === 1) return ids[0];
  return undefined;
}

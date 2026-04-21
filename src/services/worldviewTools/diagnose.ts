import {
  WORLDVIEW_TOOLS_SCHEMA,
  tryParseWorldviewEnvelopeJson,
  type WorldviewToolsEnvelope,
} from "./parse";

export type WorldviewParseDiagnosis = {
  hints: string[];
  /** Short summary when hints are non-empty */
  reason: string | null;
};

const MAX_LOG_HINT_CHARS = 400;

/** Collapse diagnosis for session log detail */
export function formatWorldviewParseDiagnosisForLog(d: WorldviewParseDiagnosis): string {
  if (!d.hints.length) return "";
  const s = d.hints.join(" | ");
  return s.length > MAX_LOG_HINT_CHARS
    ? `${s.slice(0, MAX_LOG_HINT_CHARS - 1)}…`
    : s;
}

/**
 * When `envelope` is null, look for patterns that suggest the model tried tools
 * but did not emit a valid `avatars_tools_v1` block.
 */
export function diagnoseWorldviewToolReply(
  raw: string,
  envelope: WorldviewToolsEnvelope | null
): WorldviewParseDiagnosis {
  if (envelope?.tools?.length) {
    return { hints: [], reason: null };
  }

  const hints: string[] = [];
  const t = raw;
  if (!t.trim()) {
    return { hints: [], reason: null };
  }

  if (/\buser\s+profile\s*\.\s*patch\b/i.test(t)) {
    hints.push(
      "Informal 'user profile.patch' — use exact name user_profile.patch inside one avatars_tools_v1 JSON block"
    );
  }

  if (/\bworld_metadata\.patch_projects\s*\{/i.test(t)) {
    hints.push(
      "Inline world_metadata.patch_projects { … } — wrap tools in {\"schema\":\"avatars_tools_v1\",\"tools\":[…]}"
    );
  }

  if (/\bworld_metadata\.patch_people\s*\{/i.test(t)) {
    hints.push(
      "Inline world_metadata.patch_people { … } — use avatars_tools_v1 envelope with tools array"
    );
  }

  if (/\bgmail\.fetch_message_body\b/i.test(t) && envelope === null) {
    hints.push(
      "Mentioned gmail.fetch_message_body outside valid tool JSON — use tools[].name in avatars_tools_v1"
    );
  }

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fm: RegExpExecArray | null;
  let fenceCount = 0;
  const fenceInners: string[] = [];
  while ((fm = fenceRe.exec(t)) !== null) {
    fenceCount++;
    fenceInners.push(fm[1]?.trim() ?? "");
  }
  /** Same loose parse as splitWorldviewToolsFromReply (handles smart quotes / slice / last fence). */
  let sawParsableToolsFence = false;
  for (const inner of fenceInners) {
    if (inner && tryParseWorldviewEnvelopeJson(inner)) {
      sawParsableToolsFence = true;
      break;
    }
  }
  if (!sawParsableToolsFence && fenceCount > 0) {
    const inner =
      [...fenceInners].reverse().find((s) => s.length > 0) ?? "";
    if (inner) {
      try {
        const parsed = JSON.parse(inner) as Record<string, unknown>;
        if (parsed.schema !== WORLDVIEW_TOOLS_SCHEMA) {
          hints.push(
            "`json` fence parses but schema is not avatars_tools_v1"
          );
        } else if (!Array.isArray(parsed.tools)) {
          hints.push("`json` fence has schema but missing tools array");
        }
      } catch {
        hints.push(
          "`json` fence contains invalid JSON (or could not parse as avatars_tools_v1)"
        );
      }
    }
  }

  if (fenceCount === 0 && /```(?:json)?/i.test(t)) {
    hints.push("Unclosed or partial ```json fence");
  }

  if (/\buser_profile\.patch\s*:/i.test(t) && envelope === null) {
    hints.push(
      "user_profile.patch: line in prose — put tools only in one trailing ```json avatars_tools_v1 block"
    );
  }

  const dedup = [...new Set(hints)];
  const reason =
    dedup.length > 0
      ? "Model output looks like tools but did not parse as avatars_tools_v1"
      : null;
  return { hints: dedup.slice(0, 8), reason };
}

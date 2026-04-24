import type { UnmetNeedItem } from "../unmetNeeds/types";

/**
 * Markdown block for pasting into Cursor / external editor.
 * Implementation work stays outside the Avatars app.
 */
export function buildCursorHandoffMarkdown(item: UnmetNeedItem): string {
  const lines: string[] = [
    `# Source / capability handoff — ${item.title}`,
    ``,
    `> **Remediation is expected outside this app** (e.g. in Cursor): add a connector/source, tool, or prompt change; then verify in the app.`,
    ``,
    `## Unmet need`,
    `- **Id:** \`${item.id}\``,
    `- **Status:** ${item.status}`,
    `- **Remediation track:** ${item.remediation}`,
    `- **Created:** ${new Date(item.createdAt).toISOString()}`,
    ``,
  ];

  if (item.userPromptExcerpt) {
    lines.push(`## User request (excerpt)`, `\`\`\``, item.userPromptExcerpt, `\`\`\``, ``);
  }
  if (item.userMessageId) {
    lines.push(`## Anchor`, `- **userMessageId:** \`${item.userMessageId}\` (conversation thread / turn archive)`, ``);
  }
  if (item.relatedProjectId) {
    lines.push(`## Related project (world metadata id)`, `- \`${item.relatedProjectId}\``, ``);
  }
  if (item.linkedTelemetryEventIds.length) {
    lines.push(
      `## Tool telemetry event ids`,
      item.linkedTelemetryEventIds.map((id) => `- \`${id}\``).join("\n"),
      ``
    );
  }
  if (item.notes) {
    lines.push(`## Notes`, item.notes, ``);
  }

  lines.push(
    `## Suggested repo touchpoints`,
    `- Connectors: \`src/connectors/\``,
    `- Context / gather: \`src/store/appStore.ts\`, \`src/services/platform/\``,
    `- Tool registry / execution: \`src/services/agenticTools/\`, \`src/services/worldviewTools/\``,
    `- Spec: \`SPEC.md\`, \`docs/AGENTIC_TOOLS.md\`, \`docs/CONTEXT_SCORING.md\``,
    ``,
    `## Acceptance checklist`,
    `- [ ] New or extended source returns data into \`relevantData\` / scoring path (or documented alternative).`,
    `- [ ] User-facing behavior verified for the original request pattern.`,
    `- [ ] Update or close this Unmet Need in **Workshops → Unmet Needs**.`,
    ``
  );

  return lines.join("\n");
}

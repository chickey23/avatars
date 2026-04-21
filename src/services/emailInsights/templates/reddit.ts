import type { TemplateExtract } from "./types";

export function extractRedditHints(from: string, subject: string): TemplateExtract | undefined {
  const f = from.toLowerCase();
  if (!f.includes("reddit") && !f.includes("@redditmail.com")) {
    return undefined;
  }
  return {
    summaryLines: [
      `Reddit notification: ${subject.trim().slice(0, 120)}${subject.length > 120 ? "…" : ""}`,
    ],
    invoice: undefined,
  };
}

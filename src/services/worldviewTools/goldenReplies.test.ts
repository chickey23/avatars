import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { splitWorldviewToolsFromReply } from "./parse";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "modelReplies"
);

type GoldenExpected = {
  kind: "positive" | "negative";
  expectEnvelopeToolNames: string[];
  intentTargetTool: string | null;
};

function toolMatchesIntent(
  intentTool: string | null,
  parsedFirst: string | undefined
): boolean {
  if (!intentTool || !parsedFirst) return false;
  return parsedFirst === intentTool;
}

describe("golden model replies (avatars_tools_v1)", () => {
  const bases = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => f.replace(/\.txt$/, ""));

  it("parses positive fixtures and rejects negative ones", () => {
    let positiveParse = 0;
    let positiveOk = 0;
    let intentTotal = 0;
    let intentOk = 0;

    for (const base of bases) {
      const raw = readFileSync(join(FIXTURE_DIR, `${base}.txt`), "utf-8");
      const exp = JSON.parse(
        readFileSync(join(FIXTURE_DIR, `${base}.expected.json`), "utf-8")
      ) as GoldenExpected;
      const { envelope } = splitWorldviewToolsFromReply(raw);
      const names = envelope?.tools.map((t) => t.name) ?? [];

      if (exp.kind === "negative") {
        expect(names.length, base).toBe(0);
        continue;
      }

      positiveParse++;
      const match =
        names.length === exp.expectEnvelopeToolNames.length &&
        exp.expectEnvelopeToolNames.every((n, i) => names[i] === n);
      if (match) positiveOk++;

      if (exp.intentTargetTool) {
        intentTotal++;
        if (toolMatchesIntent(exp.intentTargetTool, names[0])) intentOk++;
      }
    }

    const parseRate = positiveOk / positiveParse;
    const intentRate = intentTotal > 0 ? intentOk / intentTotal : 1;

    // eslint-disable-next-line no-console
    console.table([
      { metric: "parseSuccessRate (positive)", value: parseRate.toFixed(3) },
      { metric: "correctToolForIntentRate", value: intentRate.toFixed(3) },
    ]);

    expect(parseRate).toBeGreaterThanOrEqual(0.99);
    expect(intentRate).toBeGreaterThanOrEqual(0.99);
  });
});

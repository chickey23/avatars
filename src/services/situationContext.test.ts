import { describe, expect, it } from "vitest";
import { mergeSituationFocus } from "./situationContext";

describe("mergeSituationFocus", () => {
  it("uses persisted focus when job omits it", () => {
    const persisted = {
      project: { id: "p", title: "P" },
    };
    expect(mergeSituationFocus(undefined, persisted)).toEqual(persisted);
  });

  it("job focus overrides persisted", () => {
    const persisted = {
      project: { id: "p", title: "P" },
      email: { id: "e", title: "E" },
    };
    const job = { email: { id: "e2", title: "New" } };
    const m = mergeSituationFocus(job, persisted);
    expect(m.email?.id).toBe("e2");
    expect(m.project?.id).toBe("p");
  });
});

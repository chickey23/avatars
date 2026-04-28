import { describe, expect, it } from "vitest";
import { focusToRelevanceStrings, mergeSituationFocus } from "./situationContext";

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

  it("preserves and overrides task focus", () => {
    const persisted = {
      task: { id: "t1", title: "Old task" },
      project: { id: "p", title: "P" },
    };
    expect(mergeSituationFocus(undefined, persisted).task?.id).toBe("t1");

    const m = mergeSituationFocus(
      { task: { id: "t2", title: "New task" } },
      persisted
    );
    expect(m.task?.id).toBe("t2");
    expect(m.project?.id).toBe("p");
  });

  it("encodes task focus into relevant data lines", () => {
    expect(
      focusToRelevanceStrings({
        task: { id: "task_1", title: "Create avatar: Alice" },
      })
    ).toEqual(["focus: task [task_1] Create avatar: Alice"]);
  });
});

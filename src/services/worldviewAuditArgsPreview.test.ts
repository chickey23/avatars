import { describe, it, expect } from "vitest";
import { formatWorldviewToolArgsForAudit } from "./worldviewAuditArgsPreview";

describe("formatWorldviewToolArgsForAudit", () => {
  it("includes nested project title in JSON", () => {
    const s = formatWorldviewToolArgsForAudit({
      name: "world_metadata.patch_projects",
      args: {
        patch: {
          proj1: { title: "Spend time with friends", summary: "Weekend" },
        },
      },
    });
    expect(s).toContain('"title"');
    expect(s).toContain("Spend time with friends");
  });

  it("truncates very long strings", () => {
    const long = "x".repeat(500);
    const s = formatWorldviewToolArgsForAudit({
      name: "user_profile.patch",
      args: { patch: { notes: long } },
    });
    expect(s.length).toBeLessThan(500);
    expect(s).toContain("…");
  });
});

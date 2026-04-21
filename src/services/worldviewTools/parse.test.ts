import { describe, expect, it } from "vitest";
import {
  sanitizeAvatarVisibleReply,
  splitWorldviewToolsFromReply,
  WORLDVIEW_TOOLS_SCHEMA,
} from "./parse";

describe("sanitizeAvatarVisibleReply", () => {
  it("removes trailing ```json fence fragment", () => {
    expect(sanitizeAvatarVisibleReply("Hello.\n\n```json")).toBe("Hello.");
  });

  it("removes trailing line that is only json", () => {
    expect(sanitizeAvatarVisibleReply("Done.\n\njson")).toBe("Done.");
  });

  it("unwraps a single JSON string wrapper", () => {
    expect(sanitizeAvatarVisibleReply(`"Hi there."`)).toBe("Hi there.");
  });

  it("unwraps escaped sequences inside JSON string", () => {
    const inner = "Line one\nLine two";
    expect(sanitizeAvatarVisibleReply(JSON.stringify(inner))).toBe(inner);
  });
});

describe("splitWorldviewToolsFromReply", () => {
  it("parses envelope and strips fence", () => {
    const raw = `Hello.

\`\`\`json
{"schema":"${WORLDVIEW_TOOLS_SCHEMA}","tools":[{"name":"user_profile.patch","args":{"patch":{"displayName":"A"}}}]}
\`\`\``;
    const { visible, envelope } = splitWorldviewToolsFromReply(raw);
    expect(visible).toContain("Hello");
    expect(envelope?.tools).toHaveLength(1);
    expect(envelope?.tools[0]?.name).toBe("user_profile.patch");
  });

  it("returns full text when no tools", () => {
    const { visible, envelope } = splitWorldviewToolsFromReply("Just chat.");
    expect(visible).toContain("Just chat");
    expect(envelope).toBeNull();
  });

  it("strips bare JSON at end (no markdown fence)", () => {
    const json = `{"schema":"${WORLDVIEW_TOOLS_SCHEMA}","tools":[{"name":"world_metadata.patch_projects","args":{"patch":{"p1":{"title":"T"}}}}]}`;
    const raw = `Here is my reply.\n\n${json}`;
    const { visible, envelope } = splitWorldviewToolsFromReply(raw);
    expect(visible).toBe("Here is my reply.");
    expect(envelope?.tools).toHaveLength(1);
    expect(envelope?.tools[0]?.name).toBe("world_metadata.patch_projects");
  });

  it("normalizes patch_projects when model omits args.patch wrapper", () => {
    const json = `{"schema":"${WORLDVIEW_TOOLS_SCHEMA}","tools":[{"name":"world_metadata.patch_projects","args":{"proj_new_1":{"title":"Friends","notes":"","summary":""}}}]}`;
    const { envelope } = splitWorldviewToolsFromReply(`x\n\n${json}`);
    const args = envelope?.tools[0]?.args as Record<string, unknown>;
    expect(args?.patch).toBeDefined();
    const patch = args.patch as Record<string, unknown>;
    expect(patch.proj_new_1).toBeDefined();
  });

  it("parses single-line ```json { ... } ``` fence (model often omits newline after json)", () => {
    const inner = `{"schema":"${WORLDVIEW_TOOLS_SCHEMA}","tools":[{"name":"user_profile.patch","args":{"patch":{"notes":"n"}}}]}`;
    const raw = `Before \`\`\`json ${inner} \`\`\` after`;
    const { envelope, visible } = splitWorldviewToolsFromReply(raw);
    expect(envelope?.tools?.[0]?.name).toBe("user_profile.patch");
    expect(visible).toContain("Before");
    expect(visible).toContain("after");
  });

  it("strips reply that is only bare JSON", () => {
    const raw = `{"schema":"${WORLDVIEW_TOOLS_SCHEMA}","tools":[{"name":"user_profile.patch","args":{"patch":{"notes":"n"}}}]}`;
    const { visible, envelope } = splitWorldviewToolsFromReply(raw);
    expect(visible).toBe("");
    expect(envelope?.tools?.[0]?.name).toBe("user_profile.patch");
  });
});

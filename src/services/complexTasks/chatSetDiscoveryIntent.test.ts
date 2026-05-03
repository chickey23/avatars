import { describe, expect, it } from "vitest";
import { parseAvatarCreationPlan } from "./avatarCreationPlanner";
import { parseImplicitSetDiscoveryPlan } from "./chatSetDiscoveryIntent";

describe("parseImplicitSetDiscoveryPlan", () => {
  it("returns null for email-like or tooling lines", () => {
    expect(parseImplicitSetDiscoveryPlan("summarize this email from @bob")).toBeNull();
    expect(parseImplicitSetDiscoveryPlan("check my calendar for Tuesday")).toBeNull();
    expect(parseImplicitSetDiscoveryPlan("see https://example.com/cast")).toBeNull();
  });

  it("returns null for political / corporate phrasing", () => {
    expect(parseImplicitSetDiscoveryPlan("who is in the senate")).toBeNull();
    expect(parseImplicitSetDiscoveryPlan("list members of congress")).toBeNull();
  });

  it("parses cast … of …", () => {
    const p = parseImplicitSetDiscoveryPlan("What's the main cast of Firefly?");
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("set_discovery");
    expect(p!.chatImplicitSetDiscovery).toBe(true);
    expect(p!.discoveryQuery).toBeTruthy();
    expect(p!.planId.length).toBeGreaterThan(0);
    expect(p!.subjects).toEqual([]);
  });

  it("parses who … in …", () => {
    const p = parseImplicitSetDiscoveryPlan("Who was in The Princess Bride?");
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("set_discovery");
    expect(p!.chatImplicitSetDiscovery).toBe(true);
  });

  it("parses list characters from …", () => {
    const p = parseImplicitSetDiscoveryPlan("Please list the characters from Lower Decks");
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("set_discovery");
  });

  it("returns null without roster-style cues (monitor uses explicit parser first)", () => {
    expect(parseImplicitSetDiscoveryPlan("I like pizza")).toBeNull();
    expect(parseImplicitSetDiscoveryPlan("Create avatars for the Simpsons family")).toBeNull();
    const explicit = "Create avatars for the Simpsons family";
    expect(parseAvatarCreationPlan(explicit)).not.toBeNull();
  });

  it("parses states of …", () => {
    const p = parseImplicitSetDiscoveryPlan("What are the states of Australia?");
    expect(p).not.toBeNull();
    expect(p!.discoveryQuery?.toLowerCase()).toContain("australia");
  });

  it("parses parts of …", () => {
    const p = parseImplicitSetDiscoveryPlan("List the parts of a bicycle for a trivia game");
    expect(p).not.toBeNull();
    expect(p!.discoveryQuery?.toLowerCase()).toContain("bicycle");
  });

  it("parses list of … for fictional sets", () => {
    const p = parseImplicitSetDiscoveryPlan("Please give me a list of the planets");
    expect(p).not.toBeNull();
  });

  it("returns null for list of … tooling lines", () => {
    expect(parseImplicitSetDiscoveryPlan("list of pull requests in this repo")).toBeNull();
    expect(parseImplicitSetDiscoveryPlan("give me a list of tasks for today")).toBeNull();
  });
});

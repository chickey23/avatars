import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchGmailMessageBody } from "../connectors/gmail";
import {
  partitionWorldviewTools,
  executeGmailFetchMessageBodyTools,
  GMAIL_FETCH_MESSAGE_BODY_TOOL,
} from "./gmailFetchTools";

vi.mock("../connectors/gmail", () => ({
  fetchGmailMessageBody: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchGmailMessageBody);

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("partitionWorldviewTools", () => {
  it("splits gmail fetch from worldview patches", () => {
    const tools = [
      { name: GMAIL_FETCH_MESSAGE_BODY_TOOL, args: { messageId: "a" } },
      { name: "user_profile.patch", args: { patch: {} } },
    ];
    const { fetchTools, patchTools } = partitionWorldviewTools(tools);
    expect(fetchTools).toHaveLength(1);
    expect(patchTools).toHaveLength(1);
  });
});

describe("executeGmailFetchMessageBodyTools", () => {
  it("does not fetch when messageId is not allowlisted", async () => {
    mockedFetch.mockResolvedValue({ body: "hello" });
    const out = await executeGmailFetchMessageBodyTools(
      [{ name: GMAIL_FETCH_MESSAGE_BODY_TOOL, args: { messageId: "x" } }],
      ["y"]
    );
    expect(out.anySuccess).toBe(false);
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(out.results[0]?.ok).toBe(false);
  });

  it("fetches body when allowlisted", async () => {
    mockedFetch.mockResolvedValue({ body: "full text" });
    const out = await executeGmailFetchMessageBodyTools(
      [{ name: GMAIL_FETCH_MESSAGE_BODY_TOOL, args: { messageId: "msg1" } }],
      ["msg1"]
    );
    expect(out.anySuccess).toBe(true);
    expect(out.bodyBlocks[0]).toContain("Email body [msg1]:");
    expect(out.bodyBlocks[0]).toContain("full text");
    expect(mockedFetch).toHaveBeenCalledWith("msg1");
  });
});

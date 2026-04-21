import { describe, expect, it } from "vitest";
import { AVATARS_NO_COMMENT, isAvatarsNoCommentOnly } from "./avatarAgents";

describe("isAvatarsNoCommentOnly", () => {
  it("suppresses exact token and empty", () => {
    expect(isAvatarsNoCommentOnly("")).toBe(true);
    expect(isAvatarsNoCommentOnly(`  ${AVATARS_NO_COMMENT}  `)).toBe(true);
    expect(isAvatarsNoCommentOnly(`${AVATARS_NO_COMMENT.toLowerCase()}`)).toBe(true);
  });

  it("suppresses common model typo AVATAR_NO_COMMENT (missing S)", () => {
    expect(isAvatarsNoCommentOnly("AVATAR_NO_COMMENT")).toBe(true);
    expect(isAvatarsNoCommentOnly("avatar_no_comment")).toBe(true);
  });

  it("suppresses when wrapped or with trailing punctuation", () => {
    expect(isAvatarsNoCommentOnly("`AVATARS_NO_COMMENT`")).toBe(true);
    expect(isAvatarsNoCommentOnly("**AVATARS_NO_COMMENT**")).toBe(true);
    expect(isAvatarsNoCommentOnly("AVATARS_NO_COMMENT.")).toBe(true);
    expect(isAvatarsNoCommentOnly("AVATAR_NO_COMMENT!")).toBe(true);
  });

  it("does not suppress when there is other prose", () => {
    expect(isAvatarsNoCommentOnly("Hello")).toBe(false);
    expect(isAvatarsNoCommentOnly(`Sure.\n${AVATARS_NO_COMMENT}`)).toBe(false);
  });
});

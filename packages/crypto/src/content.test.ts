import { describe, expect, it } from "vitest";
import { parseMessageContent, serializeMessageContent } from "./content.js";

describe("parseMessageContent", () => {
  it("parses all structured message types", () => {
    const media = {
      type: "media" as const,
      media: {
        mediaId: "m1",
        mime: "image/png",
        key: "k",
        nonce: "n",
        sizeBytes: 100,
      },
    };
    expect(parseMessageContent(serializeMessageContent(media))).toEqual(media);

    const groupKey = {
      type: "group_key" as const,
      groupKey: { groupId: "g1", key: "abc" },
    };
    expect(parseMessageContent(serializeMessageContent(groupKey))).toEqual(groupKey);
  });

  it("falls back to plain text", () => {
    expect(parseMessageContent("hello")).toEqual({ type: "text", text: "hello" });
  });
});

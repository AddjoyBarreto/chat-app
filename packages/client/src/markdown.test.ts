import { describe, expect, it } from "vitest";
import { parseDiscordMarkdown, parseInlineMarkdown } from "./markdown.js";
import { validateMessageText, MAX_MESSAGE_TEXT_LENGTH } from "./message-text.js";

describe("validateMessageText", () => {
  it("rejects empty", () => {
    expect(validateMessageText("   ")).toMatch(/empty/);
  });

  it("rejects over limit", () => {
    expect(validateMessageText("x".repeat(MAX_MESSAGE_TEXT_LENGTH + 1))).toMatch(/too long/);
  });

  it("accepts valid text", () => {
    expect(validateMessageText("hello")).toBeNull();
  });
});

describe("parseInlineMarkdown", () => {
  it("parses bold and italic", () => {
    const runs = parseInlineMarkdown("**bold** and *italic*");
    expect(runs).toEqual([
      { text: "bold", bold: true },
      { text: " and ", bold: undefined, italic: undefined },
      { text: "italic", italic: true },
    ]);
  });

  it("parses spoiler and code", () => {
    const runs = parseInlineMarkdown("||secret|| `x`");
    expect(runs.some((r) => r.spoiler && r.text === "secret")).toBe(true);
    expect(runs.some((r) => r.code && r.text === "x")).toBe(true);
  });
});

describe("parseDiscordMarkdown", () => {
  it("parses code block", () => {
    const blocks = parseDiscordMarkdown("before\n```js\ncode()\n```\nafter");
    expect(blocks.some((b) => b.type === "codeblock" && b.text.includes("code()"))).toBe(true);
  });

  it("parses quote line", () => {
    const blocks = parseDiscordMarkdown("> quoted");
    expect(blocks[0]?.type).toBe("quote");
  });
});

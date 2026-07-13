import { describe, expect, it } from "vitest";
import { formatMessageDate, groupByDate, type DisplayMessage } from "./messages.js";

function msg(id: string, time: string, date: string): DisplayMessage {
  return {
    id,
    from: "me",
    content: { type: "text", text: "hi" },
    time,
    date,
    status: "sent",
  };
}

describe("groupByDate", () => {
  it("groups by timestamp, ignoring stale cached date labels", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date();

    const yIso = yesterday.toISOString();
    const tIso = today.toISOString();

    const groups = groupByDate([
      msg("1", yIso, "Today"),
      msg("2", tIso, "Yesterday"),
      msg("3", yIso, "Yesterday"),
      msg("4", tIso, "Today"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.date).toBe(formatMessageDate(yIso));
    expect(groups[0]!.messages.map((m) => m.id)).toEqual(["1", "3"]);
    expect(groups[1]!.date).toBe(formatMessageDate(tIso));
    expect(groups[1]!.messages.map((m) => m.id)).toEqual(["2", "4"]);
  });
});

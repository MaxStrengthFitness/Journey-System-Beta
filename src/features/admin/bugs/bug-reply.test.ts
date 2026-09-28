import { describe, expect, it } from "vitest";
import { REPLY_MAX, replyLine, replyOf, replyPayload } from "./bug-reply";
import { reportAsText, toReportView } from "./reportView";

describe("a reply on a bug report", () => {
  it("reads a stored reply, and turns down anything that isn't one", () => {
    const at = { toMillis: () => Date.parse("2026-09-28T14:05:00Z") };
    expect(replyOf({ text: " We can see it. Fix coming this week. ", by: { uid: "u1", name: "Faramir" }, at })).toEqual({
      text: "We can see it. Fix coming this week.",
      byName: "Faramir",
      byUid: "u1",
      at: Date.parse("2026-09-28T14:05:00Z"),
    });
    expect(replyOf({ text: "   " })).toBeNull();
    expect(replyOf("a string")).toBeNull();
    expect(replyOf(null)).toBeNull();
    expect(replyOf({ text: "Thanks." })!.byName).toBe("Max Strength");
  });

  it("writes the text and who, trimmed, and refuses an empty one", () => {
    expect(replyPayload("  It's in My Studio → Machines. ", "u1", "Faramir")).toEqual({
      text: "It's in My Studio → Machines.",
      by: { uid: "u1", name: "Faramir" },
    });
    expect(() => replyPayload("  ", "u1", "Faramir")).toThrow("Write the reply first.");
    expect(() => replyPayload("x".repeat(REPLY_MAX + 1), "u1", "Faramir")).toThrow();
    expect(() => replyPayload("Hello", "", "Faramir")).toThrow();
  });

  it("says who replied and when, in the studio's day", () => {
    expect(replyLine({ text: "x", byName: "Faramir", byUid: "u", at: Date.parse("2026-09-28T14:05:00Z") })).toBe("Faramir replied on Mon, Sep 28");
    expect(replyLine({ text: "x", byName: "Faramir", byUid: "u", at: null })).toBe("Faramir replied");
  });

  it("travels with the report, and in its copied text", () => {
    const view = toReportView({ id: "b1", description: "The timer froze.", reply: { text: "Fixed in today's version.", by: { uid: "u", name: "Faramir" }, at: 1 } });
    expect(view.reply?.text).toBe("Fixed in today's version.");
    expect(reportAsText(view, () => "Sep 28")).toContain("Reply from Faramir (Sep 28):\nFixed in today's version.");
    expect(toReportView({ id: "b2", description: "No reply yet." }).reply).toBeNull();
  });
});

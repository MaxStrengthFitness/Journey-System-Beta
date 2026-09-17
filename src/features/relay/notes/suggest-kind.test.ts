import { describe, expect, it } from "vitest";
import { suggestKind } from "./suggest-kind";

const d = (over: Partial<Parameters<typeof suggestKind>[0]> = {}) => ({ title: "", body: "", clientIds: [], links: [], ...over });

describe("suggestKind", () => {
  it("reads the words once a client is linked", () => {
    expect(suggestKind(d({ clientIds: ["c"], body: "Pain at lockout on the chest press" }))).toBe("injury");
    expect(suggestKind(d({ clientIds: ["c"], title: "Renewal talk before October" }))).toBe("retention");
    expect(suggestKind(d({ clientIds: ["c"], body: "Add the leg curl, swap the row" }))).toBe("routine");
    expect(suggestKind(d({ clientIds: ["c"], body: "Likes to talk about her garden" }))).toBe("plan");
  });
  it("reads the working log too", () => {
    expect(suggestKind(d({ clientIds: ["c"] }), [{ text: "knee twinge on the extension" }])).toBe("injury");
  });
  it("with no client, links mean research and words mean a note", () => {
    expect(suggestKind(d({ links: [{ url: "https://x", title: "x" }] }))).toBe("research");
    expect(suggestKind(d({ body: "Trail near the lake for clients" }))).toBe("note");
  });
});

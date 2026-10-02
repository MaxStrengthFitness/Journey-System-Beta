import { describe, expect, it } from "vitest";
import { sessionNoteStudioId } from "./note-studio";

describe("a note written in a session belongs to her home studio (Oct 2 2026)", () => {
  it("is her home studio, even when the trainer is standing in another", () => {
    expect(sessionNoteStudioId({ homeStudioId: "solon" }, "westlake")).toBe("solon");
  });
  it("falls back to her older studio field, then where the trainer stands", () => {
    expect(sessionNoteStudioId({ studioId: "solon" }, "westlake")).toBe("solon");
    expect(sessionNoteStudioId({}, "westlake")).toBe("westlake");
    expect(sessionNoteStudioId(null, null)).toBe("");
  });
});

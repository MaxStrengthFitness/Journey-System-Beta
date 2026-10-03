import { describe, expect, it } from "vitest";
import { painLinkLabel } from "./useJournalSuggestions";

describe("painLinkLabel — what a Pulse pain point can link to", () => {
  it("finds today's injury notes, not only the old life ones (the bug fixed Oct 3 2026)", () => {
    expect(painLinkLabel({ kind: "injury", category: null, isArchived: false })).toBe("Injury");
    expect(painLinkLabel({ kind: "injury", category: "Injury", isArchived: false })).toBe("Injury");
    expect(painLinkLabel({ kind: "injury", category: "Surgery", isArchived: false })).toBe("Surgery");
    expect(painLinkLabel({ kind: "life", category: "Injury", isArchived: false })).toBe("Injury");
    expect(painLinkLabel({ kind: "incident", category: null, isArchived: false })).toBe("Incident");
  });

  it("leaves out what is not a pain, an archived note, and a thread's updates", () => {
    expect(painLinkLabel({ kind: "injury", category: "Medication", isArchived: false })).toBeNull();
    expect(painLinkLabel({ kind: "injury", category: "OutsideCare", isArchived: false })).toBeNull();
    expect(painLinkLabel({ kind: "coaching", category: "Pace", isArchived: false })).toBeNull();
    expect(painLinkLabel({ kind: "injury", category: null, isArchived: true })).toBeNull();
    expect(painLinkLabel({ kind: "injury", category: null, isArchived: false, threadId: "root" })).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  EMPTY_DRAFT,
  conversationWrites,
  draftProblem,
  effectiveStage,
  latestLine,
  promptText,
  renewalPromptDue,
} from "./conversation";
import type { RenewalCycle, RenewalSnapshot } from "./types";

const TODAY = "2026-09-11";

describe("conversations", () => {
  it("needs a leaning before it can be saved", () => {
    expect(draftProblem(EMPTY_DRAFT)).toBe("Pick how they're leaning.");
    expect(draftProblem({ ...EMPTY_DRAFT, leaning: "unsure" })).toBeNull();
    expect(draftProblem({ ...EMPTY_DRAFT, leaning: "unsure", note: "x".repeat(501) })).toContain("500");
  });

  it("writes only the fields a trainer may write to the cycle", () => {
    const { touch, cycle } = conversationWrites({
      draft: { leaning: "unsure", concerns: ["price", "price", "results"], interestedIn: "longer", note: "  Worried about cost  ", needsLeader: true },
      clientId: "c1",
      clientName: "Mary Smith",
      cycleKey: "9001",
      snapshot: { packageKey: "committed", chargeDate: "2026-11-14" },
      authorId: "uid-jen",
      authorName: "Jen Park",
    });
    expect(touch).toEqual({
      clientId: "c1",
      authorId: "uid-jen",
      authorName: "Jen Park",
      leaning: "unsure",
      concerns: ["price", "results"],
      interestedIn: "longer",
      note: "Worried about cost",
      needsLeader: true,
    });
    expect(Object.keys(cycle).sort()).toEqual(
      [
        "chargeDate",
        "clientId",
        "clientName",
        "cycleKey",
        "lastTouchBy",
        "lastTouchByName",
        "latestConcerns",
        "latestInterestedIn",
        "latestLeaning",
        "needsLeader",
        "packageKey",
      ].sort(),
    );
  });

  it("reads 'talking' once someone has logged a conversation", () => {
    expect(effectiveStage(null)).toBe("not-started");
    expect(effectiveStage({ lastTouchAt: new Date() })).toBe("talking");
    expect(effectiveStage({ stage: "decided", lastTouchAt: new Date() })).toBe("decided");
  });

  it("sums up the latest conversation in one line", () => {
    const cycle = {
      latestLeaning: "unsure",
      latestConcerns: ["price", "commitment-length"],
      lastTouchByName: "Jen Park",
      lastTouchAt: new Date(2026, 8, 3, 15, 0),
      needsLeader: true,
    } as unknown as RenewalCycle;
    expect(latestLine(cycle, TODAY)).toBe("Unsure — price, commitment length. Jen, Sep 3. Needs a leader.");
    expect(latestLine(null, TODAY)).toBeNull();
  });

  it("asks after a session only when there is something to talk about", () => {
    const base = { situation: "on-track", conversationDue: false, chargeWarning: false, sessionsLeft: 20, bankedAtCharge: null } as RenewalSnapshot;
    expect(renewalPromptDue(base)).toBe(false);
    expect(renewalPromptDue({ ...base, conversationDue: true, sessionsLeft: 9 })).toBe(true);
    expect(promptText({ ...base, conversationDue: true, sessionsLeft: 9 })).toBe("Renewal: 9 left. Talk about it today?");
    expect(renewalPromptDue({ ...base, situation: "away", conversationDue: true })).toBe(false);
    expect(promptText({ ...base, situation: "will-bank", chargeWarning: true, bankedAtCharge: 16 })).toBe(
      "Auto-renews with about 16 sessions banked. Talk about it today?",
    );
  });
});

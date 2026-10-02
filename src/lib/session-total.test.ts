import { describe, expect, it } from "vitest";
import {
  beforeJourneyGuess,
  canClaimMilestone,
  sessionNumberWords,
  sessionTotalOf,
  totalIsSayable,
} from "./session-total";
import { numberWords } from "../features/hub-schedule/peek-model";

const prior = (sessions: number) => ({ sessions, through: "2026-09-01", source: "mindbody" as const });

describe("sessionTotalOf: sessions before Journey + Journey's (Atlas answers, Oct 2 2026)", () => {
  it("a confirmed record: the reconciled count is her total, and the split is kept", () => {
    const t = sessionTotalOf({ sessionCount: 312, priorHistory: prior(306) }, "partial");
    expect(t).toEqual({ basis: "confirmed", total: 312, journey: 6, before: 306 });
    expect(canClaimMilestone(t.basis)).toBe(true);
  });

  it("a confirmed record the reconciler hasn't folded in yet is added, never undercounted", () => {
    const t = sessionTotalOf({ sessionCount: 6, priorHistory: prior(306) }, "partial");
    expect(t.total).toBe(312);
  });

  it("a whole story: Journey's count is her total", () => {
    const t = sessionTotalOf({ sessionCount: 14 }, "complete");
    expect(t).toEqual({ basis: "whole-story", total: 14, journey: 14, before: 0 });
    expect(canClaimMilestone(t.basis)).toBe(true);
  });

  it("unconfirmed: Mindbody's visits less Journey's own sessions are the guess, and no milestone is claimed", () => {
    // Mindbody counts the 6 Journey logged too: 312 visits is 306 before + 6.
    const t = sessionTotalOf({ sessionCount: 6, clientsNumberOfVisitsAtSite: 312, firstSessionDate: "2026-09-20" }, "partial");
    expect(t).toEqual({ basis: "mindbody", total: 312, journey: 6, before: 306 });
    expect(canClaimMilestone(t.basis)).toBe(false);
    expect(totalIsSayable(t)).toBe(true);
    expect(beforeJourneyGuess(t)).toBe(306);
  });

  it("no Journey session yet: every Mindbody visit is before Journey", () => {
    const t = sessionTotalOf({ sessionCount: 0, clientsNumberOfVisitsAtSite: 40 }, "partial");
    expect(t).toMatchObject({ basis: "mindbody", total: 40, before: 40 });
  });

  it("no guess anywhere: Journey's own count only, and no total", () => {
    const t = sessionTotalOf({ sessionCount: 5 }, "unknown");
    expect(t).toEqual({ basis: "journey-only", total: null, journey: 5, before: null });
    expect(totalIsSayable(t)).toBe(false);
    expect(beforeJourneyGuess(t)).toBeNull();
  });

  it("an unknown Journey count is an unknown total, never zero", () => {
    expect(sessionTotalOf({ clientsNumberOfVisitsAtSite: 40 }, "partial").total).toBeNull();
    expect(sessionTotalOf({ priorHistory: prior(40) }, "partial").total).toBeNull();
  });
});

describe("the words", () => {
  it("#312 on the card, explained where a trainer opens it, and #6 in Journey with no guess", () => {
    expect(sessionNumberWords(312, "mindbody")).toBe("#312");
    expect(sessionNumberWords(312, "mindbody", { explain: true })).toBe("#312 · from Mindbody, not yet confirmed");
    expect(sessionNumberWords(312, "confirmed", { explain: true })).toBe("#312");
    expect(sessionNumberWords(6, "journey-only")).toBe("#6 in Journey");
    expect(sessionNumberWords(null, "mindbody")).toBeNull();
  });

  it("the peek: a guess is said to be one, a first session only off a sure total", () => {
    expect(numberWords(312, "mindbody")).toBe("her 312th session · from Mindbody, not yet confirmed");
    expect(numberWords(1, "mindbody")).toBe("her 1st session · from Mindbody, not yet confirmed");
    expect(numberWords(1, "whole-story")).toBe("her first session");
    expect(numberWords(null, "journey-only", 6)).toBe("#6 in Journey");
    expect(numberWords(null, "confirmed")).toBeNull();
  });
});

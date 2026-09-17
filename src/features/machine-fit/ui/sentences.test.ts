import { describe, expect, it } from "vitest";
import { auditMachine } from "../audit";
import { buildCohort } from "../cohort";
import { suggestForMachine } from "../engine";
import { ROW_FIELDS, body, compoundRowStudio } from "../fixtures";
import { DEFAULT_MATCH_SPEC, withFactor } from "../match-spec";
import { auditSummary, cohortPhrase, flagSentence, heightBand, missingPhrase, noSuggestionSentence, suggestionSentence } from "./sentences";

const studio = compoundRowStudio();
const show = { label: (k: string) => k[0].toUpperCase() + k.slice(1), value: (_k: string, v: string) => v };

describe("the sentences", () => {
  it("names the band the ladder stopped at", () => {
    const cohort = buildCohort(studio, body(67), DEFAULT_MATCH_SPEC);
    expect(heightBand(cohort)).toBe("5'6\"–5'8\"");
    expect(cohortPhrase(cohort, "studio")).toBe("clients 5'6\"–5'8\" at this studio");
    expect(cohortPhrase(cohort, "company")).toBe("clients 5'6\"–5'8\" across MSF");
  });

  it("says what was left out of a match, and why", () => {
    const spec = withFactor(DEFAULT_MATCH_SPEC, "wingspan", { on: true });
    expect(missingPhrase(buildCohort(studio, body(67), spec))).toBe(
      "No wingspan on file for this client, so it was left out of the match.",
    );
    expect(missingPhrase(buildCohort(studio, body(67), DEFAULT_MATCH_SPEC))).toBeNull();
  });

  it("puts the whole-set-up count first when the values are seen together", () => {
    const s = suggestForMachine({ fieldKeys: ROW_FIELDS, target: body(67), sources: { studio, company: null }, spec: DEFAULT_MATCH_SPEC, skip: ["handles"] });
    expect(s.ok === true && suggestionSentence(s)).toBe("5 of 6 clients use exactly this — clients 5'6\"–5'8\" at this studio.");
  });

  it("says when a suggestion was read from the clients who share what the trainer set", () => {
    const s = suggestForMachine({ fieldKeys: ROW_FIELDS, target: body(67), sources: { studio, company: null }, spec: DEFAULT_MATCH_SPEC, pinned: { seat: "3" } });
    expect(s.ok === true && suggestionSentence(s)).toMatch(/Read across every height, from clients who share what you set\.$/);
  });

  it("never stays silent about why nothing is offered", () => {
    expect(noSuggestionSentence({ tier: null, cohort: null, reason: "no-height" })).toMatch(/Add a height/);
    expect(noSuggestionSentence({ tier: null, cohort: null, reason: "no-data" })).toMatch(/Nobody is set up/);
    const thin = buildCohort(studio, body(76), DEFAULT_MATCH_SPEC);
    expect(noSuggestionSentence({ tier: "studio", cohort: thin, reason: "thin" })).toBe(
      "Only 3 clients of a similar build are set up on this so far — not enough to suggest from.",
    );
  });

  it("states a flag with its evidence and never the word wrong", () => {
    const cohort = buildCohort(studio, body(67), DEFAULT_MATCH_SPEC);
    const audit = auditMachine({ fieldKeys: ROW_FIELDS, settings: { seat: "9" }, cohort, tier: "studio", minClients: 5 });
    const sentence = flagSentence(audit.flags[0], show, cohort, "studio");
    expect(sentence).toBe("Seat 9 — none of the 6 clients 5'6\"–5'8\" at this studio use it. Most use 4 (5) or 3 (1).");
    expect(sentence).not.toMatch(/wrong|incorrect|error/i);
  });

  it("sums a client's check up in one line", () => {
    const cohort = buildCohort(studio, body(67), DEFAULT_MATCH_SPEC);
    const odd = auditMachine({ fieldKeys: ROW_FIELDS, settings: { seat: "9" }, cohort, tier: "studio", minClients: 5 });
    const fine = auditMachine({ fieldKeys: ROW_FIELDS, settings: { seat: "4" }, cohort, tier: "studio", minClients: 5 });
    const thin = auditMachine({ fieldKeys: ROW_FIELDS, settings: { seat: "4" }, cohort: buildCohort(studio, body(78), DEFAULT_MATCH_SPEC), tier: "studio", minClients: 5 });
    expect(auditSummary([odd, fine], 2, 20)).toBe("2 of 20 machines set up. 1 setting is worth a look.");
    expect(auditSummary([fine], 1, 20)).toBe("1 of 20 machines set up. Nothing looks unusual for this build.");
    expect(auditSummary([fine, thin], 2, 20)).toBe(
      "2 of 20 machines set up. Nothing looks unusual for this build. 1 machine has too few similar clients to check yet.",
    );
    const blind = auditMachine({ fieldKeys: ROW_FIELDS, settings: { seat: "4" }, cohort: buildCohort(studio, body(null), DEFAULT_MATCH_SPEC), tier: "studio", minClients: 5 });
    expect(auditSummary([blind], 1, 20)).toMatch(/Add a height/);
  });
});

describe("the chain, said out loud", () => {
  it("names each step and what it was read among", async () => {
    const { chainSentence } = await import("./sentences");
    const s = suggestForMachine({ fieldKeys: ROW_FIELDS, target: body(67), sources: { studio, company: null }, spec: DEFAULT_MATCH_SPEC });
    expect(s.ok === true && chainSentence(s, show)).toBe(
      "Worked out in order: Gap 0 (6 of 6), then Seat 4 among those (5 of 6), then Chest 3 among those (5 of 5), then Handles in among those (2 of 4).",
    );
    const one = suggestForMachine({ fieldKeys: ["seat"], target: body(67), sources: { studio, company: null }, spec: DEFAULT_MATCH_SPEC });
    expect(one.ok === true && chainSentence(one, show)).toBeNull();
  });
});

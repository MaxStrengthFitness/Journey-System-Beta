import { describe, expect, it } from "vitest";
import { suggestForMachine } from "../../machine-fit/engine";
import { auditMachine } from "../../machine-fit/audit";
import { buildCohort } from "../../machine-fit/cohort";
import { ROW_FIELDS, body, compoundRowStudio } from "../../machine-fit/fixtures";
import { DEFAULT_MATCH_SPEC } from "../../machine-fit/match-spec";
import { auditSummary, noSuggestionSentence, suggestionSentence } from "../../machine-fit/ui/sentences";
import type { FitField } from "../../machine-fit/ui/field-values";
import type { SetupRowModel } from "../../machine-fit/ui/useSetupModel";
import type { SuggestionResult } from "../../machine-fit/types";
import { pronounsOf } from "../kit/pronouns";
import { BUILT_LIKE_HER_MAX_LINES, builtLikeHer } from "./built-like-her";

const her = pronounsOf({ gender: "Female" });
const studio = compoundRowStudio();

const FIELDS: FitField[] = ROW_FIELDS.map((k) => ({
  key: k,
  nk: k,
  label: k.charAt(0).toUpperCase() + k.slice(1),
  type: "text",
  ghost: null,
}));

function row(id: string, suggestion: SuggestionResult | null, over: Partial<SetupRowModel> = {}): SetupRowModel {
  return {
    machine: { id, name: id.replace(/^m-/, "").replace(/-/g, " ") } as SetupRowModel["machine"],
    fields: FIELDS,
    shown: {},
    dirty: new Set(),
    routines: ["A"],
    isSetUp: false,
    suggestion,
    offer: {},
    audit: null,
    ...over,
  };
}

const good = () =>
  suggestForMachine({
    fieldKeys: [...ROW_FIELDS],
    target: body(67),
    sources: { studio, company: null },
    spec: DEFAULT_MATCH_SPEC,
  });

describe("clients built like her", () => {
  it("shows machine fit's own sentence for a suggestion that rests on similar clients", () => {
    const s = good();
    expect(s.ok).toBe(true);
    const view = builtLikeHer({
      rows: [row("m-compound-row", s)],
      allRows: [row("m-compound-row", s)],
      target: body(67),
      pronouns: her,
    });
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].sentence).toBe(s.ok === true ? suggestionSentence(s) : "");
    // Each pick in the machine's own spelling, in the order machine fit reasoned it.
    expect(view.lines[0].picks).toBe("Gap 0 · Seat 4 · Chest 3 · Handles IN");
  });

  it("gives no line for a suggestion made only of what everyone uses, and leaves a universal pick out of a line", () => {
    const s = good();
    if (s.ok !== true) throw new Error("fixture");
    const universal = { ...s, picks: s.picks.map((p) => ({ ...p, universal: true })) };
    const none = builtLikeHer({
      rows: [row("m-a", universal)],
      allRows: [row("m-a", universal)],
      target: body(67),
      pronouns: her,
    });
    expect(none.lines).toEqual([]);
    const gapForAll = { ...s, picks: s.picks.map((p) => (p.key === "gap" ? { ...p, universal: true } : p)) };
    const some = builtLikeHer({
      rows: [row("m-a", gapForAll)],
      allRows: [row("m-a", gapForAll)],
      target: body(67),
      pronouns: her,
    });
    expect(some.lines[0].picks).toBe("Seat 4 · Chest 3 · Handles IN");
  });

  it("says why there is nothing, in machine fit's words", () => {
    const thin: SuggestionResult = { ok: false, tier: "studio", cohort: { clients: 3 } as never, reason: "thin" };
    const view = builtLikeHer({
      rows: [row("m-a", thin)],
      allRows: [row("m-a", thin)],
      target: body(67),
      pronouns: her,
    });
    expect(view.reason).toBe(noSuggestionSentence(thin));
    expect(view.reason).toMatch(/^Only 3 clients/);
  });

  it("asks for a height when there is none to compare", () => {
    const view = builtLikeHer({
      rows: [row("m-a", null)],
      allRows: [row("m-a", null)],
      target: body(null),
      pronouns: her,
    });
    expect(view.reason).toBe("Add a height to her record to compare her with clients built like her.");
  });

  it("shows at most three machines", () => {
    const s = good();
    const rows = ["a", "b", "c", "d", "e"].map((id) => row(`m-${id}`, s));
    expect(builtLikeHer({ rows, allRows: rows, target: body(67), pronouns: her }).lines).toHaveLength(
      BUILT_LIKE_HER_MAX_LINES,
    );
  });

  it("leads with the Setup screen's own summary", () => {
    const rows = [row("m-a", null, { isSetUp: true }), row("m-b", null)];
    const view = builtLikeHer({ rows, allRows: rows, target: body(67), pronouns: her });
    expect(view.summary).toBe(auditSummary([], 1, 2));
    // Only the count: the card's head already says it, so no verdict line.
    expect(view.verdict).toBeNull();

    const cohort = buildCohort(studio, body(67), DEFAULT_MATCH_SPEC);
    const fine = auditMachine({ fieldKeys: [...ROW_FIELDS], settings: { seat: "4" }, cohort, tier: "studio", minClients: 5 });
    const checked = [row("m-a", null, { isSetUp: true, audit: fine })];
    expect(builtLikeHer({ rows: checked, allRows: checked, target: body(67), pronouns: her }).verdict).toBe(
      "Nothing looks unusual for this build.",
    );
  });
});

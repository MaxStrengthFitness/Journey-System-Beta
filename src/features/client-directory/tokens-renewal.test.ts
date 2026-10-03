/**
 * Renewal phrases in the search (AJ, Oct 3 2026: "add that filter").
 * TODAY is Sunday Sep 27 2026.
 */
import { describe, expect, it } from "vitest";
import { applyTokens, notOnFileWords, parseQuery } from "./tokens";
import { buildDirectoryRow } from "./row";
import { TODAY, makeClient, makeContext } from "./fixtures";
import { addDays } from "../client-history/model";

const vocab = { words: new Map() };
const parse = (q: string) => parseQuery(q, vocab, { today: TODAY });
const windowOf = (q: string) => {
  const t = parse(q).tokens.find((x) => x.kind === "renews");
  return t && t.kind === "renews" ? { from: t.from, to: t.to, label: t.label } : null;
};

describe("renewal phrases", () => {
  it("reads the common ways of saying it", () => {
    expect(windowOf("renewing this month")).toEqual({ from: "2026-09-01", to: "2026-09-30", label: "Renewal: this month" });
    expect(windowOf("renewals next month")).toEqual({ from: "2026-10-01", to: "2026-10-31", label: "Renewal: next month" });
    expect(windowOf("renews this week")).toEqual({ from: "2026-09-21", to: "2026-09-27", label: "Renewal: this week" });
    expect(windowOf("renewing next week")).toEqual({ from: "2026-09-28", to: "2026-10-04", label: "Renewal: next week" });
    expect(windowOf("renewing in 2 weeks")).toEqual({ from: TODAY, to: addDays(TODAY, 14), label: "Renewal: next 2 weeks" });
    expect(windowOf("up for renewal within 10 days")).toEqual({ from: TODAY, to: addDays(TODAY, 10), label: "Renewal: next 10 days" });
    expect(windowOf("renewing")).toEqual({ from: TODAY, to: addDays(TODAY, 30), label: "Renewal: next 30 days" });
    expect(windowOf("contract ending in November")).toEqual({ from: "2026-11-01", to: "2026-11-30", label: "Renewal: November" });
    // A month already gone is next year's.
    expect(windowOf("renewing march")).toEqual({ from: "2027-03-01", to: "2027-03-31", label: "Renewal: March 2027" });
  });

  it("lets filler sit between, and combines with the rest of the grammar", () => {
    const p = parse("women over 60 renewing clients this month");
    expect(p.tokens.map((t) => t.label)).toEqual(["Renewal: this month", "Age: 60 and over", "Gender: female"]);
    expect(p.nameText).toBe("");
  });

  it("is not read without the studio's day", () => {
    expect(parseQuery("renewing this month", vocab).tokens).toEqual([]);
  });

  it("filters on the renewal day; renewed is not a match, no date is counted as not on file", () => {
    const snap = (over: Record<string, unknown>) =>
      ({ situation: "on-track", focusDate: null, renewalOnBooks: null, paymentMode: "monthly", autoRenews: true, chargeDateSource: "mindbody", runOutDate: null, dataGaps: [], ...over }) as never;
    const rows = [
      buildDirectoryRow(makeClient({ id: "in", renewal: snap({ focusDate: "2026-09-29" }) }), makeContext()),
      buildDirectoryRow(makeClient({ id: "out", renewal: snap({ focusDate: "2026-11-02" }) }), makeContext()),
      buildDirectoryRow(
        makeClient({ id: "done", renewal: snap({ focusDate: "2026-09-29", renewalOnBooks: { cycleKey: "c", packageKey: null, startsOn: "2026-09-30" } }) }),
        makeContext(),
      ),
      buildDirectoryRow(makeClient({ id: "none" }), makeContext()),
    ];
    const tokens = parse("renewing next week").tokens;
    const f = applyTokens(rows, tokens);
    expect(f.rows.map((r) => r.id)).toEqual(["in"]);
    expect(notOnFileWords(f, tokens)).toEqual(["1 has no renewal date on file"]);
  });
});

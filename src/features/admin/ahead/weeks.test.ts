import { describe, it, expect } from "vitest";
import { addDays } from "../../client-history/model";
import type { AheadClient, AheadEvent, AheadKind } from "./events";
import {
  aheadLenses,
  aheadSpan,
  clientGroups,
  clientInLens,
  countsWords,
  eventInLens,
  groupCounts,
  headlineCounts,
  pileUps,
  runOf,
  stripOf,
  weeksOf,
} from "./weeks";

const TODAY = "2026-10-07"; // a Wednesday
const T = (n: number) => addDays(TODAY, n);

function ev(clientId: string, kind: AheadKind, day: string, over: Partial<AheadEvent> = {}): AheadEvent {
  return { key: `${clientId}:${kind}:${day}`, clientId, kind, day, now: false, range: null, sentence: "", proof: "", pair: null, ...over };
}

function cl(id: string, events: AheadEvent[], over: Partial<AheadClient> = {}): AheadClient {
  const decide = events.filter((e) => e.kind !== "birthday" && e.kind !== "anniversary");
  return {
    id,
    name: id,
    client: { id } as AheadClient["client"],
    snapshot: null,
    cycle: null,
    journey: null,
    trainerId: null,
    onTrial: false,
    events,
    cantPlace: null,
    noPace: false,
    firstDay: decide.length ? decide[0].day : null,
    needsNow: false,
    slipping: false,
    ...over,
  };
}

describe("the span and the weeks", () => {
  it("runs Monday to Sunday from this week, 26 weeks", () => {
    const span = aheadSpan(TODAY);
    expect(span).toEqual({ first: "2026-10-05", until: "2027-04-04", weeks: 26 });
  });

  it("puts each event in its week and leaves out what falls outside", () => {
    const span = aheadSpan(TODAY, 4);
    // T(10) is Saturday Oct 17: next week. T(40) is past the four weeks.
    const weeks = weeksOf([ev("a", "talk-now", TODAY), ev("b", "renews", T(10)), ev("c", "renews", T(40))], span);
    expect(weeks.map((w) => w.events.map((e) => e.clientId))).toEqual([["a"], ["b"], [], []]);
    expect(weeks[1]).toMatchObject({ monday: "2026-10-12", sunday: "2026-10-18" });
  });
});

describe("the run", () => {
  it("folds empty weeks into one clear line inside their month, never this week", () => {
    // Nine weeks of Mondays: Oct 5, 12, 19, 26, Nov 2, 9, 16, 23, 30.
    const span = aheadSpan(TODAY, 9);
    const run = runOf(weeksOf([ev("b", "talk", "2026-10-20"), ev("c", "renews", "2026-11-25")], span));
    expect(run.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    // This week stays though empty; Oct 12 and Oct 26 fold alone.
    expect(run[0].items.map((i) => i.kind)).toEqual(["week", "clear", "week", "clear"]);
    // November: three clear weeks, the week with the renewal, one more clear.
    expect(run[1].items).toEqual([
      { kind: "clear", from: "2026-11-02", to: "2026-11-22", weeks: 3 },
      expect.objectContaining({ kind: "week" }),
      { kind: "clear", from: "2026-11-30", to: "2026-12-06", weeks: 1 },
    ]);
    expect(run[1].counts).toEqual({ talk: 0, date: 1, watch: 0, moment: 0 });
  });
});

describe("counts", () => {
  it("says a week's counts in words, nothing for nothing", () => {
    const c = groupCounts([ev("a", "talk", T(1)), ev("b", "talk-now", TODAY), ev("c", "charge", T(2)), ev("d", "may-slip", T(3)), ev("e", "birthday", T(4))]);
    expect(countsWords(c)).toBe("2 talks · 1 renewal date · 1 to watch · 1 moment");
    expect(countsWords(groupCounts([]))).toBe("");
  });

  it("counts clients, not events, in the next eight weeks", () => {
    const span = aheadSpan(TODAY);
    const clients = [
      cl("a", [ev("a", "talk-now", TODAY), ev("a", "charge-window", TODAY)]),
      cl("b", [ev("b", "talk", T(20)), ev("b", "runs-out", T(100))]),
      cl("c", [ev("c", "may-slip", T(3)), ev("c", "anniversary", T(9))]),
    ];
    expect(headlineCounts(clients, span)).toEqual({ talks: 2, charges: 1, runsOut: 0, maySlip: 1, moments: 1 });
  });

  it("names a trainer with three or more talks in a week, and only them", () => {
    const trainerOf = (id: string) => ({ a: "dana", b: "dana", c: "dana", d: "owen" })[id] ?? null;
    const events = [ev("a", "talk-now", TODAY), ev("b", "talk", T(1)), ev("c", "talk", T(2)), ev("d", "talk", T(2)), ev("a", "charge", T(3))];
    expect(pileUps(events, trainerOf)).toEqual([{ trainerId: "dana", talks: 3 }]);
    expect(pileUps(events.slice(1), trainerOf)).toEqual([]);
  });
});

describe("the strip", () => {
  it("is one bar a week by group, with its months to tap", () => {
    const span = aheadSpan(TODAY, 6);
    const strip = stripOf(weeksOf([ev("a", "talk", TODAY), ev("b", "renews", TODAY), ev("c", "may-slip", T(30)), ev("d", "birthday", T(30))], span));
    expect(strip.weeks[0]).toMatchObject({ talk: 1, date: 1, watch: 0 });
    expect(strip.weeks[4]).toMatchObject({ talk: 0, date: 0, watch: 1 });
    expect(strip.months).toEqual([
      { month: "2026-10", first: 0, weeks: 4 },
      { month: "2026-11", first: 4, weeks: 2 },
    ]);
    expect(strip.max).toBe(2);
  });
});

describe("lenses", () => {
  const trial = cl("t", [ev("t", "talk", T(5)), ev("t", "birthday", T(6))], { onTrial: true });
  it("offers the Trial by the studio's own name, and only when there is one", () => {
    expect(aheadLenses("The Trial").map((l) => l.label)).toEqual(["All", "Talks", "At a charge", "Runs out early", "May slip", "The Trial", "Moments"]);
    expect(aheadLenses(null).some((l) => l.id === "trial")).toBe(false);
  });

  it("filters events and clients", () => {
    expect(eventInLens(trial.events[0], trial, "trial")).toBe(true);
    expect(eventInLens(trial.events[1], trial, "trial")).toBe(false);
    expect(eventInLens(trial.events[0], trial, "charges")).toBe(false);
    expect(clientInLens(trial, "talks")).toBe(true);
    expect(clientInLens(cl("s", [], { slipping: true }), "may-slip")).toBe(true);
  });
});

describe("the Clients view's groups", () => {
  it("now first, then by the first date; quiet and can't-place at the foot", () => {
    const g = clientGroups([
      cl("later", [ev("later", "renews", T(60))]),
      cl("soon", [ev("soon", "talk", T(10))]),
      cl("now", [ev("now", "talk-now", TODAY, { now: true })], { needsNow: true }),
      cl("quiet", [ev("quiet", "birthday", T(3))]),
      cl("omar", [], { cantPlace: "No nightly record for this client yet." }),
    ]);
    expect(g.now.map((c) => c.id)).toEqual(["now"]);
    expect(g.coming.map((c) => c.id)).toEqual(["soon", "later"]);
    expect(g.quiet.map((c) => c.id)).toEqual(["quiet"]);
    expect(g.cantPlace.map((c) => c.id)).toEqual(["omar"]);
  });
});

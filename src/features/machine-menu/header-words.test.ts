import { describe, expect, it } from "vitest";
import { STUDIO, TODAY, averyRead } from "./fixtures";
import {
  COULDNT_LOAD_LINE,
  LOADING_LINE,
  closeLabel,
  headerNames,
  knownElsewhere,
  lastTimeLine,
  safetyPillWords,
  type HeaderInput,
} from "./header-words";
import { buildTimelineModel, type TimelineInput, type TimelineLogInput, type TimelineSessionInput } from "./timeline-model";

function avery(from: number, over: Partial<TimelineInput> = {}) {
  return buildTimelineModel({
    machineId: "leg-press",
    machineName: "Leg Press",
    ...averyRead(from),
    today: TODAY,
    unitStudioId: STUDIO,
    history: [],
    journal: [],
    ...over,
  });
}

/** A few sessions on one machine: [day, the set, the session]. */
function small(rows: [string, Partial<TimelineLogInput>, Partial<TimelineSessionInput>?][], over: Partial<TimelineInput> = {}) {
  const sessions: TimelineSessionInput[] = rows.map(([day, , s], i) => ({ id: `s${i}`, date: day, status: "Completed", hostedAtStudioId: STUDIO, ...s }));
  const logs: TimelineLogInput[] = rows.map(([, l], i) => ({ sessionId: `s${i}`, machineId: "m", weight: "100", reps: "10", outcome: "performed", ...l }));
  return buildTimelineModel({
    machineId: "m",
    machineName: "Torso Rotation",
    sessions,
    logs,
    today: TODAY,
    unitStudioId: STUDIO,
    everythingRead: false,
    moreToLoad: true,
    history: [],
    journal: [],
    ...over,
  });
}

const empty = (over: Partial<TimelineInput> = {}) => small([], over);
const say = (input: Omit<HeaderInput, "today"> & { today?: string }) => lastTimeLine({ today: TODAY, ...input });

describe("line 1", () => {
  it("says the floor name and the display name, and nothing else the record holds", () => {
    const client = { firstName: "Avery", lastName: "Lindqvist", gender: "None", height: "5'8\"", age: 61 } as never;
    expect(headerNames(" Leg Press ", client)).toEqual({ machine: "Leg Press", client: "Avery Lindqvist" });
    expect(headerNames("Leg Press", { firstName: "Judith", nickname: "Judy", lastName: "Daus" }).client).toBe("Judy Daus");
  });

  it("names Close for the machine", () => {
    expect(closeLabel("Leg Press")).toBe("Close Leg Press");
  });

  it("words the safety pill, its accessible name ending Show it", () => {
    expect(safetyPillWords(1)).toEqual({ label: "1 thing to know first", ariaLabel: "1 thing to know first. Show it" });
    expect(safetyPillWords(3).label).toBe("3 things to know first");
  });
});

describe("Last time: the newest record before today", () => {
  it("says a performed set with its mark", () => {
    const l = say({ model: avery(42) });
    expect(l).toMatchObject({ kind: "last", lead: "Last time", figures: "100 lb × 11", mark: "max", markWords: "Max strength", day: "Thu Oct 1" });
    expect(l.text).toBe("Last time 100 lb × 11 · Thu Oct 1");
  });

  it("is the same in both doors, whatever has been read", () => {
    for (const from of [42, 21, 1]) expect(say({ model: avery(from) }).text).toBe("Last time 100 lb × 11 · Thu Oct 1");
  });

  it("says a timed hold", () => {
    const l = say({ model: small([["2026-03-23", { weight: "94", reps: null, seconds: "90", isTSC: true }]]) });
    expect(l.text).toBe("Last time 94 lb · held 1:30 · Mon Mar 23");
    expect(l.mark).toBeNull();
  });

  it("says one side at a time, never averaged", () => {
    const model = buildTimelineModel({
      machineId: "m",
      machineName: "Torso Rotation",
      sessions: [{ id: "a", date: "2026-10-01", status: "Completed" }],
      logs: [
        { sessionId: "a", machineId: "m", weight: "42", reps: "9", side: "Left", outcome: "performed" },
        { sessionId: "a", machineId: "m", weight: "42", reps: "9", side: "Right", outcome: "performed" },
      ],
      today: TODAY,
      everythingRead: false,
      moreToLoad: true,
      history: [],
      journal: [],
    });
    expect(say({ model }).text).toBe("Last time 42 lb · L 9 · R 9 · Thu Oct 1");
  });

  it("says another studio by name", () => {
    const model = small([["2026-10-01", { reps: "11" }, { hostedAtStudioId: "solon" }]]);
    expect(say({ model, studioNames: { solon: "Solon" } }).text).toBe("Last time 100 lb × 11 · Thu Oct 1 · at Solon");
    expect(say({ model }).text).toBe("Last time 100 lb × 11 · Thu Oct 1 · at another studio");
  });

  it("never says today's set: that is on the Now Bar", () => {
    const model = small([["2026-10-01", { reps: "11" }], [TODAY, { weight: "102", reps: "8" }]]);
    expect(say({ model }).text).toBe("Last time 100 lb × 11 · Thu Oct 1");
  });

  it("says a newest record that wasn't counted, then the last counted one", () => {
    const skipped = small([
      ["2026-02-02", { weight: "92", reps: "8" }],
      ["2026-02-11", { weight: null, reps: null, outcome: "skipped", skipReason: "pain_injury" }],
    ]);
    const l = say({ model: skipped });
    expect(l.kind).toBe("uncounted");
    expect(l.text).toBe("Last time skipped (pain) · Wed Feb 11 · last counted 92 lb × 8, Mon Feb 2");

    const practice = small([
      ["2025-12-26", { weight: "90", reps: "9" }],
      ["2026-01-03", { weight: "70", reps: "14", outcome: "practice", bloodFlow: true }],
    ]);
    expect(say({ model: practice }).text).toBe("Last time blood flow · Sat Jan 3 · last counted 90 lb × 9, Fri Dec 26 2025");

    const onlySkip = small([["2026-02-11", { outcome: "skipped" }]]);
    expect(say({ model: onlySkip }).text).toBe("Last time skipped · Wed Feb 11");
  });
});

describe("a newest record not in the sessions loaded: the running totals, hedged", () => {
  const metric = { weight: "100", reps: "11", lastPerformedDate: "2026-10-01", lastSessionId: "s-2026-10-01", settings: {} };

  it("says Finish's metric, which has reps", () => {
    const l = say({ model: empty(), metric });
    expect(l.kind).toBe("elsewhere");
    expect(l.text).toBe("Last in Journey 100 lb × 11 · Thu Oct 1 · not in the sessions loaded here");
  });

  it("reads a Timestamp the way Finish writes one", () => {
    const at = { toDate: () => new Date("2026-10-01T15:00:00-04:00") };
    expect(say({ model: empty(), metric: { ...metric, lastPerformedDate: at } }).day).toBe("Thu Oct 1");
  });

  it("says the rollup's day and load when only machineStats knows it", () => {
    const stat = { firstPerformedDate: "2025-09-09", lastPerformedDate: "2026-10-01", lastWeight: 100, timesPerformed: 34 };
    expect(say({ model: empty(), stat }).text).toBe("Last in Journey Thu Oct 1 · 100 lb · not in the sessions loaded here");
  });

  it("never quotes a running total as a count", () => {
    const stat = { firstPerformedDate: "2025-09-09", lastPerformedDate: "2026-10-01", lastWeight: 100, timesPerformed: 34 };
    expect(say({ model: empty(), stat }).text).not.toMatch(/34/);
  });

  it("uses a total only when it is newer than what was read, and not one of the sessions read", () => {
    const model = small([["2026-09-17", { reps: "9" }]]);
    expect(say({ model, metric: { ...metric, lastSessionId: "elsewhere" } }).kind).toBe("elsewhere");
    expect(say({ model, metric: { ...metric, lastSessionId: "s0" } }).text).toBe("Last time 100 lb × 9 · Thu Sep 17");
    expect(say({ model, metric: { ...metric, lastPerformedDate: "2026-09-17" } }).text).toBe("Last time 100 lb × 9 · Thu Sep 17");
  });

  it("leaves out a total dated today: that is today's session", () => {
    expect(say({ model: empty(), metric: { ...metric, lastPerformedDate: TODAY } }).kind).toBe("nothing");
  });
});

describe("nothing in what was read, gated", () => {
  it("says First time only with the whole story and every session read", () => {
    expect(say({ model: empty({ everythingRead: true, moreToLoad: false }), coverage: "complete" }).text).toBe("First time on this machine");
    expect(say({ model: empty({ everythingRead: true, moreToLoad: false }), coverage: "partial" }).text).toBe("Nothing recorded on this machine");
    expect(say({ model: empty({ everythingRead: true, moreToLoad: false }) }).text).toBe("Nothing recorded on this machine");
  });

  it("says 'in the sessions loaded here' while older sessions are unread, whatever the coverage", () => {
    for (const coverage of ["complete", "partial", "unknown"] as const) {
      expect(say({ model: empty(), coverage }).text).toBe("Nothing recorded on this machine in the sessions loaded here");
    }
  });

  it("is never First time for a machine a running total knows", () => {
    const model = empty({ everythingRead: true, moreToLoad: false });
    expect(say({ model, coverage: "complete", metric: { weight: "100", lastPerformedDate: null, settings: {} } }).text).toBe("Nothing recorded on this machine");
    expect(say({ model, coverage: "complete", stat: { timesPerformed: 3 } }).text).toBe("Nothing recorded on this machine");
  });
});

describe("reads that didn't answer", () => {
  it("says it couldn't load, never first time, even with a total on file", () => {
    const failed = empty({ readState: "failed", everythingRead: true, moreToLoad: false });
    const l = say({ model: failed, coverage: "complete", metric: { weight: "100", reps: "11", lastPerformedDate: "2026-10-01", settings: {} } });
    expect([l.kind, l.text]).toEqual(["failed", COULDNT_LOAD_LINE]);
    expect(COULDNT_LOAD_LINE).toBe("Last time: couldn't load");
  });

  it("says it is loading before the first read answers", () => {
    expect(say({ model: empty({ readState: "loading" }), coverage: "complete" }).text).toBe(LOADING_LINE);
  });

  it("still says what it has while a cache-only read stands", () => {
    expect(say({ model: avery(42, { readState: "cache-only" }) }).text).toBe("Last time 100 lb × 11 · Thu Oct 1");
  });
});

describe("watching another trainer's session", () => {
  it("ends every line with whose session it is, read only", () => {
    expect(say({ model: avery(42), watching: "Sam Reyes" }).text).toBe("Last time 100 lb × 11 · Thu Oct 1 · Watching Sam's session, read only");
    expect(say({ model: empty(), watching: "Sam Reyes" }).text).toBe(
      "Nothing recorded on this machine in the sessions loaded here · Watching Sam's session, read only",
    );
    expect(say({ model: empty({ readState: "failed" }), watching: "" }).text).toBe(
      "Last time: couldn't load · Watching another trainer's session, read only",
    );
  });
});

describe("running totals are evidence only", () => {
  it("knows a machine done before today, cautiously", () => {
    expect(knownElsewhere({}, TODAY)).toBe(false);
    expect(knownElsewhere({ metric: { weight: "100", lastPerformedDate: "2026-10-01" } }, TODAY)).toBe(true);
    expect(knownElsewhere({ metric: { weight: "100", lastPerformedDate: undefined } }, TODAY)).toBe(true);
    expect(knownElsewhere({ metric: { weight: "100", lastPerformedDate: TODAY } }, TODAY)).toBe(false);
    expect(knownElsewhere({ stat: { firstPerformedDate: TODAY, lastPerformedDate: TODAY, timesPerformed: 1 } }, TODAY)).toBe(false);
    expect(knownElsewhere({ stat: { firstPerformedDate: "2025-09-09", lastPerformedDate: TODAY, timesPerformed: 34 } }, TODAY)).toBe(true);
    expect(knownElsewhere({ stat: {} }, TODAY)).toBe(false);
  });
});

describe("guard words: no gender, no height, no pronoun", () => {
  const FORBIDDEN = /\b(her|she|gender|height|male|female|none|age|tall)\b|\d'\s?\d/i;

  it("never says them, in any line the header can draw", () => {
    const metric = { weight: "100", reps: "11", lastPerformedDate: "2026-10-01", settings: {} };
    const stat = { lastPerformedDate: "2026-10-01", lastWeight: 100, timesPerformed: 34 };
    const lines = [
      say({ model: avery(42) }),
      say({ model: avery(1), coverage: "complete" }),
      say({ model: small([["2026-03-23", { seconds: "90", isTSC: true, reps: null }]]) }),
      say({ model: small([["2026-10-01", {}, { hostedAtStudioId: "solon" }]]), studioNames: { solon: "Solon" } }),
      say({ model: small([["2026-02-02", {}], ["2026-02-11", { outcome: "skipped", skipReason: "pain_injury" }]]) }),
      say({ model: empty(), metric }),
      say({ model: empty(), stat }),
      say({ model: empty({ everythingRead: true }), coverage: "complete" }),
      say({ model: empty({ everythingRead: true }), coverage: "partial" }),
      say({ model: empty() }),
      say({ model: empty({ readState: "failed" }) }),
      say({ model: empty({ readState: "loading" }) }),
      say({ model: avery(42), watching: "Sam Reyes" }),
    ];
    const names = headerNames("Leg Press", { firstName: "Avery", lastName: "Lindqvist", gender: "None", height: "5'8\"" } as never);
    const all = [...lines.map((l) => `${l.text} ${l.markWords ?? ""}`), names.machine, names.client, closeLabel("Leg Press"), safetyPillWords(2).ariaLabel].join("\n");
    expect(all).not.toMatch(FORBIDDEN);
  });
});

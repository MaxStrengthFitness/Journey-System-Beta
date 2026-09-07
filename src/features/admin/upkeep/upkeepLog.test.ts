import { describe, expect, it } from "vitest";
import type { TaskInstance } from "../../studio-tasks/types";
import {
  DEFAULT_UPKEEP_POLICY,
  mergeUpkeepHistory,
  tallyUpkeep,
  upkeepStatus,
  worstStatus,
  type UpkeepLogEntry,
} from "./upkeepLog";

const TODAY = "2026-09-08";

const task = (over: Partial<TaskInstance> & { id: string }): TaskInstance =>
  ({
    studioId: "solon",
    templateId: "t",
    localDate: TODAY,
    shift: "any",
    status: "done",
    category: "cleaning",
    machineId: "m-leg-press",
    ...over,
  }) as TaskInstance;

const logged = (over: Partial<UpkeepLogEntry> & { id: string }): UpkeepLogEntry => ({
  machineId: "m-leg-press",
  kind: "service",
  at: `${TODAY}T10:00:00.000Z`,
  ...over,
});

describe("mergeUpkeepHistory", () => {
  it("takes completed cleaning and maintenance tasks", () => {
    const events = mergeUpkeepHistory(
      [
        task({ id: "a", category: "cleaning" }),
        task({ id: "b", category: "maintenance", localDate: "2026-09-01" }),
      ],
      [],
    );
    expect(events.map((e) => e.kind)).toEqual(["clean", "service"]);
  });

  it("ignores tasks that were not completed", () => {
    expect(
      mergeUpkeepHistory([task({ id: "a", status: "open" })], []),
    ).toEqual([]);
    expect(
      mergeUpkeepHistory([task({ id: "a", status: "skipped" })], []),
    ).toEqual([]);
  });

  it("ignores task categories that are not upkeep", () => {
    expect(mergeUpkeepHistory([task({ id: "a", category: "admin" })], [])).toEqual(
      [],
    );
  });

  it("resolves a renamed studio category rather than matching the string", () => {
    // Categories are studio-authored. Matching on "cleaning" empties this the
    // first time a manager renames it to "Wipe-down".
    const events = mergeUpkeepHistory(
      [task({ id: "a", category: "wipe-down" })],
      [],
      [{ id: "wipe-down", label: "Wipe-down", upkeepRole: "cleaning" } as any],
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("clean");
  });

  it("takes explicitly logged work the schedule knows nothing about", () => {
    // A trainer deep-cleaning after a spilled shake, or an engineer replacing
    // a seat pad on a Tuesday. Neither is a scheduled task, and both are what
    // the longevity tally is for.
    const events = mergeUpkeepHistory([], [
      logged({ id: "L1", kind: "deep-clean", note: "client spilled a shake" }),
    ]);
    expect(events[0]).toMatchObject({ kind: "deep-clean", source: "logged" });
  });

  it("counts one job once when it was both ticked and logged", () => {
    // Same machine, same day, same kind. Counting it twice inflates a tally
    // whose whole purpose is accountability.
    const events = mergeUpkeepHistory(
      [task({ id: "a", category: "maintenance" })],
      [logged({ id: "L1", kind: "service" })],
    );
    expect(events).toHaveLength(1);
  });

  it("keeps the logged version of a duplicate, because a person typed it", () => {
    const events = mergeUpkeepHistory(
      [task({ id: "a", category: "maintenance" })],
      [logged({ id: "L1", kind: "service", note: "replaced the pin" })],
    );
    expect(events[0].source).toBe("logged");
    expect(events[0].note).toBe("replaced the pin");
  });

  it("does not collapse different kinds on the same day", () => {
    const events = mergeUpkeepHistory(
      [task({ id: "a", category: "cleaning" })],
      [logged({ id: "L1", kind: "service" })],
    );
    expect(events).toHaveLength(2);
  });

  it("sorts newest first", () => {
    const events = mergeUpkeepHistory(
      [
        task({ id: "old", localDate: "2026-08-01" }),
        task({ id: "new", localDate: "2026-09-05" }),
      ],
      [],
    );
    expect(events.map((e) => e.day)).toEqual(["2026-09-05", "2026-08-01"]);
  });

  it("skips entries with no machine", () => {
    expect(
      mergeUpkeepHistory([task({ id: "a", machineId: undefined })], []),
    ).toEqual([]);
  });
});

describe("tallyUpkeep", () => {
  const events = mergeUpkeepHistory(
    [
      task({ id: "c1", localDate: "2026-09-07", category: "cleaning" }),
      task({ id: "c2", localDate: "2026-09-06", category: "cleaning" }),
      task({ id: "s1", localDate: "2026-06-01", category: "maintenance" }),
      task({ id: "other", machineId: "m-abs", localDate: "2026-09-07" }),
    ],
    [logged({ id: "L1", kind: "deep-clean", at: "2026-09-08T09:00:00Z" })],
  );

  it("counts each kind for one machine only", () => {
    const t = tallyUpkeep(events, "m-leg-press", TODAY);
    expect(t.services).toBe(1);
    expect(t.total).toBe(4);
  });

  it("counts a deep clean as a clean as well", () => {
    // Counting it only as its own category would make a studio's cleaning
    // number look worse the more thoroughly it worked.
    const t = tallyUpkeep(events, "m-leg-press", TODAY);
    expect(t.cleans).toBe(3);
    expect(t.lastCleanedDay).toBe("2026-09-08");
  });

  it("measures days since, in studio days", () => {
    const t = tallyUpkeep(events, "m-leg-press", TODAY);
    expect(t.daysSinceCleaned).toBe(0);
    expect(t.daysSinceServiced).toBe(99);
  });

  it("reports null rather than zero for a machine with no history", () => {
    const t = tallyUpkeep(events, "m-never", TODAY);
    expect(t.lastCleanedDay).toBeNull();
    expect(t.daysSinceCleaned).toBeNull();
    expect(t.total).toBe(0);
  });
});

describe("upkeepStatus", () => {
  it("treats never-logged as its own state, not as extremely overdue", () => {
    // A studio that has not started using the log is an onboarding gap.
    // Telling a manager their whole floor is overdue on day one is how a
    // status light gets ignored forever.
    expect(upkeepStatus(null, 1)).toBe("never");
  });

  it("is ok inside the interval", () => {
    expect(upkeepStatus(0, 1)).toBe("ok");
    expect(upkeepStatus(1, 1)).toBe("ok");
  });

  it("is due just past it and overdue at double", () => {
    expect(upkeepStatus(2, 1)).toBe("due");
    expect(upkeepStatus(3, 1)).toBe("overdue");
    expect(upkeepStatus(120, 90)).toBe("due");
    expect(upkeepStatus(200, 90)).toBe("overdue");
  });
});

describe("worstStatus", () => {
  const tally = (over: Partial<ReturnType<typeof tallyUpkeep>>) =>
    ({
      machineId: "m",
      cleans: 0,
      services: 0,
      lastCleanedDay: null,
      lastServicedDay: null,
      daysSinceCleaned: null,
      daysSinceServiced: null,
      total: 0,
      ...over,
    }) as ReturnType<typeof tallyUpkeep>;

  it("reports the worse of cleaning and servicing", () => {
    expect(
      worstStatus(tally({ daysSinceCleaned: 0, daysSinceServiced: 400 })),
    ).toBe("overdue");
  });

  it("ranks a genuine lapse above a never-logged one", () => {
    // "Never" means nobody has started; "due" means someone did and stopped.
    expect(
      worstStatus(tally({ daysSinceCleaned: 2, daysSinceServiced: null })),
    ).toBe("due");
  });

  it("is ok when both are inside their interval", () => {
    expect(
      worstStatus(
        tally({ daysSinceCleaned: 1, daysSinceServiced: 30 }),
        DEFAULT_UPKEEP_POLICY,
      ),
    ).toBe("ok");
  });
});

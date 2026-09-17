import { beforeEach, describe, expect, it } from "vitest";
import { publishPulse, pulseEvents, readPulse, resetPulseStore } from "./pulse";
import type { TaskRow } from "../../studio-tasks/types";
import type { TeamJob } from "../jobs/types";
import type { TaskRequest } from "../../studio-tasks/requests";

const NOW = Date.parse("2026-09-16T18:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000);

const row = (templateId: string, title: string, who: { id: string; name: string } | null, at: Date | null): TaskRow =>
  ({
    id: `${templateId}-${Math.random()}`,
    templateId,
    title,
    localDate: "2026-09-16",
    shift: "any",
    category: "cleaning",
    kind: "machine",
    template: {} as never,
    status: who ? "done" : "open",
    instance: who
      ? ({ status: "done", completedBy: who, completedAt: at } as never)
      : null,
  }) as unknown as TaskRow;

describe("pulseEvents", () => {
  const marina = { id: "m", name: "Marina Borden" };
  const austin = { id: "a", name: "Austin Jurgens" };

  it("folds one person's completions of one template into one line", () => {
    const rows = [
      row("wipe", "Wipe down machines", marina, ago(30)),
      row("wipe", "Wipe down machines", marina, ago(20)),
      row("wipe", "Wipe down machines", marina, ago(10)),
      row("bins", "Empty the bins", austin, ago(5)),
      row("wipe", "Wipe down machines", null, null),
    ];
    const events = pulseEvents({ rows, jobs: [], requests: [], now: NOW });
    expect(events.map((e) => `${e.who} ${e.what}`)).toEqual([
      "Austin empty the bins",
      "Marina wipe down machines × 3",
    ]);
  });

  it("drops anything older than the window", () => {
    const rows = [row("wipe", "Wipe", marina, ago(9 * 60))];
    expect(pulseEvents({ rows, jobs: [], requests: [], now: NOW })).toEqual([]);
  });

  it("reads closed jobs, closed asks and claims", () => {
    const jobs = [
      { id: "j1", title: "Deep clean", status: "done", completedBy: austin, completedAt: ago(15) },
      { id: "j2", title: "Open one", status: "open", completedBy: null },
    ] as unknown as TeamJob[];
    const requests = [
      { id: "r1", title: "Leg press pad", status: "resolved", resolvedBy: marina, resolvedAt: ago(2) },
      { id: "r2", title: "Cover 2pm", status: "open", claimedBy: austin, claimedAt: ago(40) },
      { id: "r3", title: "Nothing yet", status: "open", claimedBy: null },
    ] as unknown as TaskRequest[];
    const events = pulseEvents({ rows: [], jobs, requests, now: NOW });
    expect(events.map((e) => e.what)).toEqual([
      'closed "Leg press pad"',
      'finished "Deep clean"',
      'is on "Cover 2pm"',
    ]);
  });
});

describe("the store", () => {
  beforeEach(() => resetPulseStore());
  it("keeps the last published list per studio and ignores an identical republish", () => {
    const a = [{ id: "x", at: 1, whoId: "m", who: "Marina", what: "x", target: null, kudos: undefined }];
    publishPulse("s1", a);
    expect(readPulse("s1")).toBe(a);
    publishPulse("s1", [{ ...a[0] }]);
    expect(readPulse("s1")).toBe(a);
    expect(readPulse("s2")).toEqual([]);
    expect(readPulse(null)).toEqual([]);
  });
});

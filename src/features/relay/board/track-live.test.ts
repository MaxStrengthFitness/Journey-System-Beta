import { describe, expect, it } from "vitest";
import { trackedLive } from "./track-live";
import { ask, job, row, template } from "./fixtures";

const wipe = template("wipe-down", { title: "Wipe-down round" });

describe("the tracked job, as it stands now", () => {
  it("counts a shift chore's machines, and lets go once every one is ticked", () => {
    const rows = [row(wipe, "lp"), row(wipe, "cp", "done"), row(wipe, "cr")];
    expect(trackedLive("group:wipe-down:any", { rows, jobs: [], requests: [] })).toEqual({
      title: "Wipe-down round",
      done: 1,
      total: 3,
    });
    const allDone = rows.map((r) => ({ ...r, status: "done" as const }));
    expect(trackedLive("group:wipe-down:any", { rows: allDone, jobs: [], requests: [] })).toBeNull();
  });

  it("finds a template id with a colon in it", () => {
    const odd = template("deep:clean", { title: "Deep clean" });
    expect(trackedLive("group:deep:clean:any", { rows: [row(odd, "lp")], jobs: [], requests: [] })?.title).toBe("Deep clean");
  });

  it("follows an ask while it is open, and not once it is closed or gone", () => {
    const open = ask("a1", { title: "Cover Farmer Maggot at 4:20" });
    expect(trackedLive("ask:a1", { rows: [], jobs: [], requests: [open] })).toEqual({
      title: "Cover Farmer Maggot at 4:20",
      done: null,
      total: null,
    });
    expect(trackedLive("ask:a1", { rows: [], jobs: [], requests: [{ ...open, status: "resolved" }] })).toBeNull();
    expect(trackedLive("ask:a1", { rows: [], jobs: [], requests: [] })).toBeNull();
  });

  it("counts a team job's parts, and says nothing to count when it has none", () => {
    const withParts = job("j1", {
      title: "Birthday cards",
      parts: {
        p1: { id: "p1", label: "Hamfast", order: 0, doneBy: { id: "x", name: "X" } },
        p2: { id: "p2", label: "Rosie", order: 1 },
      } as never,
    });
    expect(trackedLive("job:j1", { rows: [], jobs: [withParts], requests: [] })).toEqual({ title: "Birthday cards", done: 1, total: 2 });
    expect(trackedLive("job:j2", { rows: [], jobs: [job("j2", { title: "Towels" })], requests: [] })).toEqual({
      title: "Towels",
      done: null,
      total: null,
    });
    expect(trackedLive("job:j2", { rows: [], jobs: [job("j2", { status: "done" })], requests: [] })).toBeNull();
  });

  it("follows one client task, and knows nothing of an id it can't read", () => {
    const report = template("report", { kind: "client", title: "Progress report for Hugo Bracegirdle" });
    const r = row(report, undefined);
    expect(trackedLive(`row:${r.id}`, { rows: [r], jobs: [], requests: [] })?.title).toBe("Progress report for Hugo Bracegirdle");
    expect(trackedLive("nonsense", { rows: [r], jobs: [], requests: [] })).toBeNull();
    expect(trackedLive("group:", { rows: [r], jobs: [], requests: [] })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { CHORE_LINES_MAX, teamTodayLines } from "./team-today";
import { BEREGOND, TODAY, ask, row, template } from "./fixtures";
import type { TaskRow } from "../../studio-tasks/types";

const done = (r: TaskRow, iso: string): TaskRow => ({
  ...r,
  status: "done",
  instance: { status: "done", completedAt: Date.parse(iso), completedBy: BEREGOND } as never,
});
const claimed = (r: TaskRow, who = BEREGOND): TaskRow => ({ ...r, instance: { status: "open", claimedBy: who } as never });

describe("Team today, by chore", () => {
  const wipe = template("wipe", { title: "Wipe-down round" });
  const deep = template("deep", { title: "Deep clean", kind: "facility", target: { kind: "facility" } });
  const opening = template("opening", { title: "Opening walk-through", kind: "facility", target: { kind: "facility" } });

  it("says each chore once: how far it has got, who is on it, or that nobody is yet", () => {
    const rows = [
      done(row(wipe, "lp"), "2026-09-28T15:00:00Z"),
      row(wipe, "cp"),
      row(wipe, "cr"),
      row(deep, undefined),
      done(row(opening, undefined), "2026-09-28T10:48:00Z"),
    ];
    const { lines, more } = teamTodayLines({ rows, answered: [], keptToday: 0, todayKey: TODAY });
    expect(lines.map((l) => `${l.label} · ${l.state}`)).toEqual([
      "Deep clean · nobody on it yet",
      "Wipe-down round · 1 of 3",
      "Opening walk-through · done by 6:48 AM",
    ]);
    expect(more).toBe(0);
  });

  it("names who is on an open chore, never counts anyone", () => {
    const { lines } = teamTodayLines({ rows: [claimed(row(deep, undefined))], answered: [], keptToday: 0, todayKey: TODAY });
    expect(lines[0].state).toBe("Beregond is on it");
  });

  it("adds the asks answered today and the answers kept in the Playbook", () => {
    const answered = [
      ask("a1", { status: "resolved", resolvedAt: { toMillis: () => Date.parse("2026-09-28T14:00:00Z") } as never }),
      ask("a2", { status: "resolved", resolvedAt: { toMillis: () => Date.parse("2026-09-26T14:00:00Z") } as never }),
    ];
    const { lines } = teamTodayLines({ rows: [], answered, keptToday: 1, todayKey: TODAY });
    expect(lines.map((l) => `${l.label} · ${l.state}`)).toEqual(["Asks answered · 1 today, 1 kept in the Playbook"]);
  });

  it("leaves a trainer's own to-dos out, and says how many more chores sit behind the door", () => {
    const mine = template("mine", { title: "Call Hugo's physio", scope: "personal", kind: "facility", target: { kind: "facility" } });
    const many = Array.from({ length: CHORE_LINES_MAX + 2 }, (_, i) => row(template(`t${i}`, { title: `Chore ${i}`, kind: "facility", target: { kind: "facility" } }), undefined));
    const { lines, more } = teamTodayLines({ rows: [row(mine, undefined), ...many], answered: [], keptToday: 0, todayKey: TODAY });
    expect(lines.some((l) => l.label === "Call Hugo's physio")).toBe(false);
    expect(lines).toHaveLength(CHORE_LINES_MAX);
    expect(more).toBe(2);
  });
});

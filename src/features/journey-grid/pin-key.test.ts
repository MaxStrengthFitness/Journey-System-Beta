import { describe, expect, it } from "vitest";
import { cellsKey, columnsKey } from "./pin-key";
import type { GridSection } from "./JourneyGrid";
import type { JourneySession } from "./types";

const sessions = (n: number): JourneySession[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, sessionNumber: i + 1, date: `2026-09-${String(i + 1).padStart(2, "0")}`, trainerInitials: "AJ" }));

const section = (sets: Record<string, any>, extra: Partial<GridSection> = {}): GridSection => ({
  id: "routine",
  label: "Today's routine",
  rows: [{ machine: { id: "leg-press", name: "Leg Press" } as any, sets }],
  ...extra,
});

describe("when the grid pins itself again (pin-key, the iPad round, Oct 6 2026)", () => {
  it("is the same for a new array with the same columns: a set typed today lays nothing out", () => {
    const a = sessions(5);
    expect(columnsKey(a.map((s) => ({ ...s })))).toBe(columnsKey(a));
  });

  it("changes when a column comes, goes or its head changes", () => {
    const a = sessions(5);
    expect(columnsKey(sessions(6))).not.toBe(columnsKey(a));
    expect(columnsKey(a.slice(1))).not.toBe(columnsKey(a));
    expect(columnsKey(a.map((s, i) => (i === 4 ? { ...s, trainerInitials: "JC" } : s)))).not.toBe(columnsKey(a));
  });

  it("changes when a client's sets land after the sessions: the re-pin the observers missed", () => {
    const empty = [section({})];
    const landed = [section({ s0: { sessionId: "s0", outcome: "performed", weight: 116, reps: 10, quality: 2 } })];
    expect(cellsKey(landed)).not.toBe(cellsKey(empty));
  });

  it("changes when a past cell's words change, and not for a copy of the same cells", () => {
    const set = { sessionId: "s0", outcome: "performed", weight: 96, reps: 10, quality: 2 };
    const base = [section({ s0: set })];
    expect(cellsKey([section({ s0: { ...set } })])).toBe(cellsKey(base));
    expect(cellsKey([section({ s0: { ...set, weight: 100 } })])).not.toBe(cellsKey(base));
  });

  it("changes when a section opens or closes, and ignores the rows of a closed one", () => {
    const set = { sessionId: "s0", outcome: "performed", weight: 96, reps: 10, quality: 2 };
    const open = [section({ s0: set }, { collapsed: false })];
    const closed = [section({ s0: set }, { collapsed: true })];
    expect(cellsKey(closed)).not.toBe(cellsKey(open));
    expect(cellsKey([section({}, { collapsed: true })])).toBe(cellsKey(closed));
  });
});

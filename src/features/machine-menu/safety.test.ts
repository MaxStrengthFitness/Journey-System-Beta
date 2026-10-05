import { describe, expect, it } from "vitest";
import type { MachineNote } from "../../types";
import type { JournalEntry } from "../../types/journal";
import { LEG_PRESS_HISTORY, LEG_PRESS_JOURNAL, TODAY } from "./fixtures";
import { CRITICAL_UNREAD, criticalLinesOf, floorLineCount, safetySummary, type CriticalInput } from "./safety";
import { parseSettingHistory } from "./setting-history";

const HISTORY = parseSettingHistory(LEG_PRESS_HISTORY, "avery");
const note = LEG_PRESS_JOURNAL.find((e) => e.id === "n1")!;
const critical = (over: Partial<JournalEntry>): JournalEntry => ({ ...note, importance: "critical", ...over });

const base = (over: Partial<CriticalInput> = {}): CriticalInput => ({
  machineId: "leg-press",
  machineName: "Leg Press",
  journal: LEG_PRESS_JOURNAL,
  journalState: "ready",
  history: HISTORY,
  today: TODAY,
  ...over,
});

describe("the Critical notes on this machine", () => {
  it("are none for the design's client, whose notes are a Heads up and a Note", () => {
    expect(criticalLinesOf(base())).toEqual({ state: "ready", lines: [] });
  });

  it("are the open Critical thread roots, in the note's own words with its author and day", () => {
    const journal = [
      ...LEG_PRESS_JOURNAL,
      critical({ id: "c1", body: "Leg Press — Never past 90 degrees: hip replacement.", authorName: "Ana Cole", occurredAt: new Date("2026-09-30T10:00:00-04:00") }),
    ];
    const read = criticalLinesOf(base({ journal }));
    expect(read).toEqual({ state: "ready", lines: [{ id: "c1", words: "Never past 90 degrees: hip replacement.", who: "Ana", day: "2026-09-30" }] });
  });

  it("leave out a resolved or archived one, an update, and another machine's", () => {
    const journal = [
      critical({ id: "r", resolvedAt: new Date("2026-09-01T10:00:00-04:00") }),
      critical({ id: "a", isArchived: true }),
      note,
      critical({ id: "u", threadId: "n1" }),
      critical({ id: "x", machineId: "chest-press" }),
    ];
    expect(criticalLinesOf(base({ journal }))).toEqual({ state: "ready", lines: [] });
  });

  it("say an old-list note flagged important with no journal copy, and not one the journal already holds", () => {
    const legacy: MachineNote[] = [
      { id: "old-1", content: "maintenance: Seat pin sticks, check it locks.", authorId: "t", authorName: "Theo Marsh", timestamp: "2025-06-01T14:00:00.000Z", isImportant: true },
      { id: "old-2", content: "Quiet note", authorId: "t", authorName: "Theo Marsh", timestamp: "2025-06-02T14:00:00.000Z", isImportant: false },
      { id: "old-3", content: note.body, authorId: "t", authorName: "Theo Marsh", timestamp: "2025-06-03T14:00:00.000Z", isImportant: true },
    ];
    const read = criticalLinesOf(base({ legacy }));
    expect(read.state).toBe("ready");
    expect(read.state === "ready" && read.lines.map((l) => [l.id, l.words, l.who])).toEqual([["old-1", "Seat pin sticks, check it locks.", "Theo"]]);
  });

  it("are unknown when the journal couldn't be read, and nothing yet while it hasn't answered", () => {
    expect(criticalLinesOf(base({ journal: null, journalState: "failed" }))).toEqual({ state: "failed" });
    expect(criticalLinesOf(base({ journal: null, journalState: "loading" }))).toEqual({ state: "loading" });
    expect(CRITICAL_UNREAD).toBe("Critical notes couldn't be checked");
  });

  it("never hide a typed Set-up note when the setting changes couldn't be read", () => {
    const copy = { ...LEG_PRESS_JOURNAL.find((e) => e.id === "copy-2")!, importance: "critical" as const };
    expect(criticalLinesOf(base({ journal: [copy], history: HISTORY }))).toEqual({ state: "ready", lines: [] });
    const unread = criticalLinesOf(base({ journal: [copy], history: null }));
    expect(unread.state === "ready" && unread.lines.map((l) => l.id)).toEqual(["copy-2"]);
  });
});

describe("the strip's count", () => {
  it("counts every line it draws, a failed read included", () => {
    expect(floorLineCount({ status: "loading" })).toBe(0);
    expect(floorLineCount({ status: "failed" })).toBe(1);
    expect(floorLineCount({ status: "ready", open: [1, 2, 3, 4, 5, 6], note: {}, flag: {} })).toBe(6);
    expect(safetySummary({ critical: { state: "ready", lines: [] }, watchOuts: 0, floor: { status: "ready", open: [], note: null, flag: null } })).toEqual({
      count: 0,
      critical: false,
    });
    expect(
      safetySummary({
        critical: { state: "ready", lines: [{ id: "c", words: "w", who: "Ana", day: null }] },
        watchOuts: 2,
        floor: { status: "ready", open: [1], note: null, flag: null },
      }),
    ).toEqual({ count: 4, critical: true });
    expect(safetySummary({ critical: { state: "failed" }, watchOuts: 0, floor: { status: "loading" } })).toEqual({ count: 1, critical: false });
  });
});

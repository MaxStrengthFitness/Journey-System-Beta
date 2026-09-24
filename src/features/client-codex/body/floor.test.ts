import { describe, expect, it } from "vitest";
import type { ClientMachineSetting, Machine, Routine } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import { MACHINE_DEFINITIONS } from "../../../data/machine-definitions";
import { assembleThreads } from "../../client-notes/threads";
import { threadsByMachine } from "../../client-notes/record-selectors";
import { academyParts, floorEyebrow, floorReads, floorRows, noAcademyLine } from "./floor";

const TODAY = "2027-03-24";
const NOW = new Date(2027, 2, 24, 12);
const her = { possessive: "her", object: "her" };

const MACHINES = [
  { id: "m-leg-press", name: "Leg Press", order: 3 },
  { id: "m-compound-row", name: "Compound Row", order: 6 },
  { id: "m-chest-press", name: "Chest Press", order: 2 },
  { id: "m-bicep", name: "Bicep Curl", order: 9 },
] as Machine[];

const routine = (name: string, machineIds: string[]) => ({ id: name, clientId: "c1", name, machineIds }) as Routine;

function note(over: Partial<JournalEntry>): JournalEntry {
  return {
    id: over.id ?? "n1",
    clientId: "c1",
    studioId: "s1",
    kind: "equipment",
    category: null,
    body: "Seat 7, gap 6.",
    importance: "standard",
    machineId: "m-leg-press",
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jess",
    authorInitials: "JM",
    authorName: "Jess Moreno",
    occurredAt: new Date(2027, 2, 4, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  } as JournalEntry;
}

const bodyTypeOf = (id: string) => MACHINE_DEFINITIONS[id]?.bodyTypeAdjustments ?? null;

function rows(
  over: Partial<Parameters<typeof floorRows>[0]> & { notes?: JournalEntry[] } = {},
): ReturnType<typeof floorRows> {
  const { notes = [], ...rest } = over;
  return floorRows({
    machines: MACHINES,
    routines: [
      routine("Routine A", ["m-leg-press", "m-compound-row", "m-chest-press"]),
      routine("Routine B", ["m-bicep"]),
    ],
    isBActive: false,
    clientSettings: {},
    byMachine: threadsByMachine(assembleThreads(notes), TODAY),
    bodyTypeOf,
    band: "shorter",
    today: TODAY,
    now: NOW,
    ...rest,
  });
}

describe("On our floor", () => {
  it("puts her critical note first, then an important machine note, both above the Academy's words", () => {
    const settings: Record<string, ClientMachineSetting> = {
      "m-leg-press": {
        clientId: "c1",
        machineId: "m-leg-press",
        settings: {},
        machineNotes: [
          {
            id: "mn1",
            content: "One notch closer pinched.",
            authorName: "AJ",
            timestamp: new Date(2027, 2, 4, 9),
            isImportant: true,
          },
          {
            id: "mn2",
            content: "Not important.",
            authorName: "AJ",
            timestamp: new Date(2027, 2, 5, 9),
            isImportant: false,
          },
        ],
      } as ClientMachineSetting,
    };
    const view = rows({
      clientSettings: settings,
      notes: [
        note({ id: "std" }),
        note({ id: "crit", kind: "injury", importance: "critical", body: "Stop at 90° at the bottom turn." }),
      ],
    });
    const leg = view.rows.find((r) => r.machineId === "m-leg-press")!;
    expect(leg.hers.map((h) => (h.kind === "thread" ? h.threadId : h.body))).toEqual([
      "crit",
      "std",
      "One notch closer pinched.",
    ]);
    expect(leg.hers[2]).toMatchObject({ kind: "machineNote", meta: "AJ, Mar 4" });
    expect(leg.academy.length).toBeGreaterThan(0);
  });

  it("leaves a resolved note out", () => {
    const view = rows({ band: "average", notes: [note({ resolvedAt: new Date(2027, 2, 5) })] });
    expect(view.rows.find((r) => r.machineId === "m-leg-press")).toBeUndefined();
  });

  it("quotes the Academy's shorter-body column part by part, exactly as written", () => {
    const row = rows().rows.find((r) => r.machineId === "m-compound-row")!;
    const col = MACHINE_DEFINITIONS["m-compound-row"].bodyTypeAdjustments.shorterStature;
    expect(row.academy).toEqual([col.seatAdjustment, col.padHandlePlacement]);
    expect(academyParts(MACHINE_DEFINITIONS["m-compound-row"].bodyTypeAdjustments, "taller")[0]).toBe(
      'Set chest pad height to the "up" position.',
    );
  });

  it("gives an average build or no height no Academy column, and counts the machines with nothing to add", () => {
    const view = rows({ band: "average" });
    expect(view.rows).toEqual([]);
    expect(view.rest).toBe(3);
    expect(rows({ band: null }).rest).toBe(3);
    expect(noAcademyLine("average", her)).toBe(
      `Her height is within 3" of what our machines are set for, so the standard set-up applies.`,
    );
    expect(noAcademyLine(null, her)).toBe(
      "No height on file, so the Academy's shorter and taller set-ups can't be matched to her.",
    );
    expect(noAcademyLine("shorter", her)).toBeNull();
  });

  it("lists Routine B's machines only while B is on", () => {
    expect(rows().rows.some((r) => r.machineId === "m-bicep")).toBe(false);
    const withB = rows({ isBActive: true });
    expect(withB.rows.find((r) => r.machineId === "m-bicep")?.prescribedIn).toEqual(["B"]);
  });

  it("keeps Routine A's order, then a floor machine that only carries her note", () => {
    const view = rows({
      band: "average",
      routines: [routine("Routine A", ["m-compound-row", "m-leg-press"])],
      notes: [
        note({ id: "a", machineId: "m-leg-press" }),
        note({ id: "b", machineId: "m-chest-press" }),
        note({ id: "c", machineId: "m-compound-row" }),
      ],
    });
    expect(view.rows.map((r) => [r.machineId, r.prescribedIn])).toEqual([
      ["m-compound-row", ["A"]],
      ["m-leg-press", ["A"]],
      ["m-chest-press", []],
    ]);
  });

  it("names the card for the band", () => {
    expect(floorEyebrow("shorter", her)).toBe("On our floor · set-up for a shorter body");
    expect(floorEyebrow("taller", her)).toBe("On our floor · set-up for a taller body");
    expect(floorEyebrow("average", her)).toBe("On our floor · her notes by machine");
  });
});

describe("what the card may claim while a read is out", () => {
  it("claims everything once her programme and the catalog answered", () => {
    expect(floorReads({ band: "shorter", programme: "ready", catalog: "ready", pronouns: her })).toEqual({
      programmeKnown: true,
      academyKnown: true,
      fit: "ready",
      lines: [],
    });
  });

  it("holds back the standard set-up count and says so while the Academy's text loads", () => {
    const reads = floorReads({ band: "taller", programme: "ready", catalog: "loading", pronouns: her });
    expect(reads.academyKnown).toBe(false);
    expect(reads.fit).toBe("loading");
    expect(reads.lines).toEqual(["Loading the Academy's set-up…"]);
  });

  it("never reads a failed catalog as no Academy text, and machine fit's count as unknown", () => {
    const reads = floorReads({ band: "shorter", programme: "ready", catalog: "failed", pronouns: her });
    expect(reads.academyKnown).toBe(false);
    expect(reads.fit).toBe("failed");
    expect(reads.lines).toEqual(["The Academy's set-up couldn't be loaded just now, so it isn't shown."]);
  });

  it("needs no catalog for the Academy when her band has no column, but machine fit still does", () => {
    const reads = floorReads({ band: "average", programme: "ready", catalog: "loading", pronouns: her });
    expect(reads.academyKnown).toBe(true);
    expect(reads.fit).toBe("loading");
    expect(reads.lines).toEqual([]);
  });

  it("never says she has no machines while her routines or settings are out", () => {
    const loading = floorReads({ band: null, programme: "loading", catalog: "ready", pronouns: her });
    expect(loading.programmeKnown).toBe(false);
    expect(loading.lines).toEqual(["Loading her routines and machine settings…"]);
    const failed = floorReads({ band: null, programme: "failed", catalog: "ready", pronouns: her });
    expect(failed.programmeKnown).toBe(false);
    expect(failed.fit).toBe("failed");
    expect(failed.lines).toEqual([
      "Her routines or machine settings couldn't be loaded just now, so a machine may be missing.",
    ]);
  });
});

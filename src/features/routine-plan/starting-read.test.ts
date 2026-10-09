/**
 * Starting routines as they come back from the database, and a studio's
 * choice (starting-read.ts): every document checked, a value that isn't
 * usable skipped, and a read that hasn't answered unknown, never "none".
 */
import { describe, expect, it } from "vitest";
import { normalizeRoutinePreset } from "../../lib/routine-templates";
import {
  NO_CHOICE,
  STARTING_CHOICE_MAX,
  routinesToOffer,
  seededFrom,
  startingChoiceFromDoc,
  startingChoiceToWrite,
  startingRoutinesFromPresets,
} from "./starting-read";
import { academyStartingRoutines } from "./starting-routines";

const start = (over: Record<string, unknown> = {}) => ({ dayOne: ["m-leg-press", "m-compound-row"], ...over });

describe("starting routines from the two reads", () => {
  it("keeps head office's presets that have a start part, then the studio's own, each in the order a trainer looks", () => {
    const routines = startingRoutinesFromPresets(
      [
        { id: "goal", name: "Stronger arms", tier: "company", scope: "global", machineIds: [], start: start({ kind: "goal" }) },
        { id: "plain", name: "Company template", tier: "company", scope: "global", machineIds: ["m-leg-press"] },
        { id: "knee", name: "Knee issues", tier: "company", scope: "global", machineIds: [], start: start({ kind: "condition" }) },
        { id: "clear", name: "No reported issues", tier: "company", scope: "global", machineIds: [], start: start({ kind: "clear" }) },
      ],
      [{ id: "ours", name: "Westlake's walk-in", tier: "studio", scope: "westlake", studioId: "westlake", machineIds: [], start: start() }],
      "westlake",
    );
    expect(routines.map((r) => r.id)).toEqual(["clear", "knee", "goal", "ours"]);
    expect(routines.find((r) => r.id === "ours")).toMatchObject({ tier: "studio", studioId: "westlake" });
  });

  it("never shows another studio's routines, a trainer's saved preset, or the same id twice", () => {
    const routines = startingRoutinesFromPresets(
      [
        { id: "a", name: "A", tier: "company", scope: "global", machineIds: [], start: start() },
        { id: "a", name: "A again", tier: "company", scope: "global", machineIds: [], start: start() },
        { id: "theirs", name: "Theirs", tier: "studio", scope: "solon", machineIds: [], start: start() },
      ],
      [
        { id: "solon-own", name: "Solon's", tier: "studio", scope: "solon", studioId: "solon", machineIds: [], start: start() },
        { id: "saved", name: "Saved by a trainer", tier: "trainer", scope: "westlake", machineIds: [], start: start() },
      ],
      "westlake",
    );
    expect(routines.map((r) => r.id)).toEqual(["a"]);
  });

  it("reads no studio's own when no studio is named", () => {
    const routines = startingRoutinesFromPresets(
      [],
      [{ id: "ours", name: "Ours", tier: "studio", scope: "westlake", studioId: "westlake", machineIds: [], start: start() }],
      null,
    );
    expect(routines).toEqual([]);
  });
});

describe("the studio's choice", () => {
  it("is 'hasn't chosen' with no document, or a use that isn't a list", () => {
    expect(startingChoiceFromDoc(undefined)).toEqual({ use: null, defaultId: null });
    expect(startingChoiceFromDoc({ use: "academy-knee", defaultId: 4 })).toEqual({ use: null, defaultId: null });
  });

  it("is exactly the routines ticked, an empty list included, each id once, and its default", () => {
    expect(startingChoiceFromDoc({ use: [" academy-knee", "academy-knee", "", 7, "academy-core"], defaultId: " academy-core " })).toEqual({
      use: ["academy-knee", "academy-core"],
      defaultId: "academy-core",
    });
    expect(startingChoiceFromDoc({ use: [], defaultId: null })).toEqual({ use: [], defaultId: null });
  });

  it("is written clean, and refused in words before the rules would refuse it", () => {
    expect(startingChoiceToWrite({ use: [" a", "a", "b"], defaultId: "  " })).toEqual({ use: ["a", "b"], defaultId: null });
    expect(startingChoiceToWrite(NO_CHOICE)).toEqual({ use: null, defaultId: null });
    const tooMany = Array.from({ length: STARTING_CHOICE_MAX + 2 }, (_, i) => `r-${i}`);
    expect(() => startingChoiceToWrite({ use: tooMany, defaultId: null })).toThrow(/up to 80 starting routines. Untick 2/);
    expect(() => startingChoiceToWrite({ use: null, defaultId: "x".repeat(201) })).toThrow(/Pick it again/);
  });
});

describe("what Start a plan offers", () => {
  const academy = academyStartingRoutines();

  it("offers the app's starting routines when the read found any", () => {
    const mine = [academy[3]!];
    expect(routinesToOffer({ routines: mine, known: true })).toEqual({ routines: mine, fromCode: false });
  });

  it("falls back to the Academy's eleven before the seed has run, or when the read didn't answer", () => {
    for (const answer of [{ routines: [], known: true }, { routines: [], known: false }, null]) {
      const offered = routinesToOffer(answer);
      expect(offered.fromCode).toBe(true);
      expect(offered.routines.map((r) => r.id)).toEqual(academy.map((r) => r.id));
    }
  });

  /*
   * The whole-branch review (Oct 9 2026): "none" was always read as "before
   * the seed", so a studio whose administrator retired every starting
   * routine was offered the Academy's eleven again, and a studio that made
   * one of its own before the seed lost the Academy's. Only head office's
   * routines, and the seed's own traces, decide it.
   */
  it("after the seed, every one retired is an empty offer, never the Academy's eleven back", () => {
    expect(routinesToOffer({ routines: [], known: true, seeded: true })).toEqual({ routines: [], fromCode: false });
  });

  it("before the seed, a studio's own routine sits beside the Academy's eleven, never in place of them", () => {
    const own = { ...academy[0]!, id: "w-walkin", name: "Walk-in", tier: "studio" as const, studioId: "westlake" };
    const offered = routinesToOffer({ routines: [own], known: true });
    expect(offered.fromCode).toBe(true);
    expect(offered.routines.map((r) => r.id)).toEqual([...academy.map((r) => r.id), "w-walkin"]);
    // After the seed, the studio's own is offered with what head office has: here, nothing more.
    expect(routinesToOffer({ routines: [own], known: true, seeded: true })).toEqual({ routines: [own], fromCode: false });
  });

  it("knows the seed ran from a starting routine, one switched off, or a seeded id, and not from an ordinary template", () => {
    expect(seededFrom([{ id: "p1", name: "P", machineIds: [], start: { dayOne: ["m-leg-press"] } } as never])).toBe(true);
    expect(seededFrom([{ id: "p2", name: "P", machineIds: [], startParked: { dayOne: ["m-leg-press"] } } as never])).toBe(true);
    expect(seededFrom([{ id: "academy-knee", name: "Knee", machineIds: [] } as never])).toBe(true);
    expect(seededFrom([{ id: "upper-lower", name: "Upper / lower", machineIds: ["m-leg-press"] } as never])).toBe(false);
    expect(seededFrom([])).toBe(false);
  });
});

describe("a preset's start part survives the template editor's read", () => {
  it("is carried through normalizeRoutinePreset, and absent where it was absent", () => {
    const withStart = normalizeRoutinePreset({ id: "p", name: "P", machineIds: [], scope: "global", start: { dayOne: ["m-leg-press"] } });
    expect(withStart.start).toEqual({ dayOne: ["m-leg-press"] });
    expect("start" in normalizeRoutinePreset({ id: "q", name: "Q", machineIds: [], scope: "global" })).toBe(false);
  });
});

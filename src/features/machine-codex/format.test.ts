import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../data/machine-definitions";
import type { MachineDefinition } from "../../types/machines";
import {
  CODEX_LEAVES,
  coverageSentence,
  methodLines,
  presetLine,
  presetOf,
  sourceCoverage,
  sourceFor,
  sourceLabel,
  stopLinesOf,
  switchWords,
  switchesOf,
} from "./format";

const legPress = MACHINE_DEFINITIONS["m-leg-press"] as MachineDefinition;
const compoundRow = MACHINE_DEFINITIONS["m-compound-row"] as MachineDefinition;
const cervical = MACHINE_DEFINITIONS["m-neck"] as MachineDefinition;

describe("the twelve leaves", () => {
  it("run as the timeline of a set, then study, then the data", () => {
    expect(CODEX_LEAVES.map((l) => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(CODEX_LEAVES[0].title).toBe("Stop");
    expect(CODEX_LEAVES.filter((l) => l.tier === "floor").map((l) => l.id)).toEqual([
      "stop",
      "setup",
      "getset",
      "begin",
      "rep",
      "finish",
      "wrong",
    ]);
    // Nobody types the twelfth: it is built from Journey's own data.
    expect(CODEX_LEAVES[11]).toMatchObject({ id: "floor", tier: "computed" });
  });
});

describe("switchesOf", () => {
  it("reads the three the machine already had from the one field that holds each", () => {
    expect(switchesOf(legPress)).toMatchObject({ beginsWith: "loadUp", neverToFailure: false });
    expect(switchesOf(compoundRow).beginsWith).toBe("handoff");
    const cx = switchesOf(cervical);
    expect(cx.neverToFailure).toBe(true);
    expect(cx.safetyNotice).toContain("NEVER take Cervical Extension to failure");
    expect(cx.upperTurn).toBe("pauseSqueeze");
  });

  it("reads v2's own switches, and ignores ones in the wrong shape", () => {
    const s = switchesOf({
      ...cervical,
      switches: { lowerTurn: "jointLimited", repCap: 8, tscCapable: true, unloadTransfer: true },
    });
    expect(s).toMatchObject({ lowerTurn: "jointLimited", repCap: 8, tscCapable: true, unloadTransfer: true });
    const odd = switchesOf({ ...legPress, switches: { lowerTurn: "sideways" as never, repCap: -3 } });
    expect(odd.lowerTurn).toBeUndefined();
    expect(odd.repCap).toBeUndefined();
  });

  it("says them in words, never to failure among them", () => {
    const words = switchWords(switchesOf({ ...cervical, switches: { repCap: 8, unloadTransfer: true } }));
    expect(words[0]).toBe("Begins with a handoff");
    expect(words).toContain("Never to failure");
    expect(words).toContain("No more than 8 reps early on");
    expect(words).toContain("The trainer takes the weight back at the end");
  });

  it("answers for a blank or missing machine without throwing", () => {
    expect(switchesOf(undefined)).toEqual({ beginsWith: "loadUp", neverToFailure: false });
    expect(switchesOf({})).toEqual({ beginsWith: "loadUp", neverToFailure: false });
  });
});

describe("the preset strip", () => {
  it("says there are no numbers rather than inventing any", () => {
    // The Leg Press's twenty-machine data has no dial defaults, and the
    // Academy states none for it (the codex source check).
    const p = presetOf(legPress);
    expect(p.state).toBe("none");
    expect(presetLine(p)).toBe("No numbers set for this unit yet");
  });

  it("prints each dial's letter and this unit's number: G 4 · P 2 · SP 3 · S 8", () => {
    const lettered: MachineDefinition = {
      ...legPress,
      settingFields: [
        { key: "gap", label: "Gap", type: "text", letter: "G" },
        { key: "seat-angle", label: "Seat Angle", type: "text", letter: "P" },
        { key: "shoulder-pads", label: "Shoulder Pads", type: "text", letter: "SP" },
        { key: "seat-distance", label: "Seat Distance", type: "text", letter: "S" },
      ],
      defaultSettings: { gap: "4", "seat-angle": "2", "shoulder-pads": "3", "seat-distance": "8" },
    };
    expect(presetLine(presetOf(lettered))).toBe("G 4 · P 2 · SP 3 · S 8");
  });

  it("takes the studio's own setup card first, then the unit's defaults", () => {
    const def: MachineDefinition = { ...legPress, defaultSettings: { gap: "3", "seat-distance": "7" } };
    const p = presetOf(def, { Gap: "5" });
    expect(p.dials.find((d) => d.key === "gap")?.number).toBe("5");
    expect(p.dials.find((d) => d.key === "seat-distance")?.number).toBe("7");
    expect(p.state).toBe("partial");
    expect(presetLine(p)).toBe("Gap 5 · Seat Distance 7 · 2 not set");
  });

  it("numbers the callouts by their place unless the drawing says otherwise, and carries the rule", () => {
    const def: MachineDefinition = {
      ...legPress,
      settingFields: [
        { key: "gap", label: "Gap", type: "text", callout: 4 },
        { key: "seat-angle", label: "Seat Angle", type: "text" },
      ],
      dialRules: { gap: { rule: "A bigger gap means less range.", firstSetup: "Start at the model's default." } },
    };
    const p = presetOf(def);
    expect(p.dials.map((d) => d.callout)).toEqual([4, 2]);
    expect(p.dials[0]).toMatchObject({ rule: "A bigger gap means less range.", firstSetup: "Start at the model's default." });
    expect(p.dials[1].rule).toBeUndefined();
  });

  it("says when the unit has no dials at all", () => {
    expect(presetLine(presetOf({ ...legPress, settingFields: [] }))).toBe("No dials recorded for this unit");
  });
});

describe("the stop rules", () => {
  it("puts never to failure first, with its reason", () => {
    const lines = stopLinesOf(cervical);
    expect(lines[0].kind).toBe("never-to-failure");
    expect(lines[0].why).toContain("Stop the set early");
  });

  it("gives never to failure a reason even when none was written", () => {
    const lines = stopLinesOf({ ...legPress, execution: { ...legPress.execution, neverToFailure: true } });
    expect(lines[0].why).toBe("Stop the set while it is still controlled.");
  });

  it("adds the v2 stop rules after it and skips a blank one", () => {
    const lines = stopLinesOf({
      ...legPress,
      stopRules: [
        { text: "The knees never lock out at the end stop.", why: "The quads unload at lock-out." },
        { text: "   " },
        { text: "Head pain is an exertion headache: unload and stop." },
      ],
    });
    expect(lines.map((l) => l.kind)).toEqual(["stop-rule", "stop-rule"]);
    expect(lines[0].why).toBe("The quads unload at lock-out.");
    expect(lines[1].why).toBeUndefined();
  });

  it("has nothing to pin on a machine with no stop rule", () => {
    expect(stopLinesOf(legPress)).toEqual([]);
  });
});

describe("every method line, and its source", () => {
  it("lists the Leg Press's own lines, one per list entry", () => {
    const lines = methodLines(legPress);
    expect(lines.length).toBeGreaterThan(20);
    const warnings = lines.filter((l) => l.path === "clinicalWarnings");
    expect(warnings).toHaveLength(legPress.clinicalWarnings.length);
    expect(warnings[0].line).toBe(legPress.clinicalWarnings[0]);
    // A blank field is not a line.
    expect(lines.some((l) => l.path === "universalBaseline.padAxisAlignment")).toBe(false);
  });

  it("files a source on exactly the line it names", () => {
    const qrg = "Initial Setups (Comprehensive Overview)/Quick Reference Guides/LP – Quick Reference Guide.txt";
    const def: MachineDefinition = {
      ...legPress,
      sources: [
        { path: "execution.loadUpProtocol", kind: "academy", ref: qrg, at: "Load Up" },
        { path: "contraindicatedFor", line: "Knee Replacement", kind: "unsourced", conflict: "Academy 6.1 includes the Leg Press after physical therapy." },
      ],
    };
    const lines = methodLines(def);
    expect(lines.find((l) => l.path === "execution.loadUpProtocol")?.source?.kind).toBe("academy");
    expect(lines.find((l) => l.line === "Knee Replacement")?.source?.conflict).toContain("Academy 6.1");
    expect(lines.find((l) => l.line === "Lumbar Issues")?.source).toBeUndefined();
    expect(sourceFor(def, "contraindicatedFor", "Knee Replacement")?.kind).toBe("unsourced");
  });

  it("counts what says where it came from, and where the sources disagree", () => {
    const def: MachineDefinition = {
      ...legPress,
      sources: [
        { path: "clinicalNote", kind: "guide" },
        { path: "contraindicatedFor", line: "Knee Replacement", kind: "unsourced", conflict: "Academy 6.1" },
      ],
    };
    const c = sourceCoverage(def);
    expect(c.sourced).toBe(1);
    expect(c.conflicts).toHaveLength(1);
    expect(coverageSentence(c)).toBe(`1 of ${c.lines} lines say where they come from · 1 where the sources disagree.`);
    expect(coverageSentence(sourceCoverage(legPress))).toBe(
      `None of its ${methodLines(legPress).length} lines has a source recorded yet.`,
    );
  });

  it("paraphrases a book and never pretends to quote it", () => {
    expect(
      sourceLabel({ path: "understand.why", kind: "book", ref: "The Renaissance of Exercise (Ken Hutchins)", at: "Vol. 1" }),
    ).toBe("Paraphrased from The Renaissance of Exercise (Ken Hutchins) · Vol. 1");
    expect(sourceLabel({ path: "x", kind: "academy", ref: "Academy/Academy 4 - Exercise Performance/4.6 Turnaround Technique.txt" })).toBe(
      "4.6 Turnaround Technique",
    );
    expect(sourceLabel(undefined)).toBe("No source recorded");
  });

  it("reads a v2 leaf's lines where they belong", () => {
    const lines = methodLines({
      ...compoundRow,
      begin: { delayHandoffWhen: "If she can't stabilise, hold the handoff back." },
      faults: [{ fault: "Pulling with the arms", say: "drive your elbows back" }],
      ifWrong: [{ title: "Shoulder pinch", steps: ["Stop the set.", "Lower the chest pad a notch."], stop: true }],
    });
    expect(lines.find((l) => l.path === "begin.delayHandoffWhen")?.leaf).toBe("begin");
    expect(lines.find((l) => l.path === "faults")?.text).toContain("say “drive your elbows back”");
    expect(lines.find((l) => l.path === "ifWrong")?.leaf).toBe("wrong");
  });

  it("does not throw on a partial or missing machine", () => {
    expect(methodLines(undefined)).toEqual([]);
    expect(methodLines({ name: "Minas Tirith Sled" })).toEqual([]);
  });
});

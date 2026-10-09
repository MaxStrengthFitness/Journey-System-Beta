import { describe, expect, it } from "vitest";
import { SELECTION_TEMPLATES } from "../routine-builder/academy";
import { findViolations } from "../routine-builder/engine";
import { suggestBSwaps } from "./b-routine";
import { TEMPLATE_SOURCE, startingPlanFrom, suggestStartingPlan, type FloorMachine } from "./starting-plan";
import {
  academyRoutineId,
  academyStartingRoutines,
  academyTemplateOf,
  matchedWord,
  startingPlanFromRoutine,
  startingRoutineFromPreset,
  suggestFromStartingRoutines,
  type StartingRoutine,
} from "./starting-routines";

/** The twenty MSF machines, as a floor that uses the catalog ids. */
const ALL: FloorMachine[] = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
].map((id) => ({ id }));

const ACADEMY = academyStartingRoutines();
const byId = (id: string) => ACADEMY.find((r) => r.id === id)!;
const who = { uid: "u-sam", name: "Sam" };

describe("the Academy's eleven as starting routines", () => {
  it("brings in every template, named without the Academy's sex split", () => {
    expect(ACADEMY).toHaveLength(SELECTION_TEMPLATES.length);
    for (const r of ACADEMY) {
      expect(r.id).toMatch(/^academy-/);
      expect(r.name).not.toMatch(/\b(female|male|woman|man|women|men)\b/i);
      expect(r.tier).toBe("company");
      expect(r.isDefault).toBe(false);
      expect(r.source).toBe(TEMPLATE_SOURCE);
    }
    expect(new Set(ACADEMY.map((r) => r.name)).size).toBe(ACADEMY.length);
    expect(byId("academy-low-back").name).toBe("Low back issues");
  });

  it("gives every one an id without a gender, since ids are stored where nobody renames them", () => {
    for (const r of ACADEMY) expect(r.id).not.toMatch(/(fe)?male|wom[ae]n|\bm[ae]n\b/i);
    expect(new Set(ACADEMY.map((r) => r.id)).size).toBe(ACADEMY.length);
    expect(academyRoutineId("clear-female")).toBe("academy-clear-dip-adduction");
    expect(academyRoutineId("clear-male")).toBe("academy-clear-chest-pulldown");
    expect(academyRoutineId("knee")).toBe("academy-knee");
  });

  it("names the two no-reported-issues rows by machines each road has and the other's hasn't", () => {
    const a = byId("academy-clear-dip-adduction");
    const b = byId("academy-clear-chest-pulldown");
    const named: Record<string, string> = {
      "Seated Dip": "m-dip",
      Adduction: "m-hip-add",
      "Chest Press": "m-chest-press",
      Pulldown: "m-pulldown",
    };
    for (const [mine, other] of [
      [a, b],
      [b, a],
    ] as const) {
      const said = mine.name.replace(/^No reported issues · with /, "").split(" and ");
      expect(said).toHaveLength(2);
      for (const name of said) {
        expect(mine.machineIds).toContain(named[name]);
        expect(other.machineIds).not.toContain(named[name]);
      }
    }
  });

  it("is the road and day one the Academy's own path makes, so the seed and the fallback agree", () => {
    for (const t of SELECTION_TEMPLATES) {
      const r = byId(academyRoutineId(t.id));
      const legacy = startingPlanFrom(suggestStartingPlan({ floor: ALL, templateId: t.id }), who);
      expect(r.machineIds, t.id).toEqual(legacy.plan.intended);
      expect(r.dayOne, t.id).toEqual(legacy.startWith);
      expect(r.matchWords.slice(0, t.keywords.length)).toEqual(t.keywords.map((k) => k.toLowerCase()));
      expect(r.kind, t.id).toBe(t.kind);
    }
  });

  it("adds the forms the whole-word rule would miss, so a disc or a kneecap still finds its routine", () => {
    expect(byId("academy-low-back").matchWords).toContain("discectomy");
    expect(byId("academy-knee").matchWords).toEqual(expect.arrayContaining(["kneecap", "kneel"]));
    expect(byId("academy-elbow-hand-wrist").matchWords).toContain("gripping");
    const pick = (intakeText: string) =>
      suggestFromStartingRoutines({ routines: ACADEMY, choice: null, intakeText, floor: ALL });
    expect(pick("L4-L5 discectomy in 2019").templateId).toBe("academy-low-back");
    expect(pick("Dislocated kneecap as a teen").templateId).toBe("academy-knee");
    expect(pick("It hurts to kneel").templateId).toBe("academy-knee");
    expect(pick("Gripping the handles hurts").templateId).toBe("academy-elbow-hand-wrist");
    // Still never inside an unrelated word.
    expect(pick("Some discomfort, absolutely fine beforehand").templateId).toBeNull();
  });

  it("starts with no sequencing rule broken on day one, every one", () => {
    for (const r of ACADEMY) {
      expect(r.dayOne.every((id) => r.machineIds.includes(id)), r.id).toBe(true);
      expect(findViolations(r.dayOne).filter((v) => v.severity === "avoid"), r.id).toEqual([]);
    }
  });

  it("says what each workout adds, and only that", () => {
    const chestPulldown = byId("academy-clear-chest-pulldown");
    expect(chestPulldown.steps).toEqual([
      { label: "Consultation", machineIds: ["m-compound-row", "m-lumbar", "m-leg-press"] },
      { label: "First workout adds", machineIds: ["m-chest-press", "m-overhead-press"] },
      { label: "Second workout adds", machineIds: ["m-pulldown"] },
    ]);
    for (const r of ACADEMY) {
      const all = r.steps!.flatMap((s) => s.machineIds);
      expect(new Set(all).size, r.id).toBe(all.length);
      expect([...all].sort(), r.id).toEqual([...r.machineIds].sort());
    }
  });

  it("lists the plain rows first, then conditions, then goals", () => {
    const kinds = ACADEMY.map((r) => SELECTION_TEMPLATES.find((t) => academyRoutineId(t.id) === r.id)!.kind);
    expect(kinds.slice(0, 2)).toEqual(["clear", "clear"]);
    expect(kinds.lastIndexOf("condition")).toBeLessThan(kinds.indexOf("goal"));
  });
});

describe("a stored routine preset as a starting routine", () => {
  const preset = {
    id: "p-1",
    name: " Low back, gentle ",
    machineIds: ["m-compound-row", "m-leg-press", "m-hip-abd"],
    tier: "company" as const,
    scope: "global",
    start: {
      dayOne: ["m-lumbar", "m-compound-row", "m-lumbar"],
      steps: [{ label: "Week two adds", machineIds: ["m-hip-abd", "m-abs"] }, { label: "  ", machineIds: ["m-neck"] }],
      matchWords: ["Low Back", "sciatica", "", 7],
      default: true,
      source: " Westlake's own ",
    },
  };

  it("reads a preset with a start part, checking every field", () => {
    const r = startingRoutineFromPreset(preset)!;
    expect(r).toEqual({
      id: "p-1",
      name: "Low back, gentle",
      // Day one's Lumbar wasn't on the road: it goes first. A step's Abdominals
      // goes after, and so does the unlabelled step's Neck: nothing an admin
      // wrote disappears.
      machineIds: ["m-lumbar", "m-compound-row", "m-leg-press", "m-hip-abd", "m-abs", "m-neck"],
      dayOne: ["m-lumbar", "m-compound-row"],
      steps: [{ label: "Week two adds", machineIds: ["m-hip-abd", "m-abs"] }],
      matchWords: ["low back", "sciatica"],
      isDefault: true,
      source: "Westlake's own",
      tier: "company",
    });
  });

  it("is no starting routine without a start part, a day one or an id, or when a trainer saved it", () => {
    expect(startingRoutineFromPreset({ ...preset, start: undefined })).toBeNull();
    expect(startingRoutineFromPreset({ ...preset, start: { dayOne: [] } })).toBeNull();
    expect(startingRoutineFromPreset({ ...preset, id: undefined })).toBeNull();
    expect(startingRoutineFromPreset({ ...preset, tier: "trainer" })).toBeNull();
    expect(startingRoutineFromPreset({ ...preset, tier: undefined, scope: "studio-1" })).toBeNull();
    expect(startingRoutineFromPreset(null)).toBeNull();
  });

  it("keeps a studio's own with its studio, from its scope when that is all it says", () => {
    const r = startingRoutineFromPreset({ ...preset, tier: "studio", studioId: "s-west" })!;
    expect(r.tier).toBe("studio");
    expect(r.studioId).toBe("s-west");
    expect(startingRoutineFromPreset({ ...preset, studioId: "s-west" })!.studioId).toBeUndefined();
    // normalizeRoutinePreset's rule: a scope that isn't "global" is the studio.
    expect(startingRoutineFromPreset({ ...preset, tier: "studio", scope: "s-solon" })!.studioId).toBe("s-solon");
  });

  it("makes only a company routine head office's default", () => {
    expect(startingRoutineFromPreset(preset)!.isDefault).toBe(true);
    expect(startingRoutineFromPreset({ ...preset, tier: "studio", studioId: "s-west" })!.isDefault).toBe(false);
  });

  it("reads the kind only when it is one of the Academy's", () => {
    expect(startingRoutineFromPreset({ ...preset, start: { ...preset.start, kind: "condition" } })!.kind).toBe("condition");
    expect("kind" in startingRoutineFromPreset({ ...preset, start: { ...preset.start, kind: "urgent" } })!).toBe(false);
    expect("kind" in startingRoutineFromPreset(preset)!).toBe(false);
  });
});

describe("matching the intake, whole words", () => {
  it("matches whole words and plurals, never inside another word, and says the intake's word", () => {
    expect(matchedWord(["disc"], "Two bulging discs")).toBe("discs");
    expect(matchedWord(["disc"], "Some discomfort after lifting")).toBeNull();
    expect(matchedWord(["abs"], "Absolutely fine")).toBeNull();
    expect(matchedWord(["hand"], "Told me beforehand")).toBeNull();
    expect(matchedWord(["knee"], "Both KNEES ache")).toBe("knees");
  });

  it("lets a longer word match as a stem, and says the whole word, never the stem", () => {
    expect(matchedWord(["patell"], "Patellar tendinitis")).toBe("patellar");
    expect(matchedWord(["spondyl"], "lumbar spondylosis")).toBe("spondylosis");
    const s = suggestFromStartingRoutines({ routines: ACADEMY, choice: null, intakeText: "Patellar tendinitis", floor: ALL });
    expect(s.why).toBe("Matched from the intake: patellar");
  });

  it("matches a phrase across any spacing, and says which word matched", () => {
    expect(matchedWord(["low back", "lower back"], "Lower   back pain")).toBe("lower back");
    expect(matchedWord(["low back"], "fellow backpacker")).toBeNull();
    expect(matchedWord(["knee"], null)).toBeNull();
  });
});

describe("which starting routine fits", () => {
  it("takes the routine the intake names first, and says the word", () => {
    const s = suggestFromStartingRoutines({ routines: ACADEMY, choice: null, intakeText: "Lower back pain after lifting boxes", floor: ALL });
    expect(s.templateId).toBe("academy-low-back");
    expect(s.why).toBe("Matched from the intake: lower back");
    expect(s.needsChoice).toBe(false);
    expect(s.label).toBe("Low back issues");
    expect(s.source).toBe(TEMPLATE_SOURCE);
  });

  it("ranks a condition before a goal", () => {
    const s = suggestFromStartingRoutines({ routines: ACADEMY, choice: null, intakeText: "Wants bigger arms; wrist pain", floor: ALL });
    expect(s.templateId).toBe("academy-elbow-hand-wrist");
    expect(s.alternatives[0].templateId).toBe("academy-arms");
  });

  it("ranks the same however the routines arrive, the seeded documents in id order included", () => {
    const byIdOrder = [...ACADEMY].sort((a, b) => a.id.localeCompare(b.id));
    const reversed = [...ACADEMY].reverse();
    for (const routines of [byIdOrder, reversed]) {
      const arms = suggestFromStartingRoutines({ routines, choice: null, intakeText: "Wants bigger arms; wrist pain", floor: ALL });
      expect(arms.templateId).toBe("academy-elbow-hand-wrist");
      expect(arms.why).toBe("Matched from the intake: wrist");
      const shoulders = suggestFromStartingRoutines({
        routines,
        choice: null,
        intakeText: "rounded shoulders and shoulder impingement",
        floor: ALL,
      });
      expect(shoulders.templateId).toBe("academy-shoulder");
      // The list a trainer picks from is grouped the same too: no reported
      // issues, then conditions, then goals (within a group, as they came).
      const none = suggestFromStartingRoutines({ routines, choice: null, floor: ALL });
      const kinds = none.alternatives.map((a) => byId(a.templateId).kind);
      expect(kinds).toEqual(ACADEMY.map((r) => r.kind));
    }
  });

  it("gives a client whose intake names nothing the studio's default, then head office's", () => {
    const studio = suggestFromStartingRoutines({
      routines: ACADEMY,
      choice: { use: null, defaultId: "academy-clear-chest-pulldown" },
      intakeText: "Wants to feel stronger",
      floor: ALL,
      studioName: "Westlake",
    });
    expect(studio.templateId).toBe("academy-clear-chest-pulldown");
    expect(studio.why).toBe("Westlake's default");
    expect(
      suggestFromStartingRoutines({ routines: ACADEMY, choice: { use: null, defaultId: "academy-clear-chest-pulldown" }, floor: ALL }).why,
    ).toBe("This studio's default");

    const routines = ACADEMY.map((r) => (r.id === "academy-clear-dip-adduction" ? { ...r, isDefault: true } : r));
    const headOffice = suggestFromStartingRoutines({ routines, choice: null, floor: ALL });
    expect(headOffice.templateId).toBe("academy-clear-dip-adduction");
    expect(headOffice.why).toBe("Head office's default");
    // A studio's own routine is never called head office's default.
    const studioOwn = ACADEMY.map((r) =>
      r.id === "academy-clear-dip-adduction" ? { ...r, isDefault: true, tier: "studio" as const, studioId: "s-west" } : r,
    );
    const notHeadOffice = suggestFromStartingRoutines({ routines: studioOwn, choice: null, floor: ALL });
    expect(notHeadOffice.templateId).toBeNull();
    expect(notHeadOffice.why).toBe("Pick which starting routine fits");
    // The studio's own default comes before head office's.
    expect(suggestFromStartingRoutines({ routines, choice: { use: null, defaultId: "academy-knee" }, floor: ALL }).templateId).toBe(
      "academy-knee",
    );
  });

  it("asks the trainer to pick when there is no match and no default, and picks nothing", () => {
    const s = suggestFromStartingRoutines({ routines: ACADEMY, choice: null, intakeText: "", floor: ALL });
    expect(s.needsChoice).toBe(true);
    expect(s.templateId).toBeNull();
    expect(s.steps).toEqual([]);
    expect(s.why).toBe("Pick which starting routine fits");
    expect(s.alternatives).toHaveLength(ACADEMY.length);
    // Shown by their machines, so two similar names are told apart.
    for (const a of s.alternatives) expect(a.machineIds.length).toBeGreaterThan(0);
  });

  it("offers exactly the routines the studio chose, and none it left out", () => {
    const only = suggestFromStartingRoutines({
      routines: ACADEMY,
      choice: { use: ["academy-knee", "academy-clear-chest-pulldown"], defaultId: null },
      intakeText: "Lower back pain",
      floor: ALL,
    });
    expect(only.needsChoice).toBe(true);
    expect(only.alternatives.map((a) => a.templateId)).toEqual(["academy-clear-chest-pulldown", "academy-knee"]);
    // Only use: null means all of head office's (the design round, §4.2). A
    // studio that ticked none, or whose picks were all retired, is offered
    // none, and the sentence says why.
    for (const use of [[], ["gone"]]) {
      const none = suggestFromStartingRoutines({
        routines: ACADEMY,
        choice: { use, defaultId: null },
        intakeText: "Lower back pain",
        floor: ALL,
        studioName: "Westlake",
      });
      expect(none.needsChoice).toBe(true);
      expect(none.templateId).toBeNull();
      expect(none.alternatives).toEqual([]);
      expect(none.why).toBe("Westlake has no starting routines chosen");
    }
    expect(suggestFromStartingRoutines({ routines: [], choice: null, floor: ALL }).why).toBe("There are no starting routines yet");
    expect(suggestFromStartingRoutines({ routines: ACADEMY, choice: null, floor: [{ id: "sm-sled" }] }).why).toBe(
      "No starting routine has a machine on this floor",
    );
  });

  it("takes the trainer's pick over the rest", () => {
    const s = suggestFromStartingRoutines({
      routines: ACADEMY,
      choice: { use: null, defaultId: "academy-clear-chest-pulldown" },
      intakeText: "Lower back pain",
      floor: ALL,
      pickedId: "academy-shoulder",
    });
    expect(s.templateId).toBe("academy-shoulder");
    expect(s.why).toBe("Your pick");
    expect(s.alternatives[0].templateId).toBe("academy-low-back");
  });

  it("drops a routine with nothing on this floor, and lists a missing machine under its step", () => {
    const own: StartingRoutine = {
      id: "own",
      name: "Sled start",
      machineIds: ["sm-solon-sled"],
      dayOne: ["sm-solon-sled"],
      matchWords: [],
      isDefault: true,
      tier: "company",
    };
    const s = suggestFromStartingRoutines({ routines: [own, ...ACADEMY], choice: null, floor: ALL });
    expect(s.templateId).toBeNull();
    expect(s.alternatives.map((a) => a.templateId)).not.toContain("own");

    const floor = ALL.filter((m) => m.id !== "m-lumbar");
    const low = suggestFromStartingRoutines({ routines: ACADEMY, choice: null, intakeText: "sciatica", floor });
    const consult = low.steps.find((x) => x.label === "Consultation")!;
    expect(consult.machineIds).not.toContain("m-lumbar");
    expect(consult.missing).toEqual(["m-lumbar"]);
  });

  it("draws a routine with no steps as day one, then the rest of the road", () => {
    const own: StartingRoutine = {
      id: "own",
      name: "Three to start",
      machineIds: ["m-leg-press", "m-compound-row", "m-chest-press", "m-pulldown"],
      dayOne: ["m-compound-row", "m-leg-press"],
      matchWords: [],
      isDefault: true,
      tier: "company",
    };
    const s = suggestFromStartingRoutines({ routines: [own], choice: null, floor: ALL });
    expect(s.steps).toEqual([
      { key: "step-1", label: "Day one", machineIds: ["m-leg-press", "m-compound-row"], missing: [] },
      { key: "step-2", label: "Later in the plan", machineIds: ["m-chest-press", "m-pulldown"], missing: [] },
    ]);
  });

  it("never says a gender, whatever it picks", () => {
    for (const intakeText of ["", "knee replacement", "posture"]) {
      const s = suggestFromStartingRoutines({ routines: ACADEMY, choice: null, intakeText, floor: ALL });
      for (const words of [s.label ?? "", s.why, ...s.alternatives.map((a) => a.label)]) {
        expect(words).not.toMatch(/\b(female|male|woman|man)\b/i);
      }
    }
  });
});

describe("the plan a starting routine makes", () => {
  it("makes the plan on this floor, being built, signed and dated, with day one on it", () => {
    const { plan, startWith } = startingPlanFromRoutine(byId("academy-clear-dip-adduction"), who, ALL, "2026-10-08");
    expect(plan).toEqual({
      purpose: "Learning the protocol: the starting routine",
      purposeKinds: ["core"],
      intended: ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press"],
      // Day one rides on the plan, never in Routine A (AJ, Oct 8 2026: "this
      // also counts with the consult visit, sometimes the consult machines
      // will not be the same as their a routine").
      dayOne: startWith,
      building: true,
      templateId: "academy-clear-dip-adduction",
      madeByUid: "u-sam",
      madeByName: "Sam",
      madeAt: "2026-10-08",
    });
    expect([...startWith].sort()).toEqual(["m-compound-row", "m-leg-press", "m-lumbar"]);
    // Two lists: a draft that edits the plan's day one never changes `startWith`, or back.
    expect(plan.dayOne).not.toBe(startWith);
    expect(Object.values(startingPlanFromRoutine(byId("academy-knee"), { uid: "u-1" }, ALL, "2026-10-08").plan)).not.toContain(
      undefined,
    );
  });

  it("maps onto a studio's own unit ids and repairs day one on them", () => {
    const floor: FloorMachine[] = ALL.map((m) => ({ id: `unit-${m.id}`, canonicalId: m.id }));
    for (const r of ACADEMY) {
      const { plan, startWith } = startingPlanFromRoutine(r, who, floor, "2026-10-08");
      expect(plan.intended.every((id) => id.startsWith("unit-")), r.id).toBe(true);
      expect(startWith.length, r.id).toBeGreaterThan(0);
      expect(plan.dayOne, r.id).toEqual(startWith);
      const canonical = startWith.map((id) => id.replace(/^unit-/, ""));
      expect(findViolations(canonical).filter((v) => v.severity === "avoid"), r.id).toEqual([]);
    }
  });

  it("never starts the first visit with nothing to run when none of day one is on this floor", () => {
    // A studio whose Leg Press, Compound Row and Lumbar are its own units the
    // catalog doesn't know: the road's first machines start instead.
    const floor = ALL.filter((m) => !["m-leg-press", "m-compound-row", "m-lumbar"].includes(m.id));
    const r = byId("academy-clear-chest-pulldown");
    const { plan, startWith } = startingPlanFromRoutine(r, who, floor, "2026-10-08");
    expect(startWith.length).toBe(r.dayOne.length);
    expect([...startWith].sort()).toEqual([...plan.intended.slice(0, r.dayOne.length)].sort());
    expect(plan.dayOne).toEqual(startWith);
    // The suggestion still says day one's machines are missing.
    const s = suggestFromStartingRoutines({ routines: [r], choice: null, floor, pickedId: r.id });
    expect(s.steps[0].missing).toEqual(expect.arrayContaining(["m-leg-press", "m-compound-row", "m-lumbar"]));
  });

  it("leaves a machine the floor lacks off the plan", () => {
    const floor = ALL.filter((m) => m.id !== "m-dip");
    const { plan } = startingPlanFromRoutine(byId("academy-clear-dip-adduction"), who, floor, "2026-10-08");
    expect(plan.intended).not.toContain("m-dip");
    expect(plan.intended).toHaveLength(5);
  });
});

describe("a plan's starting template, in either spelling", () => {
  it("reads a starting routine's id and a template's own as the same Academy row", () => {
    expect(academyTemplateOf("academy-knee")?.id).toBe("knee");
    expect(academyTemplateOf("knee")?.id).toBe("knee");
    expect(academyTemplateOf("p-head-office-own")).toBeUndefined();
    expect(academyTemplateOf(null)).toBeUndefined();
  });

  it("reads the two no-reported-issues routines back to their Academy rows, whose ids it never shows", () => {
    expect(academyTemplateOf("academy-clear-dip-adduction")?.id).toBe("clear-female");
    expect(academyTemplateOf("academy-clear-chest-pulldown")?.id).toBe("clear-male");
    expect(academyTemplateOf("clear-male")?.id).toBe("clear-male");
    for (const t of SELECTION_TEMPLATES) expect(academyTemplateOf(academyRoutineId(t.id))?.id).toBe(t.id);
  });

  it("keeps B's suggested swaps on a plan made from a starting routine", () => {
    for (const t of SELECTION_TEMPLATES) {
      const { plan } = startingPlanFromRoutine(byId(academyRoutineId(t.id)), who, ALL, "2026-10-08");
      const aRoutine = plan.intended;
      expect(suggestBSwaps({ aRoutine, floor: ALL, templateId: plan.templateId }), t.id).toEqual(
        suggestBSwaps({ aRoutine, floor: ALL, templateId: t.id }),
      );
    }
    // And the template is really read: the arms row's eventual B differs
    // from the model B alone.
    const { plan } = startingPlanFromRoutine(byId("academy-arms"), who, ALL, "2026-10-08");
    expect(suggestBSwaps({ aRoutine: plan.intended, floor: ALL, templateId: plan.templateId })).not.toEqual(
      suggestBSwaps({ aRoutine: plan.intended, floor: ALL }),
    );
  });
});

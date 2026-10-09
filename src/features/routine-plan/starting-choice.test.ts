import { describe, expect, it } from "vitest";
import { sameValue } from "../admin/formState";
import {
  canonicalUse,
  choiceForForm,
  choiceSourceLine,
  followingHeadOffice,
  noStudioDefaultLine,
  routineMachineName,
  seenCount,
  seesRoutine,
  withRoutineSeen,
  withStudioDefault,
} from "./starting-choice";
import type { StartingRoutine, StartingRoutineChoice } from "./starting-routines";

const IDS = ["academy-knee", "academy-low-back", "academy-arms"];
const routine = (id: string, extra: Partial<StartingRoutine> = {}): StartingRoutine => ({
  id,
  name: id.replace("academy-", "").replace("-", " "),
  machineIds: ["m-leg-press"],
  dayOne: ["m-leg-press"],
  matchWords: [],
  isDefault: false,
  tier: "company",
  ...extra,
});

describe("the choice as the form holds it", () => {
  it("keeps the list in the panel's order, ids it doesn't list kept at the end, each once", () => {
    expect(canonicalUse(["academy-arms", "retired-one", "academy-knee", "academy-arms"], IDS)).toEqual([
      "academy-knee",
      "academy-arms",
      "retired-one",
    ]);
    expect(choiceForForm({ use: null, defaultId: "academy-knee" }, IDS)).toEqual({ use: null, defaultId: "academy-knee" });
    expect(choiceForForm({ use: ["academy-arms", "academy-knee"], defaultId: null }, IDS).use).toEqual(["academy-knee", "academy-arms"]);
  });

  it("sees every routine while it follows head office's list, and only the ticked ones after", () => {
    expect(seesRoutine({ use: null, defaultId: null }, "academy-arms")).toBe(true);
    expect(seesRoutine({ use: ["academy-knee"], defaultId: null }, "academy-arms")).toBe(false);
    expect(seenCount({ use: null, defaultId: null }, IDS)).toBe("3 of 3 offered");
    expect(seenCount({ use: ["academy-knee", "retired-one"], defaultId: null }, IDS)).toBe("1 of 3 offered");
  });
});

describe("ticking and unticking", () => {
  const following: StartingRoutineChoice = { use: null, defaultId: null };

  it("unticking one while following head office's list makes the studio's own list", () => {
    expect(withRoutineSeen(following, "academy-low-back", false, IDS, null)).toEqual({
      use: ["academy-knee", "academy-arms"],
      defaultId: null,
    });
  });

  it("ticking it again goes back to following head office's list: undoing a change is no change", () => {
    const off = withRoutineSeen(following, "academy-low-back", false, IDS, null);
    const back = withRoutineSeen(off, "academy-low-back", true, IDS, null);
    expect(back).toEqual(following);
    expect(sameValue(back, following)).toBe(true);
  });

  it("a studio's own list stays its own when every routine is ticked, and an order is kept so a re-tick is no change", () => {
    const own: StartingRoutineChoice = { use: ["academy-knee", "academy-low-back", "academy-arms"], defaultId: null };
    const off = withRoutineSeen(own, "academy-knee", false, IDS, own.use);
    expect(off.use).toEqual(["academy-low-back", "academy-arms"]);
    const back = withRoutineSeen(off, "academy-knee", true, IDS, own.use);
    expect(back).toEqual(own);
    expect(sameValue(back, own)).toBe(true);
  });

  it("keeps an id the panel doesn't list, rather than dropping it on a save nobody meant about it", () => {
    const own: StartingRoutineChoice = { use: ["academy-knee", "retired-one"], defaultId: null };
    expect(withRoutineSeen(own, "academy-arms", true, IDS, own.use).use).toEqual(["academy-knee", "academy-arms", "retired-one"]);
  });

  it("unticking the studio's default clears the default too: a default nobody sees is never suggested", () => {
    const own: StartingRoutineChoice = { use: ["academy-knee", "academy-arms"], defaultId: "academy-knee" };
    expect(withRoutineSeen(own, "academy-knee", false, IDS, own.use)).toEqual({ use: ["academy-arms"], defaultId: null });
    expect(withRoutineSeen(own, "academy-arms", false, IDS, own.use).defaultId).toBe("academy-knee");
  });
});

describe("the default", () => {
  it("is picked, and ticked as well when it wasn't", () => {
    expect(withStudioDefault({ use: null, defaultId: null }, "academy-arms", IDS)).toEqual({ use: null, defaultId: "academy-arms" });
    expect(withStudioDefault({ use: ["academy-knee"], defaultId: null }, "academy-arms", IDS)).toEqual({
      use: ["academy-knee", "academy-arms"],
      defaultId: "academy-arms",
    });
    expect(withStudioDefault({ use: ["academy-knee"], defaultId: "academy-knee" }, null, IDS)).toEqual({
      use: ["academy-knee"],
      defaultId: null,
    });
  });

  it("says what No default of our own means here: head office's by name, or the trainer picks", () => {
    const routines = [routine("academy-knee", { isDefault: true }), routine("academy-arms")];
    expect(noStudioDefaultLine(routines, { use: null, defaultId: null })).toBe(
      "No default of our own: Start a plan suggests head office's, knee",
    );
    // Head office's default that this studio doesn't offer is never suggested here.
    expect(noStudioDefaultLine(routines, { use: ["academy-arms"], defaultId: null })).toBe(
      "No default of our own: the trainer picks when the intake names nothing",
    );
    // A studio's own routine is never head office's default.
    expect(noStudioDefaultLine([routine("own", { isDefault: true, tier: "studio" })], { use: null, defaultId: null })).toMatch(/trainer picks/);
  });
});

describe("following head office's list again", () => {
  it("drops the studio's own list and keeps its default", () => {
    expect(followingHeadOffice({ use: ["academy-knee"], defaultId: "academy-knee" })).toEqual({ use: null, defaultId: "academy-knee" });
  });

  it("is said in a line, with the studio's name, and what it means for a routine added later", () => {
    expect(choiceSourceLine(null, "Westlake")).toMatch(/^Following head office's list: /);
    expect(choiceSourceLine(null, "Westlake")).toContain("head office's and your own");
    expect(choiceSourceLine(["academy-knee"], "Westlake")).toMatch(/^Westlake's own choice: /);
    // The studio's own routines wait too, not only head office's.
    expect(choiceSourceLine(["academy-knee"], "Westlake")).toContain("One added later, head office's or your own, waits until you tick it.");
    expect(choiceSourceLine([], " ")).toMatch(/^This studio's own choice/);
  });

  it("speaks to someone who reads it as a reader: nothing about ticking it themselves", () => {
    for (const use of [null, ["academy-knee"]]) {
      const line = choiceSourceLine(use, "Westlake", false);
      expect(line).not.toMatch(/your|you/);
    }
    expect(choiceSourceLine(["academy-knee"], "Westlake", false)).toBe(
      "Westlake's own choice: its trainers see the ones offered here. One added later waits until a leader offers it.",
    );
    expect(choiceSourceLine(null, "Westlake", false)).toMatch(/^Following head office's list: this studio's trainers see/);
  });
});

describe("a machine's name", () => {
  it("is the Academy's for a movement, else the catalog's, else the id as it is", () => {
    expect(routineMachineName("m-lumbar", "LUMBAR")).toBe("Lumbar Extension");
    expect(routineMachineName("m-sled", "Sled")).toBe("Sled");
    expect(routineMachineName("m-sled", "  ")).toBe("m-sled");
    expect(routineMachineName("m-sled")).toBe("m-sled");
  });
});

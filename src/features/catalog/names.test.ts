import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import cardsFile from "../academy/content/cards.json";
import scriptsFile from "../academy/content/scripts.json";
import { MACHINE_CATEGORY } from "../routine-builder/academy";
import {
  ACADEMY_MOVEMENT_NAME,
  ALIASES_MAX,
  ALIAS_MAX_LENGTH,
  MOVEMENTS,
  MOVEMENT_IDS,
  aliasProblem,
  aliasesByMovement,
  floorNameHidesMovement,
  headOfficeAliasesOf,
  movementOf,
  movementsWithAliases,
  namesForMachine,
  normaliseName,
  tidyAlias,
} from "./names";

const here = dirname(fileURLToPath(import.meta.url));
const academy = (...p: string[]) => readFileSync(join(here, "..", "..", "..", "docs", "msf-academy", ...p), "utf8");

/** "## 16. Lumbar Extension (Lower Back)" -> "Lumbar Extension (Lower Back)", from all four guides. */
function guideHeadings(): string[] {
  const out: string[] = [];
  for (const n of [1, 2, 3, 4]) {
    for (const line of academy("Set Up Machines", `standardized-setup-guide-batch${n}.md`).split(/\r?\n/)) {
      const m = /^##\s+\d+\.\s+(.*)$/.exec(line);
      if (m) out.push(m[1].trim());
    }
  }
  return out;
}

describe("the Academy's names for the twenty movements", () => {
  it("names every one of the twenty standard machines, once", () => {
    expect(MOVEMENT_IDS).toHaveLength(20);
    expect([...MOVEMENT_IDS].sort()).toEqual(Object.keys(MACHINE_CATEGORY).sort());
  });

  it("are the standardized setup guides' own headings, a bracketed body part dropped", () => {
    const headings = guideHeadings().map((h) => h.replace(/\s*\(.*\)\s*$/, "").trim());
    expect(headings).toHaveLength(20);
    expect([...headings].sort()).toEqual(Object.values(ACADEMY_MOVEMENT_NAME).sort());
  });

  it("carries every code the Academy's quick cards and spoken scripts write", () => {
    const cards = (cardsFile as { cards: { abbr: string; machineId: string }[] }).cards;
    const scripts = (scriptsFile as { scripts: { abbr: string; machineId: string }[] }).scripts;
    for (const { abbr, machineId } of [...cards, ...scripts]) {
      const codes = MOVEMENTS[machineId].codes.map(normaliseName);
      expect(codes, `${machineId} ${abbr}`).toContain(normaliseName(abbr));
    }
  });
});

describe("every name a machine goes by", () => {
  const aliasesOf = (id: string) => MOVEMENTS[id].aliases;

  it("knows the Academy tab's names, which the Catalog never did", () => {
    expect(aliasesOf("m-lumbar")).toContain("Low Back");
    expect(aliasesOf("m-simple-row")).toContain("Rowing Back");
    expect(aliasesOf("m-pulldown")).toContain("Torso Arm");
    expect(aliasesOf("m-chest-fly")).toContain("Pec Fly");
    expect(aliasesOf("m-torso-rotation")).toContain("Rotary Torso");
    expect(aliasesOf("m-neck")).toContain("4-Way Neck");
  });

  it("knows the floor names every studio started with", () => {
    expect(MOVEMENTS["m-lumbar"].floorName).toBe("LUMBAR");
    expect(aliasesOf("m-lumbar")).toContain("LUMBAR");
    expect(aliasesOf("m-neck")).toContain("CX (4 WAY NECK)");
    expect(aliasesOf("m-chest-fly")).toContain("CHEST/PEC FLY");
  });

  it("knows FileMaker's names, written as a person would read them", () => {
    expect(aliasesOf("m-compound-row")).toContain("Comp row");
    expect(aliasesOf("m-lateral-raise")).toContain("Lat raise");
  });

  it("lists each name once and never repeats the Academy's own", () => {
    for (const id of MOVEMENT_IDS) {
      const keys = MOVEMENTS[id].aliases.map(normaliseName);
      expect(new Set(keys).size, id).toBe(keys.length);
      expect(keys, id).not.toContain(normaliseName(MOVEMENTS[id].name));
    }
  });

  it("namesForMachine gives the movement's name first, then its aliases", () => {
    expect(namesForMachine({ id: "m-lumbar" })[0]).toBe("Lumbar Extension");
    expect(namesForMachine({ id: "sm-solon-own-thing" })).toEqual([]);
  });
});

describe("which names open a machine on their own", () => {
  const opens = (name: string) =>
    MOVEMENT_IDS.filter((id) => MOVEMENTS[id].exact.includes(normaliseName(name)));

  it("lets a name that means one movement open it", () => {
    expect(opens("low back")).toEqual(["m-lumbar"]);
    expect(opens("Lumb")).toEqual(["m-lumbar"]);
    expect(opens("lumbar")).toEqual(["m-lumbar"]);
    expect(opens("neck")).toEqual(["m-neck"]);
    expect(opens("torso arm")).toEqual(["m-pulldown"]);
    expect(opens("Cervical Extension")).toEqual(["m-neck"]);
  });

  it("never lets a word another movement also uses open one by itself", () => {
    // FileMaker's "extension" is the Leg Extension, but Lumbar, Triceps and
    // Cervical Extension all have the word.
    expect(opens("extension")).toEqual([]);
    expect(opens("curl")).toEqual([]);
    expect(opens("torso")).toEqual([]);
  });

  it("never lets one name open two movements", () => {
    const all = MOVEMENT_IDS.flatMap((id) => MOVEMENTS[id].exact);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("the movement a machine is", () => {
  it("is itself for an MSF machine, and its lineage for a studio's copy", () => {
    expect(movementOf({ id: "m-leg-press" })?.name).toBe("Leg Press");
    expect(movementOf({ id: "sm-solon-hoist-leg-press", comparisonKey: "m-leg-press" })?.name).toBe("Leg Press");
    expect(movementOf({ id: "leg_extension", name: "Seated Leg Extension" })?.id).toBe("m-ext");
  });

  it("is nothing for a studio's own machine with no lineage", () => {
    expect(movementOf({ id: "sm-solon-sled", comparisonKey: "sm-solon-sled", name: "Sled" })).toBeNull();
  });
});

describe("a floor name that leaves the Academy's name unsaid", () => {
  it("shows the Academy name only when the floor name does not already say it", () => {
    expect(floorNameHidesMovement("LUMBAR", "Lumbar Extension")).toBe(true);
    expect(floorNameHidesMovement("CX (4 WAY NECK)", "Cervical Extension")).toBe(true);
    expect(floorNameHidesMovement("BICEP", "Biceps Curl")).toBe(true);
    expect(floorNameHidesMovement("LEG PRESS", "Leg Press")).toBe(false);
    expect(floorNameHidesMovement("LEG PRESS 2", "Leg Press")).toBe(false);
    expect(floorNameHidesMovement("TRICEP EXTENSION", "Triceps Extension")).toBe(false);
    expect(floorNameHidesMovement("HIP ABDUCTION", "Abduction")).toBe(false);
    expect(floorNameHidesMovement("SEATED ABDOMINALS", "Abdominals")).toBe(false);
  });
});

describe("head office's own names (wave 2, Sep 28 2026)", () => {
  it("reads the names off a catalog document: strings, tidied, each once, within the limits", () => {
    expect(
      headOfficeAliasesOf({
        aliases: ["  The   Rack ", "the rack", 7, "", "x".repeat(ALIAS_MAX_LENGTH + 1), "Solon sled"],
      }),
    ).toEqual(["The Rack", "Solon sled"]);
    expect(headOfficeAliasesOf({})).toEqual([]);
    expect(headOfficeAliasesOf({ aliases: "The Rack" })).toEqual([]);
    expect(headOfficeAliasesOf(null)).toEqual([]);
    expect(headOfficeAliasesOf({ aliases: Array.from({ length: 40 }, (_, i) => `name ${i}`) })).toHaveLength(ALIASES_MAX);
  });

  it("takes them only from a document that is one of the twenty", () => {
    expect(
      aliasesByMovement([
        { id: "m-lumbar", aliases: ["Bad Back Box"] },
        { id: "m-hip-sled", aliases: ["The Sled"] },
        { id: "m-neck" },
      ]),
    ).toEqual({ "m-lumbar": ["Bad Back Box"] });
  });

  it("gives back the code's own table when head office has added nothing", () => {
    expect(movementsWithAliases({})).toBe(MOVEMENTS);
    expect(movementsWithAliases({ "m-lumbar": [] })).toBe(MOVEMENTS);
  });

  it("merges a name into its movement, where it opens the movement on its own", () => {
    const table = movementsWithAliases({ "m-lumbar": ["Bad Back Box"] });
    expect(table["m-lumbar"].aliases).toContain("Bad Back Box");
    expect(table["m-lumbar"].exact).toContain("bad back box");
    // The code's table is left as it was.
    expect(MOVEMENTS["m-lumbar"].aliases).not.toContain("Bad Back Box");
    expect(namesForMachine({ id: "m-lumbar" }, table)).toContain("Bad Back Box");
    expect(movementOf({ id: "m-lumbar" }, table)?.aliases).toContain("Bad Back Box");
  });

  it("never lets a name two movements were given open either", () => {
    const table = movementsWithAliases({ "m-lumbar": ["The Box"], "m-abs": ["The Box"] });
    expect(table["m-lumbar"].aliases).toContain("The Box");
    expect(table["m-lumbar"].exact).not.toContain("the box");
    expect(table["m-abs"].exact).not.toContain("the box");
    const all = MOVEMENT_IDS.flatMap((id) => table[id].exact);
    expect(new Set(all).size).toBe(all.length);
  });

  it("refuses a name that says nothing new, or that another movement goes by, in words", () => {
    expect(aliasProblem("   ", "m-lumbar")).toBe("Type a name.");
    expect(aliasProblem("x".repeat(ALIAS_MAX_LENGTH + 1), "m-lumbar")).toBe(`Keep a name to ${ALIAS_MAX_LENGTH} characters.`);
    expect(aliasProblem("low back", "m-lumbar")).toBe("Find already knows “low back” for Lumbar Extension.");
    expect(aliasProblem("LUMBAR", "m-lumbar")).toBe("Find already knows “LUMBAR” for Lumbar Extension.");
    expect(aliasProblem("Leg Press", "m-lumbar")).toBe("“Leg Press” already means Leg Press.");
    expect(aliasProblem("torso arm", "m-lumbar")).toBe("“torso arm” already means Pulldown.");
    expect(aliasProblem("Bad Back Box", "m-lumbar")).toBeNull();
    // Another movement's head office name, too.
    const table = movementsWithAliases({ "m-abs": ["The Box"] });
    expect(aliasProblem("the box", "m-lumbar", table)).toBe("“the box” already means Abdominals.");
    expect(aliasProblem("the box", "m-abs", table)).toBe("Find already knows “the box” for Abdominals.");
  });

  it("stores a name the way it reads: one space between words", () => {
    expect(tidyAlias("  Bad   Back\tBox ")).toBe("Bad Back Box");
  });
});

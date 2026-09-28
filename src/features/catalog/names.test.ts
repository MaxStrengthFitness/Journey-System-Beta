import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import cardsFile from "../academy/content/cards.json";
import scriptsFile from "../academy/content/scripts.json";
import { MACHINE_CATEGORY } from "../routine-builder/academy";
import {
  ACADEMY_MOVEMENT_NAME,
  MOVEMENTS,
  MOVEMENT_IDS,
  floorNameHidesMovement,
  movementOf,
  namesForMachine,
  normaliseName,
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

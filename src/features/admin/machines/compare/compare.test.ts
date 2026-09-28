import { describe, expect, it } from "vitest";
import { MACHINE_DEFINITIONS } from "../../../../data/machine-definitions";
import type { MachineDefinition } from "../../../../types/machines";
import { compareStandard, networkSentence, summarize, type RosterDocLike } from "./compare";

const legPress = MACHINE_DEFINITIONS["m-leg-press"] as MachineDefinition;
const names = { solon: "Solon", westlake: "Westlake", willoughby: "Willoughby", strongsville: "Strongsville" };

const removal = (line: string, reason = "This unit has no end stop to lock against.") => ({
  field: "clinicalWarnings",
  line,
  reason,
  by: { uid: "uid-theoden", name: "Théoden" },
  at: "2026-09-27T14:00:00.000Z",
});

const docs: RosterDocLike[] = [
  {
    path: "studios/solon/roster/m-leg-press",
    machineId: "m-leg-press",
    source: "catalog",
    basedOn: "m-leg-press",
    status: "active",
    modelId: "mm-hoist-roc-it-leg-press",
    overrides: {
      defaultSettings: { gap: "4" },
      clinicalWarnings: ["Our footplate latch sticks."],
      removedSafety: [removal(legPress.clinicalWarnings[0])],
    },
  },
  {
    path: "studios/westlake/roster/m-leg-press",
    machineId: "m-leg-press",
    studioId: "westlake",
    source: "catalog",
    basedOn: "m-leg-press",
    status: "maintenance",
    overrides: {},
  },
  {
    path: "studios/willoughby/roster/m-leg-press",
    machineId: "m-leg-press",
    source: "catalog",
    basedOn: "m-leg-press",
    status: "active",
    overrides: {
      execution: { upperTurnaround: { style: "touch-and-go" } },
      universalBaseline: { seatHeightPosition: "Seat back at P3 on our older frame." },
    },
  },
  {
    path: "studios/strongsville/roster/sm-strongsville-hammer-sled",
    machineId: "sm-strongsville-hammer-sled",
    source: "custom",
    basedOn: "m-leg-press",
    status: "active",
    definition: { name: "Hammer Sled" },
  },
];

describe("compareStandard", () => {
  const r = compareStandard(legPress, docs, names);

  it("lists every unit by studio name, never ranked", () => {
    expect(r.units.map((u) => u.studioName)).toEqual(["Solon", "Strongsville", "Westlake", "Willoughby"]);
    expect(r.copies).toBe(3);
    expect(r.own).toBe(1);
    expect(r.studios).toBe(4);
  });

  it("puts every safety line taken off at the top, with the reason, who and when", () => {
    expect(r.removed).toEqual([
      {
        ...removal(legPress.clinicalWarnings[0]),
        studioId: "solon",
        studioName: "Solon",
      },
    ]);
  });

  it("names a copy's additions, and its differences line by line", () => {
    const solon = r.units.find((u) => u.studioId === "solon")!;
    expect(solon.added).toEqual([{ field: "clinicalWarnings", label: "Clinical warnings", line: "Our footplate latch sticks." }]);
    expect(solon.modelId).toBe("mm-hoist-roc-it-leg-press");
    const dials = solon.differences.find((d) => d.field === "defaultSettings")!;
    expect(dials.tier).toBe("studio");
    expect(dials.lines).toEqual([{ label: "Gap", standard: "—", studio: "4" }]);

    const willoughby = r.units.find((u) => u.studioId === "willoughby")!;
    const exec = willoughby.differences.find((d) => d.field === "execution")!;
    expect(exec.tier).toBe("method");
    expect(exec.lines).toEqual([{ label: "Upper turnaround: style", standard: "hard-stop", studio: "touch-and-go" }]);
    // The method is listed before the unit's hardware.
    expect(willoughby.differences.map((d) => d.field)).toEqual(["execution", "universalBaseline"]);
  });

  it("says a copy with nothing of its own follows the standard exactly", () => {
    const westlake = r.units.find((u) => u.studioId === "westlake")!;
    expect(westlake.follows).toBe(true);
    expect(westlake.status).toBe("maintenance");
  });

  it("lists a studio's own machine as that, not line by line", () => {
    const own = r.units.find((u) => u.kind === "own")!;
    expect(own.studioName).toBe("Strongsville");
    expect(own.differences).toEqual([]);
    expect(own.follows).toBe(false);
  });

  it("describes the network in one sentence, a configuration, never a score", () => {
    expect(networkSentence(r, "LEG PRESS")).toBe(
      "4 units at 4 studios (1 is a studio's own machine): 1 added a safety line · 1 changed the baseline set-up · 1 changed the dials' defaults · 1 changed the execution and cadence · 1 took a safety line off.",
    );
    expect(networkSentence(compareStandard(legPress, [], names), "LEG PRESS")).toBe("No studio has LEG PRESS on its floor yet.");
    expect(networkSentence(compareStandard(legPress, [docs[1]], names), "LEG PRESS")).toBe(
      "1 unit at 1 studio: every copy follows the standard exactly.",
    );
  });

  it("leaves out a removal without a reason, or of a line head office has since taken out", () => {
    const out = compareStandard(
      legPress,
      [
        {
          path: "studios/solon/roster/m-leg-press",
          source: "catalog",
          overrides: {
            removedSafety: [removal(legPress.clinicalWarnings[0], " "), removal("Not a line the catalog has")],
          },
        },
      ],
      names,
    );
    expect(out.removed).toEqual([]);
    expect(out.units[0].follows).toBe(true);
  });

  it("falls back to the studio's id when the name isn't known", () => {
    const out = compareStandard(legPress, [{ path: "studios/rohan/roster/m-leg-press", source: "catalog", overrides: {} }]);
    expect(out.units[0].studioName).toBe("rohan");
  });
});

describe("summarize", () => {
  it("says a value the way a person reads it", () => {
    expect(summarize(undefined)).toBe("—");
    expect(summarize(true)).toBe("Yes");
    expect(summarize(["Chin down", "Hips down"])).toBe("Chin down · Hips down");
    expect(summarize([{ key: "gap", label: "Gap" }])).toBe("Gap");
    expect(summarize({ seatHeightPosition: "P3" })).toBe("Seat: P3");
    expect(summarize([])).toBe("none");
  });
});

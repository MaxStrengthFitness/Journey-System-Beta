import { describe, expect, it } from "vitest";
import type { SettingFieldSpec } from "../equipment/types";
import type { FitData } from "../machine-fit/fit-store";
import { body, compoundRowStudio } from "../machine-fit/fixtures";
import { DEFAULT_MATCH_SPEC } from "../machine-fit/match-spec";
import type { MachineAudit } from "../machine-fit/types";
import { FIT_ACK_BUTTON, fitAckOf, fitAckedWords, fitLineSentence, flagFieldKey, menuAudit, rareStudioFlags } from "./fit-line";

const FIELDS: SettingFieldSpec[] = [
  { key: "gap", label: "Gap", type: "text", ghost: null, absolute: true },
  { key: "seat", label: "Seat", type: "text", ghost: null, absolute: false },
  { key: "chest", label: "Chest", type: "text", ghost: null, absolute: false },
];

const ready = (studio = compoundRowStudio()): FitData => ({
  status: "ready",
  sources: { row: { studio, company: null } },
  studioCounts: { row: studio.length },
});

const audit = (over: Partial<Parameters<typeof menuAudit>[0]> = {}) =>
  menuAudit({
    machineId: "row",
    clientId: "avery",
    fields: FIELDS,
    saved: { gap: "0", seat: "9", chest: "3" },
    fit: ready(),
    target: body(67),
    spec: DEFAULT_MATCH_SPEC,
    ...over,
  });

describe("machine fit's line on the card", () => {
  it("shows a rare value at the studio tier, in machine fit's own words", () => {
    const a = audit();
    expect(a?.tier).toBe("studio");
    const flags = rareStudioFlags(a);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ key: "seat", value: "9", level: "rare", clients: 0 });
    expect(fitLineSentence(flags[0], FIELDS, a!)).toMatch(/^Seat 9 — none of the \d+ clients .* use it\. Most use 4 \(\d+\)/);
    expect(flagFieldKey(flags[0], FIELDS)).toBe("seat");
    expect(fitAckOf(flags[0])).toEqual({ ackKey: "seat", value: "9" });
  });

  it("checks what is saved only once the read has answered", () => {
    expect(audit({ fit: { status: "loading", sources: {}, studioCounts: {} } })).toBeNull();
    expect(audit({ fit: null })).toBeNull();
    expect(audit({ saved: {} })).toBeNull();
    expect(audit({ target: null })).toBeNull();
    expect(audit({ machineId: "elsewhere" })).toBeNull();
  });

  it("says nothing with no height on file, too few similar clients, an unknown answer or only the company tier", () => {
    expect(rareStudioFlags(audit({ target: body(null) }))).toEqual([]);
    expect(rareStudioFlags(audit({ fit: ready(compoundRowStudio().slice(0, 3)) }))).toEqual([]);
    expect(rareStudioFlags(audit({ fit: { status: "ready", sources: { row: { studio: null, company: null } }, studioCounts: {} } }))).toEqual([]);
    const company: MachineAudit = {
      tier: "company",
      cohort: null,
      flags: [{ kind: "value", key: "seat", value: "9", level: "rare", clients: 0, outOf: 9, distribution: [] }],
      acknowledged: [],
      unchecked: [],
      state: "checked",
    };
    expect(rareStudioFlags(company)).toEqual([]);
    expect(rareStudioFlags({ ...company, tier: "studio" })).toHaveLength(1);
    expect(rareStudioFlags({ ...company, tier: "studio", state: "no-height" })).toEqual([]);
  });

  it("never draws an uncommon flag or a combination", () => {
    const a: MachineAudit = {
      tier: "studio",
      cohort: null,
      flags: [
        { kind: "value", key: "seat", value: "5", level: "uncommon", clients: 1, outOf: 9, distribution: [] },
        { kind: "combo", keys: ["seat", "chest"], values: ["5", "4"], level: "uncommon", each: [3, 3], outOf: 9 },
      ],
      acknowledged: [],
      unchecked: [],
      state: "checked",
    };
    expect(rareStudioFlags(a)).toEqual([]);
  });

  it("drops a flag reviewed at its value", () => {
    const acks = { seat: { value: "9", by: "uid", byName: "Sam Reyes", at: "2026-10-01T10:00:00.000Z" } };
    expect(rareStudioFlags(audit({ acks }))).toEqual([]);
  });

  it("words the button and what it did without a pronoun", () => {
    expect(FIT_ACK_BUTTON).toBe("Right for this client");
    expect(fitAckedWords("Avery")).toBe("Marked right for Avery.");
    expect(fitAckedWords("")).toBe("Marked right for this client.");
  });
});

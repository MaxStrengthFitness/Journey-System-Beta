import { describe, expect, it } from "vitest";
import { buildSubmission, canOffer, canWithdraw, decisionSentence, standardGaps, submissionLabel } from "./floor";
import type { MachineCatalogEntry, MachineDefinition, StudioMachineRosterEntry } from "../../types/machines";

type Cat = Pick<MachineCatalogEntry, "id" | "status" | "inStandardSet"> & { name: string };
const cat = (id: string, extra: Partial<Cat> = {}): Cat =>
  ({ id, status: "active", inStandardSet: true, name: id, ...extra }) as Cat;

const def = (name: string) => ({ name }) as unknown as MachineDefinition;

const onFloor = (machineId: string, extra: Partial<StudioMachineRosterEntry> = {}): StudioMachineRosterEntry =>
  ({ machineId, studioId: "solon", source: "catalog", basedOn: machineId, status: "active", ...extra }) as unknown as StudioMachineRosterEntry;

describe("standardGaps — adopted, never pushed", () => {
  it("lists the standard machines the floor does not have, and only those", () => {
    const catalog = [cat("m-leg-press"), cat("m-chest"), cat("m-extra", { inStandardSet: false })];
    const { newInStandard } = standardGaps(catalog, [onFloor("m-leg-press")]);
    expect(newInStandard.map((c) => c.id)).toEqual(["m-chest"]);
  });

  it("counts a switched-off machine as already decided — putting it back is not an adoption", () => {
    const { newInStandard } = standardGaps([cat("m-chest")], [onFloor("m-chest", { status: "inactive" })]);
    expect(newInStandard).toEqual([]);
  });

  it("leaves out draft and retired catalog machines, and collapses a duplicate id spelling", () => {
    const catalog = [
      cat("m-ext", { name: "Leg Extension" }),
      cat("leg_extension", { name: "Leg Extension" }),
      cat("m-old", { status: "retired" }),
      cat("m-draft", { status: "draft" }),
    ];
    const { newInStandard } = standardGaps(catalog, []);
    expect(newInStandard.map((c) => c.id)).toEqual(["m-ext"]);
  });

  it("marks a floor machine the standard dropped, and one the catalog retired, but never the studio's own", () => {
    const catalog = [cat("m-chest", { inStandardSet: false }), cat("m-old", { status: "retired" }), cat("m-row")];
    const roster = [
      onFloor("m-chest"),
      onFloor("m-old"),
      onFloor("m-row"),
      onFloor("m-chest-off", { basedOn: "m-chest", status: "inactive" }),
      { machineId: "sm-solon-sled", studioId: "solon", source: "custom", status: "active", definition: def("Sled") } as never,
    ];
    const { noLongerStandard } = standardGaps(catalog, roster);
    expect(noLongerStandard.map((e) => e.machineId)).toEqual(["m-chest", "m-old"]);
  });

  it("says nothing when the floor is empty and the catalog is empty", () => {
    expect(standardGaps([], [])).toEqual({ newInStandard: [], noLongerStandard: [] });
  });
});

describe("buildSubmission — only a studio's own machine can be offered", () => {
  const author = { uid: "u1", name: "Lee Leader" };
  const own = {
    machineId: "sm-solon-sled",
    studioId: "solon",
    source: "custom",
    basedOn: "m-leg-press",
    status: "active",
    definition: def("Sled"),
  } as unknown as StudioMachineRosterEntry & { definition: MachineDefinition };

  it("builds a pending submission carrying the definition, the lineage and the note", () => {
    const r = buildSubmission({ studioId: "solon", studioName: "Solon", entry: own, author, note: "  Everyone loves it. " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc).toMatchObject({
      studioId: "solon",
      studioName: "Solon",
      machineId: "sm-solon-sled",
      basedOn: "m-leg-press",
      submittedBy: "u1",
      submittedByName: "Lee Leader",
      note: "Everyone loves it.",
      status: "pending",
    });
    expect(r.doc.definition.name).toBe("Sled");
  });

  it("refuses an MSF machine, a copy of another studio's, and a nameless one", () => {
    expect(buildSubmission({ studioId: "solon", studioName: "Solon", entry: onFloor("m-chest"), author, note: "" }).ok).toBe(false);
    const copy = { ...own, adoptedFrom: { studioId: "westlake", machineId: "sm-westlake-sled", studioName: "Westlake" } };
    const r = buildSubmission({ studioId: "solon", studioName: "Solon", entry: copy as unknown as StudioMachineRosterEntry, author, note: "" });
    expect(r.ok).toBe(false);
    expect("reason" in r ? r.reason : "").toContain("Westlake");
    const nameless = { ...own, definition: def("  ") };
    expect(buildSubmission({ studioId: "solon", studioName: "Solon", entry: nameless as unknown as StudioMachineRosterEntry, author, note: "" }).ok).toBe(false);
  });

  it("caps the note", () => {
    const r = buildSubmission({ studioId: "solon", studioName: "Solon", entry: own, author, note: "x".repeat(900) });
    expect(r.ok && r.doc.note.length).toBe(500);
  });

  it("labels a marker in plain words, and a withdrawn one not at all", () => {
    expect(submissionLabel({ id: "s1", status: "pending" })).toContain("waiting on corporate");
    expect(submissionLabel({ id: "s1", status: "published" })).toContain("Published");
    expect(submissionLabel({ id: "s1", status: "declined" })).toContain("passed");
    expect(submissionLabel({ id: "s1", status: "withdrawn" })).toBeNull();
    expect(submissionLabel(null)).toBeNull();
  });

  it("says when corporate reworded a published machine, rather than a bare Published", () => {
    expect(submissionLabel({ id: "s1", status: "published", corrected: "execution and cadence" })).toBe(
      "Published to the MSF catalog — corporate adjusted execution and cadence",
    );
  });
});

describe("the offer's lifecycle", () => {
  it("offers when there is no marker, and again after a pass or a withdrawal", () => {
    expect(canOffer(null)).toBe(true);
    expect(canOffer({ id: "s1", status: "declined" })).toBe(true);
    expect(canOffer({ id: "s1", status: "withdrawn" })).toBe(true);
  });

  it("does not offer the same machine twice, or re-offer one already in the catalog", () => {
    expect(canOffer({ id: "s1", status: "pending" })).toBe(false);
    expect(canOffer({ id: "s1", status: "published" })).toBe(false);
  });

  it("withdraws only while corporate has not decided", () => {
    // Mirrors the rule: a studio gets exactly one transition, pending →
    // withdrawn. Once published, other studios may have adopted it.
    expect(canWithdraw({ id: "s1", status: "pending" })).toBe(true);
    expect(canWithdraw({ id: "s1", status: "published" })).toBe(false);
    expect(canWithdraw({ id: "s1", status: "declined" })).toBe(false);
    expect(canWithdraw({ id: "s1", status: "withdrawn" })).toBe(false);
    expect(canWithdraw(null)).toBe(false);
  });

  it("gives the studio corporate's reason, so it can fix the machine and offer again", () => {
    expect(decisionSentence("declined", "Too close to the pullover.")).toBe(
      "Corporate passed: Too close to the pullover.",
    );
    expect(decisionSentence("published", "Renamed to match the Academy.")).toBe(
      "Corporate said: Renamed to match the Academy.",
    );
  });

  it("says nothing when corporate left no note, rather than an empty quote", () => {
    expect(decisionSentence("declined", "")).toBeNull();
    expect(decisionSentence("declined", "   ")).toBeNull();
    expect(decisionSentence("declined", null)).toBeNull();
    expect(decisionSentence("pending", "not decided yet")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { RoutinePreset } from "../../../types";
import { normalizeRoutinePreset } from "../../../lib/routine-templates";
import { academyStartingRoutines } from "../../routine-plan/starting-routines";
import { startingSeedDoc } from "../../routine-plan/starting-seed";
import { editorDraftOf, isEmptyEdit, templateChanged, templateContent, templateEdit } from "./template-save";

const plain = (extra: Partial<RoutinePreset> = {}): RoutinePreset =>
  normalizeRoutinePreset({
    id: "t1",
    name: "Full body",
    description: "For anyone.",
    machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"],
    machineNotes: { "m-lumbar": "Go gently." },
    scope: "global",
    tier: "company",
    ...extra,
  });

describe("the editor's draft", () => {
  it("opens with its start part read and checked, and no start key when it has none", () => {
    expect("start" in editorDraftOf(plain())).toBe(false);
    const opened = editorDraftOf(plain({ start: { dayOne: ["m-leg-press"], matchWords: ["Low Back"] } as never }));
    expect(opened.start).toEqual({ dayOne: ["m-leg-press"], matchWords: ["low back"] });
  });

  it("is unchanged until someone changes something, a seeded routine included", () => {
    const opened = editorDraftOf(plain());
    expect(templateChanged({ ...opened }, opened)).toBe(false);
    const seed = academyStartingRoutines().find((r) => r.id === "academy-knee")!;
    const seeded = editorDraftOf(normalizeRoutinePreset({ id: seed.id, ...startingSeedDoc(seed) }));
    expect(templateChanged({ ...seeded }, seeded)).toBe(false);
    expect(isEmptyEdit(templateEdit({ ...seeded }, seeded))).toBe(true);
  });

  it("compares as it is written: a trailing space on the name is no change", () => {
    const opened = editorDraftOf(plain());
    expect(templateChanged({ ...opened, name: "Full body " }, opened)).toBe(false);
    expect(templateChanged({ ...opened, name: "Full body two" }, opened)).toBe(true);
  });
});

describe("an edit writes only what changed, each field whole", () => {
  it("writes the one field changed", () => {
    const opened = editorDraftOf(plain());
    const edit = templateEdit({ ...opened, description: "  For a new client. " }, opened);
    expect(edit).toEqual({ fields: { description: "For a new client." }, removeStart: false });
  });

  it("writes a machine's note taken out as the whole map, so it doesn't come back", () => {
    const opened = editorDraftOf(plain());
    const edit = templateEdit({ ...opened, machineNotes: {} }, opened);
    expect(edit.fields).toEqual({ machineNotes: {} });
  });

  it("writes the start part whole when it is switched on or changed", () => {
    const opened = editorDraftOf(plain());
    const on = templateEdit({ ...opened, start: { dayOne: ["m-leg-press", "m-compound-row"], matchWords: ["low back"] } }, opened);
    expect(on).toEqual({ fields: { start: { dayOne: ["m-leg-press", "m-compound-row"], matchWords: ["low back"] } }, removeStart: false });

    const starting = editorDraftOf(plain({ start: { dayOne: ["m-leg-press"], matchWords: ["low back", "sciatica"], default: true } as never }));
    const fewer = templateEdit({ ...starting, start: { dayOne: ["m-leg-press"], matchWords: ["low back"] } }, starting);
    // The word and the default taken out are gone from what is written: no merge keeps them.
    expect(fewer).toEqual({ fields: { start: { dayOne: ["m-leg-press"], matchWords: ["low back"] } }, removeStart: false });
  });

  it("removes the start part when the switch goes off, and keeps it beside the template, default left out", () => {
    const starting = editorDraftOf(plain({ start: { dayOne: ["m-leg-press"], matchWords: ["knee"], default: true } as never }));
    const { start: _gone, ...off } = starting;
    expect(templateEdit(off, starting)).toEqual({
      fields: {},
      removeStart: true,
      park: { dayOne: ["m-leg-press"], matchWords: ["knee"] },
    });
    expect(isEmptyEdit(templateEdit(off, starting))).toBe(false);
  });

  it("keeps a seeded routine's steps, source and kind when it is switched off, which the editor can't put back", () => {
    const seed = academyStartingRoutines().find((r) => r.id === "academy-knee")!;
    const seeded = editorDraftOf(normalizeRoutinePreset({ id: seed.id, ...startingSeedDoc(seed) }));
    const { start: was, ...off } = seeded;
    const edit = templateEdit(off, seeded);
    expect(edit.park).toEqual(was);
    expect(edit.park?.steps?.length).toBeGreaterThan(0);
    expect(edit.park?.source).toBeTruthy();
    expect(edit.park?.kind).toBe("condition");
  });

  it("opens a template switched off with its kept part, unchanged until the switch goes back on", () => {
    const kept = { dayOne: ["m-leg-press"], matchWords: ["knee"], source: "head office" };
    const opened = editorDraftOf(plain({ startParked: { ...kept, matchWords: ["Knee"] } as never }));
    expect("start" in opened).toBe(false);
    expect(opened.startParked).toEqual(kept);
    expect(templateChanged({ ...opened }, opened)).toBe(false);
    // Another field changed: the kept part is left where it is.
    expect(templateEdit({ ...opened, name: "Knee start" }, opened)).toEqual({ fields: { name: "Knee start" }, removeStart: false });
    // Switched back on with it: the part is written whole and the kept copy goes.
    const on = templateEdit({ ...opened, start: opened.startParked }, opened);
    expect(on).toEqual({ fields: { start: kept }, removeStart: false, unpark: true });
    expect(isEmptyEdit(on)).toBe(false);
  });

  it("takes a machine out of day one and the steps when it leaves the template", () => {
    const starting = editorDraftOf(
      plain({ start: { dayOne: ["m-leg-press", "m-lumbar"], steps: [{ label: "Consultation", machineIds: ["m-leg-press", "m-lumbar"] }] } as never }),
    );
    const edit = templateEdit({ ...starting, machineIds: ["m-leg-press", "m-compound-row"] }, starting);
    expect(edit.fields.machineIds).toEqual(["m-leg-press", "m-compound-row"]);
    expect(edit.fields.start).toEqual({ dayOne: ["m-leg-press"], steps: [{ label: "Consultation", machineIds: ["m-leg-press"] }] });
  });

  it("never writes head office's default on a studio's template", () => {
    const studio = editorDraftOf(plain({ tier: "studio", scope: "westlake", studioId: "westlake" }));
    expect(templateContent({ ...studio, start: { dayOne: ["m-leg-press"], default: true } }).start).toEqual({ dayOne: ["m-leg-press"] });
  });
});

// @vitest-environment jsdom
/**
 * PROGRAMMING → ROUTINE A'S PLAN, MOUNTED (the first-session design round,
 * Oct 8 2026, §4.3 and §4.4; AJ's "1d").
 *
 * The real Start a plan panel, the real Lineup and its sheets, over the
 * real `useStartingRoutines` (its two reads answered here: none in the app,
 * so the Academy's eleven) and a host whose writes are recorded. What
 * matters is silent when wrong:
 *   - each kind of "no routine" gets its own door, and a read that failed
 *     never says "no routine" or offers anything that would write one;
 *   - Keep this lineup is ONE start, with an EMPTY Routine A and day one on
 *     the plan (the consult is not Routine A), and nothing is written
 *     before it, while a changed draft is registered as unsaved;
 *   - a change on the Lineup asks why and saves without an answer (AJ, Oct 7
 *     2026: "Any trainer who trains the client can definitely change the
 *     plan ... You should be able to change that and make the call as a
 *     trainer because you're training them that day", and "it's nice to be
 *     able to communicate like, hey, I'm changing this plan because of this
 *     reason");
 *   - can't do reshapes the plan, and offers a Health note only for a
 *     surgery or an injury, written only when ticked;
 *   - the Changes are one list, the plan's and the old adjustments, newest
 *     first, and a read that failed says so;
 *   - every name is drawn whole.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));
/* The starting routines' two reads: none in the app (so the Academy's eleven) unless a test says otherwise. */
const startingReads = vi.hoisted(() => {
  const answered = {
    routines: () => Promise.resolve({ routines: [] as unknown[], known: true }),
    choice: () => Promise.resolve({ use: null as string[] | null, defaultId: null as string | null }),
  };
  return { answered, now: { ...answered } };
});
vi.mock("../starting-store", () => ({
  readStartingRoutines: () => startingReads.now.routines(),
  readStartingChoice: () => startingReads.now.choice(),
}));

/* The switch is base-ui's, which reads PointerEvent (jsdom has none). */
if (!("PointerEvent" in globalThis)) (globalThis as Record<string, unknown>).PointerEvent = MouseEvent;
/* The sheets are base-ui dialogs, which want both. */
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import type { Machine, Routine, RoutineAdjustment, Trainer } from "../../../types";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import { UnsavedChangesProvider, useUnsavedStatus, type UnsavedStatus } from "../../unsaved-changes";
import { startingKindOf } from "../client-kind";
import { roadGroups, type PlanWrite } from "../lineup";
import type { StoredPlanChange } from "../store";
import type { RoutinePlan } from "../types";
import type { HealthNoteCall, PlanHost, StartPlanCall } from "./host";
import { machineNamer } from "./host";
import { PlanChangesList } from "./PlanChangesList";
import { PlanLineup } from "./PlanLineup";
import { RoadStrip } from "./RoadStrip";
import { StartPlanPanel } from "./StartPlanPanel";
import { RoutinesTab } from "../../routines/RoutinesTab";
import { buildRoutineRows } from "../../routines/routine-rows";

const IDS = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
];
const FLOOR: Machine[] = IDS.map((id) => ({ id, name: ACADEMY_MOVEMENT_NAME[id] ?? id }) as Machine);
const nameOf = machineNamer(FLOOR, []);
const TODAY = "2026-10-08";

type Calls = { starts: StartPlanCall[]; saves: Array<{ routineId: string; write: PlanWrite }>; notes: HealthNoteCall[]; reads: string[] };
let calls: Calls;
let changes: () => Promise<StoredPlanChange[]>;

function hostOf(kind: Parameters<typeof startingKindOf>[0] | "can't read", over: Partial<PlanHost> = {}): PlanHost {
  return {
    status: kind === "can't read" ? "failed" : "ready",
    kind: startingKindOf(
      kind === "can't read"
        ? { known: false, hasRoutine: false, hasPlan: false, journeySessions: null, coverage: "unknown", provisionalNewClient: false }
        : kind,
    ),
    floor: FLOOR,
    studioId: "westlake",
    studioName: "Westlake",
    who: { uid: "uid-sam", name: "Sam Lee" },
    todayYmd: TODAY,
    intakeText: "Sciatica down the left leg",
    actions: {
      start: (c) => calls.starts.push(c),
      save: (routineId, write) => calls.saves.push({ routineId, write }),
      healthNote: (n) => calls.notes.push(n),
      readChanges: (routineId) => {
        calls.reads.push(routineId);
        return changes();
      },
    },
    ...over,
  };
}
const NEW_TO_STUDIO = { known: true, hasRoutine: false, hasPlan: false, journeySessions: 0, coverage: "complete", provisionalNewClient: false } as const;
const NEW_TO_JOURNEY = { known: true, hasRoutine: false, hasPlan: false, journeySessions: null, coverage: "partial", provisionalNewClient: false } as const;
const CANT_TELL = { known: true, hasRoutine: false, hasPlan: false, journeySessions: 0, coverage: "unknown", provisionalNewClient: false } as const;

let root: Root | null = null;
let el: HTMLElement | null = null;
let status: UnsavedStatus | null = null;
function Probe() {
  status = useUnsavedStatus();
  return null;
}

async function mount(node: React.ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <UnsavedChangesProvider>
        <Probe />
        {node}
      </UnsavedChangesProvider>,
    );
  });
  await act(async () => {});
}

const page = () => document.body;
const text = () => page().textContent ?? "";
const buttons = () => Array.from(page().querySelectorAll("button"));
function button(label: string | RegExp): HTMLButtonElement {
  const found = buttons().find((b) => {
    const words = (b.getAttribute("aria-label") || b.textContent || "").trim();
    return typeof label === "string" ? words === label : label.test(words);
  });
  if (!found) throw new Error(`no button ${String(label)} among: ${buttons().map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).join(" | ")}`);
  return found as HTMLButtonElement;
}
const has = (label: string | RegExp) => {
  try {
    button(label);
    return true;
  } catch {
    return false;
  }
};
async function tap(label: string | RegExp) {
  await act(async () => {
    button(label).click();
  });
  await act(async () => {});
}

beforeEach(() => {
  calls = { starts: [], saves: [], notes: [], reads: [] };
  changes = () => Promise.resolve([]);
  startingReads.now = { ...startingReads.answered };
});

/** Type into an input the way React hears it. */
async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  status = null;
  document.body.innerHTML = "";
});

/* ── Start a plan ───────────────────────────────────────────────────────── */

describe("Start a plan: each kind of no routine gets its own door", () => {
  it("new to the studio: the starting lineup, from the starting routine the intake names, with its source", async () => {
    await mount(<StartPlanPanel host={hostOf(NEW_TO_STUDIO)} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    expect(text()).toContain("Dana's starting lineup");
    expect(text()).toContain("Day one");
    expect(text()).toContain("On deck");
    expect(text()).toContain("Not for Dana");
    expect(text()).toContain("Low back issues");
    expect(text()).toContain("Next");
    expect(has("Keep this lineup")).toBe(true);
    expect(has("Build it yourself")).toBe(true);
    expect(text()).toContain("Another start");
    // The why is a tap away.
    expect(text()).not.toContain("Matched from the intake");
    await tap("Why this start");
    expect(text()).toContain("Matched from the intake: sciatica");
  });

  it("new to Journey: no suggestion, the floor by family and Save Routine A", async () => {
    await mount(<StartPlanPanel host={hostOf(NEW_TO_JOURNEY)} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    expect(text()).toContain("This studio's floor");
    expect(text()).toContain("Dana's Routine A");
    expect(text()).toContain("Lower Body");
    expect(has("Keep this lineup")).toBe(false);
    expect(button("Save Routine A").disabled).toBe(true);
    await tap(nameOf("m-leg-press"));
    await tap(nameOf("m-compound-row"));
    expect(status!.anyDirty()).toBe(true);
    expect(calls.starts).toEqual([]);
    await tap("Save Routine A");
    expect(calls.starts).toHaveLength(1);
    const [s] = calls.starts;
    expect(s.machineIds).toEqual(["m-leg-press", "m-compound-row"]);
    expect(s.plan.intended).toEqual(["m-leg-press", "m-compound-row"]);
    expect(s.plan.building).toBe(false);
    expect(s.change).toEqual({ kind: "start", machineIds: ["m-leg-press", "m-compound-row"], byUid: "uid-sam", byName: "Sam Lee" });
    expect("reason" in s.change).toBe(false);
  });

  it("can't tell: two doors, claiming neither, and back again", async () => {
    await mount(<StartPlanPanel host={hostOf(CANT_TELL)} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    expect(text()).toContain("How does Dana start?");
    expect(has(/Starting out here/)).toBe(true);
    expect(has(/Trained here before/)).toBe(true);
    expect(has("Keep this lineup")).toBe(false);
    await tap(/Starting out here/);
    expect(text()).toContain("Dana's starting lineup");
    await tap("Both ways to start");
    expect(text()).toContain("How does Dana start?");
  });

  it("a read that failed says Journey can't tell, never 'no routine', and offers nothing that writes", async () => {
    await mount(<StartPlanPanel host={hostOf("can't read")} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    expect(text()).toContain("can't tell");
    expect(text()).not.toMatch(/no routine/i);
    for (const label of ["Keep this lineup", "Save Routine A", /Starting out here/, /Trained here before/]) expect(has(label)).toBe(false);
  });

  it("a read that hasn't answered waits", async () => {
    await mount(<StartPlanPanel host={{ ...hostOf(NEW_TO_STUDIO), status: "loading" }} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    expect(text()).toContain("Reading Dana's routines");
    expect(has("Keep this lineup")).toBe(false);
  });

  it("while the starting routines are read, suggests nothing and keeps nothing: no lineup to swap underneath", async () => {
    startingReads.now.routines = () => new Promise(() => {});
    await mount(<StartPlanPanel host={hostOf(NEW_TO_STUDIO)} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    expect(text()).toContain("Reading the starting routines…");
    expect(button(/Keep this lineup/).disabled).toBe(true);
    expect(text()).not.toContain("Another start");
    expect(text()).not.toContain("Low back issues");
    expect(page().querySelector(".rpl-list button.rpl-cell")).toBeNull();
    // Building it by hand never waits on them.
    expect(has("Build it yourself")).toBe(true);
  });

  it("when the starting routines couldn't be read, claims no default and no match: the trainer picks, and Keep names the pick", async () => {
    startingReads.now.choice = () => Promise.reject(new Error("offline"));
    await mount(<StartPlanPanel host={hostOf(NEW_TO_STUDIO)} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    expect(text()).toContain("Couldn't read Westlake's starting routines just now. Pick the one that fits.");
    expect(text()).not.toContain("suggested");
    expect(text()).not.toContain("until head office adds its own");
    expect(button(/Keep this lineup/).disabled).toBe(true);
    await tap(/Low back issues/);
    expect(button(/Keep this lineup/).disabled).toBe(false);
    await tap(/Keep this lineup/);
    expect(calls.starts).toHaveLength(1);
    expect(calls.starts[0].plan.templateId).toBe("academy-low-back");
    expect(calls.starts[0].change).toMatchObject({ kind: "start", value: "Low back issues" });
  });
});

describe("Keep this lineup", () => {
  it("writes nothing before it, registers a changed draft, then issues ONE start with an empty Routine A and day one on the plan", async () => {
    await mount(<StartPlanPanel host={hostOf(NEW_TO_STUDIO)} firstName="Dana" nameOf={nameOf} routineAId="rA-empty" />);
    expect(status!.anyDirty()).toBe(false);
    // A row's sheet changes the draft: Move down.
    const firstRow = page().querySelector<HTMLButtonElement>(".rpl-list button.rpl-cell")!;
    const firstName = firstRow.querySelector(".rpl-cell__name")!.textContent!;
    await act(async () => firstRow.click());
    await tap("Move down");
    expect(page().querySelector(".rpl-list button.rpl-cell .rpl-cell__name")!.textContent).not.toBe(firstName);
    expect(status!.anyDirty()).toBe(true);
    expect(calls.starts).toEqual([]);
    expect(calls.saves).toEqual([]);

    await tap(/Keep this lineup/);
    expect(calls.starts).toHaveLength(1);
    expect(calls.saves).toEqual([]);
    const [s] = calls.starts;
    expect(s.routineId).toBe("rA-empty");
    // The consult is not Routine A (AJ, Oct 8 2026): Routine A starts empty.
    expect(s.machineIds).toEqual([]);
    expect(s.plan.dayOne!.length).toBeGreaterThan(0);
    expect(s.plan.dayOne![1]).toBe(Object.keys(ACADEMY_MOVEMENT_NAME).find((id) => ACADEMY_MOVEMENT_NAME[id] === firstName));
    expect(s.plan.building).toBe(true);
    expect(s.plan.templateId).toBe("academy-low-back");
    expect(s.change).toMatchObject({ kind: "start", value: "Low back issues", byUid: "uid-sam" });
    expect(s.change.machineIds).toEqual(s.plan.intended);
  });

  it("carries a Health note asked for in the draft only when the lineup is kept", async () => {
    await mount(<StartPlanPanel host={hostOf(NEW_TO_STUDIO)} firstName="Dana" nameOf={nameOf} routineAId={null} />);
    await tap(/^Can't do$/);
    await tap(nameOf("m-leg-press"));
    await tap("Surgery");
    await tap(/Also add a Health note/);
    await tap("Save");
    expect(calls.notes).toEqual([]);
    expect(text()).toContain("Not for Dana");
    await tap(/Keep this lineup/);
    expect(calls.notes).toHaveLength(1);
    expect(calls.notes[0]).toMatchObject({ machineId: "m-leg-press", flavour: "Surgery" });
    expect(calls.starts[0].plan.intended).not.toContain("m-leg-press");
  });
});

/* ── The Lineup ─────────────────────────────────────────────────────────── */

const PLAN: RoutinePlan = {
  purpose: "Learning the protocol: the starting routine",
  intended: ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press", "m-hip-abd", "m-pulldown"],
  dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
  building: true,
  templateId: "academy-low-back",
  madeByUid: "uid-sam",
};
const ROUTINE = (machineIds: string[], plan: RoutinePlan = PLAN) =>
  ({ id: "rA", name: "Routine A", clientId: "c1", machineIds, plan }) as Routine & { id: string; plan: RoutinePlan };

function lineup(machineIds: string[], plan: RoutinePlan = PLAN, adjustments: RoutineAdjustment[] = []) {
  return (
    <PlanLineup
      routine={ROUTINE(machineIds, plan)}
      rows={[]}
      head={<header>Routine A</header>}
      host={hostOf({ ...NEW_TO_STUDIO, hasPlan: true })}
      firstName="Dana"
      nameOf={nameOf}
      adjustments={adjustments}
      trainers={[]}
    />
  );
}

describe("the Lineup", () => {
  it("draws day one where Routine A would be while it is empty, and never offers Add to A now then", async () => {
    await mount(lineup([]));
    expect(text()).toContain(`0 of 6 · day one: ${nameOf("m-leg-press")}, ${nameOf("m-compound-row")} and ${nameOf("m-lumbar")}`);
    expect(text()).toContain("Routine A is empty until the first visit");
    expect(has("Add to A now")).toBe(false);
  });

  it("offers Add to A now on the Next row only once Routine A has machines", async () => {
    await mount(lineup(["m-leg-press", "m-compound-row", "m-lumbar"]));
    expect(text()).toContain(`3 of 6 · next: ${nameOf("m-chest-press")}`);
    expect(buttons().filter((b) => b.textContent?.trim() === "Add to A now")).toHaveLength(1);
  });

  it("a row change asks why and saves without an answer, never awaited; a reason given rides on it", async () => {
    await mount(lineup(["m-leg-press", "m-compound-row", "m-lumbar"]));
    await tap(`Change ${nameOf("m-compound-row")} in the plan`);
    await tap("Move up");
    expect(text()).toContain(`Move ${nameOf("m-compound-row")} up`);
    expect(text()).toContain("Optional");
    expect(calls.saves).toEqual([]);
    await tap("Save change");
    expect(calls.saves).toHaveLength(1);
    const first = calls.saves[0];
    expect(first.routineId).toBe("rA");
    expect(first.write.change.kind).toBe("reorder");
    expect("reason" in first.write.change).toBe(false);
    expect(first.write.machineIds).toEqual(["m-compound-row", "m-leg-press", "m-lumbar"]);

    await tap(`Change ${nameOf("m-lumbar")} in the plan`);
    await tap("Move up");
    await tap("Client asked");
    await tap("Save change");
    expect(calls.saves[1].write.change.reason).toBe("Client asked");
  });

  it("can't do reshapes the plan, says what stands in, and offers a Health note only for a surgery or an injury", async () => {
    await mount(lineup(["m-leg-press", "m-compound-row", "m-lumbar"]));
    await tap(`Change ${nameOf("m-compound-row")} in the plan`);
    await tap("Not for Dana");
    await tap("Doesn't fit the machine");
    expect(has(/Also add a Health note/)).toBe(false);
    await tap("Surgery");
    expect(has(/Also add a Health note/)).toBe(true);
    // Unticked until the trainer ticks it: asked, never automatic.
    await tap("Save");
    expect(calls.notes).toEqual([]);
    const w = calls.saves[0].write;
    expect(w.change).toMatchObject({ kind: "cantdo", machineIds: ["m-compound-row"], value: "Surgery · cleared" });
    expect(w.plan.cantDo?.[0].machineId).toBe("m-compound-row");
    expect(w.machineIds).not.toContain("m-compound-row");
    expect(text()).toMatch(new RegExp(`instead of ${nameOf("m-compound-row")}`));

    await tap(`Change ${nameOf("m-lumbar")} in the plan`);
    await tap("Not for Dana");
    await tap("Injury or pain");
    await tap(/Also add a Health note/);
    await tap("Save");
    expect(calls.notes).toHaveLength(1);
    expect(calls.notes[0]).toMatchObject({ machineId: "m-lumbar", flavour: "Injury" });
    expect(calls.notes[0].body).toContain(nameOf("m-lumbar"));
    expect(calls.notes[0].body).not.toMatch(/\b(she|he|her|his)\b/i);
  });

  it("draws Routine A's rows as Programming always has (the settings, the load), the row opening the machine's card", async () => {
    const opened: string[] = [];
    const routine = ROUTINE(["m-leg-press", "m-lumbar"]);
    const rows = buildRoutineRows(routine, FLOOR, null, {
      "m-leg-press": { clientId: "c1", machineId: "m-leg-press", settings: { Seat: "5" }, updatedBy: "t", updatedAt: null },
    }, [], []);
    await mount(
      <PlanLineup
        routine={routine}
        rows={rows}
        head={<header>Routine A</header>}
        host={hostOf({ ...NEW_TO_STUDIO, hasPlan: true })}
        firstName="Dana"
        nameOf={nameOf}
        adjustments={[]}
        trainers={[]}
        onSelectMachine={(id) => opened.push(id)}
      />,
    );
    expect(page().querySelectorAll(".rt-cellrow")).toHaveLength(2);
    // The setting chips the list draws: the setting's first letter and its value.
    expect(Array.from(page().querySelectorAll(".eq-item__chip")).map((c) => c.textContent)).toEqual(["S 5"]);
    expect(text()).toContain("No load yet");
    await tap(`Open ${nameOf("m-leg-press")}`);
    expect(opened).toEqual(["m-leg-press"]);
    expect(has(`Change ${nameOf("m-leg-press")} in the plan`)).toBe(true);
  });

  it("Add to A now, the purpose and the being-built switch are plan changes too, each asking why", async () => {
    await mount(lineup(["m-leg-press", "m-compound-row", "m-lumbar"]));
    await tap("Add to A now");
    expect(text()).toContain(`Add ${nameOf("m-chest-press")} to Routine A now`);
    await tap("Save change");
    expect(calls.saves[0].write.change).toMatchObject({ kind: "add", machineIds: ["m-chest-press"], value: "routine" });
    expect(calls.saves[0].write.machineIds).toEqual(["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press"]);
    expect(calls.saves[0].write.plan).toEqual(PLAN);

    await tap("Change the purpose");
    const input = page().querySelector<HTMLInputElement>("input[aria-label='Purpose']")!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "The core: whole body");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(status!.anyDirty()).toBe(true);
    await tap("Save");
    await tap("Save change");
    expect(calls.saves[1].write.change).toMatchObject({ kind: "purpose", value: "The core: whole body" });
    expect(calls.saves[1].write.plan.purpose).toBe("The core: whole body");

    await act(async () => {
      page().querySelector<HTMLElement>("[role='switch']")!.click();
    });
    await act(async () => {});
    expect(text()).toContain("Turn off: Routine A is being built");
    await tap("Save change");
    expect(calls.saves[2].write.change).toMatchObject({ kind: "building", value: "off" });
    expect(calls.saves[2].write.plan.building).toBe(false);
  });

  it("re-plans: what changed, what is out for now, started again from the starting routine in one write with a divider", async () => {
    const plan: RoutinePlan = { ...PLAN, intended: ["m-leg-press", "m-compound-row", "m-lumbar"], dayOne: ["m-leg-press"] };
    await mount(lineup(["m-leg-press"], plan));
    await tap("Re-plan");
    await act(async () => {});
    await tap("Surgery coming up");
    await tap(nameOf("m-compound-row"));
    await tap(/^Start again from Low back issues with what we know$/);
    expect(calls.saves).toHaveLength(1);
    const w = calls.saves[0].write;
    expect(w.change).toMatchObject({ kind: "replan", value: "Surgery coming up", byUid: "uid-sam" });
    expect(w.change.machineIds).toEqual(w.plan.intended);
    expect(w.plan.intended).not.toContain("m-compound-row");
    expect(w.also).toEqual([expect.objectContaining({ kind: "cantdo", machineIds: ["m-compound-row"] })]);
    expect(w.plan.cantDo?.map((c) => c.machineId)).toEqual(["m-compound-row"]);
  });

  it("re-plans by hand: the road as it is, the history still gets its divider", async () => {
    await mount(lineup(["m-leg-press"]));
    await tap("Re-plan");
    await tap("Edit the lineup by hand");
    expect(calls.saves[0].write.change).toMatchObject({ kind: "replan", machineIds: PLAN.intended });
    expect("value" in calls.saves[0].write.change).toBe(false);
    expect(calls.saves[0].write.also).toEqual([]);
  });

  it("reads the plan's changes only when they are opened", async () => {
    await mount(lineup(["m-leg-press"]));
    expect(calls.reads).toEqual([]);
    await tap("Changes");
    expect(calls.reads).toEqual(["rA"]);
  });

  it("a count the Changes gave is not said as now once another change is made", async () => {
    changes = () => Promise.resolve([{ id: "p1", kind: "purpose", machineIds: [], value: "The core", byUid: "uid-sam", atMs: Date.UTC(2026, 9, 7, 15) }]);
    await mount(lineup(["m-leg-press", "m-compound-row", "m-lumbar"]));
    await tap("Changes");
    await tap("Close");
    expect(has("Changes · 1")).toBe(true);
    await tap(`Change ${nameOf("m-compound-row")} in the plan`);
    await tap("Move up");
    await tap("Save change");
    expect(has("Changes · 1")).toBe(false);
    expect(has("Changes")).toBe(true);
  });

  it("a typed purpose stays, still unsaved, when its Why is closed without saving", async () => {
    await mount(lineup(["m-leg-press"]));
    await tap("Change the purpose");
    await typeInto(page().querySelector<HTMLInputElement>("input[aria-label='Purpose']")!, "The core: whole body");
    await tap("Save");
    expect(text()).toContain("Change the purpose");
    await tap("Close");
    expect(calls.saves).toEqual([]);
    expect(page().querySelector<HTMLInputElement>("input[aria-label='Purpose']")!.value).toBe("The core: whole body");
    expect(status!.anyDirty()).toBe(true);
    await tap("Save");
    await tap("Save change");
    expect(calls.saves[0].write.plan.purpose).toBe("The core: whole body");
    expect(page().querySelector("input[aria-label='Purpose']")).toBeNull();
    expect(status!.anyDirty()).toBe(false);
  });

  it("a day already gone can't be an until-date: the mark would have ended before it was made", async () => {
    await mount(lineup(["m-leg-press", "m-compound-row", "m-lumbar"]));
    await tap(`Change ${nameOf("m-lumbar")} in the plan`);
    await tap("Not for Dana");
    await tap("Until a date");
    const until = page().querySelector<HTMLInputElement>("input[aria-label='Until']")!;
    await typeInto(until, "2026-10-01");
    expect(button("Save").disabled).toBe(true);
    expect(text()).toContain("Pick today or a later day.");
    await typeInto(until, "2026-10-20");
    expect(button("Save").disabled).toBe(false);
    await tap("Save");
    expect(calls.saves[0].write.plan.cantDo?.[0]).toMatchObject({ machineId: "m-lumbar", until: "2026-10-20" });
  });

  it("a surgery coming up benches what is out as a surgery, and offers ONE Health note for them, only when ticked", async () => {
    await mount(lineup(["m-leg-press"]));
    await tap("Re-plan");
    await tap("Client asked");
    await tap(nameOf("m-compound-row"));
    expect(has(/Also add a Health note/)).toBe(false);
    await tap("Client asked");
    await tap("Surgery coming up");
    expect(has(/Also add a Health note/)).toBe(true);
    await tap(nameOf("m-lumbar"));
    await tap(/Also add a Health note/);
    await tap("Edit the lineup by hand");
    const w = calls.saves[0].write;
    expect(w.plan.cantDo?.map((c) => [c.machineId, c.reason])).toEqual([
      ["m-compound-row", "Surgery"],
      ["m-lumbar", "Surgery"],
    ]);
    expect(calls.notes).toHaveLength(1);
    expect(calls.notes[0]).toMatchObject({ machineId: null, flavour: "Surgery" });
    expect(calls.notes[0].body).toBe(`Surgery: ${nameOf("m-compound-row")} and ${nameOf("m-lumbar")} are off Routine A's plan until cleared.`);
  });

  it("a surgery re-plan not ticked writes no Health note", async () => {
    await mount(lineup(["m-leg-press"]));
    await tap("Re-plan");
    await tap("Surgery coming up");
    await tap(nameOf("m-compound-row"));
    await tap("Edit the lineup by hand");
    expect(calls.saves[0].write.plan.cantDo?.[0].reason).toBe("Surgery");
    expect(calls.notes).toEqual([]);
  });
});

/* ── The Changes ────────────────────────────────────────────────────────── */

describe("the Changes", () => {
  const trainers = [
    { id: "t-sam", authUid: "uid-sam", fullName: "Sam Lee", initials: "SL" },
    { id: "t-kim", fullName: "Kim Park", initials: "KP" },
  ] as Trainer[];

  it("are one list, the plan's changes and the old adjustments, newest first, the reason when given and a Re-plan a divider", async () => {
    const plan: StoredPlanChange[] = [
      { id: "p2", kind: "swap", machineIds: ["m-compound-row", "m-simple-row"], byUid: "uid-sam", reason: "Client asked", atMs: Date.UTC(2026, 9, 7, 15) },
      { id: "p0", kind: "replan", machineIds: [], value: "Surgery coming up", byUid: "uid-sam", atMs: Date.UTC(2026, 9, 1, 15) },
    ];
    const adjustments = [
      {
        id: "a1",
        routineId: "rA",
        clientId: "c1",
        previousMachineIds: ["m-leg-press"],
        newMachineIds: ["m-leg-press", "m-lumbar"],
        trainerId: "t-kim",
        changeType: "machines",
        createdAt: Date.UTC(2026, 9, 4, 15),
      },
    ] as RoutineAdjustment[];
    await mount(
      <PlanChangesList
        routineId="rA"
        adjustments={adjustments}
        trainers={trainers}
        nameOf={nameOf}
        firstName="Dana"
        todayYmd={TODAY}
        read={() => Promise.resolve(plan)}
      />,
    );
    const rows = Array.from(page().querySelectorAll(".rpl-changes > li")).map((li) => li.textContent ?? "");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain(`${nameOf("m-simple-row")} instead of ${nameOf("m-compound-row")}`);
    expect(rows[0]).toContain("Sam Lee");
    expect(rows[0]).toContain("Client asked");
    expect(rows[1]).toContain(`Added ${nameOf("m-lumbar")}`);
    expect(rows[1]).toContain("Kim Park");
    expect(rows[2]).toContain("Re-planned");
    expect(rows[2]).toContain("Surgery coming up");
  });

  it("a read that failed says so, never 'no changes'", async () => {
    await mount(
      <PlanChangesList routineId="rA" adjustments={[]} trainers={trainers} nameOf={nameOf} todayYmd={TODAY} read={() => Promise.reject(new Error("offline"))} />,
    );
    expect(text()).toContain("Couldn't read the plan's changes");
    expect(text()).not.toContain("No changes");
  });
});

/* ── The Road ───────────────────────────────────────────────────────────── */

describe("the Road's one-line route", () => {
  it("brackets today, marks the next stop, crosses what the client can't do, and draws every name whole", async () => {
    const long = "Hammer Strength Iso-Lateral Super Incline Press (the one by the window)";
    const names = (id: string) => (id === "sm-incline" ? long : nameOf(id));
    const plan: RoutinePlan = {
      ...PLAN,
      intended: [...PLAN.intended, "sm-incline"],
      cantDo: [{ machineId: "m-dip", until: "cleared", day: TODAY, byUid: "uid-sam" }],
    };
    await mount(
      <RoadStrip
        groups={roadGroups({ plan, today: PLAN.dayOne!, todayYmd: TODAY, firstName: "Dana" })}
        nameOf={names}
        progressLine="0 of 7 · day one"
      />,
    );
    expect(text()).toContain("Today · 3");
    expect(text()).toContain("Next stop");
    expect(text()).toContain("Not for Dana");
    expect(text()).toContain(long);
    const stations = Array.from(page().querySelectorAll(".rpl-road__stop")).map((s) => s.getAttribute("data-kind"));
    expect(stations).toEqual(["in", "in", "in", "next", "planned", "planned", "planned", "cantdo"]);
    // The long name is drawn whole, in the station's own words too, under a
    // class with no truncate beside it; the stylesheet's wrap is held by
    // names-wrap.test.ts (rpl-road__name).
    const longStop = Array.from(page().querySelectorAll(".rpl-road__stop")).find((s) => s.textContent?.includes(long));
    expect(longStop?.getAttribute("aria-label")).toBe(`${long}, planned`);
    expect(longStop?.querySelector(".rpl-road__name")?.textContent).toBe(long);
    expect(page().querySelector(".rpl-road__name")!.className).toBe("rpl-road__name");
  });
});

/* ── Routine A on Programming ───────────────────────────────────────────── */

describe("Routine A on Programming", () => {
  const base = {
    client: { id: "c1", firstName: "Dana", homeStudioId: "westlake" } as never,
    clientId: "c1",
    machines: FLOOR,
    clientSettings: {},
    allLogs: [],
    sessions: [],
    adjustments: [],
    trainers: [],
    selectedRoutineTodayId: null,
    isBActive: false,
    onEdit: vi.fn(),
    onToggleB: vi.fn(),
    view: "Routine A" as const,
  };

  it("a routine with no plan draws as it always has, with a quiet Add a plan that writes a plan of it as it stands", async () => {
    const routine = { id: "rA", name: "Routine A", clientId: "c1", machineIds: ["m-leg-press", "m-lumbar"] } as Routine;
    await mount(<RoutinesTab {...base} routines={[routine]} plan={hostOf({ ...NEW_TO_STUDIO, hasRoutine: true })} />);
    expect(text()).toContain(nameOf("m-leg-press"));
    await tap("Add a plan");
    expect(calls.starts).toHaveLength(1);
    expect(calls.starts[0]).toMatchObject({ routineId: "rA", machineIds: ["m-leg-press", "m-lumbar"] });
    expect(calls.starts[0].plan).toMatchObject({ intended: ["m-leg-press", "m-lumbar"], building: false });
  });

  it("a plan on Routine A draws the Lineup in place of the old Changes", async () => {
    await mount(<RoutinesTab {...base} routines={[ROUTINE(["m-leg-press"])]} plan={hostOf({ ...NEW_TO_STUDIO, hasPlan: true })} />);
    expect(page().querySelector("[aria-label='The lineup']")).not.toBeNull();
    expect(page().querySelector(".rt-changes")).toBeNull();
  });

  it("a Routine B with machines is a routine, even while Journey can't tell the client's kind: never Start a plan over it", async () => {
    const b = { id: "rB", name: "Routine B", clientId: "c1", machineIds: ["m-leg-press"] } as Routine;
    const unknownKind = { ...hostOf(CANT_TELL), kind: startingKindOf({ ...CANT_TELL, known: false, hasRoutine: true }) };
    await mount(<RoutinesTab {...base} routines={[b]} plan={unknownKind} />);
    expect(text()).not.toContain("How does Dana start?");
    expect(has("Keep this lineup")).toBe(false);
    expect(text()).toContain("No machines yet");
  });

  it("without a plan host it draws as it always has", async () => {
    await mount(<RoutinesTab {...base} routines={[]} />);
    expect(text()).toContain("No machines yet");
    expect(has("Keep this lineup")).toBe(false);
  });
});

// @vitest-environment jsdom
/**
 * THE PLAN IN THE SESSION, MOUNTED (the first-session design round, Oct 8
 * 2026, §4.6): the grid corner's "The plan · 3 of 6", the plan's sheet and
 * the Academy column's sheet, over the real `useSessionPlan`, with the plan's
 * writer (`store.ts`'s `savePlanChange`) recorded and NEVER answering, as
 * offline it never does.
 *
 * AJ, Oct 7 2026 (Q6): "Any trainer who trains the client can definitely
 * change the plan ... Again, you shouldn't really be blocked. ... You should
 * be able to change that and make the call as a trainer because you're
 * training them that day." And: "it's nice to be able to communicate like,
 * hey, I'm changing this plan because of this reason". What matters is
 * silent when wrong:
 *   - a change issues ONE `savePlanChange`, its reason only when one was
 *     given, and the screen moves on without its answer;
 *   - it reaches today's order only for a machine with no set logged today,
 *     and says so when it doesn't;
 *   - picking the Academy's column is one "column" change on Routine A's
 *     plan, or, with no plan, kept for today and written nowhere;
 *   - the plan's next machine is offered only while the session runs
 *     Routine A.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useMemo, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));

/* The plan's writer, recorded; its commit never answers (offline). */
const store = vi.hoisted(() => ({ calls: [] as Array<{ routineId: string; input: Record<string, any> }> }));
vi.mock("../store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../store")>()),
  savePlanChange: (_db: unknown, routineId: string, input: Record<string, any>) => {
    store.calls.push({ routineId, input });
    return new Promise<void>(() => {});
  },
}));
/* Re-plan's one read of the starting routines: none in the app (so the Academy's eleven). */
vi.mock("../starting-store", () => ({
  readStartingRoutines: () => Promise.resolve({ routines: [], known: true }),
  readStartingChoice: () => Promise.resolve({ use: null, defaultId: null }),
}));
const notes = vi.hoisted(() => ({ written: [] as unknown[] }));
vi.mock("../../../hooks/useClientJournal", () => ({
  createJournalEntry: (...args: unknown[]) => {
    notes.written.push(args);
    return Promise.resolve("n1");
  },
}));
/* Base UI's menu does not open in jsdom (its positioning never settles), so
   the corner's menu is drawn open, with plain elements: what is tested is
   the corner's own items, words and handlers (ProfileHeader's test does the
   same). */
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div data-testid="menu">{children}</div>,
  DropdownMenuTrigger: ({ children, className }: { children: ReactNode; className?: string }) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <div role="menuitem" tabIndex={0} aria-disabled={disabled} onClick={disabled ? undefined : onClick}>
      {children}
    </div>
  ),
}));
if (!("PointerEvent" in globalThis)) (globalThis as Record<string, unknown>).PointerEvent = MouseEvent;
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import type { Machine, Routine } from "../../../types";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import { SessionCorner } from "../../journey-grid/SessionCorner";
import type { LiveSet } from "../../journey-grid/types";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { TODAY_SET_STAYS, setLoggedToday } from "../session-plan";
import type { RoutinePlan } from "../types";
import { machineNamer } from "./host";
import { SessionPlanSheet } from "./SessionPlanSheet";
import { StartingRangeSheet } from "./StartingRangeSheet";
import { useSessionPlan } from "./useSessionPlan";

const IDS = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
];
const FLOOR: Machine[] = IDS.map((id) => ({ id, name: ACADEMY_MOVEMENT_NAME[id] ?? id }) as Machine);
const nameOf = machineNamer(FLOOR, []);
const TODAY = "2026-10-08";
const WHO = { uid: "uid-sam", name: "Sam Lee" };
const ROAD = ["m-leg-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-ext", "m-chest-press"];
const DAY_ONE = ["m-leg-press", "m-compound-row", "m-lumbar"];
const PLAN: RoutinePlan = { purpose: "The core", intended: ROAD, dayOne: DAY_ONE, building: true, madeByUid: "uid-sam", templateId: "academy-low-back" };
const routineA = (plan: RoutinePlan | null = PLAN): Routine => ({
  id: "ra-1",
  clientId: "c-dana",
  name: "Routine A",
  machineIds: [],
  ...(plan ? { plan } : null),
});

function Harness({
  routines,
  sessionRoutineId = "ra-1",
  values = {},
  floorMachines = FLOOR,
  startToday = DAY_ONE,
}: {
  routines: Routine[];
  sessionRoutineId?: string | null;
  values?: Record<string, LiveSet>;
  floorMachines?: Machine[];
  startToday?: string[];
}) {
  const [today, setToday] = useState<string[]>(startToday);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<"pick" | "about" | null>(null);
  const floor = useMemo(() => floorMachines, [floorMachines]);
  const names = useMemo(() => machineNamer(floorMachines, []), [floorMachines]);
  const plan = useSessionPlan({
    routines,
    sessionId: "s-1",
    sessionRoutineId,
    today,
    floor,
    todayYmd: TODAY,
    who: WHO,
    onError: () => {},
    note: { clientId: "c-dana", studioId: "westlake", author: { id: "uid-sam", initials: "SL", fullName: "Sam Lee" }, link: { sessionId: "s-1", sessionNumber: 1, sessionDay: TODAY } },
  });
  return (
    <UnsavedChangesProvider>
      <SessionCorner
        showAll={false}
        routineCount={today.length}
        allCount={FLOOR.length}
        onShowAll={() => {}}
        onReorder={() => {}}
        plan={plan.plan && plan.progress ? { have: plan.progress.have, of: plan.progress.of } : null}
        onPlan={() => setOpen(true)}
        onKey={() => {}}
      />
      <p data-testid="today">{today.join(",")}</p>
      <p data-testid="next">{plan.next ?? "none"}</p>
      <p data-testid="column">{`${String(plan.column)}|${plan.columnForToday ? "for today" : "on the plan"}`}</p>
      <button type="button" onClick={() => setRange("pick")}>
        Ask for the range
      </button>
      {open && plan.plan && plan.routineA && (
        <SessionPlanSheet
          open
          onClose={() => setOpen(false)}
          firstName="Dana"
          plan={plan.plan}
          routine={plan.routineA.machineIds}
          today={today}
          runsA={plan.runsA}
          floor={plan.floorList}
          nameOf={names}
          todayYmd={TODAY}
          studioId="westlake"
          who={WHO}
          loggedToday={(id) => setLoggedToday(values[id])}
          onWrite={(w, t) => {
            plan.write(w);
            if (t) setToday(t.next);
          }}
          onHealthNote={plan.healthNote}
          startingColumn={plan.column}
          onStartingColumn={() => {
            setOpen(false);
            setRange("pick");
          }}
        />
      )}
      {range && (
        <StartingRangeSheet
          open
          mode={range}
          firstName="Dana"
          column={plan.column}
          keptOnPlan={!!plan.plan}
          onPick={(c) => {
            plan.pickColumn(c);
            setRange(null);
          }}
          onChangeColumn={() => setRange("pick")}
          onClose={() => setRange(null)}
        />
      )}
    </UnsavedChangesProvider>
  );
}

let root: Root | null = null;
let el: HTMLElement | null = null;
async function mount(node: ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(node));
  await act(async () => {});
}
const page = () => document.body;
const text = () => page().textContent ?? "";
const shown = (id: string) => page().querySelector(`[data-testid="${id}"]`)!.textContent;
const clickables = () => Array.from(page().querySelectorAll<HTMLElement>("button, [role='menuitem']"));
function control(label: string | RegExp): HTMLElement {
  const words = (b: HTMLElement) => (b.getAttribute("aria-label") || b.textContent || "").trim();
  const found = clickables().find((b) => (typeof label === "string" ? words(b) === label : label.test(words(b))));
  if (!found) throw new Error(`no control ${String(label)} among: ${clickables().map(words).join(" | ")}`);
  return found;
}
async function tap(label: string | RegExp) {
  await act(async () => control(label).click());
  await act(async () => {});
}

beforeEach(() => {
  store.calls = [];
  notes.written = [];
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  document.body.innerHTML = "";
});

describe("the plan from the session's corner (AJ's Q6)", () => {
  it("the corner says how much of the plan today runs, and opens the plan with today under its bracket", async () => {
    await mount(<Harness routines={[routineA()]} />);
    expect(shown("next")).toBe("m-hip-abd");
    await tap("The plan · 3 of 6");
    expect(text()).toContain("Routine A · the plan");
    expect(text()).toContain("Today · 3");
    expect(text()).toContain("Next stop");
    expect(text()).toContain(`3 of 6 · next: ${nameOf("m-hip-abd")}`);
    expect(store.calls).toEqual([]);
  });

  it("a swap issues ONE savePlanChange, without a reason when none was given, and moves on without its answer", async () => {
    await mount(<Harness routines={[routineA()]} />);
    await tap(/^The plan ·/);
    await tap(`Change ${nameOf("m-leg-press")} in the plan`);
    expect(text()).toContain("Swap in the plan");
    expect(text()).toContain("Can't do");
    await tap(nameOf("m-leg-curl"));
    expect(text()).toContain(`${nameOf("m-leg-curl")} instead of ${nameOf("m-leg-press")}`);
    // The reason is asked, never required.
    await tap("Save change");

    expect(store.calls).toHaveLength(1);
    const [{ routineId, input }] = store.calls;
    expect(routineId).toBe("ra-1");
    expect(input.change).toEqual({ kind: "swap", machineIds: ["m-leg-press", "m-leg-curl"], byUid: "uid-sam", byName: "Sam Lee" });
    expect(input.plan.intended[0]).toBe("m-leg-curl");
    expect(input.plan.dayOne).toEqual(["m-leg-curl", "m-compound-row", "m-lumbar"]);
    // Routine A is empty on day one: the swap leaves it so, and writes no machines.
    expect("machineIds" in input).toBe(false);
    // The commit never answered, and the session moved on: today's order and the sheet.
    expect(shown("today")).toBe("m-leg-curl,m-compound-row,m-lumbar");
    expect(text()).toContain("Routine A · the plan");
    expect(text()).toContain(`${nameOf("m-leg-curl")} instead of ${nameOf("m-leg-press")}`);
    expect(text()).not.toContain("from next session");
  });

  it("a reason given rides on the change", async () => {
    await mount(<Harness routines={[routineA()]} />);
    await tap(/^The plan ·/);
    await tap(`Change ${nameOf("m-leg-press")} in the plan`);
    await tap(nameOf("m-leg-curl"));
    await tap("Pain or injury");
    await tap("Save change");
    expect(store.calls[0].input.change.reason).toBe("Pain or injury");
  });

  it("today's set stays: a machine with a set logged today keeps its place, and the plan changes from next session", async () => {
    const values: Record<string, LiveSet> = { "m-leg-press": { weight: 80, reps: 11, seconds: null, isTSC: false, quality: 2 } };
    await mount(<Harness routines={[routineA()]} values={values} />);
    await tap(/^The plan ·/);
    await tap(`Change ${nameOf("m-leg-press")} in the plan`);
    expect(text()).toContain(TODAY_SET_STAYS);
    await tap(nameOf("m-leg-curl"));
    await tap("Save change");
    expect(store.calls).toHaveLength(1);
    expect(shown("today")).toBe(DAY_ONE.join(","));
    expect(text()).toContain(`${nameOf("m-leg-curl")} instead of ${nameOf("m-leg-press")} from next session`);
  });

  it("can't do reshapes the plan and today's order in one write, and writes a Health note only when ticked", async () => {
    await mount(<Harness routines={[routineA()]} />);
    await tap(/^The plan ·/);
    await tap(`Change ${nameOf("m-compound-row")} in the plan`);
    await tap("Can't do");
    expect(text()).toContain(`${nameOf("m-compound-row")} · not for Dana`);
    await tap("Injury or pain");
    expect(text()).toContain("Also add a Health note");
    await tap("Save");
    expect(store.calls).toHaveLength(1);
    const { input } = store.calls[0];
    expect(input.change.kind).toBe("cantdo");
    expect(input.change.machineIds).toEqual(["m-compound-row"]);
    expect(input.plan.cantDo).toHaveLength(1);
    expect(input.plan.cantDo[0]).toMatchObject({ machineId: "m-compound-row", reason: "Injury or pain", until: "cleared", byUid: "uid-sam" });
    expect(input.plan.intended).not.toContain("m-compound-row");
    expect(shown("today").split(",")).not.toContain("m-compound-row");
    expect(notes.written).toEqual([]);
  });

  it("Re-plan writes the re-plan and each machine it benched in the same write", async () => {
    await mount(<Harness routines={[routineA()]} />);
    await tap(/^The plan ·/);
    await tap("Re-plan");
    expect(text()).toContain("Re-plan Routine A");
    await tap("Found something in the first sessions");
    await tap(nameOf("m-lumbar"));
    await tap("Edit the lineup by hand");
    expect(store.calls).toHaveLength(1);
    const { input } = store.calls[0];
    expect(input.change).toMatchObject({ kind: "replan", value: "Found something in the first sessions", byUid: "uid-sam" });
    expect(input.also.map((c: { kind: string; machineIds: string[] }) => [c.kind, c.machineIds])).toEqual([["cantdo", ["m-lumbar"]]]);
    expect(shown("today").split(",")).not.toContain("m-lumbar");
    expect(text()).toContain("Re-planned");
  });

  it("the corner offers no plan, and the floor no next machine, without a plan on Routine A", async () => {
    await mount(<Harness routines={[routineA(null)]} />);
    expect(clickables().some((b) => /The plan/.test(b.textContent ?? ""))).toBe(false);
    expect(shown("next")).toBe("none");
  });

  it("offers the plan's next machine only while the session runs Routine A", async () => {
    await mount(<Harness routines={[routineA(), { id: "rb-1", clientId: "c-dana", name: "Routine B", machineIds: DAY_ONE }]} sessionRoutineId="rb-1" />);
    expect(shown("next")).toBe("none");
    // The plan itself is still a tap away.
    expect(control(/^The plan ·/)).toBeTruthy();
  });

  it("matches a studio's own unit in today's session to the plan's machine: In today, never 'Today only', and a can't-do takes the unit out of today", async () => {
    const floor = FLOOR.map((m) => (m.id === "m-leg-press" ? ({ id: "unit-7", name: "Hoist Leg Press", comparisonKey: "m-leg-press" } as Machine) : m));
    await mount(<Harness routines={[routineA()]} floorMachines={floor} startToday={["unit-7", "m-compound-row", "m-lumbar"]} />);
    await tap("The plan · 3 of 6");
    expect(text()).toContain(`3 of 6 · next: ${nameOf("m-hip-abd")}`);
    expect(text()).not.toContain("Today only");
    const legPress = control(`Change ${nameOf("m-leg-press")} in the plan`);
    expect(legPress.closest("li")?.textContent ?? legPress.textContent).toContain("In today");
    await tap(`Change ${nameOf("m-leg-press")} in the plan`);
    await tap("Can't do");
    await tap("Save");
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].input.change).toMatchObject({ kind: "cantdo", machineIds: ["m-leg-press"] });
    expect(shown("today").split(",")).not.toContain("unit-7");
  });

  it("in a Routine B session: counts Routine A's own machines, brackets them as Routine A, a swap leaves B's order alone, and a can't-do still takes the machine out of today", async () => {
    const a: Routine = { ...routineA(), machineIds: ["m-leg-press", "m-compound-row", "m-lumbar", "m-hip-abd"] };
    const b: Routine = { id: "rb-1", clientId: "c-dana", name: "Routine B", machineIds: DAY_ONE };
    await mount(<Harness routines={[a, b]} sessionRoutineId="rb-1" />);
    await tap("The plan · 4 of 6");
    expect(text()).toContain("Routine A · 4");
    expect(text()).not.toContain("Today · ");
    await tap(`Change ${nameOf("m-leg-press")} in the plan`);
    await tap(nameOf("m-leg-curl"));
    await tap("Save change");
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].input.change).toMatchObject({ kind: "swap", machineIds: ["m-leg-press", "m-leg-curl"] });
    expect(shown("today"), "B's order is B's").toBe(DAY_ONE.join(","));
    expect(text()).not.toContain("from next session");

    await tap(`Change ${nameOf("m-compound-row")} in the plan`);
    await tap("Can't do");
    await tap("Save");
    expect(store.calls).toHaveLength(2);
    expect(shown("today").split(","), "a can't-do is read by A and B").not.toContain("m-compound-row");
  });

  // B, molded in (Round 2): the research's §5.3, "When A changes during B's
  // build-out, the machines B hasn't swapped yet follow A (they are A's), and
  // B's own swaps stay" — written in the same batch as A's change.
  it("a change that moves Routine A's machines takes Routine B with it in the same write, B's own swap kept", async () => {
    const a: Routine = { ...routineA(), machineIds: ["m-leg-press", "m-compound-row", "m-lumbar", "m-hip-abd"] };
    const bPlan: RoutinePlan = {
      purpose: "Variety: the same regions, different machines",
      purposeKinds: ["variety"],
      intended: ["m-leg-press", "m-simple-row", "m-lumbar", "m-hip-abd"],
      swaps: [{ replaces: "m-compound-row", with: "m-simple-row" }],
      building: false,
      madeByUid: "uid-sam",
    };
    const b: Routine = { id: "rb-1", clientId: "c-dana", name: "Routine B", machineIds: ["m-leg-press", "m-simple-row", "m-lumbar", "m-hip-abd"], plan: bPlan };
    await mount(<Harness routines={[a, b]} sessionRoutineId="rb-1" />);
    await tap(/^The plan ·/);
    await tap(`Change ${nameOf("m-leg-press")} in the plan`);
    await tap(nameOf("m-leg-curl"));
    await tap("Save change");
    expect(store.calls).toHaveLength(1);
    const { routineId, input } = store.calls[0];
    expect(routineId).toBe("ra-1");
    expect(input.machineIds).toEqual(["m-leg-curl", "m-compound-row", "m-lumbar", "m-hip-abd"]);
    expect(input.follow).toEqual({
      routineId: "rb-1",
      machineIds: ["m-leg-curl", "m-simple-row", "m-lumbar", "m-hip-abd"],
      intended: ["m-leg-curl", "m-simple-row", "m-lumbar", "m-hip-abd"],
    });
  });
});

describe("the Academy's column, picked once per client (AJ's \"3a\")", () => {
  it("lists the sheet's four columns by its own labels, and a pick is ONE 'column' change on Routine A's plan", async () => {
    await mount(<Harness routines={[routineA()]} />);
    expect(shown("column")).toBe("undefined|on the plan");
    await tap("Ask for the range");
    expect(text()).toContain("Which of the Academy's columns fits Dana?");
    for (const label of ["Female · Novice", "Female · Advanced", "Male · Novice", "Male · Advanced"]) expect(control(label)).toBeTruthy();
    expect(control("Don't show ranges")).toBeTruthy();
    expect(text()).toContain("From the Academy's Suggested Starting Weights");
    await tap("Female · Novice");
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].routineId).toBe("ra-1");
    expect(store.calls[0].input.change).toEqual({ kind: "column", machineIds: [], value: "female-novice", byUid: "uid-sam", byName: "Sam Lee" });
    expect(store.calls[0].input.plan.startingColumn).toBe("female-novice");
    expect(shown("column")).toBe("female-novice|on the plan");
  });

  it("Don't show ranges is the trainer's pick too", async () => {
    await mount(<Harness routines={[routineA()]} />);
    await tap("Ask for the range");
    await tap("Don't show ranges");
    expect(store.calls[0].input.change).toMatchObject({ kind: "column", value: "none" });
    expect(shown("column")).toBe("none|on the plan");
  });

  it("after Don't show ranges, the plan's sheet is the way back: Change column opens the four columns again", async () => {
    await mount(<Harness routines={[routineA()]} />);
    await tap("Ask for the range");
    await tap("Don't show ranges");
    expect(shown("column")).toBe("none|on the plan");
    await tap(/^The plan ·/);
    expect(text()).toContain("Academy's starting range");
    expect(text()).toContain("Not shown");
    await tap("Change column");
    expect(text()).toContain("Which of the Academy's columns fits Dana?");
    await tap("Female · Advanced");
    expect(store.calls).toHaveLength(2);
    expect(store.calls[1].input.change).toMatchObject({ kind: "column", value: "female-advanced" });
    expect(shown("column")).toBe("female-advanced|on the plan");
  });

  it("with no plan to keep it on, the pick is kept for today and written nowhere", async () => {
    await mount(<Harness routines={[]} sessionRoutineId={null} />);
    await tap("Ask for the range");
    expect(text()).toContain("Kept for today's session.");
    await tap("Male · Novice");
    expect(store.calls).toEqual([]);
    expect(shown("column")).toBe("male-novice|for today");
  });
});

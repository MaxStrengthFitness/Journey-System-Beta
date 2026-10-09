// @vitest-environment jsdom
/**
 * A WEAK AREA, MOUNTED (Round 2 of the first-session design round, item 7;
 * the proposal AJ said yes to is docs/rounds/2026-10-07-first-session-and-
 * routines.md §5.4b: "yes lets apply this all").
 *
 * The real Lineup with B's column and the focus, and, where a write is what
 * matters, the real `usePlanActions` over a Firestore that records each
 * batch. What matters is silent when wrong:
 *   - picking an area is a "focus" change on Routine A's plan, its reason
 *     asked and never required, and then the A | B lineup tints the machines
 *     that work it (a main mover on the blue tint, a helper on the blue
 *     outline, each said in words too) and the three answers are drawn;
 *   - a swap is ONE savePlanChange (one batch) on the routine it is for, with
 *     the reason only when one was given; on B it is B's planned swap for
 *     that place;
 *   - an addition goes on deck, never into today's routine; one for B alone
 *     goes on B's own deck, where B's column offers to take it off again;
 *   - a machine the client can't do is never offered nor counted (AJ's "2a");
 *   - Keep {A} in B where B's swap took A's main mover out;
 *   - a second tap on the picked area takes the focus off, and a focus that
 *     arrives later opens the control;
 *   - on a landscape iPad the answers are a panel beside the lineup.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* A Firestore that records each batch: which documents it set or updated with what. */
type Op = { op: "set" | "update"; path: string; data: Record<string, unknown> };
const fake = vi.hoisted(() => ({ batches: [] as Array<{ ops: Op[]; committed: boolean }>, autoId: 0 }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (path: string) => ({ path, id: path.split("/").pop()! });
  return {
    ...actual,
    collection: (base: { path?: string } | unknown, ...segments: string[]) => {
      const head = (base as { path?: string }).path;
      return { path: [head, ...segments].filter(Boolean).join("/") };
    },
    doc: (base: { path?: string } | unknown, ...segments: string[]) => {
      const head = (base as { path?: string }).path;
      if (segments.length === 0) return ref(`${head}/auto-${++fake.autoId}`);
      return ref([head, ...segments].filter(Boolean).join("/"));
    },
    serverTimestamp: () => "SERVER_TIME",
    getDocs: async () => ({ docs: [] }),
    writeBatch: () => {
      const batch = { ops: [] as Op[], committed: false };
      fake.batches.push(batch);
      return {
        set: (r: { path: string }, data: Record<string, unknown>) => batch.ops.push({ op: "set", path: r.path, data }),
        update: (r: { path: string }, data: Record<string, unknown>) => batch.ops.push({ op: "update", path: r.path, data }),
        commit: () => {
          batch.committed = true;
          return Promise.resolve();
        },
      };
    },
  };
});
vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));
vi.mock("../../../hooks/useClientJournal", () => ({ createJournalEntry: vi.fn(() => Promise.resolve("j1")) }));
vi.mock("../starting-store", () => ({
  readStartingRoutines: () => Promise.resolve({ routines: [], known: true }),
  readStartingChoice: () => Promise.resolve({ use: null, defaultId: null }),
}));

/* The switch is base-ui's, which reads PointerEvent (jsdom has none); the sheets want both. */
if (!("PointerEvent" in globalThis)) (globalThis as Record<string, unknown>).PointerEvent = MouseEvent;
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { NOW_BAR_SIDE_QUERY } from "../../../hooks/useMediaQuery";
import type { Machine, Routine } from "../../../types";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import type { RoutineRow } from "../../routines/routine-rows";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { startingKindOf } from "../client-kind";
import { bIntendedOf, bRoutineOf } from "../b-routine";
import type { PlanWrite } from "../lineup";
import type { PlanSwap, RoutinePlan } from "../types";
import type { BSide } from "./BColumn";
import { machineNamer, type PlanHost } from "./host";
import { PlanLineup } from "./PlanLineup";
import { usePlanActions } from "./usePlanActions";

const IDS = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
];
const FLOOR: Machine[] = IDS.map((id) => ({ id, name: ACADEMY_MOVEMENT_NAME[id] ?? id }) as Machine);
const nameOf = machineNamer(FLOOR, []);
const TODAY = "2026-10-09";

/* AJ's example: weak delts, with Seated Dip in A and nothing that works the delts as a main mover. */
const A = ["m-lumbar", "m-compound-row", "m-dip", "m-hip-add", "m-pullover", "m-leg-press"];
const A_PLAN: RoutinePlan = { purpose: "The core", intended: [...A], building: false, madeByUid: "uid-sam" };
const SWAPS: PlanSwap[] = [
  { replaces: "m-leg-press", with: "m-ext" },
  { replaces: "m-hip-add", with: "m-hip-abd" },
];
const B_PLAN: RoutinePlan = {
  purpose: "Variety: the same regions, different machines",
  purposeKinds: ["variety"],
  intended: bIntendedOf(A, SWAPS),
  swaps: SWAPS,
  building: false,
  madeByUid: "uid-sam",
};
const routineA = (plan: RoutinePlan = A_PLAN, machineIds = A) =>
  ({ id: "rA", name: "Routine A", clientId: "c1", machineIds, plan }) as Routine & { id: string; plan: RoutinePlan };
const ROUTINE_B = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(A, SWAPS, 1), plan: B_PLAN } as Routine & { id: string };

let saves: Array<{ routineId: string; write: PlanWrite }>;

function hostOf(over: Partial<PlanHost> = {}): PlanHost {
  return {
    status: "ready",
    kind: startingKindOf({ known: true, hasRoutine: true, hasPlan: true, journeySessions: 9, coverage: "complete", provisionalNewClient: false }),
    floor: FLOOR,
    studioId: "westlake",
    studioName: "Westlake",
    who: { uid: "uid-sam", name: "Sam Lee" },
    todayYmd: TODAY,
    intakeText: null,
    actions: {
      start: () => {},
      save: (routineId, write) => saves.push({ routineId, write }),
      startB: () => {},
      healthNote: () => {},
      readChanges: () => Promise.resolve([]),
    },
    openPlanB: () => {},
    sessionsComplete: true,
    ...over,
  };
}
const bSideOf = (routine: (Routine & { id: string }) | null): BSide => ({
  routine,
  isBActive: true,
  aRunsLine: "Routine A has run 7 times in Journey.",
  nextIsB: true,
  onToggleB: () => {},
});

/** Programming's rows for Routine A, as `buildRoutineRows` makes them (the real "In Routine A" cells). */
const rowsOf = (ids: readonly string[]): RoutineRow[] =>
  ids.map((machineId, i) => ({
    order: i + 1,
    machineId,
    name: nameOf(machineId),
    region: null,
    weight: null,
    outcome: null,
    isHold: false,
    settings: [],
    startingWeight: null,
    note: null,
    missing: false,
    progressionPct: null,
    timesPerformed: 0,
    watchOuts: [],
  }));

let root: Root | null = null;
let el: HTMLElement | null = null;
async function mount(node: React.ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<UnsavedChangesProvider>{node}</UnsavedChangesProvider>);
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
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The answers' own element: the bench names a machine the client can't do, the answers never offer it. */
const answers = () => page().querySelector(".rpl-focus__answers");
/** The A row (the real "In Routine A" cell) that names a machine. */
const aRow = (id: string) =>
  Array.from(page().querySelectorAll("li.rt-cellrow")).find((li) => li.querySelector(".rt-row__name")?.textContent === nameOf(id)) ?? null;

beforeEach(() => {
  saves = [];
  fake.batches.length = 0;
  fake.autoId = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  document.body.innerHTML = "";
});

function lineup(routine: Routine & { id: string; plan: RoutinePlan }, b: BSide | null, host: PlanHost = hostOf(), onSelectMachine?: (id: string) => void) {
  return (
    <PlanLineup
      routine={routine}
      rows={rowsOf(routine.machineIds ?? [])}
      head={<header>Routine A</header>}
      host={host}
      firstName="Tom"
      nameOf={nameOf}
      adjustments={[]}
      trainers={[]}
      b={b}
      onSelectMachine={onSelectMachine}
    />
  );
}

/** The profile's one read and the real actions, so a change is drawn as the profile patches it. */
function Profile({ initial }: { initial: Routine[] }) {
  const [routines, setRoutines] = useState<Routine[]>(initial);
  const actions = usePlanActions({
    clientId: "c1",
    studioId: "westlake",
    routines,
    setRoutines,
    onError: () => {},
    author: { id: "uid-sam", initials: "SL", fullName: "Sam Lee" },
  });
  const host = useMemo(() => hostOf({ actions }), [actions]);
  const a = routines.find((r) => r.name === "Routine A") as Routine & { id: string; plan: RoutinePlan };
  const b = (routines.find((r) => r.name === "Routine B") as (Routine & { id: string }) | undefined) ?? null;
  return lineup(a, bSideOf(b), host);
}

describe("a weak area on the A | B lineup", () => {
  it("picking an area asks why, stores it on Routine A's plan, then tints the cells that work it and draws the three answers", async () => {
    await mount(<Profile initial={[routineA(), ROUTINE_B]} />);
    // Quiet until asked: no chips, no tints.
    expect(has("Delts")).toBe(false);
    expect(page().querySelector(".rpl-tint")).toBeNull();
    await tap("Weak area");
    await tap("Delts");
    // The reason is asked, never required: nothing is written before Save change.
    expect(text()).toContain("Focus: Delts");
    expect(fake.batches).toHaveLength(0);
    await tap("Save change");
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    const update = ops.find((o) => o.op === "update" && o.path === "routines/rA")!;
    expect((update.data.plan as RoutinePlan).focus).toEqual(["delts"]);
    expect("machineIds" in update.data).toBe(false);
    const change = ops.find((o) => o.op === "set" && o.path.startsWith("routines/rA/planChanges/"))!;
    expect(change.data).toMatchObject({ kind: "focus", machineIds: [], value: "delts", byUid: "uid-sam" });
    expect("reason" in change.data).toBe(false);

    // The head says it for the next trainer.
    expect(page().querySelector(".rpl-focusline")?.textContent).toBe("Focus: Delts");
    // Seated Dip and Compound Row help the delts (the blue outline); nothing in A works them as a main mover.
    expect(aRow("m-dip")!.className).toContain("rpl-tint--helper");
    expect(aRow("m-compound-row")!.className).toContain("rpl-tint--helper");
    expect(aRow("m-lumbar")!.className).not.toContain("rpl-tint");
    expect(page().querySelectorAll(".rpl-tint--primary")).toHaveLength(0);
    // Said in words too, never by colour alone.
    expect(aRow("m-dip")!.textContent).toContain("helps");
    // B's cell at Seated Dip's place follows A, so it is tinted the same.
    const bDip = button(new RegExp(`^Routine B: ${esc(nameOf("m-dip"))} · Follows A · helps$`));
    expect(bDip.dataset.focus).toBe("helper");
    // The three answers, numbered, with their source.
    const list = page().querySelector("[aria-label='Weak delts: three questions']")!;
    expect(list.querySelectorAll(":scope > li")).toHaveLength(3);
    expect(text()).toContain("In A and B?");
    expect(text()).toContain("A swap in the same family, instead of an addition?");
    expect(text()).toContain("Or add a single-joint machine?");
    expect(text()).toContain("Academy · Exercise Selection Template / A/B Routines");
    expect(text()).toContain(`Helpers only: ${nameOf("m-compound-row")} and ${nameOf("m-dip")}`);
    expect(text()).toContain("Nothing in A or B works the delts as a main mover.");
    // AJ's own example, for both routines at once (B follows A at Seated Dip's place).
    expect(has(`Swap: ${nameOf("m-overhead-press")} for ${nameOf("m-dip")} in A and B`)).toBe(true);
    expect(text()).toContain("keeps the count");
    // The single-joint addition, with what it does to each plan's count.
    expect(has(`Add to the plan: ${nameOf("m-lateral-raise")} for A and B`)).toBe(true);
    expect(text()).toContain("Single-joint · A's and B's plans go to 7 · inside the Academy's 6 to 8");
    expect(text()).toContain("Nothing here moves the order or a weight.");
  });

  it("a swap is ONE savePlanChange on the routine it is for, with the reason only when one was given; B follows A in the same batch", async () => {
    await mount(<Profile initial={[routineA({ ...A_PLAN, focus: ["delts"] }), ROUTINE_B]} />);
    // A stored focus opens with its tints and answers.
    expect(button("Delts").getAttribute("aria-pressed")).toBe("true");
    await tap(`Swap: ${nameOf("m-overhead-press")} for ${nameOf("m-dip")} in A and B`);
    expect(text()).toContain(`${nameOf("m-overhead-press")} for ${nameOf("m-dip")} in A and B`);
    await tap("Client asked");
    await tap("Save change");
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    const changes = ops.filter((o) => o.op === "set" && o.path.includes("/planChanges/"));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.path.startsWith("routines/rA/planChanges/")).toBe(true);
    expect(changes[0]!.data).toMatchObject({ kind: "swap", machineIds: ["m-dip", "m-overhead-press"], reason: "Client asked", byUid: "uid-sam" });
    const a = ops.find((o) => o.op === "update" && o.path === "routines/rA")!;
    expect(a.data.machineIds).toEqual(A.map((id) => (id === "m-dip" ? "m-overhead-press" : id)));
    // B follows A where it hasn't swapped, in the SAME batch.
    const b = ops.find((o) => o.op === "update" && o.path === "routines/rB")!;
    expect(b.data.machineIds).toContain("m-overhead-press");
    expect(b.data.machineIds).not.toContain("m-dip");
    // Once in, the delts are worked in A and B: nothing more to suggest.
    expect(text()).toContain("Worked in A and B. Nothing to change.");
    expect(aRow("m-overhead-press")!.className).toContain("rpl-tint--primary");
  });

  it("a swap on B alone is B's planned swap for that place, one write on Routine B, its reason optional", async () => {
    // A works the delts (Overhead Press); B swapped it out for Chest Flye, which only helps.
    const a2 = ["m-leg-press", "m-compound-row", "m-overhead-press", "m-lumbar", "m-hip-add"];
    const swaps: PlanSwap[] = [{ replaces: "m-overhead-press", with: "m-chest-fly" }];
    const bPlan: RoutinePlan = { ...B_PLAN, intended: bIntendedOf(a2, swaps), swaps };
    const b = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(a2, swaps, 1), plan: bPlan } as Routine & { id: string };
    await mount(lineup(routineA({ purpose: "", intended: [...a2], building: false, madeByUid: "uid-sam", focus: ["delts"] }, a2), bSideOf(b)));
    expect(text()).toContain("Nothing in B works the delts as a main mover.");
    await tap(`Swap: ${nameOf("m-lateral-raise")} for ${nameOf("m-chest-fly")} in B`);
    await tap("Save change");
    expect(saves).toHaveLength(1);
    const w = saves[0]!;
    expect(w.routineId).toBe("rB");
    expect(w.write.change).toMatchObject({ kind: "swap", machineIds: ["m-overhead-press", "m-lateral-raise"], value: "planned" });
    expect("reason" in w.write.change).toBe(false);
    expect(w.write.also).toBeUndefined();
    expect(w.write.plan.swaps).toEqual([{ replaces: "m-overhead-press", with: "m-lateral-raise" }]);
    // The swap was in B, so B's machine changes with it; A's is never touched from B.
    expect(w.write.machineIds).toEqual(b.machineIds!.map((id) => (id === "m-chest-fly" ? "m-lateral-raise" : id)));
    // A's machine is never swapped into B as a new machine: it comes back only as a Keep.
    expect(has(new RegExp(`^Swap: ${esc(nameOf("m-overhead-press"))} for .* in B$`))).toBe(false);
  });

  it("Keep {A} in B, where B's swap took A's main mover out: one write on Routine B, the swap left out", async () => {
    const a2 = ["m-leg-press", "m-compound-row", "m-overhead-press", "m-lumbar", "m-hip-add"];
    const swaps: PlanSwap[] = [{ replaces: "m-overhead-press", with: "m-chest-fly" }];
    const bPlan: RoutinePlan = { ...B_PLAN, intended: bIntendedOf(a2, swaps), swaps };
    const b = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(a2, swaps, 1), plan: bPlan } as Routine & { id: string };
    await mount(lineup(routineA({ purpose: "", intended: [...a2], building: false, madeByUid: "uid-sam", focus: ["delts"] }, a2), bSideOf(b)));
    // "Delts: Overhead Press in A, nothing in B. Offer the machine for B that works it." (§5.4b)
    expect(answers()!.textContent).toContain(`Keep ${nameOf("m-overhead-press")} in B`);
    expect(answers()!.textContent).toContain(`instead of ${nameOf("m-chest-fly")} · keeps the count`);
    await tap(`Keep ${nameOf("m-overhead-press")} in B, instead of ${nameOf("m-chest-fly")}`);
    await tap("Save change");
    expect(saves).toHaveLength(1);
    const w = saves[0]!;
    expect(w.routineId).toBe("rB");
    expect(w.write.change).toMatchObject({ kind: "swap", machineIds: ["m-overhead-press"], value: "kept" });
    expect(w.write.plan.swaps).toEqual([]);
    expect(w.write.machineIds).toEqual(a2);
  });

  it("an addition for B alone goes on B's own deck: one write on Routine B, Routine B as it was, and B's column offers to take it off again", async () => {
    // A works the delts (Overhead Press) and B swapped it for Chest Flye: here the
    // trainer takes the addition, rather than the Keep or the swap.
    const a2 = ["m-leg-press", "m-compound-row", "m-overhead-press", "m-lumbar", "m-hip-add"];
    const swaps: PlanSwap[] = [{ replaces: "m-overhead-press", with: "m-chest-fly" }];
    const bPlan: RoutinePlan = { ...B_PLAN, intended: bIntendedOf(a2, swaps), swaps };
    const b = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(a2, swaps, 1), plan: bPlan } as Routine & { id: string };
    await mount(<Profile initial={[routineA({ purpose: "", intended: [...a2], building: false, madeByUid: "uid-sam", focus: ["delts"] }, a2), b]} />);
    await tap(`Add to the plan: ${nameOf("m-lateral-raise")} for B`);
    expect(text()).toContain(`Add ${nameOf("m-lateral-raise")} to B's plan`);
    await tap("Save change");
    expect(fake.batches).toHaveLength(1);
    let ops = fake.batches[0]!.ops;
    const bUpdate = ops.find((o) => o.op === "update" && o.path === "routines/rB")!;
    expect("machineIds" in bUpdate.data).toBe(false);
    expect((bUpdate.data.plan as RoutinePlan).intended.at(-1)).toBe("m-lateral-raise");
    expect(ops.some((o) => o.path === "routines/rA")).toBe(false);
    expect(ops.find((o) => o.op === "set")!.data).toMatchObject({ kind: "add", machineIds: ["m-lateral-raise"] });

    // Drawn under B's column as "On deck in B", tinted and said, and B's plan answers the delts now.
    const cell = button(new RegExp(`^Routine B: ${esc(nameOf("m-lateral-raise"))} · On deck in B · works the delts$`));
    expect(cell.dataset.focus).toBe("primary");
    expect(text()).toContain("On B's plan, not in Routine B yet.");
    expect(text()).toContain(`Already on B's plan: ${nameOf("m-lateral-raise")} (planned).`);
    expect(has(`Add to the plan: ${nameOf("m-lateral-raise")} for B`)).toBe(false);

    // A tap offers to take it off B's plan: one "remove" on Routine B, Routine B as it was.
    await tap(new RegExp(`^Routine B: ${esc(nameOf("m-lateral-raise"))} · On deck in B`));
    await tap("Take off B's plan");
    expect(text()).toContain(`Take ${nameOf("m-lateral-raise")} off B's plan`);
    await tap("Save change");
    expect(fake.batches).toHaveLength(2);
    ops = fake.batches[1]!.ops;
    const off = ops.find((o) => o.op === "update" && o.path === "routines/rB")!;
    expect("machineIds" in off.data).toBe(false);
    expect((off.data.plan as RoutinePlan).intended).not.toContain("m-lateral-raise");
    expect(ops.find((o) => o.op === "set")!.data).toMatchObject({ kind: "remove", machineIds: ["m-lateral-raise"] });
    expect(has(new RegExp(`^Routine B: ${esc(nameOf("m-lateral-raise"))} · On deck in B`))).toBe(false);
  });

  it("a swap on A that B follows says 'A and B' and B is never offered the same machine again", async () => {
    // B has swapped Compound Row for Biceps Curl; A's swap at Pullover reaches B by B following A.
    const a = ["m-compound-row", "m-lumbar", "m-dip", "m-pullover", "m-leg-press"];
    const swaps: PlanSwap[] = [{ replaces: "m-compound-row", with: "m-bicep" }];
    const bPlan: RoutinePlan = { ...B_PLAN, intended: bIntendedOf(a, swaps), swaps };
    const b = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(a, swaps, 1), plan: bPlan } as Routine & { id: string };
    await mount(<Profile initial={[routineA({ purpose: "", intended: [...a], building: false, madeByUid: "uid-sam", focus: ["delts"] }, a), b]} />);
    expect(buttons().filter((x) => /^Swap: .* in B$/.test(x.getAttribute("aria-label") ?? ""))).toHaveLength(0);
    await tap(`Swap: ${nameOf("m-simple-row")} for ${nameOf("m-pullover")} in A and B`);
    await tap("Save change");
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.find((o) => o.op === "update" && o.path === "routines/rA")!.data.machineIds).toEqual(
      a.map((id) => (id === "m-pullover" ? "m-simple-row" : id)),
    );
    expect(ops.find((o) => o.op === "update" && o.path === "routines/rB")!.data.machineIds).toEqual([
      "m-bicep",
      "m-lumbar",
      "m-dip",
      "m-simple-row",
      "m-leg-press",
    ]);
  });

  it("an addition goes on deck, never into today's routine", async () => {
    await mount(<Profile initial={[routineA({ ...A_PLAN, focus: ["delts"] }), ROUTINE_B]} />);
    await tap(`Add to the plan: ${nameOf("m-lateral-raise")} for A and B`);
    expect(text()).toContain(`Add ${nameOf("m-lateral-raise")} to the plans for A and B`);
    await tap("Save change");
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    const a = ops.find((o) => o.op === "update" && o.path === "routines/rA")!;
    expect("machineIds" in a.data).toBe(false);
    expect((a.data.plan as RoutinePlan).intended).toEqual([...A, "m-lateral-raise"]);
    expect(ops.some((o) => o.path === "routines/rB")).toBe(false);
    const change = ops.find((o) => o.op === "set")!;
    expect(change.data).toMatchObject({ kind: "add", machineIds: ["m-lateral-raise"] });
    expect("value" in change.data).toBe(false);
    // On deck now, as the next one, and Routine A as it was.
    const deck = Array.from(page().querySelectorAll("li.rpl-row")).find((li) => li.textContent?.includes(nameOf("m-lateral-raise")));
    expect(deck?.textContent).toContain("Next");
    expect(deck?.className).toContain("rpl-tint--primary");
    expect(aRow("m-lateral-raise")).toBeNull();
    // On A's plan, which B follows: the delts are answered in A and B's plans.
    expect(text()).toContain(`${nameOf("m-lateral-raise")} (on deck)`);
  });

  it("never offers a machine the client can't do", async () => {
    const plan: RoutinePlan = {
      ...A_PLAN,
      focus: ["delts"],
      cantDo: [
        { machineId: "m-overhead-press", until: "cleared", day: TODAY, byUid: "uid-sam" },
        { machineId: "m-lateral-raise", until: "always", day: TODAY, byUid: "uid-sam" },
      ],
    };
    await mount(lineup(routineA(plan), bSideOf(ROUTINE_B)));
    const words = answers()!.textContent ?? "";
    expect(words).not.toContain(nameOf("m-overhead-press"));
    expect(words).not.toContain(nameOf("m-lateral-raise"));
    expect(buttons().some((b) => /Overhead Press|Lateral Raise/.test(b.getAttribute("aria-label") ?? ""))).toBe(false);
    // What the floor still has for the delts is offered instead.
    expect(has(`Swap: ${nameOf("m-simple-row")} for ${nameOf("m-pullover")} in A and B`)).toBe(true);
    expect(has(`Add to the plan: ${nameOf("m-simple-row")} for A and B`)).toBe(true);
  });

  it("a second tap on the picked area takes the focus off: one change, no value, and the tints go", async () => {
    await mount(<Profile initial={[routineA({ ...A_PLAN, focus: ["delts"] }), ROUTINE_B]} />);
    expect(page().querySelectorAll(".rpl-tint").length).toBeGreaterThan(0);
    await tap("Delts");
    expect(text()).toContain("Take the focus off Delts");
    await tap("Save change");
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect((ops.find((o) => o.op === "update")!.data.plan as RoutinePlan).focus).toEqual([]);
    const change = ops.find((o) => o.op === "set")!;
    expect(change.data).toMatchObject({ kind: "focus", machineIds: [] });
    expect("value" in change.data).toBe(false);
    expect(page().querySelector(".rpl-tint")).toBeNull();
    expect(page().querySelector(".rpl-focusline")).toBeNull();
    expect(answers()).toBeNull();
    expect(button("Delts").getAttribute("aria-pressed")).toBe("false");
  });

  it("on a landscape iPad the answers are their own panel beside the lineup, above the Changes", async () => {
    const real = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query === NOW_BAR_SIDE_QUERY,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      await mount(lineup(routineA({ ...A_PLAN, focus: ["delts"] }), bSideOf(ROUTINE_B)));
      const side = page().querySelector("section.rpl-panel[aria-label='Weak delts']")!;
      expect(side).not.toBeNull();
      expect(side.querySelector("h3")?.textContent).toBe("Weak delts");
      expect(side.textContent).toContain("Academy · Exercise Selection Template / A/B Routines");
      expect(side.querySelector("[aria-label='Weak delts: three questions']")).not.toBeNull();
      // Beside the lineup, above the Changes, and not under the chips as well.
      const col = side.parentElement!;
      expect(col.className).toBe("rpl-col");
      expect(col.lastElementChild?.getAttribute("aria-label")).toBe("Changes");
      expect(page().querySelectorAll(".rpl-focus__answers")).toHaveLength(1);
      expect(page().querySelector(".rpl-focus .rpl-focus__answers")).toBeNull();
      expect(has(`Swap: ${nameOf("m-overhead-press")} for ${nameOf("m-dip")} in A and B`)).toBe(true);
    } finally {
      window.matchMedia = real;
    }
  });

  it("a focus that arrives after the Lineup mounted opens the control with its tints and answers", async () => {
    function Later() {
      const [plan, setPlan] = useState<RoutinePlan>(A_PLAN);
      return (
        <>
          <button type="button" onClick={() => setPlan({ ...A_PLAN, focus: ["delts"] })}>
            Another iPad picks Delts
          </button>
          {lineup(routineA(plan), bSideOf(ROUTINE_B))}
        </>
      );
    }
    await mount(<Later />);
    expect(has("Delts")).toBe(false);
    await tap("Another iPad picks Delts");
    expect(page().querySelector(".rpl-focusline")?.textContent).toBe("Focus: Delts");
    expect(button("Delts").getAttribute("aria-pressed")).toBe("true");
    expect(aRow("m-dip")!.className).toContain("rpl-tint--helper");
    expect(answers()).not.toBeNull();
  });

  it("an On deck row reads its tint aloud too, not by colour alone", async () => {
    await mount(lineup(routineA({ ...A_PLAN, intended: [...A, "m-lateral-raise"], focus: ["delts"] }), bSideOf(ROUTINE_B), hostOf(), () => {}));
    const open = button(`Open ${nameOf("m-lateral-raise")} · works the delts`);
    expect(open.closest("li")?.className).toContain("rpl-tint--primary");
    // And Routine A's own rows: "Open Seated Dip · helps".
    expect(has(`Open ${nameOf("m-dip")} · helps`)).toBe(true);
    // Only on the plan, so said as such, and nothing more is added for A.
    expect(text()).toContain("On both plans, not in Routine A or B yet.");
    expect(text()).toContain(`Already on A's plan: ${nameOf("m-lateral-raise")} (on deck).`);
  });

  it("never counts a machine the client can't do as working the area, a swap B plans for it included", async () => {
    // B plans Overhead Press for Seated Dip; the client can't do the Overhead Press now.
    const swaps: PlanSwap[] = [...SWAPS, { replaces: "m-dip", with: "m-overhead-press" }];
    const bPlan: RoutinePlan = { ...B_PLAN, intended: bIntendedOf(A, swaps), swaps };
    const b = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(A, swaps, 1), plan: bPlan } as Routine & { id: string };
    const plan: RoutinePlan = { ...A_PLAN, focus: ["delts"], cantDo: [{ machineId: "m-overhead-press", until: "cleared", day: TODAY, byUid: "uid-sam" }] };
    await mount(lineup(routineA(plan), bSideOf(b)));
    const words = answers()!.textContent ?? "";
    expect(words).not.toContain(nameOf("m-overhead-press"));
    expect(words).toContain("Nothing in A or B works the delts as a main mover.");
    expect(words).not.toContain("Nothing to change");
    expect(has(`Add to the plan: ${nameOf("m-lateral-raise")} for A and B`)).toBe(true);
  });

  it("the Academy answers grip with a setting before a machine, and nothing is offered to someone who can't write", async () => {
    await mount(lineup(routineA({ ...A_PLAN, focus: ["grip"] }), bSideOf(ROUTINE_B), hostOf({ who: null })));
    expect(text()).toContain("A setting before a machine");
    expect(text()).toMatch(/Grip usually adapts/);
    expect(has(/^Swap:/)).toBe(false);
    expect(has(/^Add to the plan/)).toBe(false);
    expect(button("Grip").disabled).toBe(true);
  });
});

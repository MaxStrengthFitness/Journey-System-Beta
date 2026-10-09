// @vitest-environment jsdom
/**
 * B, MOLDED IN, MOUNTED (Round 2 of the first-session design round, item 6;
 * AJ's "1d": the Lineup is A and B side by side).
 *
 * The real Lineup with B's column, Routine B's own segment, the Plan B sheet
 * and, where a write is what matters, the real `usePlanActions` over a
 * Firestore that records each batch. What matters is silent when wrong:
 *   - each of B's cells says whether B follows A there or has its own
 *     machine ("B's own · for Leg Press"), and the next swap's place;
 *   - "Swap in the next one" is ONE write on Routine B with B's new
 *     machines, its reason asked and never required; Two is one write too;
 *   - Plan B starts Routine B as A with ONE machine different and turns B
 *     on, in ONE batch, never an empty Routine B (AJ, Oct 7 2026: "the B
 *     routine starts out as the A routine with just one machine different");
 *   - turning B on with nothing in B opens Plan B instead (the critic's #22);
 *   - a change to Routine A writes Routine B in the same batch: B's
 *     unswapped places follow A, B's own swaps stay (the critic's #25).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

import type { Machine, Routine } from "../../../types";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import { UnsavedChangesProvider, useUnsavedStatus, type UnsavedStatus } from "../../unsaved-changes";
import { RoutinesTab } from "../../routines/RoutinesTab";
import { startingKindOf } from "../client-kind";
import { bIntendedOf, bRoutineOf } from "../b-routine";
import type { PlanWrite } from "../lineup";
import type { PlanSwap, RoutinePlan } from "../types";
import type { BSide } from "./BColumn";
import { floorMachinesOf, machineNamer, type PlanHost, type StartBCall } from "./host";
import { PlanBSheet } from "./PlanBSheet";
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

const A = ["m-leg-press", "m-compound-row", "m-chest-press", "m-lumbar", "m-hip-add"];
const SWAPS: PlanSwap[] = [
  { replaces: "m-leg-press", with: "m-ext" },
  { replaces: "m-compound-row", with: "m-simple-row" },
  { replaces: "m-hip-add", with: "m-hip-abd" },
];
const A_PLAN: RoutinePlan = { purpose: "The core", intended: [...A, "m-pulldown"], building: false, madeByUid: "uid-sam" };
const B_PLAN: RoutinePlan = {
  purpose: "Variety: the same regions, different machines",
  purposeKinds: ["variety"],
  intended: bIntendedOf(A, SWAPS),
  swaps: SWAPS,
  building: false,
  madeByUid: "uid-sam",
};
const ROUTINE_A = { id: "rA", name: "Routine A", clientId: "c1", machineIds: A, plan: A_PLAN } as Routine & { id: string; plan: RoutinePlan };
const ROUTINE_B = { id: "rB", name: "Routine B", clientId: "c1", machineIds: bRoutineOf(A, SWAPS, 1), plan: B_PLAN } as Routine & { id: string };

type Calls = { saves: Array<{ routineId: string; write: PlanWrite }>; planB: number; toggles: boolean[]; startB: StartBCall[] };
let calls: Calls;

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
      save: (routineId, write) => calls.saves.push({ routineId, write }),
      startB: (c) => calls.startB.push(c),
      healthNote: () => {},
      readChanges: () => Promise.resolve([]),
    },
    openPlanB: () => {
      calls.planB += 1;
    },
    sessionsComplete: true,
    ...over,
  };
}
const bSideOf = (routine: (Routine & { id: string }) | null, over: Partial<BSide> = {}): BSide => ({
  routine,
  isBActive: true,
  aRunsLine: "Routine A has run 7 times in Journey.",
  nextIsB: true,
  onToggleB: (on) => calls.toggles.push(on),
  ...over,
});

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
  await rerender(node);
}
/** The same tree with new props: state is kept, as a parent's re-render keeps it. */
async function rerender(node: React.ReactNode) {
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
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

beforeEach(() => {
  calls = { saves: [], planB: 0, toggles: [], startB: [] };
  fake.batches.length = 0;
  fake.autoId = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  status = null;
  document.body.innerHTML = "";
});

function lineup(b: BSide | null, host: PlanHost = hostOf(), routine = ROUTINE_A) {
  return (
    <PlanLineup
      routine={routine}
      rows={[]}
      head={<header>Routine A</header>}
      host={host}
      firstName="Tom"
      nameOf={nameOf}
      adjustments={[]}
      trainers={[]}
      b={b}
    />
  );
}

/* ── The A | B lineup ───────────────────────────────────────────────────── */

describe("the A | B lineup on Routine A", () => {
  it("draws B's cells beside A's rows: following A, or B's own machine for the A machine it replaces, the next swap marked", async () => {
    await mount(lineup(bSideOf(ROUTINE_B)));
    const list = page().querySelector("[aria-label='The lineup']")!;
    expect(list.className).toContain("rpl-list--ab");
    const own = button(new RegExp(`^Routine B: ${esc(nameOf("m-ext"))} · B's own · for ${esc(nameOf("m-leg-press"))}$`));
    expect(own.dataset.kind).toBe("own");
    const next = button(new RegExp(`^Routine B: ${esc(nameOf("m-compound-row"))} · Follows A · next swap: ${esc(nameOf("m-simple-row"))}$`));
    expect(next.dataset.kind).toBe("next");
    expect(button(new RegExp(`^Routine B: ${esc(nameOf("m-chest-press"))} · Follows A$`)).dataset.kind).toBe("follows");
    expect(button(new RegExp(`^Routine B: ${esc(nameOf("m-hip-add"))} · Follows A · later: ${esc(nameOf("m-hip-abd"))}$`)).dataset.kind).toBe("follows");
    // B's head, and the Academy's line said with its source, never a gate.
    expect(text()).toContain(`B · 1 of 3 swaps · next: ${nameOf("m-simple-row")} for ${nameOf("m-compound-row")}`);
    expect(text()).toContain("A and B alternate · next session is B");
    // Its icon sits on the words' line (the screens preview, Oct 9 2026: drawn as a block, it stood alone above them).
    const alternate = Array.from(page().querySelectorAll("p")).find((p) => p.textContent?.includes("A and B alternate"))!;
    expect(alternate.classList).toContain("rpl-line--icon");
    const css = readFileSync(resolve(__dirname, "routine-plan.css"), "utf8").replace(/\r\n/g, "\n");
    expect(css).toMatch(/\.rpl-line--icon \{\n  display: flex;\n  align-items: center;/);
    expect(text()).toContain("Routine A has run 7 times in Journey. The Academy starts B after 5 to 7 runs of A, then swaps about one a week.");
    expect(text()).toContain("From the Academy's");
    // Every B cell's name is drawn whole, in a class names-wrap.test.ts holds.
    expect(page().querySelectorAll(".rpl-bcell__name").length).toBeGreaterThanOrEqual(A.length);
  });

  it("Swap in the next one asks why, and is ONE write on Routine B with B's new machines; Two is one write too", async () => {
    await mount(lineup(bSideOf(ROUTINE_B)));
    await tap("Swap in the next one");
    expect(text()).toContain(`Swap in ${nameOf("m-simple-row")} for ${nameOf("m-compound-row")}`);
    expect(calls.saves).toEqual([]);
    await tap("Save change");
    expect(calls.saves).toHaveLength(1);
    const first = calls.saves[0]!;
    expect(first.routineId).toBe("rB");
    expect(first.write.machineIds).toEqual(bRoutineOf(A, SWAPS, 2));
    expect(first.write.change).toMatchObject({ kind: "swap", machineIds: ["m-compound-row", "m-simple-row"], value: "made", byUid: "uid-sam" });
    expect("reason" in first.write.change).toBe(false);
    expect(first.write.also).toBeUndefined();
    expect(first.write.plan).toEqual(B_PLAN);

    await tap("Swap in the next two");
    await tap("Client asked");
    await tap("Save change");
    const two = calls.saves[1]!;
    expect(two.write.machineIds).toEqual(bRoutineOf(A, SWAPS, 3));
    expect([two.write.change, ...(two.write.also ?? [])].map((c) => c.machineIds[1])).toEqual(["m-simple-row", "m-hip-abd"]);
    expect(two.write.change.reason).toBe("Client asked");
  });

  it("a tap on B's cell opens its place's strip, and a machine picked there is B's planned swap", async () => {
    await mount(lineup(bSideOf(ROUTINE_B)));
    await tap(new RegExp(`^Routine B: ${esc(nameOf("m-chest-press"))} · Follows A$`));
    expect(text()).toContain(`In B, instead of ${nameOf("m-chest-press")}`);
    expect(text()).toContain("From the Academy's five families");
    // A's own machines are never offered for B.
    expect(has(nameOf("m-leg-press"))).toBe(false);
    await tap(nameOf("m-overhead-press"));
    await tap("Save change");
    const w = calls.saves[0]!.write;
    expect(w.change).toMatchObject({ kind: "swap", machineIds: ["m-chest-press", "m-overhead-press"], value: "planned" });
    expect(w.plan.swaps?.at(-1)).toEqual({ replaces: "m-chest-press", with: "m-overhead-press" });
    // A swap still to come moves nothing in B today.
    expect(w.machineIds).toBeUndefined();
  });

  it("B is for: Variety · Recovery · Both, a purpose change that asks why", async () => {
    await mount(lineup(bSideOf(ROUTINE_B)));
    expect(button("Variety").getAttribute("aria-pressed")).toBe("true");
    await tap("Both");
    await tap("Save change");
    expect(calls.saves[0]!.write.change).toMatchObject({ kind: "purpose", value: "Variety and recovery: the same regions on different machines, a region's heaviest work split" });
    expect(calls.saves[0]!.write.plan.purposeKinds).toEqual(["variety", "recovery"]);
  });

  it("a next swap the client can't do waits: no Swap in, and the head says why (AJ's '2a')", async () => {
    const aWithBench = {
      ...ROUTINE_A,
      plan: { ...A_PLAN, cantDo: [{ machineId: "m-simple-row", until: "cleared", day: TODAY, byUid: "uid-sam" }] },
    } as Routine & { id: string; plan: RoutinePlan };
    await mount(lineup(bSideOf(ROUTINE_B), hostOf(), aWithBench));
    expect(has("Swap in the next one")).toBe(false);
    expect(text()).toContain(`${nameOf("m-simple-row")} is on the can't-do list, so the next swap waits.`);
    expect(button(new RegExp(`^Routine B: ${esc(nameOf("m-compound-row"))} · Follows A · next swap: ${esc(nameOf("m-simple-row"))}, can't do for now$`))).toBeTruthy();
  });

  it("a next swap whose machine Routine A holds now waits: no Swap in, and the head says why", async () => {
    // A took Simple Row from its own road; B's next swap was Simple Row for Compound Row.
    const aNow = [...A, "m-simple-row"];
    const aWithRow = { ...ROUTINE_A, machineIds: aNow } as Routine & { id: string; plan: RoutinePlan };
    const bNow = { ...ROUTINE_B, machineIds: [...bRoutineOf(A, SWAPS, 1), "m-simple-row"] } as Routine & { id: string };
    await mount(lineup(bSideOf(bNow), hostOf(), aWithRow));
    expect(has("Swap in the next one")).toBe(false);
    expect(text()).toContain(`${nameOf("m-simple-row")} is in Routine A now, so the next swap waits.`);
    // Still one of B's swaps made, and each machine drawn once.
    expect(text()).toContain(`B · 1 of 3 swaps`);
    expect(page().querySelectorAll(`[aria-label^='Routine B: ${nameOf("m-simple-row")} ·']`)).toHaveLength(1);
  });

  it("before B starts: one quiet cell down B's column, and Plan B", async () => {
    await mount(lineup(bSideOf(null, { isBActive: false, nextIsB: null })));
    expect(text()).toContain("B starts as a copy of A with one machine different.");
    expect(page().querySelectorAll(".rpl-bcell")).toHaveLength(0);
    // After A's rows, so a phone's one column draws it under them; beside
    // them from grid row 2 when side by side (the review of Round 2: it split
    // A's first and second machines on a phone).
    const list = page().querySelector("[aria-label='The lineup']")!;
    const items = Array.from(list.children) as HTMLElement[];
    const start = items.findIndex((li) => li.textContent?.includes("B starts as a copy of A"));
    // A's rows and their order notes: every rpl-aside item but the group's head.
    const aItems = items.filter((li) => li.classList.contains("rpl-aside") && !li.classList.contains("rpl-group"));
    expect(aItems.length).toBeGreaterThanOrEqual(A.length);
    expect(start).toBeGreaterThan(items.indexOf(aItems.at(-1)!));
    expect(items[start]!.style.gridRow).toBe(`2 / span ${aItems.length}`);
    await tap("Plan B");
    expect(calls.planB).toBe(1);
  });

  it("without Routine B handed in, the lineup is A's alone, as before", async () => {
    await mount(lineup(null));
    expect(page().querySelector("[aria-label='The lineup']")!.className).not.toContain("rpl-list--ab");
    expect(text()).not.toContain("Routine B");
  });
});

/* ── Routine B's own segment ────────────────────────────────────────────── */

describe("Programming → Routine B", () => {
  const base = {
    client: { id: "c1", firstName: "Tom", homeStudioId: "westlake" } as never,
    clientId: "c1",
    machines: FLOOR,
    clientSettings: {},
    allLogs: [],
    sessions: [],
    adjustments: [],
    trainers: [],
    selectedRoutineTodayId: null,
    onEdit: vi.fn(),
    view: "Routine B" as const,
  };

  it("turning B on with nothing in B opens Plan B, never an empty Routine B", async () => {
    await mount(
      <RoutinesTab {...base} routines={[ROUTINE_A]} isBActive={false} onToggleB={(on) => calls.toggles.push(on)} plan={hostOf()} />,
    );
    expect(text()).toContain("B starts as a copy of A with one machine different, then A and B alternate.");
    await act(async () => {
      page().querySelector<HTMLElement>("[role='switch']")!.click();
    });
    await act(async () => {});
    expect(calls.planB).toBe(1);
    expect(calls.toggles).toEqual([]);
  });

  it("a Routine B with machines of its own turns on as it always has", async () => {
    const ownB = { id: "rB", name: "Routine B", clientId: "c1", machineIds: ["m-ext"] } as Routine;
    await mount(<RoutinesTab {...base} routines={[ROUTINE_A, ownB]} isBActive={false} onToggleB={(on) => calls.toggles.push(on)} plan={hostOf()} />);
    await act(async () => {
      page().querySelector<HTMLElement>("[role='switch']")!.click();
    });
    await act(async () => {});
    expect(calls.toggles).toEqual([true]);
    expect(calls.planB).toBe(0);
  });

  it("a Routine B with its plan draws B's head and the A | B lineup", async () => {
    await mount(
      <RoutinesTab {...base} routines={[ROUTINE_A, ROUTINE_B]} isBActive onToggleB={(on) => calls.toggles.push(on)} plan={hostOf()} />,
    );
    expect(page().querySelector("[aria-label='Routine A and Routine B']")).not.toBeNull();
    expect(text()).toContain(`B · 1 of 3 swaps · next: ${nameOf("m-simple-row")} for ${nameOf("m-compound-row")}`);
    expect(button(new RegExp(`^Routine B: ${esc(nameOf("m-ext"))} · B's own`)).dataset.kind).toBe("own");
    expect(page().querySelector(".rt-changes")).toBeNull();
  });
});

/* ── The writes, through the real actions ───────────────────────────────── */

/** The profile's part: the routines, the real actions over them, and a host. */
function Profile({ initial, children }: { initial: Routine[]; children: (host: PlanHost, routines: Routine[]) => React.ReactNode }) {
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
  return <>{children(host, routines)}</>;
}

describe("Plan B: Routine B as A with one machine different, in ONE batch with B turned on", () => {
  it("offers B's swaps with the first marked Starts with, and Start B writes Routine B, its plan, its start and the switch together", async () => {
    let started: Routine[] = [];
    await mount(
      <Profile initial={[ROUTINE_A]}>
        {(host, routines) => {
          started = routines;
          return (
            <PlanBSheet
              open
              aRoutine={A}
              aPlan={A_PLAN}
              floor={floorMachinesOf(FLOOR)}
              nameOf={nameOf}
              who={host.who}
              todayYmd={TODAY}
              aRunsLine="Routine A has run 7 times in Journey."
              onClose={() => {}}
              onStart={(s) => host.actions.startB!({ routineId: null, ...s })}
            />
          );
        }}
      </Profile>,
    );
    expect(text()).toContain("B starts as a copy of A with one machine different, then A and B alternate.");
    expect(text()).toContain("Starts with");
    expect(text()).toContain("The Academy starts B after 5 to 7 runs of A");
    expect(fake.batches).toHaveLength(0);
    await tap("Start B");

    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/g, "*")])).toEqual([
      ["set", "routines/*"],
      ["set", "routines/*/planChanges/*"],
      ["update", "clients/c1"],
    ]);
    const routine = ops[0]!.data as { name: string; machineIds: string[]; plan: RoutinePlan };
    expect(routine.name).toBe("Routine B");
    // A copy of A with exactly ONE machine different.
    expect(routine.machineIds).toHaveLength(A.length);
    expect(routine.machineIds.filter((id, i) => id !== A[i])).toHaveLength(1);
    expect(routine.plan.swaps!.length).toBeGreaterThan(0);
    expect(routine.machineIds).toContain(routine.plan.swaps![0]!.with);
    expect(ops[1]!.data).toMatchObject({ kind: "start", value: "B", byUid: "uid-sam" });
    expect(ops[2]!.data).toEqual({ isRoutineBActive: true });
    // Drawn at once: the profile holds Routine B before the batch answers.
    expect(started.some((r) => r.name === "Routine B")).toBe(true);
  });

  it("an edited swap is kept, and a changed draft is registered as unsaved until Start B", async () => {
    await mount(
      <PlanBSheet
        open
        aRoutine={A}
        aPlan={A_PLAN}
        floor={floorMachinesOf(FLOOR)}
        nameOf={nameOf}
        who={{ uid: "uid-sam", name: "Sam Lee" }}
        todayYmd={TODAY}
        aRunsLine={null}
        onClose={() => {}}
        onStart={(s) => calls.startB.push({ routineId: null, ...s })}
      />,
    );
    expect(status!.anyDirty()).toBe(false);
    await tap(/, starts with$/);
    const offered = page().querySelector("[role='group'][aria-label^='In B, instead of']")!;
    const pick = Array.from(offered.querySelectorAll<HTMLButtonElement>("button.rpl-chip")).find((b) => b.getAttribute("aria-pressed") === "false")!;
    const picked = pick.textContent!.trim();
    await act(async () => pick.click());
    await act(async () => {});
    expect(status!.anyDirty()).toBe(true);
    await tap("Start B");
    expect(calls.startB).toHaveLength(1);
    const first = calls.startB[0]!.plan.swaps![0]!;
    expect(nameOf(first.with)).toBe(picked);
    expect(calls.startB[0]!.machineIds).toContain(first.with);
  });

  it("with no machines in Routine A, nothing starts: B is a copy of A", async () => {
    await mount(
      <PlanBSheet
        open
        aRoutine={[]}
        aPlan={null}
        floor={floorMachinesOf(FLOOR)}
        nameOf={nameOf}
        who={{ uid: "uid-sam" }}
        todayYmd={TODAY}
        aRunsLine={null}
        onClose={() => {}}
        onStart={(s) => calls.startB.push({ routineId: null, ...s })}
      />,
    );
    expect(text()).toContain("Routine A has no machines yet.");
    expect(button("Start B").disabled).toBe(true);
  });
});

describe("Swap in the next one, through the profile's real actions", () => {
  it("is ONE batch on Routine B: B's machines with the next swap made, its plan, and the swap's change; nothing on A", async () => {
    await mount(
      <Profile initial={[ROUTINE_A, ROUTINE_B]}>
        {(host, routines) => {
          const a = routines.find((r) => r.id === "rA") as Routine & { id: string; plan: RoutinePlan };
          const b = routines.find((r) => r.id === "rB") as Routine & { id: string };
          return lineup(bSideOf(b), host, a);
        }}
      </Profile>,
    );
    await tap("Swap in the next one");
    expect(fake.batches).toHaveLength(0);
    await tap("Save change");
    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/g, "*")])).toEqual([
      ["update", "routines/rB"],
      ["set", "routines/rB/planChanges/*"],
    ]);
    expect(ops[0]!.data).toEqual({ plan: B_PLAN, machineIds: bRoutineOf(A, SWAPS, 2) });
    expect(ops[1]!.data).toMatchObject({ kind: "swap", machineIds: ["m-compound-row", "m-simple-row"], value: "made", byUid: "uid-sam" });
    // Drawn at once from what was written: two of three swaps in.
    expect(text()).toContain(`B · 2 of 3 swaps · next: ${nameOf("m-hip-abd")} for ${nameOf("m-hip-add")}`);
  });
});

describe("Plan B's sheet follows what arrives until the trainer changes it", () => {
  const sheet = (floor: Machine[], aRoutine: readonly string[] = A) => (
    <PlanBSheet
      open
      aRoutine={aRoutine}
      aPlan={A_PLAN}
      floor={floorMachinesOf(floor)}
      nameOf={nameOf}
      who={{ uid: "uid-sam", name: "Sam Lee" }}
      todayYmd={TODAY}
      aRunsLine={null}
      onClose={() => {}}
      onStart={(s) => calls.startB.push({ routineId: null, ...s })}
    />
  );

  it("a floor that arrives after the sheet opened brings its suggestion, and nothing reads as unsaved", async () => {
    // The review of Round 2: the suggestion was taken once at opening, so a
    // floor still loading left "Nothing on this floor" for good, and the
    // suggestion arriving later read as unsaved work nobody typed.
    await mount(sheet([]));
    expect(text()).toContain("Nothing on this floor to swap in yet.");
    await rerender(sheet(FLOOR));
    expect(text()).not.toContain("Nothing on this floor to swap in yet.");
    expect(text()).toContain("Starts with");
    expect(status!.anyDirty()).toBe(false);
    expect(button("Start B").disabled).toBe(false);
  });

  it("'Starts with' marks the swap Start B starts with, when the first in the list can't be kept", async () => {
    await mount(sheet(FLOOR));
    const rows = () => Array.from(page().querySelectorAll<HTMLButtonElement>("ol button.rpl-bcell"));
    const label = (b: HTMLButtonElement) => b.getAttribute("aria-label")!;
    const swapOf = (b: HTMLButtonElement) => {
      const [w, r] = label(b).replace(/, (starts with|left out)$/, "").split(" for ");
      return { with: IDS.find((id) => nameOf(id) === w)!, replaces: IDS.find((id) => nameOf(id) === r)! };
    };
    expect(rows().length).toBeGreaterThanOrEqual(2);
    const s1 = swapOf(rows()[0]!);
    const s2 = swapOf(rows()[1]!);
    // The trainer puts the second swap first (their own list now)...
    await act(async () => rows()[1]!.click());
    await act(async () => {});
    await tap("Start with this one");
    expect(label(rows()[0]!)).toMatch(/, starts with$/);
    expect(swapOf(rows()[0]!)).toEqual(s2);
    // ...and then Routine A lets go of the machine that swap was for.
    await rerender(sheet(FLOOR, A.filter((id) => id !== s2.replaces)));
    expect(label(rows()[0]!)).toMatch(/, left out$/);
    expect(swapOf(rows()[1]!)).toEqual(s1);
    expect(label(rows()[1]!)).toMatch(/, starts with$/);
    await tap("Start B");
    // Start B starts with the swap the sheet marked.
    expect(calls.startB[0]!.plan.swaps![0]).toEqual(s1);
    expect(calls.startB[0]!.change.machineIds).toEqual([s1.replaces, s1.with]);
  });
});

describe("B follows A: a change to Routine A writes Routine B in the same batch", () => {
  it("a move on Routine A's Lineup reaches B's unswapped places, and never B's swap", async () => {
    await mount(
      <Profile initial={[ROUTINE_A, ROUTINE_B]}>
        {(host, routines) => {
          const a = routines.find((r) => r.id === "rA") as Routine & { id: string; plan: RoutinePlan };
          const b = routines.find((r) => r.id === "rB") as Routine & { id: string };
          return lineup(bSideOf(b), host, a);
        }}
      </Profile>,
    );
    await tap(`Change ${nameOf("m-compound-row")} in the plan`);
    await tap("Move up");
    await tap("Save change");

    expect(fake.batches).toHaveLength(1);
    const ops = fake.batches[0]!.ops;
    expect(ops.map((o) => [o.op, o.path.replace(/auto-\d+/g, "*")])).toEqual([
      ["update", "routines/rA"],
      ["set", "routines/rA/planChanges/*"],
      ["update", "routines/rB"],
    ]);
    expect(ops[0]!.data.machineIds).toEqual(["m-compound-row", "m-leg-press", "m-chest-press", "m-lumbar", "m-hip-add"]);
    // B's own Leg Extension keeps Leg Press's place in A's new order; the rest follow A.
    expect(ops[2]!.data).toEqual({
      machineIds: ["m-compound-row", "m-ext", "m-chest-press", "m-lumbar", "m-hip-add"],
      "plan.intended": ["m-simple-row", "m-ext", "m-chest-press", "m-lumbar", "m-hip-abd"],
    });
    // And the screen draws B's column from what was written, at once.
    expect(button(new RegExp(`^Routine B: ${esc(nameOf("m-ext"))} · B's own`)).dataset.kind).toBe("own");
  });
});

/*
 * B planned with the starting lineup (the studio setting `newClientsStart`,
 * "A and B together", item 8). AJ, Oct 7 2026: "Some studios may start
 * building an A and B routine immediately for a client." Routine B is kept
 * with its plan and no machines until the Wrap-up that starts Routine A
 * starts it; Programming says so, never draws it as a column of "missing"
 * places, and Plan B starts from its swaps.
 */
describe("a Routine B planned with the starting lineup", () => {
  const ROAD = ["m-leg-press", "m-compound-row", "m-lumbar", "m-chest-press", "m-hip-add"];
  const CONSULT_A = {
    id: "rA",
    name: "Routine A",
    clientId: "c1",
    machineIds: [],
    plan: { purpose: "Learning the protocol", intended: ROAD, dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"], building: true, madeByUid: "uid-sam" },
  } as unknown as Routine & { id: string; plan: RoutinePlan };
  const PLANNED_B = {
    id: "rB",
    name: "Routine B",
    clientId: "c1",
    machineIds: [],
    plan: { ...B_PLAN, intended: bIntendedOf(ROAD, SWAPS) },
  } as unknown as Routine & { id: string };
  const base = {
    client: { id: "c1", firstName: "Tom", homeStudioId: "westlake" } as never,
    clientId: "c1",
    machines: FLOOR,
    clientSettings: {},
    allLogs: [],
    sessions: [],
    adjustments: [],
    trainers: [],
    selectedRoutineTodayId: null,
    onEdit: vi.fn(),
  };
  const planned = `B is planned: ${nameOf("m-ext")} for ${nameOf("m-leg-press")} first, 3 swaps in all.`;

  it("while day one runs, Routine A's Lineup says what B starts with and when, with no column of B", async () => {
    await mount(lineup(bSideOf(PLANNED_B, { isBActive: false, nextIsB: null }), hostOf(), CONSULT_A));
    expect(text()).toContain(planned);
    expect(text()).toContain("It starts with Routine A, at the Wrap-up that starts A.");
    expect(page().querySelector("[aria-label='Routine A and Routine B']")).toBeNull();
  });

  it("Routine B's own segment says it is planned and when it starts, with no Plan B while A is empty", async () => {
    await mount(<RoutinesTab {...base} view="Routine B" routines={[CONSULT_A, PLANNED_B]} isBActive={false} onToggleB={(on) => calls.toggles.push(on)} plan={hostOf()} />);
    expect(text()).toContain(planned);
    expect(text()).toContain("It starts with Routine A, at the Wrap-up that starts A.");
    expect(has("Plan B")).toBe(false);
    expect(text()).not.toContain("Not in B");
  });

  it("once Routine A has machines, B's one cell offers Plan B, which starts from B's planned swaps and keeps them", async () => {
    const aWith = { ...CONSULT_A, machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"] } as Routine & { id: string; plan: RoutinePlan };
    await mount(lineup(bSideOf(PLANNED_B, { isBActive: false, nextIsB: null }), hostOf(), aWith));
    expect(text()).toContain(planned);
    await tap("Plan B");
    expect(calls.planB).toBe(1);

    document.body.innerHTML = "";
    act(() => root?.unmount());
    await mount(
      <PlanBSheet
        open
        aRoutine={aWith.machineIds}
        aPlan={aWith.plan}
        planned={PLANNED_B.plan as RoutinePlan}
        floor={floorMachinesOf(FLOOR)}
        nameOf={nameOf}
        who={{ uid: "uid-sam", name: "Sam Lee" }}
        todayYmd={TODAY}
        aRunsLine={null}
        onClose={() => {}}
        onStart={(s) => calls.startB.push({ routineId: "rB", ...s })}
      />,
    );
    expect(text()).toContain("B's swaps, as planned at the start");
    // The swap for a machine still on A's deck is left out of this start, and said so.
    expect(text()).toContain(`Left out: ${nameOf("m-hip-add")} isn't in Routine A yet`);
    expect(status!.anyDirty()).toBe(false);
    await tap("Start B");
    expect(calls.startB).toHaveLength(1);
    expect(calls.startB[0]!.machineIds).toEqual(["m-ext", "m-compound-row", "m-lumbar"]);
    expect(calls.startB[0]!.plan.swaps).toEqual(SWAPS.slice(0, 2));
  });

  /*
   * The review of item 8: B's planned swaps for machines still on A's deck
   * were dropped when the first Wrap-up started B. They are kept, waiting
   * for A, and B's column says so, never "no longer in A".
   */
  it("a swap kept for a machine still on A's road waits under B's column, said as waiting for A", async () => {
    const aNow = ["m-leg-press", "m-compound-row", "m-lumbar"];
    const aWith = { ...CONSULT_A, machineIds: aNow } as Routine & { id: string; plan: RoutinePlan };
    // As the Wrap-up that started A started it: the first swap made, the hip adductor's kept for later.
    const swaps = [SWAPS[0]!, SWAPS[1]!, SWAPS[2]!];
    const started = {
      ...PLANNED_B,
      machineIds: bRoutineOf(aNow, swaps, 1),
      plan: { ...B_PLAN, swaps, intended: bIntendedOf(aNow, swaps) },
    } as Routine & { id: string };
    await mount(lineup(bSideOf(started), hostOf(), aWith));
    const waits = `Planned · waits for ${nameOf("m-hip-add")} in Routine A`;
    expect(text()).toContain(waits);
    expect(text()).not.toContain(`${nameOf("m-hip-add")} is no longer in A`);
    // Two swaps made: the next is the waiting one, and Swap in waits for A, with why.
    document.body.innerHTML = "";
    act(() => root?.unmount());
    const two = { ...started, machineIds: bRoutineOf(aNow, swaps, 2) } as Routine & { id: string };
    await mount(lineup(bSideOf(two), hostOf(), aWith));
    expect(text()).toContain(`${nameOf("m-hip-add")} isn't in Routine A yet, so the next swap waits until A takes it.`);
    expect(has("Swap in the next one")).toBe(false);
  });
});

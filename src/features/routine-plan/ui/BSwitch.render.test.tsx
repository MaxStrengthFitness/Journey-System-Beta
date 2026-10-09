// @vitest-environment jsdom
/**
 * THE B SWITCH, MOUNTED as ClientProfileView wires it (Round 2 of the
 * first-session design round, item 6: B molded in). The real `useBSwitch`
 * (the profile's `handlePromptToggleB`), the real Programming → Routine B
 * segment (`RoutinesTab`), the real Edit routine drawer and the profile's
 * Plan B (`ProfilePlanB`) over the real `usePlanActions`, on a Firestore
 * that records every write.
 *
 * AJ, Oct 7 2026: "the B routine starts out as the A routine with just one
 * machine different". What matters is silent when wrong:
 *   - turning B on with nothing in Routine B, from the switch or from the
 *     drawer's inactive B tab, opens Plan B and writes NO Routine B (the
 *     critic's #22: an empty Routine B with B on alternated the client into
 *     a session of nothing); the drawer closes for it;
 *   - Start B then writes Routine B as A with one machine different, its
 *     plan, its start and the switch, in ONE batch;
 *   - before the client's routines have answered, the switch says it can't
 *     tell, never Plan B off a list it hasn't read (the review of Round 2);
 *   - a Routine B with machines turns on as it always has, its reason asked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* A Firestore that records each batch and every lone write. */
type Op = { op: "set" | "update"; path: string; data: Record<string, unknown> };
const fake = vi.hoisted(() => ({
  batches: [] as Array<{ ops: Op[]; committed: boolean }>,
  lone: [] as Array<{ op: string; path: string }>,
  autoId: 0,
}));
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
    query: (base: unknown) => base,
    where: () => ({}),
    serverTimestamp: () => "SERVER_TIME",
    onSnapshot: () => () => {},
    getDocs: async () => ({ docs: [] }),
    addDoc: async (r: { path: string }) => {
      fake.lone.push({ op: "add", path: r.path });
      return { id: "lone" };
    },
    updateDoc: async (r: { path: string }) => {
      fake.lone.push({ op: "update", path: r.path });
    },
    deleteDoc: async (r: { path: string }) => {
      fake.lone.push({ op: "delete", path: r.path });
    },
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
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {} }) }));
vi.mock("../../../hooks/useClientJournal", () => ({ createJournalEntry: vi.fn(() => Promise.resolve("j1")) }));
vi.mock("../starting-store", () => ({
  readStartingRoutines: () => Promise.resolve({ routines: [], known: true }),
  readStartingChoice: () => Promise.resolve({ use: null, defaultId: null }),
}));

/* base-ui reads PointerEvent (jsdom has none); the sheets want ResizeObserver. */
if (!("PointerEvent" in globalThis)) (globalThis as Record<string, unknown>).PointerEvent = MouseEvent;
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import type { Client, Machine, Routine } from "../../../types";
import { EditRoutineDrawer } from "../../../components/EditRoutineDrawer";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { RoutinesTab } from "../../routines/RoutinesTab";
import { B_SWITCH_CANT_TELL } from "../b-routine";
import { startingKindOf } from "../client-kind";
import type { RoutinePlan } from "../types";
import type { PlanHost } from "./host";
import { ProfilePlanB } from "./ProfilePlanB";
import { useBSwitch } from "./useBSwitch";
import { usePlanActions } from "./usePlanActions";

const IDS = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
];
const FLOOR: Machine[] = IDS.map((id) => ({ id, name: ACADEMY_MOVEMENT_NAME[id] ?? id }) as Machine);
const TODAY = "2026-10-09";
const A = ["m-leg-press", "m-compound-row", "m-chest-press", "m-lumbar", "m-hip-add"];
const A_PLAN: RoutinePlan = { purpose: "The core", intended: A, building: false, madeByUid: "uid-sam" };
const ROUTINE_A = { id: "rA", name: "Routine A", clientId: "c1", machineIds: A, plan: A_PLAN, studioId: "westlake" } as Routine;
const CLIENT = { id: "c1", firstName: "Tom", homeStudioId: "westlake", isRoutineBActive: false } as Client;

let calls: { switches: boolean[]; errors: string[] };

/** The profile's part, as ClientProfileView wires it. */
function ProfileLike({ initial, known }: { initial: Routine[]; known: boolean }) {
  const [routines, setRoutines] = useState<Routine[]>(initial);
  const [target, setTarget] = useState<"Routine A" | "Routine B" | null>(null);
  const actions = usePlanActions({
    clientId: "c1",
    studioId: "westlake",
    routines,
    setRoutines,
    onError: (m) => calls.errors.push(m),
    author: { id: "uid-sam", initials: "SL", fullName: "Sam Lee" },
  });
  const bSwitch = useBSwitch({
    routines,
    routinesKnown: known,
    onSwitch: (on) => calls.switches.push(on),
    onCantTell: (m) => calls.errors.push(m),
    beforePlanB: () => setTarget(null),
  });
  const host = useMemo<PlanHost>(
    () => ({
      status: known ? "ready" : "loading",
      kind: startingKindOf({ known, hasRoutine: true, hasPlan: true, journeySessions: 9, coverage: "complete", provisionalNewClient: false }),
      floor: FLOOR,
      studioId: "westlake",
      studioName: "Westlake",
      who: { uid: "uid-sam", name: "Sam Lee" },
      todayYmd: TODAY,
      intakeText: null,
      actions,
      openPlanB: bSwitch.openPlanB,
      sessionsComplete: true,
      coverage: "complete",
    }),
    [known, actions, bSwitch.openPlanB],
  );
  return (
    <>
      <button type="button" onClick={() => setTarget("Routine A")}>
        Open the drawer
      </button>
      <RoutinesTab
        client={CLIENT}
        clientId="c1"
        machines={FLOOR}
        clientSettings={{}}
        allLogs={[]}
        sessions={[]}
        adjustments={[]}
        trainers={[]}
        selectedRoutineTodayId={null}
        onEdit={() => setTarget("Routine B")}
        view="Routine B"
        routines={routines}
        isBActive={false}
        onToggleB={bSwitch.request}
        plan={host}
      />
      <EditRoutineDrawer
        client={CLIENT}
        clientId="c1"
        routines={routines}
        machines={FLOOR}
        activeStudioId="westlake"
        sessions={[]}
        allLogs={[]}
        coverage="complete"
        target={target}
        onClose={() => setTarget(null)}
        onSaved={setRoutines}
        onRequestActivateRoutineB={() => bSwitch.request(true)}
      />
      <ProfilePlanB
        bSwitch={bSwitch}
        routines={routines}
        floor={FLOOR}
        machines={FLOOR}
        sessions={[]}
        sessionsComplete
        coverage="complete"
        who={{ uid: "uid-sam", name: "Sam Lee" }}
        todayYmd={TODAY}
        actions={actions}
        onError={(m) => calls.errors.push(m)}
      />
    </>
  );
}

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
async function click(target: HTMLElement) {
  await act(async () => {
    target.click();
  });
  await act(async () => {});
}
const switchOn = () => page().querySelector<HTMLElement>("[role='switch'][aria-label='Turn Routine B on']")!;
const writes = () => [...fake.batches.flatMap((b) => b.ops.map((o) => `${o.op} ${o.path}`)), ...fake.lone.map((o) => `${o.op} ${o.path}`)];

beforeEach(() => {
  calls = { switches: [], errors: [] };
  fake.batches.length = 0;
  fake.lone.length = 0;
  fake.autoId = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  document.body.innerHTML = "";
});

describe("turning B on with nothing in Routine B opens Plan B, and writes no Routine B", () => {
  it("from the switch: Plan B opens, nothing is written; Start B is then ONE batch with B on", async () => {
    await mount(<ProfileLike initial={[ROUTINE_A]} known />);
    expect(has("Start B")).toBe(false);
    await click(switchOn());
    expect(has("Start B")).toBe(true);
    expect(writes()).toEqual([]);
    expect(calls.switches).toEqual([]);

    await click(button("Start B"));
    expect(fake.batches).toHaveLength(1);
    expect(writes().map((w) => w.replace(/auto-\d+/g, "*"))).toEqual([
      "set routines/*",
      "set routines/*/planChanges/*",
      "update clients/c1",
    ]);
    const made = fake.batches[0]!.ops[0]!.data as { name: string; machineIds: string[] };
    expect(made.name).toBe("Routine B");
    expect(made.machineIds).toHaveLength(A.length);
    expect(made.machineIds.filter((id, i) => id !== A[i])).toHaveLength(1);
    expect(fake.batches[0]!.ops[2]!.data).toEqual({ isRoutineBActive: true });
  });

  it("from the Edit routine drawer's inactive B tab: the drawer closes, Plan B opens, nothing is written", async () => {
    await mount(<ProfileLike initial={[ROUTINE_A]} known />);
    await click(button("Open the drawer"));
    expect(text()).toContain("Edit routine");
    await click(button(/^Routine BTap to activate$/));
    expect(text()).not.toContain("Adjust the machine order");
    expect(has("Start B")).toBe(true);
    expect(writes()).toEqual([]);
    expect(calls.switches).toEqual([]);
  });

  it("an empty Routine B saved before Round 2 is filled by Start B, never a second one made", async () => {
    const emptyB = { id: "rB", name: "Routine B", clientId: "c1", machineIds: [], studioId: "westlake" } as Routine;
    await mount(<ProfileLike initial={[ROUTINE_A, emptyB]} known />);
    await click(switchOn());
    await click(button("Start B"));
    expect(writes().map((w) => w.replace(/auto-\d+/g, "*"))).toEqual([
      "update routines/rB",
      "set routines/rB/planChanges/*",
      "update clients/c1",
    ]);
  });
});

describe("the switch never decides off a list it hasn't read", () => {
  it("before the routines answer, turning B on says it can't tell: no Plan B, no switch, nothing written", async () => {
    await mount(<ProfileLike initial={[]} known={false} />);
    await click(switchOn());
    expect(calls.errors).toEqual([B_SWITCH_CANT_TELL]);
    expect(has("Start B")).toBe(false);
    expect(calls.switches).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it("a Routine B with machines turns on as it always has, its reason asked (the profile's dialog)", async () => {
    const ownB = { id: "rB", name: "Routine B", clientId: "c1", machineIds: ["m-ext"], studioId: "westlake" } as Routine;
    await mount(<ProfileLike initial={[ROUTINE_A, ownB]} known />);
    await click(switchOn());
    expect(calls.switches).toEqual([true]);
    expect(has("Start B")).toBe(false);
  });
});

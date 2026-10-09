// @vitest-environment jsdom
/**
 * START FROM A ROUTINE…, MOUNTED (the open session round, Oct 9 2026; AJ's
 * "1b": "i want to be able to take advantage of our routine builder so we can
 * use it if we wanted too"): the grid corner's item, the sheet over the real
 * `useStartingRoutines` (its one read stubbed), and a harness that lays a tap
 * on today's list the way the tracker does (`laidToday`).
 *
 * What matters is silent when wrong:
 *   - the sheet lists the right groups (the client's own once known, the
 *     starting routines, the studio's templates, head office's), each row by
 *     its name and its first machines;
 *   - one tap hands the routine's machines up in order and closes, and
 *     today's list keeps what is already done;
 *   - a machine this floor lacks is named on the row, never dropped;
 *   - a read still out, or failed, is said, never "none": the floor's, the
 *     client's routines' (their place held) and the starting routines' (no
 *     default off a choice never read; the review, Oct 9 2026);
 *   - nothing here writes (it imports no writer; session-scope.test.ts holds
 *     the source).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useMemo, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));

/* The starting routines' one read (which carries the templates), answered when a test says so. */
const reads = vi.hoisted(() => ({
  routines: [] as Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void; studioId: unknown; opts: unknown }>,
  choices: [] as Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
}));
vi.mock("../starting-store", () => ({
  readStartingRoutines: (_db: unknown, studioId: unknown, opts?: unknown) =>
    new Promise((resolve, reject) => reads.routines.push({ resolve, reject, studioId, opts })),
  readStartingChoice: () => new Promise((resolve, reject) => reads.choices.push({ resolve, reject })),
}));
/* Base UI's menu does not open in jsdom: the corner's menu is drawn open, as SessionPlan.render.test.tsx draws it. */
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div data-testid="menu">{children}</div>,
  DropdownMenuTrigger: ({ children, className }: { children: ReactNode; className?: string }) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, ...rest }: { children: ReactNode; onClick?: () => void; disabled?: boolean; "data-testid"?: string }) => (
    <div role="menuitem" tabIndex={0} data-testid={rest["data-testid"]} aria-disabled={disabled} onClick={disabled ? undefined : onClick}>
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

import type { Machine, Routine, RoutinePreset } from "../../../types";
import { SessionCorner } from "../../journey-grid/SessionCorner";
import { laidToday, type StartFromChoice } from "../start-from";
import type { StartingRoutine } from "../starting-routines";
import { floorMachinesOf, machineNamer } from "./host";
import { StartFromRoutineSheet } from "./StartFromRoutineSheet";

const FLOOR: Machine[] = [
  { id: "m-leg-press", name: "Leg Press" },
  { id: "m-compound-row", name: "Compound Row" },
  { id: "m-lumbar", name: "Lumbar" },
  { id: "m-chest-press", name: "Chest Press" },
  { id: "sm-west-dip", name: "Dip Station" },
] as Machine[];
const CATALOG: Machine[] = [{ id: "m-leg-curl", name: "Leg Curl" }, { id: "m-abs", name: "Abdominal" }] as Machine[];
const TODAY = "2026-10-09";

const knee: StartingRoutine = {
  id: "academy-knee",
  name: "Knee issues",
  machineIds: ["m-leg-press", "m-leg-curl", "m-lumbar"],
  dayOne: ["m-leg-press", "m-leg-curl"],
  matchWords: ["knee"],
  isDefault: true,
  tier: "company",
  kind: "condition",
};
const legs: RoutinePreset = { id: "t-legs", name: "Legs day", machineIds: ["m-leg-press", "m-lumbar"], scope: "westlake", tier: "studio", studioId: "westlake" };
const fullBody: RoutinePreset = { id: "t-full", name: "Full Body", machineIds: ["m-chest-press", "m-compound-row", "m-leg-press", "m-abs"], scope: "global", tier: "company" };

/**
 * The tracker's wiring, in small: the corner opens the sheet once today's
 * list is on screen, and a tap lays the routine through `laidToday` (what is
 * done today first), recording each list laid.
 */
function Harness({
  routines = null,
  startToday = [],
  doneToday = [],
  floorState = "known",
  laid,
}: {
  routines?: Routine[] | "reading" | null;
  startToday?: string[];
  doneToday?: string[];
  floorState?: "known" | "reading" | "failed";
  laid: Array<{ ids: string[]; choice: StartFromChoice }>;
}) {
  const [today, setToday] = useState<string[]>(startToday);
  const [open, setOpen] = useState(false);
  const floor = useMemo(() => floorMachinesOf(FLOOR), []);
  const nameOf = useMemo(() => machineNamer(FLOOR, CATALOG), []);
  return (
    <>
      <SessionCorner
        showAll
        routineCount={today.length}
        allCount={FLOOR.length}
        onShowAll={() => {}}
        onReorder={() => {}}
        onKey={() => {}}
        floor
        onStartFrom={() => setOpen(true)}
      />
      <p data-testid="today">{today.join(",")}</p>
      {open && (
        <StartFromRoutineSheet
          onClose={() => setOpen(false)}
          studioId="westlake"
          studioName="Westlake"
          floor={floor}
          floorState={floorState}
          nameOf={nameOf}
          todayYmd={TODAY}
          clientRoutines={routines}
          firstName={routines !== null ? "Judy" : null}
          onLay={(ids, choice) => {
            laid.push({ ids, choice });
            setToday((t) => laidToday({ today: t, laid: ids, done: (id) => doneToday.includes(id) }));
          }}
        />
      )}
    </>
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
const text = () => document.body.textContent ?? "";
const today = () => document.body.querySelector('[data-testid="today"]')!.textContent;
const row = (key: string) => document.body.querySelector<HTMLButtonElement>(`[data-testid="start-from-${key}"]`);
const labels = () => Array.from(document.body.querySelectorAll(".rpl-sheet__label")).map((n) => n.textContent);
async function open() {
  await act(async () => document.body.querySelector<HTMLElement>('[data-testid="session-corner-start-from"]')!.click());
  await act(async () => {});
}
async function answer(templates: RoutinePreset[] | undefined = [legs, fullBody]) {
  await act(async () => {
    reads.routines.at(-1)!.resolve({ routines: [knee], known: true, seeded: true, ...(templates ? { templates } : null) });
    reads.choices.at(-1)!.resolve({ use: null, defaultId: null });
  });
  await act(async () => {});
}

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  document.body.innerHTML = "";
  reads.routines.length = 0;
  reads.choices.length = 0;
});

describe("Start from a routine… from the session's corner (AJ's 1b)", () => {
  it("the corner offers it, and the sheet reads once, only when opened, saying so while it reads", async () => {
    const laid: Array<{ ids: string[]; choice: StartFromChoice }> = [];
    await mount(<Harness laid={laid} />);
    const item = document.body.querySelector('[data-testid="session-corner-start-from"]')!;
    expect(item.textContent).toBe("Start from a routine…");
    expect(reads.routines, "nothing read until it opens").toHaveLength(0);
    await open();
    expect(reads.routines.map((r) => r.studioId)).toEqual(["westlake"]);
    // The drawer's studio group holds its trainers' saved templates: asked for here (the review, Oct 9 2026).
    expect(reads.routines[0].opts).toEqual({ trainerTemplates: true });
    expect(text()).toContain("Start from a routine");
    expect(text()).toContain("For today only. What's done today stays.");
    expect(text()).toContain("Reading the starting routines…");
    expect(text()).toContain("Reading the templates…");
  });

  it("an open session (no client): the starting routines, the studio's templates and head office's, each by its name and its machines", async () => {
    await mount(<Harness laid={[]} />);
    await open();
    await answer();
    expect(labels()).toEqual(["Starting routines", "Westlake's templates", "Head office's templates"]);
    expect(row("starting:academy-knee")!.textContent).toContain("Knee issues · default · day one");
    expect(row("starting:academy-knee")!.textContent).toContain("Leg Press");
    expect(row("studio:t-legs")!.textContent).toContain("Legs day");
    expect(row("studio:t-legs")!.textContent).toContain("Leg Press · Lumbar");
    expect(row("company:t-full")!.textContent).toContain("Chest Press · Compound Row · Leg Press");
  });

  it("once the client is known, their Routine A and B come first, under their name", async () => {
    const routines = [
      { id: "ra", clientId: "c-1", name: "Routine A", machineIds: ["m-lumbar", "m-chest-press"] },
      { id: "rb", clientId: "c-1", name: "Routine B", machineIds: ["m-compound-row"] },
    ] as Routine[];
    await mount(<Harness laid={[]} routines={routines} />);
    await open();
    await answer();
    expect(labels()[0]).toBe("Judy's routines");
    expect(row("client:A")!.textContent).toContain("Lumbar · Chest Press");
    expect(row("client:B")!.textContent).toContain("Compound Row");
  });

  it("a machine this floor lacks is named on the row, never dropped silently", async () => {
    await mount(<Harness laid={[]} />);
    await open();
    await answer();
    expect(row("starting:academy-knee")!.textContent).toContain("Not on Westlake's floor: Leg Curl");
    expect(row("company:t-full")!.textContent).toContain("Not on Westlake's floor: Abdominal");
  });

  it("one tap lays the routine's machines in order at the top of today's list, keeps what was done, and closes", async () => {
    const laid: Array<{ ids: string[]; choice: StartFromChoice }> = [];
    await mount(<Harness laid={laid} startToday={["sm-west-dip", "m-chest-press"]} doneToday={["sm-west-dip"]} />);
    await open();
    await answer();
    await act(async () => row("company:t-full")!.click());
    expect(laid.map((l) => l.ids)).toEqual([["m-chest-press", "m-compound-row", "m-leg-press"]]);
    expect(laid[0].choice.missing).toEqual(["m-abs"]);
    // The Dip Station was done today: it stays first. The Chest Press had no set: it takes the routine's place.
    expect(today()).toBe("sm-west-dip,m-chest-press,m-compound-row,m-leg-press");
    expect(text()).not.toContain("Head office's templates");
  });

  it("a read that failed says so, never 'none'", async () => {
    await mount(<Harness laid={[]} />);
    await open();
    await act(async () => {
      reads.routines.at(-1)!.reject(new Error("unavailable"));
      reads.choices.at(-1)!.resolve({ use: null, defaultId: null });
    });
    await act(async () => {});
    expect(text()).toContain("The templates couldn't be read.");
    // The Academy's eleven from code are still offered, as Start a plan offers them.
    expect(labels()).toContain("Starting routines");
    expect(document.body.querySelectorAll('[data-testid^="start-from-starting:"]').length).toBeGreaterThan(0);
  });

  /*
   * The phase's review (Oct 9 2026): the routines' read failed for a studio
   * that chose only its own Walk-in, and the sheet said Westlake had "no
   * starting routines chosen", off a read that never answered. Said as Start
   * a plan says it, above what is offered.
   */
  it("the routines' read failed, for a studio that chose its own: said above the Academy's, never 'none chosen', and no default", async () => {
    await mount(<Harness laid={[]} />);
    await open();
    await act(async () => {
      reads.routines.at(-1)!.reject(new Error("unavailable"));
      reads.choices.at(-1)!.resolve({ use: ["w-walkin"], defaultId: "w-walkin" });
    });
    await act(async () => {});
    const starting = document.body.querySelector('section[aria-label="Starting routines"]')!;
    expect(starting.textContent).toContain("Couldn't read Westlake's starting routines just now.");
    expect(starting.textContent).toContain("These are the Academy's, from Journey's own copy.");
    expect(starting.textContent).not.toContain("no starting routines chosen");
    expect(starting.textContent).not.toContain("default");
    expect(starting.querySelectorAll('[data-testid^="start-from-starting:"]').length).toBeGreaterThan(0);
  });

  it("the choice's read failed: every start offered, head office's default never called the default", async () => {
    await mount(<Harness laid={[]} />);
    await open();
    await act(async () => {
      reads.routines.at(-1)!.resolve({ routines: [knee], known: true, seeded: true, templates: [] });
      reads.choices.at(-1)!.reject(new Error("unavailable"));
    });
    await act(async () => {});
    const row = document.body.querySelector('[data-testid="start-from-starting:academy-knee"]')!;
    expect(row.textContent).toContain("Knee issues · day one");
    expect(row.textContent).not.toContain("default");
    expect(document.body.querySelector('section[aria-label="Starting routines"]')!.textContent).toContain(
      "Couldn't read Westlake's starting routines just now.",
    );
  });

  it("a client whose routines are still reading holds their place, so nothing lands above a row", async () => {
    await mount(<Harness laid={[]} routines="reading" />);
    await open();
    await answer();
    expect(labels()[0]).toBe("Judy's routines");
    expect(text()).toContain("Reading Judy's routines…");
  });

  it("a floor not read yet, or failed, is said in place of every row: nothing offered, nothing called missing", async () => {
    await mount(<Harness laid={[]} floorState="reading" />);
    await open();
    await answer();
    expect(document.body.querySelector('[data-testid="start-from-floor"]')!.textContent).toBe("Reading Westlake's floor…");
    expect(document.body.querySelectorAll('[data-testid^="start-from-"]:not([data-testid="start-from-floor"])')).toHaveLength(0);
    expect(text()).not.toContain("Not on Westlake's floor");
    act(() => root?.unmount());
    el?.remove();
    await mount(<Harness laid={[]} floorState="failed" />);
    await open();
    expect(text()).toContain("Couldn't read Westlake's floor just now.");
    expect(labels()).toEqual([]);
  });

  it("a client routine with nothing on this floor is shown, said, and can't be tapped", async () => {
    const laid: Array<{ ids: string[]; choice: StartFromChoice }> = [];
    const routines = [{ id: "ra", clientId: "c-1", name: "Routine A", machineIds: ["m-leg-curl"] }] as Routine[];
    await mount(<Harness laid={laid} routines={routines} />);
    await open();
    await answer();
    const a = row("client:A")!;
    expect(a.disabled).toBe(true);
    expect(a.textContent).toContain("Nothing of it to lay on this floor");
    expect(a.textContent).toContain("Not on Westlake's floor: Leg Curl");
    await act(async () => a.click());
    expect(laid).toEqual([]);
  });
});

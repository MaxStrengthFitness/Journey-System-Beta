// @vitest-environment jsdom
/**
 * THE BRIEFING'S PLAN CARD, MOUNTED (the first-session design round, Oct 8
 * 2026, §4.5; AJ's "1d": "the Road's one-line route wherever a glance is all
 * there is").
 *
 * The real card over the real `useBriefingPlan` and the real
 * `useStartingRoutines` (its two reads answered here: none in the app, so
 * the Academy's eleven). What matters is silent when wrong:
 *   - today (the starting routine's day one) sits under the Today bracket,
 *     the rest of the road hollow, the next one "Next stop", the source said;
 *   - Change today moves TODAY only: out, the plan's next, any floor machine;
 *     the plan (and its day one) stays as it was, and what Start hands up
 *     carries today's machines;
 *   - nothing here holds Start: while the starting routines are read, or a
 *     start is still to pick, the card says so and hands up no plan;
 *   - a kept plan (Routine A still empty) runs its day one and offers no
 *     other start;
 *   - the other doors say one line and open Programming, or offer both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));
const startingReads = vi.hoisted(() => {
  const answered = {
    routines: () => Promise.resolve({ routines: [] as unknown[], known: true }),
    choice: () => Promise.resolve({ use: null as string[] | null, defaultId: null as string | null }),
  };
  return { answered, now: { ...answered }, count: 0 };
});
vi.mock("../starting-store", () => ({
  readStartingRoutines: () => {
    startingReads.count += 1;
    return startingReads.now.routines();
  },
  readStartingChoice: () => startingReads.now.choice(),
}));

/* The sheets are base-ui dialogs, which want both. */
const g = globalThis as unknown as Record<string, unknown>;
if (!("PointerEvent" in g)) g.PointerEvent = MouseEvent;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import type { Machine } from "../../../types";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import type { BriefingPlanView } from "../briefing-plan";
import { academyStartingRoutines, startingPlanFromRoutine } from "../starting-routines";
import type { RoutinePlan } from "../types";
import { BriefingDoors, BriefingJourneyLine, BriefingPlanCard } from "./BriefingPlanCard";
import { floorMachinesOf, machineNamer } from "./host";
import { useBriefingPlan, type BriefingPlanState } from "./useBriefingPlan";

const IDS = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
];
const FLOOR: Machine[] = IDS.map((id) => ({ id, name: ACADEMY_MOVEMENT_NAME[id] ?? id }) as Machine);
const nameOf = machineNamer(FLOOR, []);
const TODAY = "2026-10-08";
const WHO = { uid: "uid-sam", name: "Sam Lee" };

/** The low back starting routine's plan on this floor, as the card should make it. */
const lowBack = academyStartingRoutines().find((r) => r.id === "academy-low-back")!;
const expected = startingPlanFromRoutine(lowBack, WHO, floorMachinesOf(FLOOR), TODAY);

let latest: BriefingPlanState | null = null;
function Harness({
  view,
  intake = "Sciatica down the left leg",
  kept = null,
  who = WHO,
  firstName = "Dana",
  limits = null,
}: {
  view: BriefingPlanView;
  intake?: string | null;
  kept?: RoutinePlan | null;
  who?: typeof WHO | null;
  firstName?: string;
  limits?: React.ReactNode;
}) {
  const state = useBriefingPlan({
    view,
    studioId: "westlake",
    studioName: "Westlake",
    floor: FLOOR,
    intakeText: intake,
    who,
    todayYmd: TODAY,
    kept,
  });
  latest = state;
  if (view !== "starting" && view !== "kept") return null;
  return (
    <BriefingPlanCard state={state} view={view} firstName={firstName} nameOf={nameOf} floor={FLOOR} todayYmd={TODAY} limits={limits} />
  );
}

let root: Root | null = null;
let el: HTMLElement | null = null;
async function mount(node: React.ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<StrictMode>{node}</StrictMode>);
  });
  await act(async () => {});
}
/** The same root, new props: what a parent re-rendering looks like. */
async function rerender(node: React.ReactNode) {
  await act(async () => {
    root!.render(<StrictMode>{node}</StrictMode>);
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
async function tap(label: string | RegExp | HTMLElement) {
  const target = label instanceof HTMLElement ? label : button(label);
  await act(async () => {
    target.click();
  });
  await act(async () => {});
}
/** The Road's stations, by what each is: today, planned, the next stop. */
function stations(kind: string) {
  return Array.from(page().querySelectorAll(`[data-testid="briefing-plan"] .rpl-road__stop[data-kind="${kind}"] .rpl-road__name`)).map(
    (n) => n.textContent,
  );
}
/** Change today's tick for a machine. */
const tick = (id: string) =>
  Array.from(page().querySelectorAll<HTMLButtonElement>('[role="checkbox"]')).find(
    (b) => b.querySelector(".rpl-tick__label")?.textContent === nameOf(id),
  )!;

beforeEach(() => {
  latest = null;
  startingReads.now = { ...startingReads.answered };
  startingReads.count = 0;
});

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  document.body.innerHTML = "";
});

describe("a client starting out: the starting lineup's first visit, on the Road", () => {
  it("puts day one under the Today bracket, the rest hollow with the next stop, and says where it came from", async () => {
    await mount(<Harness view="starting" />);
    expect(text()).toContain("Dana's starting lineup");
    expect(page().querySelector(".rpl-road__group--bracket .rpl-road__label")?.textContent).toBe(`Today · ${expected.startWith.length}`);
    expect(stations("in")).toEqual(expected.startWith.map(nameOf));
    const later = expected.plan.intended.filter((id) => !expected.startWith.includes(id));
    expect(stations("next")).toEqual([nameOf(later[0])]);
    expect(stations("planned")).toEqual(later.slice(1).map(nameOf));
    expect(text()).toContain("Next stop");
    expect(text()).toContain("Low back issues");
    expect(text()).not.toContain("Matched from the intake");
    await tap("Why this start");
    expect(text()).toContain("Matched from the intake: sciatica");
    expect(text()).toContain("Starts Routine A's plan · nothing is saved until Start");
    // What Start hands up: the plan with day one, today's machines, and the start's name.
    expect(latest!.startPlan).toMatchObject({
      name: "Routine A",
      machineIds: expected.startWith,
      startingRoutineId: "academy-low-back",
      startingRoutineName: "Low back issues",
    });
    expect(latest!.startPlan!.plan.dayOne).toEqual(expected.startWith);
    expect(latest!.changed).toBe(false);
    // One read of each, for this card only.
    expect(startingReads.count).toBeGreaterThan(0);
  });

  it("Change today takes a machine out, adds the plan's next one and any floor machine; the road stays, and day one is what the consult runs", async () => {
    await mount(<Harness view="starting" />);
    const next = expected.plan.intended.find((id) => !expected.startWith.includes(id))!;
    const out = expected.startWith[0];
    await tap("Change today");
    expect(text()).toContain("Today is the plan's day one. Its road stays as it is.");
    expect(tick(out).getAttribute("aria-checked")).toBe("true");
    expect(tick(next).textContent).toContain("Next stop");

    await tap(tick(out));
    // The row stays, unticked, so the untick can be taken back.
    expect(tick(out).getAttribute("aria-checked")).toBe("false");
    await tap(tick(next));
    // Any machine on this floor, folded under the rest of the floor.
    await tap(/Rest of the floor/);
    const extra = IDS.find((id) => !expected.plan.intended.includes(id))!;
    await tap(nameOf(extra));
    expect(tick(extra).textContent).toContain("Not in the plan");
    await tap("Done");

    const today = [...expected.startWith.slice(1), next, extra];
    expect(latest!.today).toEqual(today);
    expect(latest!.changed).toBe(true);
    expect(stations("in")).toEqual(today.map(nameOf));
    expect(latest!.startPlan!.machineIds).toEqual(today);
    /* AJ's "3a" (Oct 8 2026): the plan keeps "the first visit's machines" as
       its day one. Before Start the plan is a draft, so day one follows
       today: the machine taken out leaves it (so it never comes back at the
       next visit), the plan's next one joins it, in the road's order; the
       floor machine runs today only and the road stays the starting
       routine's. */
    expect(latest!.startPlan!.plan.dayOne).toEqual(
      expected.plan.intended.filter((id) => id !== out && (expected.startWith.includes(id) || id === next)),
    );
    expect(latest!.startPlan!.plan.dayOne).not.toContain(out);
    expect(latest!.startPlan!.plan.dayOne).not.toContain(extra);
    expect(latest!.startPlan!.plan.intended).toEqual(expected.plan.intended);
    // The plan the card draws is untouched: only what Start keeps takes today.
    expect(latest!.plan!.dayOne).toEqual(expected.startWith);
  });

  it("an unchanged today hands up the starting routine's own day one", async () => {
    await mount(<Harness view="starting" />);
    expect(latest!.changed).toBe(false);
    expect(latest!.startPlan!.plan).toEqual(expected.plan);
  });

  it("says when today is empty that Start still opens, and adds as you go", async () => {
    await mount(<Harness view="starting" />);
    await tap("Change today");
    for (const id of expected.startWith) await tap(tick(id));
    await tap("Done");
    expect(text()).toContain("Nothing picked for today. Start and add machines as you go.");
    expect(latest!.startPlan!.machineIds).toEqual([]);
  });

  it("Another start shows each by its machines, and picking one makes its plan today's", async () => {
    await mount(<Harness view="starting" />);
    expect(text()).not.toContain("Knee issues");
    await tap("Another start");
    const knee = page().querySelector<HTMLButtonElement>(".rpl-start[aria-pressed='false']")!;
    expect(knee.querySelector(".rpl-start__machines")!.textContent).toMatch(/ · /);
    await tap(/Knee issues/);
    expect(latest!.plan!.templateId).toBe("academy-knee");
    expect(latest!.startPlan!.startingRoutineName).toBe("Knee issues");
    expect(latest!.startPlan!.machineIds).toEqual(latest!.plan!.dayOne);
  });

  it("an order effect today trips is one quiet line, never a block", async () => {
    await mount(<Harness view="starting" />);
    await tap("Change today");
    // Lumbar straight into the Leg Press: the Academy's sequencing rule.
    for (const id of expected.startWith) await tap(tick(id));
    await tap(tick("m-lumbar"));
    await tap(tick("m-leg-press"));
    await tap("Done");
    const effect = page().querySelector('[aria-label="Today\'s order"] .rpl-effect__text');
    expect(effect?.textContent).toMatch(/the Academy/);
    expect(latest!.startPlan!.machineIds).toEqual(["m-lumbar", "m-leg-press"]);
  });
});

describe("nothing holds Start", () => {
  it("while the starting routines are read, says so and hands up no plan", async () => {
    startingReads.now.routines = () => new Promise(() => {});
    await mount(<Harness view="starting" />);
    expect(text()).toContain("Reading the starting routines…");
    // Start never waits on the read, so the card says what Start does now.
    expect(text()).toContain("Start without a pick keeps no plan.");
    expect(has("Change today")).toBe(false);
    expect(latest!.startPlan).toBeNull();
    expect(latest!.today).toEqual([]);
  });

  it("with nothing to go by, the trainer picks a start; until then no plan is handed up", async () => {
    await mount(<Harness view="starting" intake={null} />);
    expect(text()).toContain("Pick a start");
    expect(text()).toContain("Pick which starting routine fits");
    // AJ's "2a" (Oct 8 2026) leaves no head office default: a client whose
    // intake names nothing waits on a pick, and the card says Start without
    // one keeps no plan.
    expect(text()).toContain("Start without a pick keeps no plan.");
    expect(latest!.startPlan).toBeNull();
    await tap(/Low back issues/);
    expect(latest!.startPlan!.startingRoutineId).toBe("academy-low-back");
    expect(text()).not.toContain("Start without a pick keeps no plan.");
  });

  it("with nobody signed in, draws the plan but hands up none (nothing could sign it)", async () => {
    await mount(<Harness view="starting" who={null} />);
    expect(stations("in")).toEqual(expected.startWith.map(nameOf));
    expect(latest!.startPlan).toBeNull();
  });
});

describe("what the card holds once the trainer has touched it", () => {
  it("holds the suggestion once today is changed: words arriving later never swap the start, or the changes with it", async () => {
    await mount(<Harness view="starting" />);
    await tap("Change today");
    await tap(tick(expected.startWith[0]));
    await tap("Done");
    const changed = [...latest!.today];
    // The journal answers a moment later and the intake's words move.
    await rerender(<Harness view="starting" intake={null} />);
    expect(latest!.plan!.templateId).toBe("academy-low-back");
    expect(latest!.today).toEqual(changed);
    expect(latest!.changed).toBe(true);
  });

  it("before the trainer touches it, follows the intake as it lands", async () => {
    await mount(<Harness view="starting" intake={null} />);
    expect(latest!.plan).toBeNull();
    await rerender(<Harness view="starting" />);
    expect(latest!.plan!.templateId).toBe("academy-low-back");
  });

  it("puts everything back on reset (the leave gate's discard)", async () => {
    await mount(<Harness view="starting" />);
    await tap("Change today");
    await tap(tick(expected.startWith[0]));
    await tap("Done");
    expect(latest!.changed).toBe(true);
    await act(async () => latest!.reset());
    expect(latest!.changed).toBe(false);
    expect(latest!.today).toEqual(expected.startWith);
  });
});

describe("the card's own words", () => {
  it("draws the host's safety line under the Road", async () => {
    await mount(<Harness view="starting" limits={<p data-testid="limits">Mind the limits on Lumbar Extension</p>} />);
    const road = page().querySelector('[data-testid="briefing-plan"] .rpl-road');
    const limits = page().querySelector('[data-testid="limits"]');
    expect(limits?.textContent).toBe("Mind the limits on Lumbar Extension");
    // After the Road, inside the card.
    expect(road!.compareDocumentPosition(limits!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("starts its title with a capital when there is no first name", async () => {
    await mount(<Harness view="starting" firstName="" />);
    expect(page().querySelector(".rpl-brief__title")?.textContent).toBe("The client's starting lineup");
  });
});

describe("a plan kept with Routine A still empty", () => {
  it("runs its day one, says where it started, offers no other start, and reads nothing", async () => {
    await mount(<Harness view="kept" kept={{ ...expected.plan, madeAt: TODAY }} />);
    expect(text()).toContain("Routine A's plan");
    expect(stations("in")).toEqual(expected.startWith.map(nameOf));
    expect(text()).toContain("Started from Low back issues");
    expect(text()).toContain("Day one · Routine A starts at the Wrap-up");
    expect(has("Another start")).toBe(false);
    expect(latest!.startPlan).toBeNull();
    expect(startingReads.count).toBe(0);
    await tap("Who kept this plan");
    expect(text()).toContain("Kept by Sam Lee, Oct 8.");
  });
});

describe("a view with no card reads nothing", () => {
  it("for a client with a routine, the starting routines are never read", async () => {
    await mount(<Harness view="routine" />);
    expect(startingReads.count).toBe(0);
    expect(latest!.plan).toBeNull();
    expect(latest!.startPlan).toBeNull();
  });
});

describe("the other doors", () => {
  it("before Journey: one line and a quiet door to Programming", async () => {
    const onEnter = vi.fn();
    await mount(<BriefingJourneyLine line="Dana has a routine from before Journey." onEnter={onEnter} />);
    expect(text()).toContain("Dana has a routine from before Journey.");
    expect(text()).toContain("Or start and add machines as you go.");
    await tap("Enter the routine on Programming");
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("can't tell: both doors, claiming neither", async () => {
    const onPick = vi.fn();
    await mount(<BriefingDoors firstName="Dana" says="Journey can't tell whether this client has trained here before." onPick={onPick} />);
    expect(text()).toContain("How does Dana start?");
    await tap(/Starting out here/);
    await tap(/Trained here before/);
    expect(onPick.mock.calls).toEqual([["studio"], ["journey"]]);
  });
});

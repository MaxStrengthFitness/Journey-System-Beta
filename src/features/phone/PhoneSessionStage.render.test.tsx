// @vitest-environment jsdom
/**
 * THE PHONE'S SESSION CARDS, MOUNTED (Journey Lite, Oct 1 2026): every
 * machine in today's order with its last five times, the weight pre-filled
 * and the count never, every change going out through the tracker's own
 * onChange, Next moving the machine in hand, and the iPad note said once.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PhoneSessionStage, type PhoneSessionStageProps } from "./PhoneSessionStage";
import type { JourneyRow, JourneySession } from "../journey-grid/types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no CSS.escape or scrollIntoView.
  (globalThis as any).CSS ??= {};
  (globalThis as any).CSS.escape ??= (s: string) => s;
  Element.prototype.scrollIntoView ??= function () {};
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const history: JourneySession[] = ["2026-08-24", "2026-08-27", "2026-08-31", "2026-09-03", "2026-09-07", "2026-09-10"].map(
  (date, i) => ({ id: `s${i}`, sessionNumber: 10 + i, date, trainerInitials: "AJ" }),
);
const rowOf = (id: string, name: string, base: number): JourneyRow => ({
  machine: { id, name, group: "Push", settings: { S: "4" }, settingLabels: { S: "Seat" } },
  sets: Object.fromEntries(
    history.map((s, i) => [s.id, { sessionId: s.id, outcome: "performed", weight: base + i * 2, reps: 8 + (i % 3), quality: 2 }]),
  ),
  prescribedWeight: base + 12,
});
const ROWS = [rowOf("chest", "Chest Press", 80), rowOf("leg", "Leg Press", 200)];

function mount(over: Partial<PhoneSessionStageProps> = {}) {
  const props: PhoneSessionStageProps = {
    rows: ROWS,
    history,
    values: {},
    focusId: "chest",
    onFocus: vi.fn(),
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onOpenMachine: vi.fn(),
    onReorder: vi.fn(),
    ...over,
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<StrictMode><PhoneSessionStage {...props} /></StrictMode>));
  return props;
}

const q = <T extends Element = HTMLElement>(sel: string) => host!.querySelector<T>(sel)!;
const qa = (sel: string) => Array.from(host!.querySelectorAll<HTMLElement>(sel));

describe("PhoneSessionStage", () => {
  it("draws each machine in order with its last five times, newest last", () => {
    mount();
    const cards = qa(".ph-card");
    expect(cards.map((c) => c.querySelector(".ph-card__name")!.textContent)).toEqual(["Chest Press", "Leg Press"]);
    const cells = Array.from(cards[0].querySelectorAll(".ph-past__cell"));
    expect(cells).toHaveLength(5);
    expect(cells[4].querySelector(".ph-past__date")!.textContent).toBe("Sep 10");
    expect(cells[4].querySelector(".ph-past__weight")!.textContent).toBe("90");
    expect(host!.textContent).toContain("meant to be run on the iPad");
  });

  it("pre-fills the weight and only ghosts the count", () => {
    mount();
    const weight = q<HTMLInputElement>('[aria-label="Chest Press weight in pounds"]');
    expect(weight.value).toBe("92");
    const reps = q<HTMLInputElement>('[aria-label="Chest Press reps"]');
    expect(reps.value).toBe("");
    expect(reps.placeholder).toBe("10");
  });

  it("sends every change through onChange", () => {
    const p = mount();
    act(() => q<HTMLButtonElement>('[aria-label="Heavier by 2"]').click());
    expect(p.onChange).toHaveBeenCalledWith("chest", { weight: 94 });
    act(() => qa(".ph-chip").find((b) => b.textContent === "Skip")!.click());
    expect(p.onChange).toHaveBeenCalledWith("chest", { outcome: "skipped", skipReason: "other" });
  });

  it("holds the marks until a count is in", () => {
    mount({ values: {} });
    expect(q<HTMLButtonElement>('[aria-label="Max strength"]').disabled).toBe(true);
    act(() => root!.unmount());
    host!.remove();
    const p = mount({ values: { chest: { weight: 92, reps: 9, seconds: null, isTSC: false, quality: 2 } } });
    const star = q<HTMLButtonElement>('[aria-label="Max strength"]');
    expect(star.disabled).toBe(false);
    act(() => star.click());
    expect(p.onChange).toHaveBeenCalledWith("chest", { quality: 3 });
  });

  it("moves the machine in hand with Next, sending what waits first", () => {
    const p = mount();
    const next = q<HTMLButtonElement>(".ph-card__next");
    expect(next.textContent).toContain("Leg Press");
    act(() => next.click());
    expect(p.onCommit).toHaveBeenCalled();
    expect(p.onFocus).toHaveBeenCalledWith("leg");
  });

  it("opens the machine sheet from the name, and Reorder from the foot", () => {
    const p = mount();
    act(() => q<HTMLButtonElement>(".ph-card__name").click());
    expect(p.onOpenMachine).toHaveBeenCalledWith("chest");
    act(() => q<HTMLButtonElement>(".ph-stage__reorder").click());
    expect(p.onReorder).toHaveBeenCalled();
  });

  it("says first time only with every session read and the whole story in Journey (machine menu, Oct 2026)", () => {
    const neck: JourneyRow = { machine: { id: "neck", name: "Neck Flexion", group: "Neck" }, sets: {}, prescribedWeight: 20 };
    mount({ rows: [neck], everythingRead: true, coverage: "complete" });
    expect(host!.textContent).toContain("First time on this machine.");
  });

  it("never says first time while older sessions are unread, or for a machine a running total knows", () => {
    const neck: JourneyRow = { machine: { id: "neck", name: "Neck Flexion", group: "Neck" }, sets: {}, prescribedWeight: 20 };
    mount({ rows: [neck], coverage: "complete" });
    expect(host!.textContent).toContain("Nothing recorded on this machine in the sessions loaded here.");
    expect(host!.textContent).not.toContain("First time");
    act(() => root?.unmount());
    host?.remove();
    mount({
      rows: [neck],
      everythingRead: true,
      coverage: "complete",
      totals: { machineStats: { neck: { timesPerformed: 40, lastPerformedDate: "2026-03-02" } as never } },
    });
    expect(host!.textContent).toContain("Done here in Journey before · not in the sessions loaded here.");
    expect(host!.textContent).not.toContain("First time");
  });

  it("says the past times are loading, or couldn't load, rather than 'nothing recorded'", () => {
    const neck: JourneyRow = { machine: { id: "neck", name: "Neck Flexion", group: "Neck" }, sets: {}, prescribedWeight: 20 };
    mount({ rows: [neck], coverage: "complete", historyState: "loading" });
    expect(host!.textContent).toContain("Loading past times…");
    act(() => root?.unmount());
    host?.remove();
    mount({ rows: [neck], coverage: "complete", historyState: "failed" });
    expect(host!.textContent).toContain("Couldn't load past times.");
    expect(host!.textContent).not.toContain("Nothing recorded");
  });

  it("marks a machine's loudest open note in the one note key, never the kaizen red", () => {
    const rows: JourneyRow[] = [
      { ...ROWS[0], machine: { ...ROWS[0].machine, alert: "critical" } },
      { ...ROWS[1], machine: { ...ROWS[1].machine, alert: "elevated" } },
    ];
    mount({ rows });
    const marks = [...host!.querySelectorAll(".ph-card__alert")];
    expect(marks.map((m) => m.getAttribute("data-level"))).toEqual(["critical", "elevated"]);
    expect(marks.map((m) => m.getAttribute("aria-label"))).toEqual(["Critical note on this machine", "Heads up note on this machine"]);
  });

  /* The floor on day one (the first-session design round, Oct 8 2026, §4.6):
     "On a phone, the last card's Next becomes 'Next in the plan · Add'".
     Adding is today only: the tracker's onAddPlanned. */
  it("on the last card, offers the plan's next machine as Next: today only, what waits sent first", () => {
    const p = mount({ focusId: "leg", planNext: { id: "m-hip-abd", name: "Hip Abduction" }, onAddPlanned: vi.fn() });
    const next = q<HTMLButtonElement>(".ph-card.is-in-hand .ph-card__next");
    expect(next.textContent).toBe("Next in the plan: Hip Abduction · Add");
    expect(next.disabled).toBe(false);
    act(() => next.click());
    expect(p.onCommit).toHaveBeenCalled();
    expect(p.onAddPlanned).toHaveBeenCalledTimes(1);
    expect(p.onAddPlanned).toHaveBeenCalledWith("m-hip-abd");
    expect(p.onFocus).not.toHaveBeenCalled();
    // A door left open, never the press-me-to-finish: the quiet dashed blue, the last machine's cue kept under it (the whole-branch review, Oct 9 2026).
    expect(next.className).toContain("ph-card__next--plan");
    expect(q(".ph-card.is-in-hand .ph-card__last").textContent).toBe("Last machine · Finish is at the top");
  });

  // AJ's Q6, "you shouldn't really be blocked": a can't-do mid-session on a phone (the whole-branch review, Oct 9 2026).
  it("opens the plan's sheet from the phone, the iPad corner's door; nothing without a plan", () => {
    const onOpenPlan = vi.fn();
    mount({ focusId: "leg", plan: { have: 2, of: 6 }, onOpenPlan });
    const door = q<HTMLButtonElement>('[data-testid="phone-plan"]');
    expect(door.textContent).toBe("The plan · 2 of 6");
    act(() => door.click());
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it("keeps the last card's quiet word when the plan has nothing next, and Next on any other card", () => {
    mount({ focusId: "leg" });
    const last = q<HTMLButtonElement>(".ph-card.is-in-hand .ph-card__next");
    expect(last.textContent).toBe("Last machine · Finish is at the top");
    expect(last.disabled).toBe(true);
    act(() => root?.unmount());
    host?.remove();
    mount({ focusId: "chest", planNext: { id: "m-hip-abd", name: "Hip Abduction" }, onAddPlanned: vi.fn() });
    expect(q<HTMLButtonElement>(".ph-card.is-in-hand .ph-card__next").textContent).toBe("Next: Leg Press");
  });

  it("an empty list offers the plan's next machine too", () => {
    const p = mount({ rows: [], focusId: null, planNext: { id: "m-leg-press", name: "Leg Press" }, onAddPlanned: vi.fn() });
    expect(host!.textContent).toContain("No machines in today's routine yet.");
    act(() => q<HTMLButtonElement>(".ph-stage__plan").click());
    expect(p.onAddPlanned).toHaveBeenCalledWith("m-leg-press");
  });
});

/*
 * THE FILEMAKER FLOOR ON A PHONE (the open session round, Oct 9 2026; AJ's
 * "1b": "you have every machine on the screen and you just fill in the ones
 * you did"). Today's machines stay cards; the rest of the floor is a plain
 * list of names under them, each with a 40px Add that adds the machine and
 * makes it the card in hand (the tracker's own add, the grid's +).
 */
describe("PhoneSessionStage with the floor showing", () => {
  const FLOOR = [rowOf("row", "Compound Row", 60), rowOf("lumbar", "Lumbar Extension with a name long enough to wrap on a phone", 90)];

  it("draws today's cards, then the rest of the floor as names, each with its own Add", () => {
    mount({ floor: FLOOR, onAddMachine: vi.fn() });
    expect(qa(".ph-card").map((c) => c.querySelector(".ph-card__name")!.textContent)).toEqual(["Chest Press", "Leg Press"]);
    const list = q('section[aria-label="Rest of the floor"]');
    expect(list.querySelector(".ph-floor__head")!.textContent).toBe("Rest of the floor");
    // A plain list, never a second set of cards, in the order handed (the walking order).
    expect(list.querySelectorAll(".ph-card")).toHaveLength(0);
    expect(qa(".ph-floor__name").map((n) => n.textContent)).toEqual([
      "Compound Row",
      "Lumbar Extension with a name long enough to wrap on a phone",
    ]);
    const adds = qa(".ph-floor__add");
    expect(adds.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Add Compound Row to today's session",
      "Add Lumbar Extension with a name long enough to wrap on a phone to today's session",
    ]);
    expect(adds.every((b) => b.textContent === "Add")).toBe(true);
  });

  it("Add sends what waits on the card in hand, then adds the machine (the tracker makes it the card in hand)", () => {
    const p = mount({ floor: FLOOR, onAddMachine: vi.fn() });
    act(() => qa(".ph-floor__add")[1].click());
    expect(p.onCommit).toHaveBeenCalledTimes(1);
    expect(p.onAddMachine).toHaveBeenCalledTimes(1);
    expect(p.onAddMachine).toHaveBeenCalledWith("lumbar");
    expect(p.onFocus).not.toHaveBeenCalled();
  });

  it("a machine out of service on the roster is listed, says so, and has no Add", () => {
    const out = rowOf("row", "Compound Row", 60);
    out.machine = { ...out.machine, outOfService: true };
    mount({ floor: [out, FLOOR[1]], onAddMachine: vi.fn() });
    const rows = qa(".ph-floor__row");
    expect(rows.map((r) => r.querySelector(".ph-floor__name")!.textContent)).toEqual([
      "Compound Row",
      "Lumbar Extension with a name long enough to wrap on a phone",
    ]);
    expect(rows[0].querySelector(".ph-floor__out")!.textContent).toBe("Out of service");
    expect(rows[0].querySelector(".ph-floor__add")).toBeNull();
    expect(rows[1].querySelector(".ph-floor__add")).not.toBeNull();
  });

  it("an empty day says where to tap, over the floor", () => {
    mount({ rows: [], focusId: null, floor: [...ROWS, ...FLOOR], onAddMachine: vi.fn() });
    expect(q(".ph-stage__empty").textContent).toBe("Tap Add on a machine you're doing.");
    expect(qa(".ph-card")).toHaveLength(0);
    expect(qa(".ph-floor__name")).toHaveLength(4);
  });

  it("without the floor, or without a way to add, today's cards only, as before", () => {
    mount({ floor: null, onAddMachine: vi.fn() });
    expect(qa(".ph-floor__row")).toHaveLength(0);
    act(() => root?.unmount());
    host?.remove();
    mount({ floor: FLOOR });
    expect(qa(".ph-floor__row")).toHaveLength(0);
    act(() => root?.unmount());
    host?.remove();
    mount({ rows: [], focusId: null, floor: [], onAddMachine: vi.fn() });
    expect(q(".ph-stage__empty").textContent).toBe("No machines in today's routine yet.");
  });
});

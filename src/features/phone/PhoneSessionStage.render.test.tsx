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

  it("says when a machine is new to her in Journey", () => {
    mount({ rows: [{ machine: { id: "neck", name: "Neck Flexion", group: "Neck" }, sets: {}, prescribedWeight: 20 }] });
    expect(host!.textContent).toContain("First time on this machine in Journey.");
  });
});

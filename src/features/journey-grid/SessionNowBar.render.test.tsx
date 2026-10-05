// @vitest-environment jsdom
/**
 * The Now Bar's commit, MOUNTED (session record, Sep 26 2026). A set's write
 * waits for the trainer to stop typing; leaving the field, or pressing Enter,
 * is the moment the set was entered, and the tracker sends it then. Only the
 * mounted bar shows that each keystroke reports a change but not a commit,
 * and that leaving the field reports one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { SessionNowBar } from "./SessionNowBar";
import type { JourneyRow, LiveSet } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row: JourneyRow = {
  machine: { id: "leg_press", name: "LEG PRESS", group: "Lower Body" },
  sets: {},
  prescribedWeight: 150,
};

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(props: { onChange: (id: string, p: Partial<LiveSet>) => void; onCommit?: (id: string) => void; sides?: boolean }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const r: JourneyRow = props.sides ? { ...row, machine: { ...row.machine, id: "torso_rotation", sides: true } } : row;
  act(() => {
    root!.render(<SessionNowBar row={r} history={[]} onChange={props.onChange} onCommit={props.onCommit} />);
  });
  return host;
}

/** Types into a controlled input the way a keystroke does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("SessionNowBar commit", () => {
  it("reports each keystroke as a change, and leaving the reps field as a commit", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const el = mount({ onChange, onCommit });
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    expect(reps).not.toBeNull();

    act(() => reps.focus());
    type(reps, "1");
    type(reps, "12");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 12 });
    expect(onCommit).not.toHaveBeenCalled();

    act(() => reps.blur());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("leg_press");
  });

  it("treats Enter in the reps field as leaving it", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit });
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    act(() => reps.focus());
    act(() => {
      reps.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith("leg_press");
  });

  it("commits the weight field when it is left", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit });
    const weight = el.querySelector<HTMLInputElement>('input[aria-label="Weight in pounds"]')!;
    act(() => weight.focus());
    act(() => weight.blur());
    expect(onCommit).toHaveBeenCalledWith("leg_press");
  });

  it("does not commit on a stepper tap, which comes in runs the queue gathers", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const el = mount({ onChange, onCommit });
    const up = el.querySelector<HTMLButtonElement>('button[aria-label="Increase weight by 2"]')!;
    act(() => up.click());
    expect(onChange).toHaveBeenCalledWith("leg_press", { weight: 152 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits each side of a two-sided machine under the machine's id", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit, sides: true });
    const right = el.querySelector<HTMLInputElement>('input[aria-label="Right side reps to failure"]')!;
    act(() => right.focus());
    act(() => right.blur());
    expect(onCommit).toHaveBeenCalledWith("torso_rotation");
  });

  it("says who set today's weight at the last Wrap-up, and nothing when nobody did (Oct 2 2026)", () => {
    const el = mount({ onChange: vi.fn() });
    expect(el.querySelector('[data-testid="weight-source"]')).toBeNull();
    act(() => root!.unmount());
    host!.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <SessionNowBar row={{ ...row, weightSource: "Set for today at the last Wrap-up by Sam." }} history={[]} onChange={vi.fn()} />,
      );
    });
    expect(host.querySelector('[data-testid="weight-source"]')!.textContent).toBe("Set for today at the last Wrap-up by Sam.");
  });

  it("still mounts and types without an onCommit", () => {
    const onChange = vi.fn();
    const el = mount({ onChange });
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    act(() => reps.focus());
    type(reps, "9");
    act(() => reps.blur());
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 9 });
  });
});

describe("SessionNowBar's Blood flow (Oct 3 2026)", () => {
  it("offers Blood flow beside Practice and Skip, and marks the set as a blood flow practice set", () => {
    const changes: Partial<LiveSet>[] = [];
    const el = mount({ onChange: (_id, p) => changes.push(p) });
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Blood flow")!;
    expect(btn).toBeTruthy();
    act(() => btn.click());
    expect(changes.at(-1)).toEqual({ outcome: "practice", bloodFlow: true });
    act(() => root?.unmount());
    host?.remove();
  });

  it("Practice clears a blood flow mark", () => {
    const changes: Partial<LiveSet>[] = [];
    const el = mount({ onChange: (_id, p) => changes.push(p) });
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Practice")!;
    act(() => btn.click());
    expect(changes.at(-1)).toEqual({ outcome: "practice", bloodFlow: null });
    act(() => root?.unmount());
    host?.remove();
  });
});

describe("SessionNowBar's start and gain (Oct 3 2026; the machine menu's one figure since Oct 4 2026)", () => {
  const sessions = [
    { id: "a", sessionNumber: 1, date: "2026-08-01", trainerInitials: "AJ" },
    { id: "b", sessionNumber: 2, date: "2026-09-01", trainerInitials: "AJ" },
  ];
  const grown: JourneyRow = {
    ...row,
    sets: {
      a: { sessionId: "a", outcome: "performed", weight: 100, reps: 10, quality: 2 },
      b: { sessionId: "b", outcome: "performed", weight: 125, reps: 9, quality: 2 },
    },
  };
  const draw = (props: Partial<Parameters<typeof SessionNowBar>[0]>) =>
    act(() => root!.render(<SessionNowBar row={grown} history={sessions} onChange={() => {}} {...props} />));
  const start = () => host!.querySelector('[data-testid="nb-start"]')?.textContent ?? null;
  const gain = () => host!.querySelector('[data-testid="nb-gain"]')?.textContent ?? null;

  function open() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }

  it("counts from the starting weight on file, labelled Starting weight, never First in Journey (AJ's Q2 (a))", () => {
    open();
    draw({ row: { ...grown, startingWeight: 80 }, coverage: "partial" });
    expect(start()).toContain("Starting weight 80 lb");
    expect(start()).not.toContain("First in Journey");
    expect(gain()).toBe("+56%");
    expect(host!.textContent).not.toContain("Best");
    // A typed start counts whether or not the older sessions were read.
    draw({ row: { ...grown, startingWeight: 80 }, coverage: "complete", everythingRead: true });
    expect(start()).toContain("Starting weight 80 lb");
    expect(start()).not.toContain("Started");
  });

  it("falls back to the first counted set only once every session has been read, with the history words", () => {
    open();
    draw({ coverage: "complete", everythingRead: true });
    expect(start()).toContain("First performed 100 lb");
    expect(gain()).toBe("+25%");
    draw({ coverage: "partial", everythingRead: true });
    expect(start()).toContain("First in Journey 100 lb");
  });

  it("says no start and no % when nothing is on file and older sessions are unread: the oldest loaded is not where anyone began", () => {
    open();
    draw({ coverage: "partial" });
    expect(start()).toBeNull();
    expect(gain()).toBeNull();
    draw({ coverage: "complete", everythingRead: false });
    expect(start()).toBeNull();
  });

  it("shows the start but no % when the weight isn't up", () => {
    open();
    draw({ row: { ...grown, startingWeight: 130 } });
    expect(start()).toContain("Starting weight 130 lb");
    expect(gain()).toBeNull();
  });
});

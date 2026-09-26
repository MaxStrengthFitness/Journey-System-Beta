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

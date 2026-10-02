// @vitest-environment jsdom
/**
 * Mounts the Wrap-up's "Next session's weights" (the Atlas answers, Oct 2
 * 2026). One row per machine performed today, starting at today's weight,
 * with − / + in two pounds and the number to type into; each change is
 * handed to the host the moment it is made. Nothing suggests a weight.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextWeightCard } from "./NextWeightCard";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];
async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<StrictMode>{ui}</StrictMode>));
  mounted.push({ root, host });
  return host;
}
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = async (el: Element | null) => {
  if (!el) throw new Error("element not found");
  await act(async () => (el as HTMLElement).click());
  await settle();
};

const lines = [
  { machineId: "m1", name: "Leg Press", outcome: "performed", weight: 100, count: 9 },
  { machineId: "m2", name: "Chest Press", outcome: "skipped", weight: 60, count: null },
  { machineId: "m3", name: "Torso Rotation", outcome: "not_reached", weight: null, count: null },
] as any[];

describe("the next session's weights", () => {
  it("offers only the machines she performed, from today's weight, in two-pound steps both ways", async () => {
    const onSave = vi.fn(async () => true);
    const host = await mount(<NextWeightCard lines={lines} onSave={onSave} />);
    const rows = host.querySelectorAll('[data-testid="next-weight-row"]');
    expect(rows).toHaveLength(1);
    const input = rows[0].querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("100");
    await click(rows[0].querySelector('button[aria-label^="Raise"]'));
    await click(rows[0].querySelector('button[aria-label^="Raise"]'));
    expect(onSave).toHaveBeenLastCalledWith("m1", 104, 100);
    expect(input.value).toBe("104");
    expect(rows[0].textContent).toContain("Up 4 lb from today");
    expect(rows[0].textContent).toContain("Saved for next time");
    await click(rows[0].querySelector('button[aria-label^="Lower"]'));
    expect(onSave).toHaveBeenLastCalledWith("m1", 102, 100);
    // Every button is at least 44px.
    for (const b of Array.from(rows[0].querySelectorAll("button"))) {
      expect(b.className).toContain("min-h-11");
      expect(b.className).toContain("min-w-11");
    }
    // It never proposes a weight or a direction.
    expect(host.textContent).not.toMatch(/suggest|try|should|recommend/i);
  });

  it("takes a typed weight when the field is left", async () => {
    const onSave = vi.fn(async () => true);
    const host = await mount(<NextWeightCard lines={lines} onSave={onSave} />);
    const input = host.querySelector('[data-testid="next-weight-row"] input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "96");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await settle();
    expect(onSave).toHaveBeenCalledWith("m1", 96, 100);
    expect(host.textContent).toContain("Down 4 lb from today");
  });

  it("puts back a typed entry that isn't a weight, and saves nothing", async () => {
    const onSave = vi.fn(async () => true);
    const host = await mount(<NextWeightCard lines={lines} onSave={onSave} />);
    const input = host.querySelector('[data-testid="next-weight-row"] input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "abc");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(input.value).toBe("100");
  });

  it("says it wasn't saved when the write failed", async () => {
    const host = await mount(<NextWeightCard lines={lines} onSave={vi.fn(async () => false)} />);
    await click(host.querySelector('[data-testid="next-weight-row"] button[aria-label^="Raise"]'));
    expect(host.textContent).toContain("Not saved. Set it again.");
  });

  it("draws nothing when nothing was performed", async () => {
    const host = await mount(<NextWeightCard lines={[lines[1]]} onSave={vi.fn()} />);
    expect(host.querySelector('[data-testid="next-weight-card"]')).toBeNull();
  });
});

// @vitest-environment jsdom
/**
 * Mounts the Dial and Loudness — the two controls every rating in the app
 * goes through from the reporting round on. A control used on five screens
 * earns a render test: it proves the bar draws five equal radios, that a
 * tap stores the position, that tapping it again clears back to "not
 * asked", and that the words on screen are the scale's words, never numbers.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dial } from "./Dial";
import { Loudness } from "./Loudness";
import { DOSE_SCALE, FREQUENCY_SCALE, SLEEP_SCALE, type DialValue } from "./dial";
import type { JournalImportance } from "../../types/journal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
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

function Harness({ initial = null, onValue }: { initial?: DialValue | null; onValue?: (v: DialValue | null) => void }) {
  const [v, setV] = useState<DialValue | null>(initial);
  return (
    <Dial
      scale={SLEEP_SCALE}
      value={v}
      onChange={(n) => {
        setV(n);
        onValue?.(n);
      }}
      data-testid="sleep"
    />
  );
}

describe("Dial", () => {
  it("draws five equal radios and rests untouched", async () => {
    const host = await mount(<Harness />);
    const radios = host.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(5);
    expect(Array.from(radios).every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect(host.querySelector(".rt__word")?.textContent).toBe("Not asked");
    // The centre carries the resting tick.
    expect(radios[2].classList.contains("rt__seg--centre")).toBe(true);
    // No digits anywhere a trainer reads.
    expect(host.textContent ?? "").not.toMatch(/\d/);
  });

  it("stores a tap, shows the word, and clears on a second tap", async () => {
    const seen: (DialValue | null)[] = [];
    const host = await mount(<Harness onValue={(v) => seen.push(v)} />);
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');

    await act(async () => radios[1].click());
    expect(seen).toEqual([-1]);
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(radios[1].getAttribute("data-tone")).toBe("warn");
    expect(host.querySelector(".rt__word")?.textContent).toBe("A bit short");

    await act(async () => radios[1].click());
    expect(seen).toEqual([-1, null]);
    expect(radios[1].getAttribute("aria-checked")).toBe("false");
    expect(host.querySelector(".rt__word")?.textContent).toBe("Not asked");
  });

  it("an explicit centre tap is a stored 0, not a cleared dial", async () => {
    const seen: (DialValue | null)[] = [];
    const host = await mount(<Harness onValue={(v) => seen.push(v)} />);
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    await act(async () => radios[2].click());
    expect(seen).toEqual([0]);
    expect(host.querySelector(".rt__word")?.textContent).toBe("As usual");
    expect(radios[2].getAttribute("data-tone")).toBe("live");
  });

  it("relative scales show a three-word legend; absolute scales show all five", async () => {
    const rel = await mount(<Dial scale={DOSE_SCALE} value={null} onChange={() => {}} />);
    const relWords = Array.from(rel.querySelectorAll(".rt__legend > span")).map((s) => s.textContent);
    expect(relWords).toEqual(["Wiped out", "", "Just right", "", "Barely worked"]);

    const abs = await mount(<Dial scale={FREQUENCY_SCALE} value={2} onChange={() => {}} />);
    const absWords = Array.from(abs.querySelectorAll(".rt__legend > span")).map((s) => s.textContent);
    expect(absWords).toEqual(["Not at all", "Rarely", "Sometimes", "Often", "Nearly always"]);
    expect(abs.querySelector(".rt__word")?.textContent).toBe("Nearly always");
  });

  it("disabled dials don't take a tap", async () => {
    const onChange = vi.fn();
    const host = await mount(<Dial scale={SLEEP_SCALE} value={null} onChange={onChange} disabled />);
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    await act(async () => radios[0].click());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Loudness", () => {
  it("draws Note · Heads up · Critical and reports the tap", async () => {
    const seen: JournalImportance[] = [];
    function H() {
      const [v, setV] = useState<JournalImportance>("standard");
      return (
        <Loudness
          value={v}
          onChange={(n) => {
            setV(n);
            seen.push(n);
          }}
        />
      );
    }
    const host = await mount(<H />);
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(Array.from(radios).map((r) => r.textContent)).toEqual(["Note", "Heads up", "Critical"]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
    await act(async () => radios[2].click());
    expect(seen).toEqual(["critical"]);
    expect(radios[2].getAttribute("aria-checked")).toBe("true");
    expect(radios[2].getAttribute("data-tone")).toBe("alert");
    expect(host.querySelector(".rt__hint")?.textContent).toContain("briefing");
  });
});

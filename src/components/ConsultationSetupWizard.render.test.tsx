// @vitest-environment jsdom
/**
 * The tracker's First-Time Setup, MOUNTED (Sep 24 2026, "ghost data").
 *
 * It used to open on Male, 40 and hand that back on Skip, and the tracker
 * wrote the Male over whatever was on file. Now it opens on what is on file,
 * or on nothing, and hands back null for what nobody answered.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConsultationSetupWizard, type ConsultationSetupData } from "./ConsultationSetupWizard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text))!;

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ConsultationSetupWizard", () => {
  it("opens on nothing, suggests no load, and Skip hands back no gender and no age", () => {
    const onComplete = vi.fn<(d: ConsultationSetupData) => void>();
    const el = mount(<ConsultationSetupWizard clientName="Grace" onComplete={onComplete} />);

    expect((el.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("");
    // No load is worked out for a profile nobody gave.
    expect(el.textContent).not.toContain("lbs");
    expect(el.textContent).toContain("—");

    act(() => button(el, "Skip Setup").click());
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ gender: null, age: null, routine: [] });
  });

  it("opens on what is on file and suggests loads from it", () => {
    const onComplete = vi.fn<(d: ConsultationSetupData) => void>();
    const el = mount(
      <ConsultationSetupWizard clientName="Grace" initialGender="Female" initialAge={55} onComplete={onComplete} />,
    );

    expect((el.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("55");
    expect(el.textContent).toContain("Seated Dip");
    expect(el.textContent).toContain("lbs");

    act(() => button(el, "Start Consult Workout").click());
    const data = onComplete.mock.calls[0][0];
    expect(data.gender).toBe("Female");
    expect(data.age).toBe(55);
    expect(data.routine.map((r) => r.name)).toEqual(["Leg Press", "Seated Dip", "Lumbar"]);
  });

  it("an answer typed in is what comes back; a cleared age comes back null, never 0", () => {
    const onComplete = vi.fn<(d: ConsultationSetupData) => void>();
    const el = mount(<ConsultationSetupWizard clientName="Grace" onComplete={onComplete} />);

    act(() => button(el, "Male").click());
    const age = el.querySelector('input[type="number"]') as HTMLInputElement;
    type(age, "62");
    expect(el.textContent).toContain("lbs");
    type(age, "");
    expect(el.textContent).not.toContain("lbs");

    act(() => button(el, "Start Consult Workout").click());
    expect(onComplete.mock.calls[0][0]).toMatchObject({ gender: "Male", age: null });
  });

  it("does not take an unknown gender on file as an answer", () => {
    const onComplete = vi.fn<(d: ConsultationSetupData) => void>();
    const el = mount(<ConsultationSetupWizard clientName="Sam" initialGender="Other" onComplete={onComplete} />);
    act(() => button(el, "Skip Setup").click());
    // null, so the tracker writes nothing and "Other" stays on file.
    expect(onComplete.mock.calls[0][0].gender).toBeNull();
  });
});

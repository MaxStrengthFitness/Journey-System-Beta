// @vitest-environment jsdom
/**
 * The record's new Life and Body pieces, MOUNTED: the flag picker searches and
 * toggles, the banner leads with the watch-outs, and the Life baseline writes
 * through the Save bar's updateField — including a dated mastery step.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Machine } from "../../types";
import { ClinicalFlagPicker } from "./ClinicalFlagPicker";
import { BodyWatchOuts } from "./BodyWatchOuts";
import { ActivityExperienceBaseline, WorkBaseline } from "../client-life/LifeBaseline";

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

const typeInto = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text))!;

describe("ClinicalFlagPicker", () => {
  it("toggles a common constraint and finds a diagnosis by search", () => {
    const onChange = vi.fn();
    const el = mount(<ClinicalFlagPicker value={[]} onChange={onChange} />);
    expect(el.textContent).toContain("No clinical flags on file.");
    act(() => button(el, "Shoulder limitation").click());
    expect(onChange).toHaveBeenLastCalledWith(["gen-shoulder"]);

    typeInto(el.querySelector('input[type="search"]') as HTMLInputElement, "stent");
    const hit = button(el, "Recent Cardiac Event");
    expect(hit).toBeTruthy();
    act(() => hit.click());
    expect(onChange).toHaveBeenLastCalledWith(["cv-recent-cardiac"]);
  });

  it("removes a selected flag with one tap", () => {
    const onChange = vi.fn();
    const el = mount(<ClinicalFlagPicker value={["gen-knee", "sys-hernia"]} onChange={onChange} />);
    act(() => (el.querySelector('[aria-label="Remove Knee limitation"]') as HTMLButtonElement).click());
    expect(onChange).toHaveBeenLastCalledWith(["sys-hernia"]);
  });
});

describe("BodyWatchOuts", () => {
  const machines = [
    { id: "leg_press", name: "Leg Press" },
    { id: "chest_press", name: "Chest Press" },
  ] as Machine[];

  it("renders nothing with nothing to watch", () => {
    expect(mount(<BodyWatchOuts flagIds={[]} machines={machines} hasMedicalText={false} />).innerHTML).toBe("");
  });

  it("leads with flags, every-set cautions and the machines that carry one", () => {
    const el = mount(
      <BodyWatchOuts flagIds={["gen-knee", "gen-blood-pressure"]} machines={machines} hasMedicalText />,
    );
    const text = el.textContent || "";
    expect(text).toContain("Knee limitation");
    expect(text).toContain("no breath-holding");
    expect(text).toContain("Leg Press");
    expect(text).not.toContain("Chest Press");
  });
});

describe("Life baseline", () => {
  const client = {
    id: "1",
    firstName: "A",
    lastName: "B",
    homeStudioId: "s",
    height: "",
    isActive: true,
    remainingSessions: 0,
    occupation: "Teacher / Educator",
    trainingPedigree: "Novice",
  } as Client;

  it("reads the work category from the occupation and confirms it on tap", () => {
    const updateField = vi.fn();
    const el = mount(<WorkBaseline client={client} formData={{}} updateField={updateField} />);
    expect(el.textContent).toContain("On their feet (Teacher / Educator)");
    act(() => button(el, "On their feet").click());
    expect(updateField).toHaveBeenLastCalledWith("workProfile", "on-feet");
    act(() => button(el, "Working").click());
    expect(updateField).toHaveBeenLastCalledWith("isRetired", true);
  });

  it("dates a step up in protocol mastery", () => {
    const updateField = vi.fn();
    const el = mount(
      <ActivityExperienceBaseline client={client} formData={{}} updateField={updateField} authorName="AJ" />,
    );
    act(() => button(el, "Intermediate").click());
    expect(updateField).toHaveBeenCalledWith("trainingPedigree", "Intermediate");
    const history = updateField.mock.calls.find((c) => c[0] === "pedigreeHistory")![1];
    expect(history.map((s: { level: string }) => s.level)).toEqual(["Novice", "Intermediate"]);
    expect(history[1].byName).toBe("AJ");
    act(() => button(el, "Pickleball").click());
    expect(updateField).toHaveBeenLastCalledWith("recreationActivities", ["Pickleball"]);
  });
});

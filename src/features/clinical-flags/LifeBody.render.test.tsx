// @vitest-environment jsdom
/**
 * The record's Life and Body pieces, MOUNTED: the flag picker searches and
 * toggles, and the life editors write through the Save bar's updateField —
 * including a dated mastery step. (The watch-out banner, BodyWatchOuts, went
 * in phase 12: Body & Pulse → Watch-outs quotes every instruction now, and
 * its cases are in client-codex/body/BodyPulsePage.render.test.tsx.)
 *
 * Client codex, Sep 2026 (phase 10): the Life baseline became three editors.
 * FORD's Occupation band reads the work sentence and opens WorkEditor (the
 * job title is free text with suggestions now, and Retired is a pick);
 * RecreationEditor is FORD's Recreation band; ExperienceEditor is Body &
 * Pulse's Training story. Every updateField the old tests asserted is still
 * asserted, word for word.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import { ClinicalFlagPicker } from "./ClinicalFlagPicker";
import { ExperienceEditor, RecreationEditor } from "../client-life/LifeBaseline";
import { OccupationBand } from "../ford/page/bands";

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

describe("the life editors", () => {
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

  it("reads the work sentence, then confirms the category, marks retired and takes a free-text title", () => {
    const updateField = vi.fn();
    const read = mount(
      <OccupationBand client={client} formData={{}} updateField={updateField} dirty={false} editing={false} />,
    );
    expect(read.textContent).toContain("On their feet (Teacher / Educator)");
    expect(read.textContent).not.toContain("Not saved yet");
    expect(read.querySelector("button")).toBeNull();
    act(() => root?.unmount());
    host?.remove();

    const el = mount(<OccupationBand client={client} formData={{}} updateField={updateField} dirty editing />);
    expect(el.textContent).toContain("Not saved yet");
    expect(el.textContent).toContain("Saved with the Save bar");
    act(() => button(el, "On their feet").click());
    expect(updateField).toHaveBeenLastCalledWith("workProfile", "on-feet");
    act(() => button(el, "Retired").click());
    expect(updateField).toHaveBeenLastCalledWith("isRetired", true);

    const title = el.querySelector<HTMLInputElement>("input[list]")!;
    expect(title.value).toBe("Teacher / Educator");
    typeInto(title, "Dental hygienist");
    expect(updateField).toHaveBeenLastCalledWith("occupation", "Dental hygienist");
    const options = [...el.querySelectorAll(`datalist[id="${title.getAttribute("list")}"] option`)].map((o) =>
      o.getAttribute("value"),
    );
    expect(options).toContain("Teacher / Educator");
    expect(options.some((v) => v?.startsWith("Retired ("))).toBe(false);
  });

  it("dates a step up in protocol mastery", () => {
    const updateField = vi.fn();
    const el = mount(<ExperienceEditor client={client} formData={{}} updateField={updateField} authorName="AJ" />);
    act(() => button(el, "Intermediate").click());
    expect(updateField).toHaveBeenCalledWith("trainingPedigree", "Intermediate");
    const history = updateField.mock.calls.find((c) => c[0] === "pedigreeHistory")![1];
    expect(history.map((s: { level: string }) => s.level)).toEqual(["Novice", "Intermediate"]);
    expect(history[1].byName).toBe("AJ");
  });

  it("picks what they do outside the studio, and takes one of their own", () => {
    const updateField = vi.fn();
    const el = mount(<RecreationEditor client={client} formData={{}} updateField={updateField} />);
    act(() => button(el, "Pickleball").click());
    expect(updateField).toHaveBeenLastCalledWith("recreationActivities", ["Pickleball"]);
    act(() => button(el, "Moderate").click());
    expect(updateField).toHaveBeenLastCalledWith("activityLevel", "Moderate");
    const custom = el.querySelector<HTMLInputElement>('input[maxlength="40"]')!;
    typeInto(custom, "  Tai   chi ");
    act(() => (el.querySelector('[aria-label="Add to What they do"]') as HTMLButtonElement).click());
    expect(updateField).toHaveBeenLastCalledWith("recreationActivities", ["Tai chi"]);
  });

  it("keeps the saved order when a chip goes on and off again, so nothing is left unsaved", () => {
    const updateField = vi.fn();
    const saved = { ...client, recreationActivities: ["Walking", "Pickleball"] } as Client;
    function Harness() {
      const [formData, setFormData] = useState<Partial<Client>>({});
      return (
        <RecreationEditor
          client={saved}
          formData={formData}
          updateField={(key, value) => {
            updateField(key, value);
            setFormData((f) => ({ ...f, [key]: value }));
          }}
        />
      );
    }
    const el = mount(<Harness />);
    act(() => button(el, "Golf").click());
    expect(updateField).toHaveBeenLastCalledWith("recreationActivities", ["Walking", "Pickleball", "Golf"]);
    act(() => button(el, "Golf").click());
    expect(updateField).toHaveBeenLastCalledWith("recreationActivities", ["Walking", "Pickleball"]);
    act(() => button(el, "Walking").click());
    expect(updateField).toHaveBeenLastCalledWith("recreationActivities", ["Pickleball"]);
  });

  it("draws every pick at 40px or more (the kit's pills)", () => {
    const el = mount(<RecreationEditor client={client} formData={{}} updateField={vi.fn()} />);
    const picks = [...el.querySelectorAll("button")].filter((b) => !b.classList.contains("cx-btn"));
    expect(picks.length).toBeGreaterThan(0);
    for (const b of picks) expect(b.classList.contains("cx-pick"), b.textContent ?? "").toBe(true);
  });
});

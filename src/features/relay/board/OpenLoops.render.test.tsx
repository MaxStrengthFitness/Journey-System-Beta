// @vitest-environment jsdom
/**
 * OPEN LOOPS MOUNTS, and a machine reported on the shift list earlier in the
 * week is still listed today — once, with the day it was reported — unless
 * the Floor Map flags that machine already (voice review follow-up, Sep 27
 * 2026: reports used to drop off Team at midnight).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const care = vi.hoisted(() => ({ byMachineId: {} as Record<string, unknown> }));

vi.mock("./RelayContext", () => ({
  useRelay: () => ({ studioId: "s1", now: { todayKey: "2026-09-16" }, openCapture: () => {} }),
}));
vi.mock("./machine-care-store", () => ({
  useMachineCare: () => ({ byMachineId: care.byMachineId, loading: false, error: null }),
}));

import type { TaskInstance } from "../../studio-tasks/types";
import { OpenLoops } from "./TeamCockpit";

const report = (over: Partial<TaskInstance>): TaskInstance =>
  ({
    id: "r",
    studioId: "s1",
    templateId: "check",
    localDate: "2026-09-15",
    shift: "any",
    status: "done",
    flagged: true,
    ...over,
  }) as TaskInstance;

const names: Record<string, string> = { "leg-press": "Leg Press", chest: "Chest Press" };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(taskRows: TaskInstance[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <OpenLoops requests={[]} jobs={[]} machineNames={(id) => names[id] ?? ""} taskRows={taskRows} taskTitle={() => "Weekly machine check"} />
      </StrictMode>,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  care.byMachineId = {};
});

describe("OpenLoops", () => {
  it("lists yesterday's shift-list report today, once per machine, with its day", async () => {
    const el = await mount([
      report({ id: "a", machineId: "leg-press", localDate: "2026-09-13", note: "Squeak" }),
      report({ id: "b", machineId: "leg-press", localDate: "2026-09-15", note: "Cable frayed", completedBy: { id: "t-d", name: "Dana Ortiz" } }),
    ]);
    const loops = [...el.querySelectorAll(".tc__loop")].map((li) => li.textContent);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toContain("Reported on the shift list");
    expect(loops[0]).toContain("Leg Press");
    expect(loops[0]).toContain("Cable frayed — Dana, yesterday");
    expect(el.textContent).toContain("1 to close");
  });

  it("does not list a report twice for a machine the Floor Map already flags", async () => {
    care.byMachineId = {
      "leg-press": { machineId: "leg-press", flag: { note: "Out of service", by: { id: "t-a", name: "AJ Jurgens" } } },
    };
    const el = await mount([report({ id: "b", machineId: "leg-press", note: "Cable frayed" })]);
    const loops = [...el.querySelectorAll(".tc__loop")].map((li) => li.textContent);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toContain("Flagged machine");
    expect(el.textContent).not.toContain("Reported on the shift list");
  });

  it("says nothing is hanging when nothing is", async () => {
    const el = await mount([]);
    expect(el.textContent).toContain("nothing hanging");
  });
});

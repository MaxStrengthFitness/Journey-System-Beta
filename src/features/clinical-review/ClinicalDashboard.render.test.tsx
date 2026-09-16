// @vitest-environment jsdom
/**
 * Mounts the Kaizen Deep Dive with a report built from synthetic sessions.
 *
 * It proves the frame: the title, the fixed "it can be wrong" line above
 * everything, the panel ORDER the owner decided (stalls → readiness →
 * attendance → pain & Pulse → time under tension → heat map), that no
 * tonnage figure survives anywhere on the page, and that a level under
 * three sessions reads "needs 3" instead of a number.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ExerciseLog, WorkoutSession } from "../../types";

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: {}, functions: {} }));

import { buildReport } from "./report";
import { ClinicalDashboard, DEEP_DIVE_TITLE } from "./ClinicalDashboard";
import { RANGE_PRESETS } from "./ClinicalReviewTab";
import { DEEP_DIVE_CAVEAT } from "./panels";

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

const day = (offset: number): string => {
  const d = new Date(2026, 5, 1);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Twelve sessions: six legacy, six on the Dial; Leg Press parked at 100 lb for the last six. */
function synthetic() {
  const sessions: WorkoutSession[] = [];
  const logs: ExerciseLog[] = [];
  for (let i = 0; i < 12; i++) {
    const date = day(i * 3);
    const off = i % 4 === 1;
    sessions.push({
      id: `s${i}`,
      clientId: "c1",
      status: "Completed",
      date,
      trainerInitials: "AJ",
      preSessionCheckIn: i < 6 ? { sleepQuality: off ? "poor" : "optimal" } : { readiness: { sleep: off ? -2 : 1 } },
      ...(i < 6 ? { clientFeel: "Good" } : { dose: 0 }),
    } as WorkoutSession);
    logs.push({ id: `l${i}`, sessionId: `s${i}`, machineId: "leg-press", weight: String(i < 6 ? 88 + i * 2 : 100), reps: "8", repQuality: off ? 1 : 2, totalTimeUnderLoad: 80 } as ExerciseLog);
    logs.push({ id: `m${i}`, sessionId: `s${i}`, machineId: "chest", weight: "50", reps: "10", repQuality: 2 } as ExerciseLog);
  }
  return { sessions, logs };
}

const client = { id: "c1", firstName: "Judy", lastName: "Kaizen" } as Client;

describe("ClinicalDashboard (Kaizen Deep Dive)", () => {
  it("frames the page with the caveat and draws the panels in the decided order", async () => {
    const { sessions, logs } = synthetic();
    const report = buildReport({
      client,
      machines: [{ id: "leg-press", name: "Leg Press" } as any, { id: "chest", name: "Chest Press" } as any],
      trainers: [],
      sessions,
      logs,
      incidents: [],
      pulseHistory: null,
      range: { preset: "custom", from: day(0), to: day(40) },
    });
    const host = await mount(
      <ClinicalDashboard report={report} clientName="Judy Kaizen" presets={RANGE_PRESETS} onPreset={() => {}} onRegenerate={() => {}} />,
    );
    const text = host.textContent ?? "";
    expect(text).toContain(DEEP_DIVE_TITLE);
    expect(text).toContain(DEEP_DIVE_CAVEAT);
    // The caveat sits above every panel.
    const caveat = host.querySelector(".cr-caveat")!;
    const firstSection = host.querySelector("section.cr-section")!;
    expect(caveat.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const titles = Array.from(host.querySelectorAll("h3.cr-section__title")).map((h) => h.textContent);
    expect(titles).toEqual([
      "What moves the needle",
      "Progression stalls",
      "Readiness vs output",
      "Attendance rhythm",
      "Pain & incidents, and the Pulse",
      "Time under tension",
      "Where form breaks",
    ]);

    // Tonnage is retired: no "lb moved", no tonnage tile, no tonnage outcome.
    expect(text).not.toMatch(/tonnage/i);
    expect(text).not.toMatch(/lb moved/i);
    // The stall reads as a sentence.
    expect(text).toMatch(/Leg Press — 100 lb for 6 sessions since/);
    // The Pulse read failed → "unavailable", never "no Pulse".
    expect(text).toContain("Pulse history unavailable");
    // A level under three sessions shows "needs 3", not a number.
    expect(text).toContain("needs 3");
  });
});

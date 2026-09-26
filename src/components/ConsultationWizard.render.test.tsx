// @vitest-environment jsdom
/**
 * The Initial Consultation, MOUNTED (Sep 24 2026, "ghost data").
 *
 * Nothing in the app opens it any more (the Relay task that did is the Pulse
 * task now), but the file stays for the redesign, so what it would save is
 * pinned here: it used to start every client as a man of 40 and save both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Machine } from "../types";

const updateDoc = vi.fn(async (..._args: unknown[]) => {});
const addDoc = vi.fn(async (..._args: unknown[]) => ({ id: "doc-1" }));
const createJournalEntry = vi.fn(async (..._args: unknown[]) => {});

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));
vi.mock("firebase/firestore", () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  collection: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: () => "ts",
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}));
vi.mock("../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", activeStudio: null }),
}));
vi.mock("../contexts/ToastContext", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));
vi.mock("../hooks/useClientJournal", () => ({
  createJournalEntry: (...args: unknown[]) => createJournalEntry(...args),
}));

import { ConsultationWizard } from "./ConsultationWizard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machines = [
  { id: "leg-press", name: "Leg Press" },
  { id: "chest-press", name: "Chest Press" },
  { id: "lumbar", name: "Lumbar" },
] as Machine[];

const baseClient = {
  id: "c1",
  firstName: "Grace",
  lastName: "Ahn",
  homeStudioId: "westlake",
  height: "",
  isActive: true,
  remainingSessions: 0,
} as Client;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(client: Client) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <ConsultationWizard
        client={client}
        machines={machines}
        authTrainer={null}
        trainers={[]}
        onComplete={() => {}}
        onCancel={() => {}}
      />,
    ),
  );
  return host;
}
beforeEach(() => {
  updateDoc.mockClear();
  createJournalEntry.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function finish(el: HTMLElement) {
  // The three considerations, then Begin.
  for (const title of ["Nothing loose in mouth", "Breathing Protocol", "Today's Workout"]) {
    const card = [...el.querySelectorAll("h3")].find((h) => h.textContent === title)!.closest("div.border-2")!;
    act(() => (card as HTMLElement).click());
  }
  const begin = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Begin Demo Workout"))!;
  await act(async () => begin.click());
}

describe("ConsultationWizard", () => {
  it("left alone, it writes no gender and no age, and suggests no load", async () => {
    const el = mount(baseClient);
    expect((el.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("");
    expect(el.textContent).not.toContain("lbs");

    await finish(el);

    expect(updateDoc).toHaveBeenCalledTimes(1);
    const written = updateDoc.mock.calls[0][1] as Record<string, unknown>;
    for (const unanswered of ["gender", "age", "occupation", "medicalHistory", "activity", "goals"]) {
      expect(unanswered in written).toBe(false);
    }
    // The Journal note does not invent an age either.
    const note = (createJournalEntry.mock.calls[0][3] as { body: string }).body;
    expect(note).toBe("Consultation. Skill: Novice.");
  });

  it("starts from what is on file, and writes it back unchanged", async () => {
    const el = mount({ ...baseClient, gender: "Female", age: 58, occupation: "Nurse" } as Client);
    expect((el.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("58");
    expect(el.textContent).toContain("lbs");

    await finish(el);

    expect(updateDoc.mock.calls[0][1]).toMatchObject({ gender: "Female", age: 58, occupation: "Nurse" });
  });
});

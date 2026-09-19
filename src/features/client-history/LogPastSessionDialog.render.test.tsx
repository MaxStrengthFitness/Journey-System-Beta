// @vitest-environment jsdom
/**
 * "Log past session", MOUNTED.
 *
 * Round: history editing + past-session entry, Sep 17 2026.
 *
 * The form is three panes and a pile of local state, and a clean typecheck
 * plus a green pure-function suite would say nothing about whether it opens —
 * which is exactly the shape of the crash the four-tab profile shipped. So
 * this walks the flow the way a trainer does: pick a day and a trainer,
 * inject a routine, land on the numbers.
 *
 * Firestore is mocked wholesale. Nothing here writes; the arithmetic that
 * would is tested in session-edits.test.ts and client-rollups.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Machine, Routine, Trainer } from "../../types";

vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", activeStudio: null }),
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  increment: (n: number) => n,
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: () => "ts",
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() })),
}));

import { LogPastSessionDialog } from "./LogPastSessionDialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machines = [
  { id: "chest-press", name: "Chest Press" },
  { id: "pulldown", name: "Pulldown" },
  { id: "leg-press", name: "Leg Press" },
] as Machine[];

const trainers = [{ id: "t1", fullName: "Alex Rivera", initials: "AR" }] as Trainer[];

const routines = [
  { id: "rA", clientId: "c1", name: "Routine A", machineIds: ["chest-press", "pulldown"] },
] as Routine[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <LogPastSessionDialog
        open
        onOpenChange={() => {}}
        clientId="c1"
        client={null}
        clientHomeStudioId="westlake"
        machines={machines}
        trainers={trainers}
        routines={routines}
        timeZone="America/New_York"
      />,
    ),
  );
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** The dialog renders in a portal, so everything is read off the document. */
const text = () => document.body.textContent || "";

function findButton(label: string): HTMLButtonElement {
  const match = Array.from(document.body.querySelectorAll("button")).find((b) =>
    (b.textContent || "").trim().toLowerCase().includes(label.toLowerCase()),
  );
  if (!match) throw new Error(`no button matching "${label}"`);
  return match as HTMLButtonElement;
}

function click(label: string) {
  const button = findButton(label);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** React owns the value, so the native setter has to run before the event. */
function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("LogPastSessionDialog", () => {
  it("opens on the When pane and says the session will count", () => {
    mount();
    expect(text()).toContain("Log past session");
    expect(text()).toContain("counts toward this client's totals");
    expect(text()).toContain("Session date");
    expect(text()).toContain("Trainer");
  });

  it("will not move off the first pane until a trainer is named", () => {
    mount();
    expect(findButton("Next").disabled).toBe(true);
    const select = document.body.querySelector("select") as HTMLSelectElement;
    setValue(select, "t1");
    expect(findButton("Next").disabled).toBe(false);
  });

  it("injects a whole routine, and the numbers pane asks for each machine", () => {
    mount();
    setValue(document.body.querySelector("select") as HTMLSelectElement, "t1");
    click("Next");
    expect(text()).toContain("Start from");
    expect(text()).toContain("Routine A");

    click("Routine A");
    expect(text()).toContain("Chest Press");
    expect(text()).toContain("Pulldown");
    expect(text()).toContain("2 machines");

    click("Next");
    // Every machine is asked for, and every one still says it has no reps.
    expect(text()).toContain("0 of 2 machines with numbers");
    expect(text()).toContain("saved as a machine that was not done");
  });

  it("does not offer Next from the machines pane with nothing on it", () => {
    mount();
    setValue(document.body.querySelector("select") as HTMLSelectElement, "t1");
    click("Next");
    expect(findButton("Next").disabled).toBe(true);
  });
});

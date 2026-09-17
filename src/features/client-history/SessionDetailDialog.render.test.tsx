// @vitest-environment jsdom
/**
 * The session pop-up, MOUNTED, in edit mode.
 *
 * Round: history editing + past-session entry, Sep 17 2026.
 *
 * What this is here to catch: the dialog now composes saved sets and unsaved
 * drafts into one list and renders both through the same row, which is the
 * kind of thing that typechecks perfectly and throws on the first tap. It
 * also carries the "Edited" badge, which is the whole point of the stamp — a
 * badge that silently stops rendering is a record that silently stops saying
 * it was changed.
 *
 * Firestore is mocked: `onSnapshot` hands back a fixed pair of sets from the
 * server. Nothing is written — the save arithmetic is session-edits.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Machine, Trainer } from "../../types";
import type { HistorySession } from "./model";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1", displayName: null } } }));

const LOGS = [
  { id: "l1", sessionId: "s1", machineId: "chest-press", weight: "120", reps: "8", repQuality: 3 },
  { id: "l2", sessionId: "s1", machineId: "pulldown", weight: "90", reps: "10", repQuality: 2 },
];

vi.mock("firebase/firestore", () => ({
  Timestamp: { now: () => "now" },
  collection: vi.fn(),
  doc: vi.fn(),
  increment: (n: number) => n,
  serverTimestamp: () => "ts",
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
  onSnapshot: (_q: unknown, _opts: unknown, next: (snap: unknown) => void) => {
    next({
      metadata: { fromCache: false },
      docs: LOGS.map((l) => ({ id: l.id, data: () => l })),
    });
    return () => {};
  },
}));

import { SessionDetailDialog } from "./SessionDetailDialog";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machines = [
  { id: "chest-press", name: "Chest Press" },
  { id: "pulldown", name: "Pulldown" },
  { id: "leg-press", name: "Leg Press" },
] as Machine[];

const trainers = [{ id: "u1", fullName: "Alex Rivera", initials: "AR" }] as Trainer[];

const session = (extra: Record<string, unknown> = {}): HistorySession =>
  ({
    id: "s1",
    clientId: "c1",
    status: "Completed",
    date: "2026-09-10",
    startTime: "2026-09-10T14:30:00.000Z",
    trainerInitials: "AR",
    hostedAtStudioId: "westlake",
    clientHomeStudioId: "westlake",
    isCrossTrain: false,
    sessionType: "Standard",
    sessionNumber: 12,
    ...extra,
  }) as unknown as HistorySession;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(s: HistorySession) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <SessionDetailDialog
        initialSessions={[s]}
        onClose={() => {}}
        clientId="c1"
        machines={machines}
        trainerFor={() => null}
        trainers={trainers}
        activeStudioId="westlake"
        clientHomeStudioId="westlake"
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

const text = () => document.body.textContent || "";

function buttons(label: string): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll("button")).filter((b) =>
    ((b.textContent || "") + (b.getAttribute("aria-label") || "")).toLowerCase().includes(label.toLowerCase()),
  ) as HTMLButtonElement[];
}

function click(label: string, index = 0) {
  const target = buttons(label)[index];
  if (!target) throw new Error(`no button matching "${label}"`);
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("SessionDetailDialog", () => {
  it("shows the session's sets, and no Edited badge on a session nobody has touched", () => {
    mount(session());
    expect(text()).toContain("Chest Press");
    expect(text()).toContain("Pulldown");
    expect(text()).toContain("2 machines");
    expect(text()).not.toContain("Edited by");
  });

  it("says who edited it, and when", () => {
    mount(session({ editedAt: "2026-09-17T16:00:00.000Z", editedByName: "AJ", editCount: 1 }));
    expect(text()).toContain("Edited by AJ on Sep 17");
  });

  it("opens the machine picker in edit mode and adds a machine as an unsaved draft", () => {
    mount(session());
    click("Edit");
    expect(text()).toContain("Add a machine to this session");

    click("Add a machine to this session");
    // The Routine Builder's picker, listing the floor.
    expect(text()).toContain("Leg Press");

    click("Leg Press");
    expect(text()).toContain("1 added");
    expect(text()).toContain("unsaved");
    expect(text()).toContain("Saving stamps this session as edited.");
  });

  it("marks a set for removal without hiding it, and takes the mark off again", () => {
    mount(session());
    click("Edit");
    click("Remove Chest Press from the session");
    expect(text()).toContain("Removed when you save.");
    expect(text()).toContain("1 to remove");
    // The row is still there to put back.
    expect(text()).toContain("Chest Press");
    click("Keep Chest Press on the session");
    expect(text()).not.toContain("Removed when you save.");
  });

  it("drops every pending change on Cancel", () => {
    mount(session());
    click("Edit");
    click("Remove Chest Press from the session");
    click("Cancel");
    expect(text()).not.toContain("to remove");
    expect(text()).not.toContain("Removed when you save.");
  });
});

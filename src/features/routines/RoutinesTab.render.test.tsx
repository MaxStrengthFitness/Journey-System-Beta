// @vitest-environment jsdom
/**
 * The routine card, MOUNTED (Sep 26 2026). "Use today" set a choice the
 * session never read; AJ asked for "Used last on" instead. Only the mounted
 * card shows the button is gone, the date is there, and the Today marker
 * follows what the session will actually run.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { RoutinesTab } from "./RoutinesTab";
import type { Routine, WorkoutSession } from "../../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = { id: "rA", name: "Routine A", clientId: "c1", machineIds: [] } as unknown as Routine;
const B = { id: "rB", name: "Routine B", clientId: "c1", machineIds: [] } as unknown as Routine;
const done = (id: string, date: string, routineId: string) =>
  ({ id, clientId: "c1", date, routineId, status: "Completed" }) as unknown as WorkoutSession;

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(sessions: WorkoutSession[], todayId: string | null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <RoutinesTab
        client={{ id: "c1", homeStudioId: "s1", isRoutineBActive: true } as any}
        clientId="c1"
        routines={[A, B]}
        machines={[]}
        clientSettings={{}}
        allLogs={[]}
        sessions={sessions}
        adjustments={[]}
        trainers={[]}
        selectedRoutineTodayId={todayId}
        isBActive
        onEdit={vi.fn()}
        onToggleB={vi.fn()}
      />,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the routine card says when each routine was last used", () => {
  it("has no Use today button", () => {
    const el = mount([done("s1", "2026-09-22", "rA")], "rB");
    const labels = Array.from(el.querySelectorAll("button")).map((b) => b.textContent?.trim());
    expect(labels).not.toContain("Use today");
    expect(labels).not.toContain("Active today");
  });

  it("says Used last on for a routine Journey has a session on, and nothing for one it hasn't", () => {
    const el = mount([done("s1", "2025-03-02", "rA")], "rB");
    const used = Array.from(el.querySelectorAll(".rt-used")).map((n) => n.textContent);
    expect(used).toEqual(["Used last on Mar 2, 2025"]);
  });

  it("marks the routine the session will run as today's", () => {
    const el = mount([done("s1", "2026-09-22", "rA")], "rB");
    expect(el.textContent).toContain("Routine B today");
  });
});

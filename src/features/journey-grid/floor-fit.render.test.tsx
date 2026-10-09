// @vitest-environment jsdom
/**
 * The Today column's + is 40px to tap on a floor of any size (the open
 * session round, Oct 9 2026; the review of the FileMaker floor).
 *
 * The session grid fits every row into the height it has (44 down to 26px,
 * `fit="auto"`), and the +'s tap area reaches its own row's height at most
 * (journey-grid.css, the Oct 5 2026 review fix: a 40px area in a 26px row
 * reached into the row above). The FileMaker floor opens every machine by
 * default, so on a portrait iPad a floor of twenty fitted 26-31px rows and
 * every + was under 40px. A row is never fitted under 40px while a + is on
 * screen: the rows keep 40px and the grid scrolls. jsdom does no layout, so
 * the fill box measures as 400px: thirty rows would fit at 26px, dense.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JourneyGrid, type GridSection } from "./JourneyGrid";
import type { JourneyRow, JourneySession, LiveColumn } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY: JourneySession = { id: "today", sessionNumber: 1, date: "2026-10-09", trainerInitials: "AJ" };
const FLOOR: JourneyRow[] = Array.from({ length: 30 }, (_, i) => ({
  machine: { id: `m${i + 1}`, name: `Machine ${i + 1}`, group: "Push" as const },
  sets: {},
}));

const live = (onAddMachine?: (id: string) => void): LiveColumn => ({
  session: TODAY,
  routineMachineIds: [],
  values: {},
  onChange: () => {},
  ...(onAddMachine ? { onAddMachine } : null),
});

const sections = (open: boolean): GridSection[] => [
  { id: "routine", label: "Today", rows: [], numbered: true, bare: true },
  { id: "others", label: "Rest of the floor", rows: FLOOR, collapsed: !open, inactive: true },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function draw(s: GridSection[], column: LiveColumn) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<JourneyGrid sessions={[]} sections={s} live={column} layout="fill" fit="auto" />);
  });
  return host.querySelector<HTMLElement>(".jg")!;
}

describe("the floor's rows keep 40px while a + is on screen", () => {
  it("thirty machines with the Today column's +: 40px rows, never dense, and the grid scrolls", async () => {
    const grid = await draw(sections(true), live(() => {}));
    expect(grid.querySelectorAll("button.jg-today__add")).toHaveLength(30);
    expect(grid.style.getPropertyValue("--jg-row-h")).toBe("40px");
    expect(grid.getAttribute("data-dense")).toBe("stack");
  });

  it("the same thirty with no + (a session watched from another iPad, or the profile): fitted down to 26px as before", async () => {
    const grid = await draw(sections(true), live());
    expect(grid.querySelectorAll("button.jg-today__add")).toHaveLength(0);
    expect(grid.style.getPropertyValue("--jg-row-h")).toBe("26px");
    expect(grid.getAttribute("data-dense")).toBe("line");
  });

  it("the floor folded: nothing to fit, the rows keep their 44px", async () => {
    const grid = await draw(sections(false), live(() => {}));
    expect(grid.querySelectorAll("button.jg-today__add")).toHaveLength(0);
    expect(grid.style.getPropertyValue("--jg-row-h")).toBe("44px");
  });

  it("an out-of-service machine says so in its Today cell, with no +", async () => {
    const rows: JourneyRow[] = [
      { machine: { id: "leg-press", name: "Leg Press", group: "Push" as const, outOfService: true }, sets: {} },
      { machine: { id: "row", name: "Compound Row", group: "Pull" as const }, sets: {} },
    ];
    const grid = await draw(
      [
        { id: "routine", label: "Today", rows: [], numbered: true, bare: true },
        { id: "others", label: "Rest of the floor", rows, inactive: true, idleNote: "not added today" },
      ],
      live(() => {}),
    );
    const cells = [...grid.querySelectorAll(".jg-today--idle")];
    expect(cells.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Leg Press: out of service",
      "Compound Row: not added today",
    ]);
    expect(cells[0].textContent).toBe("Out of service");
    expect(cells[0].querySelector("button")).toBeNull();
    expect(cells[1].querySelector("button.jg-today__add")).not.toBeNull();
  });
});

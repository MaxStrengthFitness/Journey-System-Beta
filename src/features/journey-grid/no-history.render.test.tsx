// @vitest-environment jsdom
/**
 * A client with no past sessions gets a grid, not one long line (Oct 7 2026,
 * AJ: "because there are no previous sessions in that history, there's no
 * cells so it just shows the machine in one long line").
 *
 * The session tracks are `repeat(var(--jg-cols), …)`, and repeat(0, …) is
 * invalid CSS: arriving through var() it voids the whole
 * grid-template-columns, the grid falls back to one column, and every name
 * cell and Today cell stacks down it. jsdom does no layout, so this holds the
 * two halves of the fix: the grid says it has no past (`data-past="none"`),
 * and the stylesheet has a template for that with no repeat() in it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RecentJourneyView } from "./RecentJourneyView";
import type { JourneyRow, JourneySession } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROWS: JourneyRow[] = [
  { machine: { id: "leg-press", name: "Leg Press", group: "Push" as const }, sets: {} },
  { machine: { id: "compound-row", name: "Compound Row", group: "Pull" as const }, sets: {} },
];

const SESSION: JourneySession = { id: "s1", sessionNumber: 1, date: "2026-10-01", trainerInitials: "AJ" };

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(sessions: JourneySession[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<RecentJourneyView sessions={sessions} rows={ROWS} layout="page" resetKey="new-client" />);
  });
  return host.querySelector<HTMLElement>(".jg")!;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the Journey grid with no past sessions", () => {
  it("says it has none, so the stylesheet can drop the session tracks", async () => {
    const grid = await mount([]);
    expect(grid.getAttribute("data-past")).toBe("none");
    // Every machine still gets its row and name cell.
    expect(grid.querySelectorAll(".jg-machine").length).toBeGreaterThanOrEqual(ROWS.length);
  });

  it("says it has some once a session exists", async () => {
    const grid = await mount([SESSION]);
    expect(grid.getAttribute("data-past")).toBe("some");
  });

  it("has a template for no past sessions with no repeat() in it", () => {
    const css = readFileSync(resolve(__dirname, "journey-grid.css"), "utf8").replace(/\r\n/g, "\n");
    const rule = css.match(/\.jg\[data-past="none"\] \.jg-grid \{([^}]*)\}/);
    expect(rule, 'journey-grid.css needs a .jg[data-past="none"] .jg-grid rule').not.toBeNull();
    const body = rule![1];
    expect(body).toMatch(/grid-template-columns:/);
    expect(body).toMatch(/var\(--jg-col-machine\)/);
    expect(body).toMatch(/var\(--jg-track-live\)/);
    expect(body).not.toMatch(/repeat\(/);
  });
});

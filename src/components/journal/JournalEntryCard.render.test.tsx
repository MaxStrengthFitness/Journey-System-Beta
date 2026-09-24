// @vitest-environment jsdom
/**
 * The entry card's window chip: "Ended —" only on a window that has run out.
 *
 * Client codex, Sep 2026. The card decided "ended" as "does not matter today",
 * so a note whose start was pushed ahead ("no lunges from the 20th", written
 * on the 10th) read "Ended — Matters from Sep 20" before it had begun. It now
 * asks `windowEnded` (client-notes/mattering.ts). Dates are built from today,
 * so the cases hold whenever the suite runs.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JournalEntry } from "../../types/journal";
import { JournalEntryCard } from "./JournalEntryCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A local day `offset` days from today, at the given hour. */
const dayAt = (offset: number, hour: number, minute = 0, second = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, second);
};
const noonOn = (offset: number) => dayAt(offset, 12);
const endOf = (offset: number) => dayAt(offset, 23, 59, 59);

const entry = (over: Partial<JournalEntry>): JournalEntry =>
  ({
    id: "n1",
    clientId: "c1",
    studioId: "westlake",
    kind: "injury",
    category: null,
    body: "No lunges",
    importance: "elevated",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-aj",
    authorInitials: "AJ",
    authorName: "AJ",
    occurredAt: noonOn(-20),
    createdAt: noonOn(-20),
    updatedAt: noonOn(-20),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

let host: HTMLDivElement;
let root: Root;

const mount = (e: JournalEntry) => {
  act(() => {
    root.render(
      <StrictMode>
        <JournalEntryCard entry={e} machines={[]} />
      </StrictMode>,
    );
  });
  return host.textContent ?? "";
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the window chip", () => {
  it("a start pushed ahead is waiting, not ended", () => {
    const text = mount(entry({ effectiveFrom: noonOn(10) }));
    expect(text).toContain("Matters from");
    expect(text).not.toContain("Ended");
  });

  it("a range that has not begun yet is not ended either", () => {
    const text = mount(entry({ effectiveFrom: noonOn(5), effectiveUntil: endOf(15) }));
    expect(text).toContain("Matters");
    expect(text).not.toContain("Ended");
  });

  it("a range whose last day has gone by has ended", () => {
    expect(mount(entry({ effectiveUntil: endOf(-3) }))).toContain("Ended — Matters until");
  });

  it("a one-off day that has passed has ended; a yearly one never does", () => {
    expect(mount(entry({ effectiveFrom: noonOn(-3), effectiveUntil: endOf(-3) }))).toContain("Ended — Only on");
    const yearly = mount(entry({ effectiveFrom: noonOn(-3), effectiveUntil: endOf(-3), repeat: "yearly" }));
    expect(yearly).toContain("every year");
    expect(yearly).not.toContain("Ended");
  });

  it("a resolved note is closed, not ended", () => {
    expect(mount(entry({ effectiveUntil: endOf(-3), resolvedAt: noonOn(-5) }))).not.toContain("Ended");
  });
});

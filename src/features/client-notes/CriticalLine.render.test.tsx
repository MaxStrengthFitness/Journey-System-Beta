// @vitest-environment jsdom
/**
 * Mounts the critical line.
 *
 * What only a mount proves: that nothing is drawn when nothing is critical;
 * that the machine is named in full and the note is shown as whole sentences
 * with no "…"; that the button opens the ROOT thread, even when the thread is
 * handed in with its updates; that a failed read says a critical note may be
 * missing instead of drawing nothing; and that the line follows a new list of
 * critical notes without a remount. Plus the one rule a stylesheet scan cannot
 * see alone: the button it renders matches a rule that makes it 40px tall.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JournalEntry } from "../../types/journal";
import { assembleThreads } from "./threads";
import { CRITICAL_LINE_FAILED, CriticalLine, type CriticalLineProps } from "./CriticalLine";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    kind: "injury",
    category: null,
    body: "Stop at 90° at the bottom turn.",
    importance: "critical",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-aj",
    authorInitials: "AJ",
    authorName: "AJ",
    occurredAt: new Date("2026-09-01T16:00:00Z"),
    createdAt: new Date("2026-09-01T16:00:00Z"),
    updatedAt: new Date("2026-09-01T16:00:00Z"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const MACHINES = [
  { id: "leg", name: "Leg Press" },
  { id: "row", name: "Compound Row (the long-handled one by the window)" },
];

let host: HTMLDivElement;
let root: Root;

const render = (props: Partial<CriticalLineProps> & Pick<CriticalLineProps, "criticalEntries">) => {
  const onOpen = props.onOpen ?? vi.fn();
  act(() => {
    root.render(
      <StrictMode>
        <CriticalLine machines={MACHINES} onOpen={onOpen} {...props} />
      </StrictMode>,
    );
  });
  return onOpen;
};

const line = () => host.querySelector('[data-testid="critical-line"]');
const button = () => host.querySelector("button");

const click = (el: Element | null) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
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

describe("the critical line", () => {
  it("draws nothing when nothing critical matters today", () => {
    render({ criticalEntries: [], threads: [] });
    expect(host.innerHTML).toBe("");
  });

  it("names the machine in full and shows whole sentences, never '…'", () => {
    const body =
      "Right knee: stop at 90° at the bottom turn. She felt a pinch on Mar 4 with the seat one notch closer. Back to seat 7 and it was fine.";
    const e = entry({ id: "k", machineId: "row", body });
    const onOpen = render({ criticalEntries: [e], threads: assembleThreads([e]) });

    const text = line()?.textContent ?? "";
    expect(text).toContain("Critical ·");
    expect(text).toContain(
      "Compound Row (the long-handled one by the window): Right knee: stop at 90° at the bottom turn. She felt a pinch on Mar 4 with the seat one notch closer.",
    );
    expect(text).not.toContain("…");
    expect(text).not.toContain("Back to seat 7");
    expect(line()?.getAttribute("aria-label")).toBe("Critical note");
    expect(line()?.getAttribute("data-state")).toBe("critical");

    expect(button()?.textContent).toBe("Open the note");
    expect(button()?.getAttribute("type")).toBe("button");
    click(button());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("k");
  });

  it("a note with no machine is just the note", () => {
    render({ criticalEntries: [entry({ id: "k", body: "No overhead until the shoulder is cleared." })] });
    expect(line()?.textContent).toContain("Critical · No overhead until the shoulder is cleared.");
  });

  it("opens the root thread, not an update", () => {
    const note = entry({ id: "k", machineId: "leg" });
    const update = entry({ id: "u", threadId: "k", importance: "standard", body: "Seat 7 now." });
    const onOpen = render({ criticalEntries: [note], threads: assembleThreads([note, update]) });
    click(button());
    expect(onOpen).toHaveBeenCalledWith("k");
  });

  it("with more than one, counts the others and opens the notes", () => {
    render({
      criticalEntries: [entry({ id: "a", body: "Newest one." }), entry({ id: "b", body: "Older one." })],
    });
    expect(line()?.textContent).toContain("Newest one.");
    expect(line()?.textContent).toContain(" · and 1 more critical note");
    expect(line()?.textContent).not.toContain("Older one.");
    expect(line()?.getAttribute("aria-label")).toBe("Critical notes");
    expect(button()?.textContent).toBe("Open the notes");

    render({
      criticalEntries: [entry({ id: "a" }), entry({ id: "b" }), entry({ id: "c" })],
    });
    expect(line()?.textContent).toContain("and 2 more critical notes");
  });

  it("takes the page's own words for the button", () => {
    const onOpen = render({ criticalEntries: [entry({ id: "k" })], actionLabel: "Show it" });
    expect(button()?.textContent).toBe("Show it");
    click(button());
    expect(onOpen).toHaveBeenCalledWith("k");
  });

  it("a failed read is not 'nothing critical': it says a note may be missing", () => {
    render({ criticalEntries: [], threads: [], failed: true });
    expect(line()?.textContent).toBe(CRITICAL_LINE_FAILED);
    expect(line()?.getAttribute("data-state")).toBe("failed");
    expect(button()).toBeNull();
  });

  it("a partial read shows what it has, and says more may be missing", () => {
    render({ criticalEntries: [entry({ id: "k" })], failed: true });
    expect(line()?.textContent).toContain("Critical · Stop at 90° at the bottom turn.");
    expect(line()?.textContent).toContain(CRITICAL_LINE_FAILED);
    expect(line()?.getAttribute("data-state")).toBe("critical");
  });

  it("follows a new list without a remount, and goes when the note is resolved", () => {
    render({ criticalEntries: [entry({ id: "k", body: "First." })] });
    expect(line()?.textContent).toContain("First.");
    render({ criticalEntries: [entry({ id: "k2", body: "Second." })] });
    expect(line()?.textContent).toContain("Second.");
    render({ criticalEntries: [] });
    expect(line()).toBeNull();
  });

  it("uses only its own classes: no Tailwind palette, nothing clipped", () => {
    render({ criticalEntries: [entry({ id: "k", machineId: "leg" })], failed: true });
    for (const el of host.querySelectorAll("[class]")) {
      const cls = el.getAttribute("class") ?? "";
      expect(cls, cls).not.toMatch(/\b(?:rose|red|slate|violet|fuchsia)-\d|truncate|line-clamp/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* critical-line.css, as rules jsdom can match                         */
/* ------------------------------------------------------------------ */

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = [...readFileSync(join(HERE, "critical-line.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => !m[1].trim().startsWith("@"))
  .map((m) => ({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2] }));

function minHeight(el: Element): number {
  let best = 0;
  for (const rule of RULES) {
    const m = /(?:^|;|\s)min-height\s*:\s*(\d+(?:\.\d+)?)px/.exec(rule.body);
    if (m && rule.selectors.some((s) => el.matches(s))) best = Math.max(best, Number(m[1]));
  }
  return best;
}

describe("the critical line's stylesheet", () => {
  it("makes its button at least 40px tall", () => {
    render({ criticalEntries: [entry({ id: "k" })] });
    const b = button();
    expect(b).not.toBeNull();
    expect(minHeight(b!)).toBeGreaterThanOrEqual(40);
  });
});

// @vitest-environment jsdom
/**
 * STORY, MOUNTED (client codex, phase 15).
 *
 * The page works out what to draw during render — the filter, the years
 * that start open, each long note's fold — so only a mount proves it:
 *
 *   - the since line, then the years newest first; the two newest open, an
 *     older one folded behind "1 moment in 2019" until it is tapped;
 *   - the years before Journey as a dashed panel: under Everything and
 *     Milestones, never under Life; a filter that leaves nothing says so and
 *     offers everything back;
 *   - a long note folds behind "Read all" and opens whole; a Pulse statement
 *     that moved is quoted in full with its two words;
 *   - a moment with a door is one button that opens where it came from;
 *   - a read that is pending, failed or not this reader's is named, an
 *     empty story is "nothing recorded" only when nothing is unknown, and a
 *     filter emptied by a missing read (Life, with FORD off or failed) says
 *     "that could be read here", never "yet";
 *   - neutral: no crimson, no hero orange, no Tailwind size; the neighbours
 *     and the Next card to Account.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import { assembleThreads } from "../client-notes/threads";
import { historyFromDocs } from "../subjective-report/assessment-history";
import { pronounsOf } from "../client-codex/kit/pronouns";
import { buildStory, type Src, type StoryClient, type StoryInput } from "./story";
import { StoryPage } from "./StoryPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TZ = "America/New_York";
const TODAY = "2027-03-16";
const SHE = pronounsOf({ gender: "Female" });
const noon = (day: string) => new Date(`${day}T12:00:00-05:00`);
const ready = <T,>(data: T): Src<T> => ({ status: "ready", data });

const LONG =
  "A pinch in the right knee on Leg Press with the seat one notch closer, so we moved her back to seat 7 and she stops at " +
  "ninety degrees at the bottom turn, holds the pause, and tells us before the set whether the knee feels warm or tight " +
  "that morning, because the pickleball season starts in April and she wants to be able to play three mornings a week " +
  "without the knee swelling afterwards, which it did twice last spring when the seat crept forward during the set.";

const note = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    kind: "injury",
    category: null,
    body: "note",
    importance: "critical",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-aj",
    authorInitials: "AJ",
    authorName: "AJ Jurgens",
    occurredAt: noon("2027-03-04"),
    createdAt: noon("2027-03-04"),
    updatedAt: noon("2027-03-04"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const moment: FordEntry = {
  id: "moment",
  clientId: "c1",
  studioId: "westlake",
  pillar: "dreams",
  body: "Booked the Camino with Tom.",
  subject: null,
  isPinned: false,
  eventDate: null,
  recurrence: "none",
  opportunity: null,
  occurredAt: noon("2026-12-18"),
  createdAt: noon("2026-12-18"),
  updatedAt: noon("2026-12-18"),
  authorId: "uid-marcus",
  authorName: "Marcus Lee",
  authorInitials: "ML",
  origin: "in_session",
  sessionId: null,
  isArchived: false,
};

const round = (id: string, date: string, strength: number) => ({
  id,
  clientId: "c1",
  status: "Finalized",
  date,
  trainerName: "AJ Jurgens",
  updatedAt: noon(date),
  subjective: { scaleVersion: 2, enteredBy: "coach", completedAt: date, answers: { strengthConfidence_1: { value: strength } } },
});

const carol: StoryClient = {
  priorHistory: { sessions: 412, importedCount: 0, from: "2019-03-01", through: "2026-09-12", source: "filemaker" },
  firstAppointmentDate: new Date(Date.UTC(2019, 2, 6)),
  referredBy: "Janet Olsen",
  goalHistory: [{ goal: "Walk 5 miles without stopping", achievedAt: "2027-01-23T03:30:00Z", byName: "AJ" }],
};

function carolInput(over: Partial<StoryInput> = {}): StoryInput {
  return {
    today: TODAY,
    tz: TZ,
    client: carol,
    coverage: "partial",
    totals: { total: 461, journey: 49, before: 412 },
    pronouns: SHE,
    notes: ready(assembleThreads([note({ id: "crit", body: LONG })])),
    focuses: ready([]),
    ford: ready([moment]),
    inbody: ready([]),
    pulse: ready(historyFromDocs([round("r2", "2027-03-10", 8), round("r1", "2026-09-16", 5)], 50)),
    ...over,
  };
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(input: StoryInput = carolInput()) {
  const go = vi.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <StoryPage story={buildStory(input)} pronouns={input.pronouns ?? SHE} go={go} />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return { host, go };
}

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
};

const buttonIn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text) ??
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));

const years = (host: HTMLElement) => Array.from(host.querySelectorAll(".st-year__title")).map((h) => h.textContent);

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("StoryPage", () => {
  it("leads with the since line and her time, in her pronoun, with the neighbours and the Next card", async () => {
    const { host, go } = await mount();
    expect(host.querySelector(".cx-page-title")?.textContent).toBe("Story");
    expect(host.querySelector(".cx-page-lede")?.textContent).toMatch(/^Her time with Max Strength, newest first\./);
    expect(host.querySelector(".st-since")?.textContent).toBe(
      "With Max Strength since Mar 2019. 412 sessions in FileMaker before Journey, and 49 in Journey.",
    );
    expect(host.querySelector('[aria-label="Previous page: Goals & Focus"]')).not.toBeNull();
    const next = host.querySelector<HTMLElement>(".cx-next")!;
    expect(next.textContent).toContain("Account");
    await click(next);
    expect(go).toHaveBeenLastCalledWith("account");
  });

  it("draws the years newest first, the two newest open and an older one folded until tapped", async () => {
    const { host } = await mount();
    expect(years(host)).toEqual(["2027", "2026", "2019"]);
    const y2019 = host.querySelectorAll<HTMLElement>(".st-year")[2];
    expect(y2019.querySelector(".st-beats")).toBeNull();
    const fold = buttonIn(y2019, "1 moment in 2019")!;
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    await click(fold);
    expect(host.querySelectorAll<HTMLElement>(".st-year")[2].textContent).toContain("First visit, as Mindbody records it.");
  });

  it("shows the years before Journey as a panel under Everything and Milestones, never under Life", async () => {
    const { host } = await mount();
    const era = () => host.querySelector('[data-testid="story-era"]');
    expect(era()?.textContent).toContain("Mar 2019 – Sep 2026 · 412 sessions in FileMaker");
    expect(era()?.textContent).toContain("never treated as new");
    await click(buttonIn(host, "Milestones"));
    expect(era()).not.toBeNull();
    expect(buttonIn(host, "Milestones")?.getAttribute("aria-pressed")).toBe("true");
    await click(buttonIn(host, "Life"));
    expect(era()).toBeNull();
    expect(host.querySelectorAll(".st-beat").length).toBe(1);
    expect(host.textContent).toContain("Booked the Camino with Tom.");
    expect(years(host)).toEqual(["2026"]);
  });

  it("says when a filter leaves nothing, and offers everything back", async () => {
    const { host } = await mount(carolInput({ ford: ready([]) }));
    await click(buttonIn(host, "Life"));
    expect(host.textContent).toContain("Nothing under “Life” yet.");
    await click(buttonIn(host, "Show everything"));
    expect(buttonIn(host, "Everything")?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector('[data-testid="story-era"]')).not.toBeNull();
  });

  it("an empty filter whose read is missing is unknown, never “yet”", async () => {
    // A cross-train reader: FORD is the home studio's, so Life is always empty.
    const off = await mount(carolInput({ ford: { status: "off" } }));
    await click(buttonIn(off.host, "Life"));
    expect(off.host.textContent).toContain("FORD is kept by the home studio");
    expect(off.host.textContent).toContain("Nothing under “Life” that could be read here.");
    expect(off.host.textContent).not.toContain("Nothing under “Life” yet.");
    expect(buttonIn(off.host, "Show everything")).toBeDefined();

    // FORD failed: the status line and the empty line agree.
    const failed = await mount(carolInput({ ford: { status: "failed" } }));
    await click(buttonIn(failed.host, "Life"));
    expect(failed.host.textContent).toContain("Couldn't read FORD here");
    expect(failed.host.textContent).toContain("Nothing under “Life” that could be read here.");
    expect(failed.host.textContent).not.toContain("Nothing under “Life” yet.");

    // Another filter's read still loading leaves this one's "yet" alone.
    const other = await mount(carolInput({ ford: ready([]), inbody: { status: "loading" } }));
    await click(buttonIn(other.host, "Life"));
    expect(other.host.textContent).toContain("Nothing under “Life” yet.");
  });

  it("folds a long note behind Read all and opens it whole", async () => {
    const { host } = await mount();
    const beat = host.querySelector<HTMLElement>('[data-source="note"]')!;
    expect(beat.textContent).not.toContain("crept forward during the set.");
    const more = buttonIn(beat, "Read all")!;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await click(more);
    expect(beat.textContent).toContain(LONG);
    expect(buttonIn(beat, "Show less")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens a moment where it came from: one button, the thread on Notes", async () => {
    const { host, go } = await mount();
    const beat = host.querySelector<HTMLElement>('[data-source="note"]')!;
    const door = beat.querySelector<HTMLButtonElement>("button.st-beat__door")!;
    expect(door.textContent).toContain("Critical note · AJ");
    await click(door);
    expect(go).toHaveBeenLastCalledWith("notes", "note-crit");
    // "Read all" is its own button, never inside the door.
    expect(door.querySelector("button")).toBeNull();
  });

  it("quotes a Pulse statement that moved, whole, with its two words", async () => {
    const { host } = await mount();
    const pulse = host.querySelector<HTMLElement>('[data-source="pulse"]')!;
    expect(pulse.textContent).toContain("Pulse saved: 1 statement moved.");
    expect(pulse.querySelector(".st-quote")?.textContent).toBe(
      "“I feel stronger than I did 3 months ago.” Often, was Sometimes.",
    );
  });

  it("names what it couldn't read, and what this reader may not", async () => {
    const { host } = await mount(carolInput({ inbody: { status: "failed" }, ford: { status: "off" }, notes: { status: "loading" } }));
    const status = host.querySelector(".st-status")?.textContent ?? "";
    expect(status).toContain("Still reading notes, so those moments aren't shown yet.");
    expect(status).toContain("Couldn't read InBody scans here, so those moments aren't shown.");
    expect(status).toContain("FORD is kept by the home studio, so FORD moments aren't shown here.");
  });

  it("says nothing is recorded only when nothing is unknown", async () => {
    const empty: StoryInput = {
      today: TODAY,
      tz: TZ,
      client: {},
      coverage: "complete",
      pronouns: SHE,
      notes: ready([]),
      focuses: ready([]),
      ford: ready([]),
      inbody: ready([]),
      pulse: ready(historyFromDocs([], 50)),
    };
    const known = await mount(empty);
    expect(known.host.textContent).toContain("Nothing recorded yet.");
    const unknown = await mount({ ...empty, notes: { status: "loading" } });
    expect(unknown.host.textContent).not.toContain("Nothing recorded yet.");
    expect(unknown.host.textContent).toContain("Still reading notes");
    // FORD kept by the home studio: nothing THIS reader can read, not nothing.
    const elsewhere = await mount({ ...empty, ford: { status: "off" } });
    expect(elsewhere.host.textContent).not.toContain("Nothing recorded yet.");
    expect(elsewhere.host.textContent).toContain("Nothing recorded yet that can be read here.");
    expect(elsewhere.host.textContent).toContain("FORD is kept by the home studio");
  });

  it("is neutral: no crimson, no hero orange, no Tailwind size or colour", async () => {
    const { host } = await mount();
    expect(host.querySelector('[data-tone="alert"], [data-tone="hero"]')).toBeNull();
    const html = host.innerHTML;
    expect(html).not.toMatch(/\balert\b|\bhero\b/);
    expect(html).not.toMatch(/\btext-(xs|sm|base|lg|xl|\[)/);
    expect(html).not.toMatch(/\b(?:text|bg|border)-(?:red|rose|orange|amber|slate|gray)-\d{2,3}\b/);
  });

  it("gives a moment's door a row's height and every fold a kit button", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, "story.css"), "utf8");
    const door = /\.st-beat__door,\s*\.st-beat__content\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(door).toContain("min-height: var(--cx-row)");
    // The year is a label, never a sticky header.
    expect(css).not.toMatch(/position:\s*sticky/);
  });
});

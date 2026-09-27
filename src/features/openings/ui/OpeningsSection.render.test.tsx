// @vitest-environment jsdom
/**
 * MY STUDIO → OPENINGS → THE USUAL WEEK (Openings round, phase 4), mounted:
 * the grid drawn from a summary the Sunday job would write, a time's sheet
 * in the Context Panel, and every way the summary can't be used (still
 * loading, never built, unreadable, a cache with no copy, not linked), each
 * its own sentence and never an empty grid. Then the one sentence before four
 * weeks are counted, a studio with no week agreed, and a trainer's view,
 * which names colleagues (AJ's relaxed answer).
 *
 * Today is Monday Nov 9 2026, noon Eastern: the day after the fixture's
 * Sunday run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Studio, Trainer } from "../../../types";
import type { StandingWeekDoc } from "../../standing-week/week";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SummaryAnswer = { data: unknown; fromCache?: boolean } | "missing" | "cache-missing" | "fails" | "never";

const fake = vi.hoisted(() => ({
  summary: "missing" as unknown,
  /** Every document read, by path. */
  reads: [] as string[],
  weeks: { docs: [] as unknown[], loading: false, error: null as string | null },
  marks: [] as { id: string; data: Record<string, unknown> }[],
  marksFail: false,
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sam" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    getDoc: (r: { path: string }) => {
      fake.reads.push(r.path);
      const a = fake.summary as SummaryAnswer;
      if (a === "never") return new Promise(() => {});
      if (a === "fails") return Promise.reject(Object.assign(new Error("denied"), { code: "permission-denied" }));
      if (a === "missing" || a === "cache-missing")
        return Promise.resolve({ exists: () => false, data: () => undefined, metadata: { fromCache: a === "cache-missing" } });
      return Promise.resolve({ exists: () => true, data: () => a.data, metadata: { fromCache: a.fromCache === true } });
    },
    onSnapshot: (r: { path: string }, _opts: unknown, next: (s: unknown) => void, fail: (e: unknown) => void) => {
      const t = setTimeout(() => {
        if (fake.marksFail) return fail(Object.assign(new Error("denied"), { code: "permission-denied" }));
        next({ docs: fake.marks.map((m) => ({ id: m.id, data: () => m.data })), metadata: { fromCache: false } });
      }, 0);
      return () => clearTimeout(t);
    },
  };
});
vi.mock("../../standing-week/useStandingWeeks", () => ({ useStandingWeeks: () => fake.weeks }));

import { forgetPersonalMemory } from "../../sign-out/memory";
import { OpeningsSection } from "./OpeningsSection";
import { KIM, LEE, PAT, PAT_WEEK, SAM, SAM_TUESDAYS, Shell, WESTLAKE, foldFixture, person } from "./test-shell";
import { readInFull } from "../fixtures";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-11-09T12:00:00-05:00") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  forgetPersonalMemory();
  fake.summary = { data: foldFixture() };
  fake.reads.length = 0;
  fake.weeks = { docs: [SAM_TUESDAYS, PAT_WEEK], loading: false, error: null };
  fake.marks = [];
  fake.marksFail = false;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount({ viewer = SAM, studio = WESTLAKE, trainers = [SAM, PAT] }: { viewer?: Trainer; studio?: Studio; trainers?: Trainer[] } = {}) {
  await act(async () => {
    root.render(
      <StrictMode>
        <Shell>
          <OpeningsSection studio={studio} authTrainer={viewer} trainers={trainers} />
        </Shell>
      </StrictMode>,
    );
  });
  await settle();
}
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
const cell = (key: string) => host.querySelector<HTMLButtonElement>(`[data-key="${key}"]`);
const text = () => host.textContent ?? "";

describe("the usual week, drawn from the summary", () => {
  it("reads the one summary document by id, and draws each time's word, its label the whole sentence", async () => {
    await mount();
    expect(fake.reads).toEqual(["studios/westlake/watch/openings"]);
    expect(cell("1-0800")?.textContent).toBe("Always full");
    expect(cell("1-0800")?.getAttribute("aria-label")).toBe("Monday 8:00 AM · Always full: full in all of the last 8 Mondays.");
    expect(cell("2-1030")?.textContent).toBe("Usually has room");
    expect(cell("1-0800")?.className).toContain("op-cell--always");
    expect(cell("2-1030")?.className).toContain("op-cell--room");
    // Saturday has nothing booked and nobody in: blank, still a button.
    expect(cell("6-0800")?.textContent).toBe("");
    expect(text()).toContain("Built Sunday, Nov 8.");
    expect(text()).toContain("From the weeks Journey has read in full since Sep 14 (8 weeks).");
    // Everyone's week is agreed: no line about whose isn't.
    expect(host.querySelector("[data-testid='unagreed-line']")).toBeNull();
  });

  it("opens a time's sheet beside the grid, with present.ts's lines", async () => {
    await mount();
    await act(async () => cell("1-0800")!.click());
    const sheet = host.querySelector("[data-testid='time-sheet']");
    expect(host.querySelector(".cp__title")?.textContent).toContain("Monday 8:00 AM");
    expect(sheet?.textContent).toContain("Monday 8:00 AM · Always full: full in all of the last 8 Mondays.");
    expect(sheet?.textContent).toContain("Usually 2 booked.");
    expect(cell("1-0800")?.getAttribute("aria-current")).toBe("true");
  });

  it("shows a mark read-only, first, and says so when the marks can't be read", async () => {
    fake.marks = [{ id: "2-1030", data: { weekday: 2, time: "10:30", mark: "full", by: { id: "uid-pat", name: "Pat Moss" }, at: new Date("2026-11-02T15:00:00Z") } }];
    await mount();
    expect(cell("2-1030")?.textContent).toContain("Marked");
    await act(async () => cell("2-1030")!.click());
    const sheet = host.querySelector("[data-testid='time-sheet']")!;
    const lines = [...sheet.querySelectorAll(".op-sheet__line--lead")].map((l) => l.textContent);
    expect(lines[0]).toBe("The bookings disagree: room in 8 of the last 8 Tuesdays.");
    expect(lines[1]).toBe("Marked Always full by Pat, Nov 2.");
    // Nothing on the sheet sets or changes a mark yet.
    expect(sheet.querySelectorAll("button, input, textarea")).toHaveLength(0);
  });

  it("says it can't tell about marks when they can't be read, never that there are none", async () => {
    fake.marksFail = true;
    await mount();
    await act(async () => cell("1-0800")!.click());
    expect(host.querySelector("[data-testid='time-sheet']")?.textContent).toContain("Can't tell just now whether anyone has marked this time.");
  });
});

describe("when the summary can't be used", () => {
  it("says it is reading while the read is out", async () => {
    fake.summary = "never";
    await mount();
    expect(text()).toContain("Reading the usual week…");
    expect(host.querySelector(".op-grid")).toBeNull();
  });

  it("never built: the job hasn't written one yet", async () => {
    fake.summary = "missing";
    await mount();
    expect(text()).toContain("The usual week is built early each Sunday. The first one comes this Sunday.");
    expect(host.querySelector(".op-grid")).toBeNull();
  });

  it("failed: can't read it, never 'never built' and never an empty grid", async () => {
    fake.summary = "fails";
    await mount();
    expect(text()).toContain("Can't read the usual week just now.");
    expect(text()).not.toContain("built early each Sunday");
    expect(host.querySelector(".op-grid")).toBeNull();
  });

  it("offline with no copy: this iPad's cache can't say the job never ran", async () => {
    fake.summary = "cache-missing";
    await mount();
    expect(text()).toContain("Can't read the usual week just now.");
  });

  it("offline with a copy: shown, with its own date", async () => {
    fake.summary = { data: foldFixture(), fromCache: true };
    await mount();
    expect(cell("1-0800")?.textContent).toBe("Always full");
    expect(text()).toContain("Built Sunday, Nov 8.");
  });

  it("an old summary shows its date in the caution colour", async () => {
    vi.setSystemTime(new Date("2026-11-20T12:00:00-05:00"));
    await mount();
    expect(host.querySelector("[data-testid='built-line']")?.className).toContain("op__line--old");
  });

  it("a document this app can't read is unreadable, not empty", async () => {
    fake.summary = { data: { v: 99 } };
    await mount();
    expect(text()).toContain("Can't read the usual week just now.");
  });

  it("not linked to Mindbody: says so, and reads nothing", async () => {
    await mount({ studio: { ...WESTLAKE, mindbodySiteId: "" } as unknown as Studio });
    expect(text()).toContain("Westlake's bookings aren't linked to Journey, so Openings can't read them.");
    expect(host.querySelector(".op-grid")).toBeNull();
  });
});

describe("before the weeks are there", () => {
  it("is one sentence until four weeks are counted", async () => {
    fake.summary = { data: foldFixture({ coverage: readInFull("2026-10-26", "2026-11-30") }) };
    await mount();
    const one = host.querySelector("[data-testid='not-enough-weeks']");
    expect(one?.textContent).toBe("The usual week needs 4 weeks Journey has read in full. It has 2 so far, counted since Oct 26. The first words can come on Sunday, Nov 22.");
    expect(host.querySelector(".op-grid")).toBeNull();
    expect(host.querySelectorAll(".op-cell")).toHaveLength(0);
  });

  it("with no week agreed, shows how many are usually booked and says why", async () => {
    fake.summary = { data: foldFixture({ weeks: [] }) };
    fake.weeks = { docs: [], loading: false, error: null };
    await mount();
    expect(host.querySelector("[data-testid='unagreed-line']")?.textContent).toBe(
      "Who's in comes from the standing weeks leaders agree on Team. None is agreed at Westlake yet, so this shows how many are usually booked, not whether there's room.",
    );
    expect(cell("1-0800")?.textContent).toBe("2 booked");
    expect(cell("1-0800")?.getAttribute("aria-label")).toContain("Room can't be judged yet: not every trainer's week is agreed.");
  });
});

describe("who sees names (AJ, Sep 27 2026: relaxed for the beta)", () => {
  it("a trainer sees colleagues by name, and themselves as 'you'", async () => {
    await mount({ viewer: SAM, trainers: [SAM, PAT, KIM] });
    // Kim works here and has no agreed week: named, to a trainer too.
    expect(host.querySelector("[data-testid='unagreed-line']")?.textContent).toBe("Kim's week isn't agreed yet.");
    await act(async () => cell("1-0800")!.click());
    expect(host.querySelector("[data-testid='time-sheet']")?.textContent).toContain("Usually in: you and Pat.");
  });

  it("a leader who isn't in the week sees everyone by name", async () => {
    await mount({ viewer: LEE, trainers: [SAM, PAT, LEE] });
    await act(async () => cell("1-0800")!.click());
    expect(host.querySelector("[data-testid='time-sheet']")?.textContent).toContain("Usually in: Pat and Sam.");
  });

  it("someone who doesn't work at the studio is told so, and nothing is read", async () => {
    await mount({ viewer: person("t-far", "Far Away", { primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] }) });
    expect(text()).toContain("Openings is for the people who work at Westlake.");
    expect(fake.reads).toEqual([]);
  });
});

// @vitest-environment jsdom
/**
 * MY PROFILE → YOUR WEEK, MOUNTED (Openings round, phase 11, Sep 27 2026).
 *
 * The card reads the studio's sessions from the SERVER once and works out
 * both weeks during render. These mount it against the read's four answers:
 * still reading, failed (a refusal or no connection), too many, and
 * answered — and check it never shows a zero it doesn't know.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WorkoutSession } from "../../types";

const fetchHolder = vi.hoisted(() => ({
  calls: [] as unknown[],
  answer: null as null | (() => Promise<{ sessions: WorkoutSession[]; truncated: boolean }>),
}));
vi.mock("../admin/sessions-range", () => ({
  fetchSessionsInRange: (range: unknown) => {
    fetchHolder.calls.push(range);
    return fetchHolder.answer ? fetchHolder.answer() : new Promise(() => {});
  },
}));

import { YourWeek } from "./YourWeek";

const NOW = new Date("2026-09-30T12:00:00-04:00"); // Wednesday, noon Eastern
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

function session(id: string, day: string, from: string, to: string, over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id,
    clientId: `client-${id}`,
    trainerId: "t1",
    trainerInitials: "SK",
    hostedAtStudioId: "westlake",
    status: "Completed",
    date: day,
    startTime: at(day, from),
    endTime: at(day, to),
    createdAt: at(day, from),
    ...over,
  } as WorkoutSession;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  fetchHolder.calls = [];
  fetchHolder.answer = null;
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount(studio: { sessionMinutes?: number; journeyCutoverDate?: string | null } | null = { sessionMinutes: 30 }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <YourWeek trainerId="t1" studioId="westlake" studioName="Westlake" studio={studio} tz="America/New_York" />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

const text = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

describe("Your week", () => {
  it("says it is reading until the server answers, and asks the server only", async () => {
    const el = await mount();
    expect(text(el.querySelector("[data-testid='your-week-state']"))).toBe("Reading the sessions…");
    expect(el.querySelector("h2")?.textContent).toBe("Your week at Westlake");
    expect(fetchHolder.calls.length).toBeGreaterThan(0);
    const call = fetchHolder.calls[0] as { studioId: string; startMs: number; fromServer: boolean; endMs?: number };
    expect(call.studioId).toBe("westlake");
    expect(call.fromServer).toBe(true);
    expect(call.endMs).toBeUndefined();
    // From the day before last Monday (Sep 21), midnight Eastern.
    expect(new Date(call.startMs).toISOString()).toBe("2026-09-20T04:00:00.000Z");
  });

  it("says it can't read when the read fails or the iPad is offline — never zero", async () => {
    fetchHolder.answer = () => Promise.reject(new Error("unavailable: offline"));
    const el = await mount();
    expect(text(el.querySelector("[data-testid='your-week-state']"))).toBe("Can't read the sessions just now.");
    expect(el.querySelector("[data-testid='your-week-this']")).toBeNull();
    expect(el.textContent).not.toMatch(/\b0\b/);
  });

  it("says there are too many to count rather than a number from part of the fortnight", async () => {
    fetchHolder.answer = async () => ({ sessions: [session("a", "2026-09-29", "07:00", "07:25")], truncated: true });
    const el = await mount();
    expect(text(el.querySelector("[data-testid='your-week-state']"))).toBe("Too many sessions to count here.");
  });

  it("counts your sessions, clients and session time, and splits first session to last at a break", async () => {
    fetchHolder.answer = async () => ({
      truncated: false,
      sessions: [
        // Last week: one session.
        session("l1", "2026-09-22", "08:00", "08:25"),
        // This week, Monday: a morning block and an evening block.
        session("m1", "2026-09-28", "06:58", "07:23", { clientId: "judy" }),
        session("m2", "2026-09-28", "07:30", "07:55", { clientId: "judy" }),
        session("m3", "2026-09-28", "09:09", "09:34"),
        session("m4", "2026-09-28", "16:02", "16:27"),
        session("m5", "2026-09-28", "18:45", "19:10"),
        // Logged by hand on Tuesday: counted, but no clock times.
        session("t1", "2026-09-29", "08:00", "08:25", { startTime: "2026-09-29T12:00:00.000Z" }),
        // A colleague's, in the same read.
        session("x1", "2026-09-29", "10:00", "10:25", { trainerId: "t2" }),
      ],
    });
    const el = await mount({ sessionMinutes: 30 });
    const thisWeek = el.querySelector("[data-testid='your-week-this']")!;
    expect(text(thisWeek.querySelector("h3"))).toBe("This week Sep 28–30");
    const facts = [...thisWeek.querySelectorAll(".tp-fact")].map((f) => `${text(f.querySelector(".tp-fact__k"))} ${text(f.querySelector(".tp-fact__v"))}`);
    expect(facts).toEqual([
      "Clients trained 5",
      "Sessions 6",
      "Session time 3 h (6 sessions × 30 min)",
      "First session to last 3 h 26 min over 1 day",
    ]);
    expect([...thisWeek.querySelectorAll(".tp-yw__days li")].map((li) => text(li))).toEqual([
      "Mon, Sep 28: 6:58 to 9:34 AM, 4:02 to 4:27 PM, and 6:45 to 7:10 PM (5 sessions).",
    ]);
    expect(text(thisWeek)).toContain("Leaves out 1 session without real clock times");

    const lastWeek = el.querySelector("[data-testid='your-week-last']")!;
    expect(text(lastWeek.querySelector("h3"))).toBe("Last week Sep 21–27");
    expect(text(lastWeek)).toContain("0.5 h (1 session × 30 min)");
  });

  it("says so in words when the server answered and nothing is logged with you", async () => {
    fetchHolder.answer = async () => ({ sessions: [session("x1", "2026-09-29", "10:00", "10:25", { trainerId: "t2" })], truncated: false });
    const el = await mount();
    expect(text(el.querySelector("[data-testid='your-week-this']"))).toContain(
      "No sessions with you logged in Journey at Westlake so far this week.",
    );
    expect(text(el.querySelector("[data-testid='your-week-last']"))).toContain(
      "No sessions with you logged in Journey at Westlake last week.",
    );
    expect(el.querySelector(".tp-fact")).toBeNull();
  });

  it("says the studio is still moving off FileMaker while it has no cutover, and not once both weeks are after it", async () => {
    fetchHolder.answer = async () => ({ sessions: [], truncated: false });
    let el = await mount({ sessionMinutes: 30 });
    expect(el.textContent).toContain("Westlake is still moving off FileMaker. Sessions logged there aren't counted.");
    expect(el.textContent).toContain("Counts sessions logged in Journey at Westlake.");
    act(() => root?.unmount());
    host?.remove();
    el = await mount({ sessionMinutes: 30, journeyCutoverDate: "2026-09-01" });
    expect(el.textContent).not.toContain("still moving off FileMaker");
  });

  it("explains, on a tap, why it can differ from Coaching load", async () => {
    fetchHolder.answer = async () => ({ sessions: [], truncated: false });
    const el = await mount();
    const button = [...el.querySelectorAll("button")].find((b) => b.textContent === "Why this can differ from Coaching load")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(el.textContent).not.toContain("nightly totals");
    await act(async () => {
      button.click();
    });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(el.textContent).toContain("Coaching load above counts the nightly totals");
  });
});

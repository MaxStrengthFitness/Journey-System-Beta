// @vitest-environment jsdom
/**
 * OPERATIONS → AHEAD MOUNTS — the weeks with each client's dates, a lens
 * folding the rest into All clear, the Clients view's groups, a client's
 * panel with the renewals dashboard's own row, and a client it can't place
 * counted with the reason (Oct 7 2026).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const NOW = new Date("2026-10-07T13:00:00Z"); // Wednesday Oct 7, 9 AM Eastern
const failures = vi.hoisted(() => ({ cycles: false }));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r, i) => ({ id: String(r.id ?? i), data: () => r, exists: () => true })),
    size: rows.length,
    empty: rows.length === 0,
    forEach: (fn: (d: unknown) => void) => rows.forEach((r, i) => fn({ id: String(r.id ?? i), data: () => r })),
    docChanges: () => [],
    metadata: { fromCache: false },
  });
  // This week's bookings: everyone but Adelard is booked Friday, so only Adelard has nothing booked.
  const booking = (clientId: string) => ({
    id: `b-${clientId}`,
    clientId,
    clientName: clientId,
    trainerId: "t-dana",
    studioId: "westlake",
    startTime: new Date("2026-10-09T11:00:00-04:00"),
    endTime: new Date("2026-10-09T11:30:00-04:00"),
    status: "Scheduled",
  });
  const answer = (path: string) => {
    if (path === "schedules") return snap(["maureen", "gordon", "linda", "omar"].map(booking));
    if (path === "studios/westlake/renewals")
      return snap([{ id: "c-gordon", clientId: "gordon", clientName: "Gordon Pell", cycleKey: "c-gordon", lastTouchAt: new Date("2026-10-02T15:00:00Z"), lastTouchByName: "Dana Reyes" }]);
    return snap([]);
  };
  return {
    collection: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    documentId: () => "__name__",
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown, c?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const fail = (typeof a === "function" ? b : c) as ((e: unknown) => void) | undefined;
      const t = setTimeout(() => {
        if (target.path === "studios/westlake/renewals" && failures.cycles) fail?.(new Error("permission-denied"));
        else if (target.path.split("/").length % 2 === 0) next({ exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } });
        else next(answer(target.path));
      }, 0);
      return () => clearTimeout(t);
    },
    setDoc: async () => {},
    deleteDoc: async () => {},
    writeBatch: () => ({ set: () => {}, update: () => {}, commit: async () => {} }),
    serverTimestamp: () => new Date(),
  };
});

import { AheadPage } from "./AheadPage";
import { forgetPersonalMemory } from "../../sign-out/memory";
import type { Client, Studio, Trainer } from "../../../types";

const studio = { id: "westlake", name: "Westlake", timezone: "America/New_York" } as unknown as Studio;
const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake" } as unknown as Trainer;
const trainers = [lead, { id: "t-dana", fullName: "Dana Reyes", primaryHomeStudioId: "westlake" }] as unknown as Trainer[];

const T = (n: number) => {
  const d = new Date(Date.UTC(2026, 9, 7 + n));
  return d.toISOString().slice(0, 10);
};

const snap = (extra: Record<string, unknown> = {}) => ({
  version: 3,
  situation: "on-track",
  paymentMode: "monthly",
  packageKey: "committed",
  packageLabel: "Committed · 12 months",
  autoRenews: true,
  autoRenewsFrom: "mindbody",
  chargeDate: T(90),
  chargeDateSource: "mindbody",
  commitmentEnd: T(90),
  commitmentEndSource: "mindbody",
  sessionsLeft: 26,
  sessionsLeftSource: "mindbody",
  sessionsOnHand: 2,
  paymentsLeft: 3,
  pacePerWeek: 2,
  runOutDate: T(91),
  bankedAtCharge: 0,
  conversationDue: false,
  chargeWarning: false,
  focusDate: T(90),
  renewalOnBooks: null,
  flags: [],
  proof: { weeksObserved: 12, weeksAttended: 12 },
  lastVisitDate: T(-2),
  nextBookingDate: T(2),
  primaryTrainerId: "t-dana",
  coachIds: ["t-dana"],
  dataGaps: [],
  cycleKey: null,
  ledger: { carriedIn: 0, thisContract: 2, toCome: 24, extra: 0, total: 26, source: "mindbody", asOf: T(0) },
  projection: { endsOn: T(90), endsOnSource: "mindbody", booked: 0, bookedThrough: null, paceWeeks: 12.9, pacePerWeek: 2, leftAtEnd: 0, leftAtEndLow: 0, leftAtEndHigh: 3, runOutDate: null },
  paceRange: { slowest: 1.75, fastest: 2.25 },
  runOutRange: null,
  computedAt: new Date("2026-10-07T06:31:00Z"),
  ...extra,
});
const client = (id: string, first: string, last: string, renewal: Record<string, unknown> | null, extra: Record<string, unknown> = {}) =>
  ({ id, firstName: first, lastName: last, isActive: true, homeStudioId: "westlake", ...(renewal ? { renewal: snap(renewal) } : {}), ...extra }) as unknown as Client;

const clients = [
  client("maureen", "Maureen", "Kowalski", { sessionsLeft: 9, conversationDue: true, cycleKey: "c-maureen" }),
  client("gordon", "Gordon", "Pell", {
    situation: "will-bank",
    sessionsLeft: 28,
    pacePerWeek: 1,
    chargeDate: T(44),
    commitmentEnd: T(44),
    bankedAtCharge: 22,
    runOutDate: T(196),
    cycleKey: "c-gordon",
    projection: { endsOn: T(44), endsOnSource: "mindbody", booked: 0, bookedThrough: null, paceWeeks: 6.3, pacePerWeek: 1, leftAtEnd: 22, leftAtEndLow: 20, leftAtEndHigh: 23, runOutDate: null },
  }),
  client("linda", "Linda", "Ferrante", {
    situation: "will-run-out",
    runOutDate: T(60),
    runOutRange: { earliest: T(52), latest: T(70) },
    projection: { endsOn: T(90), endsOnSource: "mindbody", booked: 0, bookedThrough: null, paceWeeks: 12.9, pacePerWeek: 2, leftAtEnd: 0, leftAtEndLow: 0, leftAtEndHigh: 0, runOutDate: T(60) },
  }),
  client("grace", "Grace", "Lindqvist", { situation: "away", awayUntil: T(40), awayReason: "Snowbird", pacePerWeek: null, runOutDate: null }),
  client("omar", "Omar", "Siddiqui", { situation: "unknown", dataGaps: ["“SV 18 Months/144 Sessions PIF + 2 Free” isn't matched to a package in Renewal settings, so it isn't counted."] }),
  // Last came a week ago with nothing booked: the Journey reads Drifting, and At risk comes a week on.
  client("adelard", "Adelard", "Took", { lastVisitDate: T(-7), nextBookingDate: null, runOutDate: T(98) }),
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  failures.cycles = false;
  // The page remembers its view and lens until sign-out: each test starts as a fresh sign-in.
  forgetPersonalMemory();
  vi.useRealTimers();
});

async function mount(list: Client[] = clients, onOpenClient: (id: string) => void = () => {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <AheadPage studio={studio} studios={[studio]} clients={list} rosterStatus="ready" trainers={trainers} authTrainer={lead} onOpenClient={onOpenClient} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return host;
}

const press = async (b: Element | null | undefined) => {
  if (!b) throw new Error("button not found");
  await act(async () => (b as HTMLElement).click());
};
const button = (el: ParentNode, label: string) =>
  [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label);
const weekCard = (el: HTMLElement, title: string) => [...el.querySelectorAll<HTMLElement>(".ops-ah-week")].find((w) => w.getAttribute("aria-label") === title);
const rowsIn = (el: ParentNode) => [...el.querySelectorAll(".ops-ah-row")].map((r) => `${r.querySelector(".adm-badge")?.textContent}: ${r.querySelector(".ops-ah-row__name")?.textContent}`);

describe("Operations → Ahead", () => {
  it("lays every client's dates on the weeks they land, with the counts and the client it can't place", async () => {
    const el = await mount();
    expect(el.querySelector(".adm-head__title")?.textContent).toBe("Ahead");
    const counts = el.querySelector(".ops-counts__line")?.textContent ?? "";
    // Maureen's talk is the one in the next eight weeks; Gordon's and Linda's come later.
    expect(counts).toContain("1 talk due");
    expect(counts).toContain("banked at a charge");
    // This week: Maureen's talk is now, and Adelard turns At risk if nothing is booked.
    const thisWeek = weekCard(el, "This week")!;
    expect(rowsIn(thisWeek)).toContain("Talk now: Maureen Kowalski");
    expect(thisWeek.textContent).toContain("Dana Reyes");
    // Gordon's charge window opens 30 days before Nov 20, with who last talked read in.
    const window = [...el.querySelectorAll(".ops-ah-row")].find((r) => r.textContent?.includes("Before the charge"));
    expect(window?.textContent).toContain("Gordon Pell");
    expect(window?.textContent).toContain("about 22 banked (20–23)");
    // Linda runs out a month before it renews, with the range.
    const out = [...el.querySelectorAll(".ops-ah-row")].find((r) => r.textContent?.includes("Runs out"));
    expect(out?.textContent).toContain("Out of sessions around Dec 6");
    expect(out?.textContent).toContain("between Nov 28 and Dec 16");
    // Grace is back from away.
    expect(el.textContent).toContain("Back from snowbird around Nov 16");
    // Omar is counted, never dropped, with the reason behind Show.
    expect(el.textContent).toContain("1 client can't be placed yet");
    await press(button(el, "Show"));
    expect(el.querySelector(".ops-ah-cant__list")?.textContent).toContain("isn't matched to a package");
    // The strip: one bar a week, tapped by month.
    expect(el.querySelectorAll(".ops-ah-strip__col")).toHaveLength(26);
    expect(button(el, "Jump to November 2026")).toBeTruthy();
  });

  it("says when a client may slip, and only off the Journey's own lines", async () => {
    const el = await mount();
    const slip = [...el.querySelectorAll(".ops-ah-row")].find((r) => r.textContent?.includes("May slip"));
    expect(slip?.textContent).toContain("Adelard Took");
    expect(slip?.textContent).toContain("Turns At risk if nothing is booked");
  });

  it("a lens keeps one kind and folds the empty weeks into All clear", async () => {
    const el = await mount();
    await press(button(el, "Runs out early"));
    expect([...el.querySelectorAll(".ops-ah-row")].map((r) => r.querySelector(".ops-ah-row__name")?.textContent)).toEqual(["Linda Ferrante"]);
    expect(el.querySelectorAll(".ops-ah-clear").length).toBeGreaterThan(2);
    expect(el.querySelector(".ops-ah-clear")?.textContent).toContain("All clear");
    // This week is always drawn, even with nothing in it.
    expect(weekCard(el, "This week")?.textContent).toContain("Nothing to decide this week.");
  });

  it("opens a client's panel with the renewals dashboard's own row, and Open client goes to the client", async () => {
    const opened: string[] = [];
    const el = await mount(clients, (id) => opened.push(id));
    const gordon = [...el.querySelectorAll<HTMLButtonElement>(".ops-ah-row__main")].find((b) => b.textContent?.includes("Gordon Pell"));
    await press(gordon);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const peek = document.body.querySelector(".ops-ah-peek");
    expect(peek).toBeTruthy();
    expect(peek?.querySelector(".ops-ah-peek__name")?.textContent).toBe("Gordon Pell");
    expect(peek?.textContent).toContain("Next here");
    // The dashboard's row, the same one Renewals draws: who last talked is read in.
    expect(peek?.querySelector(".rr")).toBeTruthy();
    expect(peek?.textContent).toContain("Talked Oct 2");
    await press(button(peek!, "Open client"));
    expect(opened).toEqual(["gordon"]);
  });

  it("the Clients view puts what needs you first and counts who it can't place", async () => {
    const el = await mount();
    await press(button(el, "Clients"));
    const groups = [...el.querySelectorAll(".ops-ah-group__t")].map((g) => g.textContent);
    expect(groups[0]).toBe("Needs you now");
    expect(groups).toContain("Can't place yet");
    const now = el.querySelector("[aria-label='Needs you now']")?.textContent ?? "";
    expect(now).toContain("Maureen Kowalski");
    expect(now).toContain("Adelard Took");
    expect(el.querySelector("[aria-label=\"Can't place yet\"]")?.textContent).toContain("Omar Siddiqui");
    // The two clocks: a bar and an end tick, and the legend that says them.
    expect(el.querySelectorAll(".ops-ah-clock__seg--bar").length).toBeGreaterThan(0);
    expect(el.querySelector(".ops-ah-legend")?.textContent).toContain("Banked at the charge");
  });

  it("a trainer remembered from elsewhere never empties the page", async () => {
    // Two trainers here, so the picker is drawn: Linda trains with Tess.
    const here = clients.map((c) => (c.id === "linda" ? ({ ...c, renewal: { ...(c.renewal as object), primaryTrainerId: "t-tess" } } as unknown as Client) : c));
    trainers.push({ id: "t-tess", fullName: "Tess Ward", primaryHomeStudioId: "westlake" } as unknown as Trainer);
    let el = await mount(here);
    const select = el.querySelector<HTMLSelectElement>("select[aria-label='Trainer']")!;
    await act(async () => {
      select.value = "t-dana";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // Another studio: nobody's primary trainer is Dana there.
    act(() => root?.unmount());
    host?.remove();
    const elsewhere = clients.map((c) => ({ ...c, renewal: { ...(c.renewal as object), primaryTrainerId: "t-other" } }) as unknown as Client);
    el = await mount(elsewhere);
    expect([...el.querySelectorAll(".ops-ah-row__name")].map((n) => n.textContent)).toContain("Maureen Kowalski");
    trainers.pop();
  });

  it("says so when the conversations can't be read, and never 'nobody has talked'", async () => {
    failures.cycles = true;
    const el = await mount();
    expect(el.textContent).toContain("Who last talked, and the plans, couldn't be read just now");
    expect(el.textContent).not.toContain("nobody has talked yet");
  });
});

// @vitest-environment jsdom
/**
 * OPERATIONS → MONTH MOUNTS — the four lists for a month, the arrows to
 * another month and back, a row opening the client, an unknown renewal
 * counted rather than dropped, a guessed anniversary said to be a guess,
 * and the MIA list only once the Journey is ready (Sep 29 2026).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const NOW = new Date("2026-09-29T13:00:00Z"); // Tuesday Sep 29, 9 AM Eastern
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);
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
  const booking = (id: string, clientId: string, trainerId: string, day: string, hm: string) => ({
    id,
    clientId,
    clientName: clientId,
    trainerId,
    studioId: "westlake",
    startTime: eastern(day, hm),
    endTime: new Date(eastern(day, hm).getTime() + 30 * 60_000),
    status: "Scheduled",
  });
  const answer = (path: string) => {
    if (path === "schedules") return snap([booking("b1", "frodo", "t-ber", "2026-09-29", "11:00")]);
    if (path === "studios/westlake/renewals")
      return snap([{ id: "c-frodo", clientId: "frodo", clientName: "Frodo Took", cycleKey: "c-frodo", packageKey: null, lastTouchAt: new Date("2026-09-20T15:00:00Z"), lastTouchByName: "Sam", latestLeaning: "leaning-yes" }]);
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
    serverTimestamp: () => new Date(),
  };
});

import { MonthPage } from "./MonthPage";
import type { Client, Studio, Trainer } from "../../../types";

const studio = { id: "westlake", name: "Westlake", timezone: "America/New_York" } as unknown as Studio;
const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake" } as unknown as Trainer;
const trainers = [lead, { id: "t-ber", fullName: "Beregond Guard", primaryHomeStudioId: "westlake" }] as unknown as Trainer[];

const snap = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  situation: "on-track",
  pacePerWeek: 2,
  proof: { weeksObserved: 12, weeksAttended: 12 },
  flags: [],
  lastVisitDate: "2026-09-26",
  nextBookingDate: null,
  primaryTrainerId: "t-ber",
  packageLabel: "Committed · 12 months",
  cycleKey: null,
  focusDate: "2027-03-01",
  chargeDateSource: "mindbody",
  sessionsLeft: 40,
  paymentMode: "monthly",
  conversationDue: false,
  chargeWarning: false,
  renewalOnBooks: null,
  computedAt: new Date("2026-09-29T06:31:00Z"),
  ...extra,
});
const client = (id: string, first: string, last: string, renewal: Record<string, unknown> | null, extra: Record<string, unknown> = {}) =>
  ({ id, firstName: first, lastName: last, isActive: true, homeStudioId: "westlake", ...(renewal ? { renewal: snap(renewal) } : {}), ...extra }) as unknown as Client;

const clients = [
  client("frodo", "Frodo", "Baggins", { cycleKey: "c-frodo", focusDate: "2026-10-12", conversationDue: true, sessionsLeft: 8 }, { dateOfBirth: "1968-09-22" }),
  client("sam", "Sam", "Gamgee", { cycleKey: "c-sam", focusDate: "2026-10-03", chargeWarning: true }, { firstStudioDay: "2019-10-06" }),
  client("rosie", "Rosie", "Cotton", { focusDate: "2026-11-20" }, { dateOfBirth: "1956-10-14", firstAppointmentDate: "2024-10-20T15:00:00Z" }),
  client("adelard", "Adelard", "Took", { lastVisitDate: "2026-09-18" }), // drifting
  client("mungo", "Mungo", "Baggins", { lastVisitDate: "2026-09-08" }), // at risk
  client("gollum", "Gollum", "Smeagol", { situation: "unknown", focusDate: null }),
  client("galdor", "Galdor", "Havens", null),
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  failures.cycles = false;
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
        <MonthPage studio={studio} studios={[studio]} clients={list} trainers={trainers} authTrainer={lead} onOpenClient={onOpenClient} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return host;
}

const section = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`#brief-month-${id}`)!;
const names = (el: HTMLElement, id: string) => [...section(el, id).querySelectorAll(".ops-jr-row__name")].map((n) => n.textContent);
const press = async (b: HTMLElement | null | undefined) => {
  if (!b) throw new Error("button not found");
  await act(async () => b.click());
};
const button = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label);

describe("Operations → Month", () => {
  it("opens on this month with the four lists, counts an unknown renewal, and says what is MIA today", async () => {
    const el = await mount();
    expect(el.textContent).toContain("September 2026");
    expect(el.textContent).toContain("this month");
    // September: Frodo's birthday; no package ends; MIA from the Journey.
    expect(names(el, "birthdays")).toEqual(["Frodo Baggins"]);
    expect(section(el, "birthdays").textContent).toContain("Turns 58 on Tue, Sep 22.");
    expect(section(el, "renewals").textContent).toContain("No package ends in September 2026.");
    expect(section(el, "renewals").textContent).toContain("1 client's timing unknown");
    expect(names(el, "mia")).toEqual(["Adelard Took", "Mungo Baggins"]);
    expect(section(el, "mia").textContent).toContain("1 drifting · 1 at risk · 0 lapsed");
    expect(section(el, "mia").textContent).toContain("1 can't be judged yet");
    expect(el.textContent).toContain("2 clients are MIA today");
  });

  it("goes to next month, where the renewals, a birthday and the anniversaries are, and a guessed anniversary says so", async () => {
    const el = await mount();
    await press(button(el, "Next month"));
    expect(el.textContent).toContain("October 2026");
    expect(names(el, "renewals")).toEqual(["Sam Gamgee", "Frodo Baggins"]);
    const renewals = section(el, "renewals").textContent ?? "";
    expect(renewals).toContain("Before the charge");
    expect(renewals).toContain("Talk now");
    expect(renewals).toContain("Last talked to by Sam — leaning yes.");
    expect(renewals).toContain("1 nobody has talked to yet");
    expect(names(el, "birthdays")).toEqual(["Rosie Cotton"]);
    expect(section(el, "birthdays").textContent).toContain("Turns 70");
    // Rosie's is Mindbody's date, not yet confirmed: counted, not listed (Oct 2 2026).
    expect(names(el, "anniversaries")).toEqual(["Sam Gamgee"]);
    const anniversaries = section(el, "anniversaries").textContent ?? "";
    expect(anniversaries).toContain("7 years with the studio on Tue, Oct 6.");
    expect(anniversaries).toContain("set on their profile");
    expect(anniversaries).toContain("1 more waits for a confirmed first day — confirm it on Account");
    // MIA is as of today whichever month is open.
    expect(section(el, "mia").textContent).toContain("as of today");
    expect(el.textContent).toContain("October will have 2 renewals, 1 birthday and 1 anniversary.");
    await press(button(el, "This month"));
    expect(el.textContent).toContain("September 2026");
  });

  it("opens a client inside Operations from any row", async () => {
    const opened: string[] = [];
    const el = await mount(clients, (id) => opened.push(id));
    await press(section(el, "mia").querySelector<HTMLButtonElement>(".ops-jr-row"));
    expect(opened).toEqual(["adelard"]);
  });

  it("never says 'nobody has talked to them' off a failed read of the conversations", async () => {
    failures.cycles = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await mount();
    await press(button(el, "Next month"));
    warn.mockRestore();
    const renewals = section(el, "renewals").textContent ?? "";
    expect(renewals).toContain("the conversations couldn't be read");
    expect(renewals).not.toContain("Nobody has talked to them yet");
    expect(renewals).toContain("couldn't be read just now");
  });
});

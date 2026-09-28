// @vitest-environment jsdom
/**
 * CLIENTS → JOURNEY MOUNTS — the state strip counts every home client once,
 * a state's list reads catchable first, the lenses recount, "too new to
 * judge" names who can't be judged yet, a client opens inside Operations, and
 * an unread week or a nightly record that stopped changing is never a list of
 * slipping clients (the redesign's Operations room, phase 4).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const NOW = new Date("2026-09-28T13:00:00Z"); // Monday 9 AM Eastern
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);
const failures = vi.hoisted(() => ({ week: false, cases: [] as Array<Record<string, unknown>> }));

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
    if (path === "schedules") return snap([booking("b1", "hamfast", "t-ber", "2026-09-28", "11:00"), booking("b2", "rosie", "t-mab", "2026-10-01", "10:00")]);
    if (path === "studios/westlake/watchlist") return snap([{ id: "halbarad", clientId: "halbarad", snoozedUntil: "2026-10-05", dismissedAt: null }]);
    if (path === "studios/westlake/cases") return snap(failures.cases);
    return snap([]);
  };
  return {
    collection: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown, c?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const fail = (typeof a === "function" ? b : c) as ((e: unknown) => void) | undefined;
      const t = setTimeout(() => {
        if (target.path === "schedules" && failures.week) fail?.(new Error("permission-denied"));
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

import { JourneyPage } from "./JourneyPage";
import type { Client, Studio, Trainer } from "../../../types";

const studio = { id: "westlake", name: "Westlake", timezone: "America/New_York" } as unknown as Studio;
const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake" } as unknown as Trainer;
const trainers = [lead, { id: "t-ber", fullName: "Beregond Guard", primaryHomeStudioId: "westlake" }, { id: "t-mab", fullName: "Mablung Ranger", primaryHomeStudioId: "westlake" }] as unknown as Trainer[];

const snap = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  situation: "on-track",
  pacePerWeek: 2,
  proof: { weeksObserved: 12, weeksAttended: 12 },
  flags: [],
  lastVisitDate: "2026-09-26",
  nextBookingDate: null,
  primaryTrainerId: "t-ber",
  focusDate: "2027-03-01",
  conversationDue: false,
  chargeWarning: false,
  renewalOnBooks: null,
  computedAt: new Date("2026-09-28T06:31:00Z"),
  ...extra,
});
const client = (id: string, first: string, last: string, renewal: Record<string, unknown> | null, extra: Record<string, unknown> = {}) =>
  ({ id, firstName: first, lastName: last, isActive: true, homeStudioId: "westlake", ...(renewal ? { renewal: snap(renewal) } : {}), ...extra }) as unknown as Client;

const clients = [
  client("adelard", "Adelard", "Took", { lastVisitDate: "2026-09-18" }),
  client("estella", "Estella", "Bolger", { lastVisitDate: "2026-09-20", primaryTrainerId: "t-mab" }),
  client("halbarad", "Halbarad", "Dunedain", { lastVisitDate: "2026-09-19" }),
  client("mungo", "Mungo", "Baggins", { lastVisitDate: "2026-09-08" }),
  client("rosie", "Rosie", "Cotton", { lastVisitDate: "2026-09-05" }),
  client("hamfast", "Hamfast", "Gamgee", { conversationDue: true, focusDate: "2026-10-12" }),
  client("holman", "Holman", "Greenhand", { pacePerWeek: null }, { sessionCount: 4, clientsNumberOfVisitsAtSite: 4 }),
  client("odo", "Odo", "Proudfoot", { pacePerWeek: null }),
  client("galdor", "Galdor", "Havens", null),
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  failures.week = false;
  failures.cases = [];
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
        <JourneyPage studio={studio} studios={[studio]} clients={list} trainers={trainers} authTrainer={lead} onOpenClient={onOpenClient} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return host;
}

const stop = (el: HTMLElement, name: string) => [...el.querySelectorAll<HTMLButtonElement>(".ops-stop, .ops-bchip")].find((b) => b.textContent?.includes(name))!;
const press = async (b: HTMLElement) => {
  await act(async () => b.click());
};
const listNames = (el: HTMLElement) => [...el.querySelectorAll(".ops-jr-row__name")].map((n) => n.textContent);

describe("Clients → Journey", () => {
  it("counts every home client once on the line and beside it", async () => {
    const el = await mount();
    const count = (name: string) => stop(el, name).querySelector(".ops-stop__n, b")?.textContent;
    expect(count("Drifting")).toBe("3");
    expect(count("At risk")).toBe("1");
    expect(count("Steady")).toBe("1");
    expect(count("New")).toBe("1");
    expect(count("Back")).toBe("1");
    expect(count("Unknown")).toBe("2");
    expect(el.textContent).toContain("9 active clients");
    expect(el.textContent).toContain("This week: 4 crossed a line and started slipping");
  });

  it("reads a slipping list catchable first, and a client a leader answered last", async () => {
    const el = await mount();
    // Adelard's trainer (Beregond) is in today; Estella's (Mablung) isn't; Halbarad is snoozed.
    expect(listNames(el)).toEqual(["Adelard Took", "Estella Bolger", "Halbarad Dunedain"]);
    expect(el.querySelector(".ops-jr-row")?.textContent).toContain("Beregond is in today, 11:00 AM – 11:30 AM");
    expect(el.textContent).toContain("snoozed");
  });

  it("shows who owns a stored case, and when it is due (wave 2)", async () => {
    failures.cases = [
      {
        id: "estella",
        clientId: "estella",
        clientName: "Estella Bolger",
        owner: { id: "t-ber", name: "Beregond Guard" },
        nextStep: "Beregond phones her after his shift.",
        dueOn: "2026-10-01",
        outcome: "open",
        openedAt: new Date("2026-09-27T14:00:00Z"),
        updatedAt: new Date("2026-09-27T14:00:00Z"),
        updatedBy: "lead",
      },
    ];
    const el = await mount();
    const row = [...el.querySelectorAll(".ops-jr-row")].find((r) => r.textContent?.includes("Estella Bolger"));
    expect(row?.textContent).toContain("case: Beregond owns it, due Thu, Oct 1");
  });

  it("names who is too new to judge, and opens a client inside Operations", async () => {
    const opened: string[] = [];
    const el = await mount(clients, (id) => opened.push(id));
    const tooNew = el.querySelector(".ops-toonew")?.textContent ?? "";
    expect(tooNew).toContain("Too new to judge (1)");
    expect(tooNew).toContain("Odo Proudfoot");
    await press(el.querySelector<HTMLButtonElement>(".ops-jr-row")!);
    expect(opened).toEqual(["adelard"]);
  });

  it("recounts through a lens, and groups Unknown by why", async () => {
    const el = await mount();
    await press([...el.querySelectorAll<HTMLButtonElement>("[aria-label='Lens'] button")].find((b) => b.textContent === "Renewal window")!);
    expect(stop(el, "Steady").querySelector(".ops-stop__n")?.textContent).toBe("1");
    expect(stop(el, "Drifting").querySelector(".ops-stop__n")?.textContent).toBe("0");
    await press([...el.querySelectorAll<HTMLButtonElement>("[aria-label='Lens'] button")].find((b) => b.textContent === "All clients")!);
    await press(stop(el, "Unknown"));
    const text = el.textContent ?? "";
    expect(text).toContain("No nightly record for them yet (1)");
    expect(text).toContain("Too new to judge: not enough visits for a usual gap yet (1)");
  });

  it("calls nobody slipping while the week's bookings can't be read", async () => {
    failures.week = true;
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const el = await mount();
    alert.mockRestore();
    expect(stop(el, "Drifting").querySelector(".ops-stop__n")?.textContent).toBe("0");
    expect(el.textContent).toContain("anyone past a line reads Unknown, never slipping");
  });

  it("with a nightly record that stopped changing, every client is Unknown and the page says why", async () => {
    const stale = clients.map((c) => (c.renewal ? ({ ...c, renewal: { ...c.renewal, computedAt: new Date("2026-09-20T06:31:00Z") } } as Client) : c));
    const el = await mount(stale);
    expect(el.textContent).toContain("The nightly record hasn't changed since Sun, Sep 20");
    expect(stop(el, "Unknown").querySelector("b")?.textContent).toBe("9");
  });
});

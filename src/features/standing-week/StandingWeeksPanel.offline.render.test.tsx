// @vitest-environment jsdom
/**
 * OFFLINE IS "CAN'T TELL", NEVER "OPEN" (voice review follow-up, Sep 27 2026).
 *
 * Mounted with the REAL bookings read (admin/changes/useWeekSchedule) over a
 * fake listener, because the hole was in the read: Firestore keeps a
 * persistent cache here, and a snapshot only the cache answered used to reach
 * the week check as a finished read, so an iPad with no connection listed
 * every agreed slot the cache lacked as open, with a Free slot badge.
 *
 * Also the Operations Overview's side of the same hook: without the opt-in it
 * listens exactly as it always has.
 *
 * Today is Monday Sep 28 2026, noon Eastern. Ann's agreed week has Judy Smith
 * on Mondays at 8:00.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Studio, Trainer } from "../../types";
import type { StandingWeekDoc } from "./week";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = { args: unknown[]; next: (snap: unknown) => void; fail: (err: unknown) => void };
const fake = vi.hoisted(() => ({
  listeners: [] as Listener[],
  weeks: { docs: [] as unknown[], loading: false, error: null as string | null },
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-pat" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    query: (ref: unknown, ...rest: unknown[]) => ({ ref, rest }),
    where: (...args: unknown[]) => ({ where: args }),
    orderBy: (...args: unknown[]) => ({ orderBy: args }),
    onSnapshot: (...args: unknown[]) => {
      const fns = args.filter((a): a is (x: unknown) => void => typeof a === "function");
      fake.listeners.push({ args, next: fns[0], fail: fns[1] });
      return () => {};
    },
  };
});
vi.mock("../../lib/firestore-errors", () => ({ OperationType: { GET: "get" }, handleFirestoreError: () => {} }));
vi.mock("./useStandingWeeks", () => ({ useStandingWeeks: () => fake.weeks }));

import { StandingWeeksPanel } from "./StandingWeeksPanel";
import { useWeekSchedule, type WeekSchedule } from "../admin/changes/useWeekSchedule";

const studio = { id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957" } as unknown as Studio;
const person = (id: string, fullName: string) =>
  ({ id, fullName, initials: "", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: [] }) as unknown as Trainer;
const annWeek = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [{ id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" }] };
const annDoc: StandingWeekDoc = {
  id: "t-ann",
  studioId: "solon",
  trainerUid: "t-ann",
  trainerId: "t-ann",
  trainerName: "Ann Park",
  proposed: annWeek,
  final: annWeek,
  finalAt: new Date("2026-09-20T14:00:00Z"),
  finalBy: { id: "uid-pat", name: "Pat Doe" },
};

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
};
/** Hand every bookings listener the same answer. */
const answer = async (fromCache: boolean, docs: { id: string; data: () => unknown }[] = []) => {
  await act(async () => {
    for (const l of fake.listeners) l.next({ docs, metadata: { fromCache, hasPendingWrites: false } });
  });
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-28T12:00:00-04:00") });
  fake.listeners.length = 0;
  fake.weeks = { docs: [annDoc], loading: false, error: null };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setOnline(true);
  vi.useRealTimers();
});

const stateLine = () => host.querySelector("[data-testid='week-check-state']")?.textContent ?? "";

describe("the week check on a cache-only snapshot", () => {
  it("waits for the server, says can't tell offline, and checks once the server answers", async () => {
    await act(async () => {
      root.render(<StandingWeeksPanel studio={studio} authTrainer={person("t-pat", "Pat Doe")} trainers={[person("t-ann", "Ann Park")]} clients={[]} />);
    });
    // Both bookings streams listen for the server's confirmation.
    expect(fake.listeners).toHaveLength(2);
    for (const l of fake.listeners) expect(l.args[1]).toEqual({ includeMetadataChanges: true });

    // The cache answers alone, with nothing for Monday: not an answer.
    await answer(true);
    expect(stateLine()).toBe("Reading the week's bookings…");
    expect(host.textContent).not.toContain("Free slot");
    expect(host.textContent).not.toContain("is open");

    // The iPad is offline: can't tell, in its own sentence.
    await act(async () => setOnline(false));
    expect(stateLine()).toContain("Can't tell: this iPad can't reach the week's bookings just now");
    expect(host.textContent).not.toContain("Free slot");

    // Back online, and the server confirms: now the empty Monday is an answer.
    await act(async () => setOnline(true));
    await answer(false);
    expect(host.textContent).toContain("Ann's Mon, Sep 28 at 8:00 AM is open: Judy Smith isn't booked for it.");
    expect(host.textContent).toContain("Free slot");
  });

  it("says can't tell once the server has kept it waiting", async () => {
    await act(async () => {
      root.render(<StandingWeeksPanel studio={studio} authTrainer={person("t-pat", "Pat Doe")} trainers={[person("t-ann", "Ann Park")]} clients={[]} />);
    });
    await answer(true);
    expect(stateLine()).toBe("Reading the week's bookings…");
    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(stateLine()).toContain("Can't tell");
  });
});

describe("the first frame of a read", () => {
  it("never paints a Free slot before the bookings are read, when the weeks arrive", async () => {
    // The weeks are still being read, so nothing needs the bookings yet.
    fake.weeks = { docs: [], loading: true, error: null };
    const panel = () => <StandingWeeksPanel studio={studio} authTrainer={person("t-pat", "Pat Doe")} trainers={[person("t-ann", "Ann Park")]} clients={[]} />;
    await act(async () => root.render(panel()));
    expect(fake.listeners).toHaveLength(0);

    // Every node the panel ever adds, however briefly it stays.
    const added: string[] = [];
    const watch = new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) added.push(n.textContent ?? "");
    });
    watch.observe(host, { childList: true, subtree: true, characterData: true });
    // The weeks arrive: the render that starts needing the bookings still
    // held the idle read, "nothing booked", and listed Ann's 8:00 as open.
    fake.weeks = { docs: [annDoc], loading: false, error: null };
    await act(async () => root.render(panel()));
    await act(async () => {});
    watch.disconnect();
    for (const r of watch.takeRecords()) for (const n of r.addedNodes) added.push(n.textContent ?? "");
    expect(fake.listeners).toHaveLength(2);
    expect(added.join(" ")).not.toContain("Free slot");
    expect(added.join(" ")).not.toContain("is open");
    expect(stateLine()).toBe("Reading the week's bookings…");
  });

  it("reports the new read as loading in the very render its studio or day changes", async () => {
    const seen: { studioId: string | null; today: string; value: WeekSchedule }[] = [];
    function Probe({ studioId, today }: { studioId: string | null; today: string }) {
      // Recorded in the render body, not an effect, so act() can't hide a frame.
      seen.push({ studioId, today, value: useWeekSchedule(studioId, today, "America/New_York", { confirmed: true }) });
      return null;
    }
    await act(async () => root.render(<Probe studioId={null} today="2026-09-28" />));
    expect(seen.at(-1)!.value).toMatchObject({ loading: false, failed: false, entries: [] });

    await act(async () => root.render(<Probe studioId="solon" today="2026-09-28" />));
    const first = seen.find((r) => r.studioId === "solon")!;
    expect(first.value).toMatchObject({ loading: true, failed: false, fromCache: false, entries: [] });

    // Answered, then the studio's midnight: yesterday's answer is not today's.
    await answer(false, [{ id: "b1", data: () => ({ clientName: "Judy Smith", status: "Scheduled" }) }]);
    expect(seen.at(-1)!.value).toMatchObject({ loading: false });
    expect(seen.at(-1)!.value.entries).toHaveLength(1);
    await act(async () => root.render(<Probe studioId="solon" today="2026-09-29" />));
    const nextDay = seen.find((r) => r.today === "2026-09-29")!;
    expect(nextDay.value).toMatchObject({ loading: true, failed: false, fromCache: false, entries: [] });
  });
});

describe("the Overview's read of the same week", () => {
  it("listens as it always has, and never reports the cache flag", async () => {
    let seen: WeekSchedule | null = null;
    function Overview() {
      seen = useWeekSchedule("solon", "2026-09-28", "America/New_York");
      return null;
    }
    await act(async () => root.render(<Overview />));
    expect(fake.listeners).toHaveLength(2);
    // (query, next, fail): no options object.
    for (const l of fake.listeners) expect(typeof l.args[1]).toBe("function");
    await answer(true, [{ id: "b1", data: () => ({ clientName: "Judy Smith", status: "Scheduled" }) }]);
    expect(seen).toMatchObject({ loading: false, failed: false, fromCache: false });
    expect(seen!.entries).toHaveLength(1);
  });
});

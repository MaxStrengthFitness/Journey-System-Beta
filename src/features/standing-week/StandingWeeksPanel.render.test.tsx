// @vitest-environment jsdom
/**
 * MY STUDIO → TEAM → STANDING WEEKS (voice-review round, Sep 27 2026),
 * mounted: a leader sees whose week is waiting and which slots are free this
 * week, agrees a proposal as it is or changed, and removes a week. A day
 * whose bookings weren't read is never called open.
 *
 * Today is Monday Sep 28 2026, noon Eastern.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ScheduleEntry, Studio, Trainer } from "../../types";
import type { StandingWeekDoc } from "./week";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  writes: [] as { op: "set" | "delete"; path: string; data?: Record<string, unknown>; options?: unknown }[],
  weeks: { docs: [] as StandingWeekDoc[], loading: false, error: null as string | null },
  schedule: { entries: [] as unknown[], loading: false, failed: false },
  /** The studio each render asked useWeekSchedule for (null: no read). */
  scheduleAsked: [] as (string | null)[],
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-pat" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    onSnapshot: () => () => {},
    setDoc: async (r: { path: string }, data: Record<string, unknown>, options?: unknown) => {
      fake.writes.push({ op: "set", path: r.path, data, options });
    },
    deleteDoc: async (r: { path: string }) => {
      fake.writes.push({ op: "delete", path: r.path });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});
vi.mock("./useStandingWeeks", () => ({ useStandingWeeks: () => fake.weeks }));
vi.mock("../admin/changes/useWeekSchedule", () => ({
  useWeekSchedule: (studioId: string | null) => {
    fake.scheduleAsked.push(studioId);
    return fake.schedule;
  },
}));

import { StandingWeeksPanel } from "./StandingWeeksPanel";
import { UnsavedChangesProvider } from "../unsaved-changes";

const studio = { id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957" } as unknown as Studio;
const person = (id: string, fullName: string) =>
  ({ id, fullName, initials: "", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: [] }) as unknown as Trainer;
const trainers = [person("t-sam", "Sam Lee"), person("t-ann", "Ann Park")];
const pat = person("t-pat", "Pat Doe");
const clients = [{ id: "c-judy", firstName: "Judy", lastName: "Smith", isActive: true }] as unknown as Client[];

const judyMon = { id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" };
const annWeek = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [judyMon] };
const samProposal = { hours: [{ weekday: 2, from: "12:00", to: "18:00" }], regulars: [] };
const weekDoc = (id: string, over: Partial<StandingWeekDoc>): StandingWeekDoc => ({
  id,
  studioId: "solon",
  trainerUid: id,
  trainerId: id,
  trainerName: "",
  proposed: null,
  final: null,
  ...over,
});

const booking = (day: string, clock: string, over: Partial<ScheduleEntry> = {}) =>
  ({
    id: `${day}-${clock}`,
    clientId: "c-judy",
    clientName: "Judy Smith",
    trainerId: "t-ann",
    trainerName: "Ann Park",
    studioId: "solon",
    startTime: new Date(`${day}T${clock}:00-04:00`),
    status: "Scheduled",
    ...over,
  }) as ScheduleEntry;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-28T12:00:00-04:00") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fake.writes.length = 0;
  fake.scheduleAsked.length = 0;
  fake.weeks = {
    docs: [
      weekDoc("t-sam", { trainerName: "Sam Lee", proposed: samProposal, proposedAt: new Date("2026-09-27T14:00:00Z") }),
      weekDoc("t-ann", { trainerName: "Ann Park", proposed: annWeek, final: annWeek, finalAt: new Date("2026-09-20T14:00:00Z"), finalBy: { id: "uid-pat", name: "Pat Doe" } }),
    ],
    loading: false,
    error: null,
  };
  fake.schedule = { entries: [], loading: false, failed: false };
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

async function mount(s: Studio = studio) {
  await act(async () => {
    root.render(
      <StrictMode>
        <StandingWeeksPanel studio={s} authTrainer={pat} trainers={trainers} clients={clients} />
      </StrictMode>,
    );
  });
}

const button = (label: string) => {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent?.trim() === label || x.getAttribute("aria-label") === label);
  if (!b) throw new Error(`No button "${label}" in: ${[...host.querySelectorAll("button")].map((x) => x.getAttribute("aria-label") ?? x.textContent).join(" | ")}`);
  return b as HTMLButtonElement;
};
const click = async (label: string) => {
  await act(async () => {
    button(label).click();
  });
};

describe("Standing weeks on Team", () => {
  it("says whose week is waiting, and which agreed slot is free this week", async () => {
    await mount();
    expect(host.textContent).toContain("Sam has a week waiting to be agreed.");
    const findings = host.querySelector("[aria-label='Where the bookings differ from the agreed weeks']");
    expect(findings?.textContent).toContain("Ann's Mon, Sep 28 at 8:00 AM is open: Judy Smith isn't booked for it.");
    expect(findings?.textContent).toContain("Free slot");
    // People by name, never ranked: Ann before Sam although Sam's is the one waiting.
    expect([...host.querySelectorAll(".adm-row__name")].map((n) => n.textContent)).toEqual(["Ann Park", "Sam Lee"]);
  });

  it("says nothing is out of place when the regular is booked as usual", async () => {
    fake.schedule = { entries: [booking("2026-09-28", "08:00")], loading: false, failed: false };
    await mount();
    expect(host.querySelector("[data-testid='week-check-state']")?.textContent).toBe("All 1 agreed slot is booked as usual for the next seven days.");
  });

  it("never calls a slot open when the bookings weren't read, or can't be", async () => {
    fake.schedule = { entries: [], loading: false, failed: true };
    await mount();
    expect(host.querySelector("[data-testid='week-check-state']")?.textContent).toContain("nothing here says a slot is open");
    act(() => root.unmount());
    root = createRoot(host);
    fake.schedule = { entries: [], loading: false, failed: false };
    await mount({ ...studio, mindbodyMode: "offline" } as Studio);
    expect(host.querySelector("[data-testid='week-check-state']")?.textContent).toBe(
      "Mindbody isn't connected for this studio, so the week can't be checked against bookings.",
    );
  });

  it("agrees a proposal as it stands, signed by the leader", async () => {
    await mount();
    await click("Review: Sam Lee");
    expect(host.querySelector("[aria-label=\"Sam Lee's week\"]")).not.toBeNull();
    await click("Agree this week");
    expect(fake.writes).toHaveLength(1);
    const w = fake.writes[0];
    expect(w.path).toBe("studios/solon/standingWeeks/t-sam");
    expect(w.options).toEqual({ merge: true });
    expect(w.data).toMatchObject({ final: samProposal, proposed: samProposal, finalBy: { id: "uid-pat", name: "Pat Doe" }, trainerId: "t-sam" });
    expect(host.querySelector("[aria-label=\"Sam Lee's week\"]")).toBeNull();
  });

  it("agrees a week changed first, and won't re-agree a week that already is", async () => {
    await mount();
    await click("Change: Ann Park");
    expect(button("Agree this week").disabled).toBe(true);
    await click("Remove Judy Smith from Monday");
    await click("Agree it as changed");
    expect(fake.writes[0].data).toMatchObject({ final: { hours: annWeek.hours, regulars: [] } });
  });

  it("removes a week only after asking", async () => {
    await mount();
    await click("Change: Ann Park");
    await click("Remove this week");
    expect(host.querySelector("[role='alertdialog']")?.textContent).toContain("Remove Ann's standing week?");
    expect(fake.writes).toHaveLength(0);
    await click("Remove it");
    expect(fake.writes).toEqual([{ op: "delete", path: "studios/solon/standingWeeks/t-ann" }]);
  });

  it("checks only the weeks of people who still work here", async () => {
    const leftBehind = weekDoc("t-gone", {
      trainerName: "Gone Away",
      final: { hours: [], regulars: [{ id: "g1", weekday: 1, start: "10:00", clientId: "c-judy", clientName: "Judy Smith" }] },
    });
    fake.weeks = { ...fake.weeks, docs: [...fake.weeks.docs, leftBehind] };
    await mount();
    const findings = host.querySelector("[aria-label='Where the bookings differ from the agreed weeks']");
    expect(findings?.textContent).not.toContain("Gone");
    expect(findings?.querySelectorAll("li")).toHaveLength(1);
    // Listed after the staff, so a leader can remove it.
    expect([...host.querySelectorAll(".adm-row__name")].map((n) => n.textContent)).toEqual(["Ann Park", "Sam Lee", "Gone Away"]);
  });

  it("reads the week's bookings only when there is an agreed week to check them against", async () => {
    fake.weeks = { ...fake.weeks, docs: [fake.weeks.docs[0]] }; // Sam's proposal only
    await mount();
    expect(fake.scheduleAsked.every((s) => s === null)).toBe(true);
    expect(host.querySelector("[data-testid='week-check-state']")?.textContent).toContain("No standing week is agreed yet");
    act(() => root.unmount());
    root = createRoot(host);
    fake.scheduleAsked.length = 0;
    await mount({ ...studio, mindbodyMode: "offline" } as Studio);
    expect(fake.scheduleAsked.every((s) => s === null)).toBe(true);
  });

  it("says once who is away, and leaves their days unchecked (voice review follow-up)", async () => {
    fake.weeks = { ...fake.weeks, docs: [fake.weeks.docs[0], { ...fake.weeks.docs[1], away: [{ id: "a1", from: "2026-09-28", to: "2026-09-28", note: "Dentist" }] }] };
    await mount();
    expect(host.querySelector("[aria-label='Away this week']")?.textContent).toBe("Ann is away on Mon, Sep 28.");
    expect(host.textContent).not.toContain("Free slot");
    expect(host.querySelector("[data-testid='week-check-state']")?.textContent).toBe("No agreed regular falls in the next seven days.");
  });

  it("lets a leader set a trainer's dates away from the review", async () => {
    await mount();
    await click("Change: Ann Park");
    await click("Dates away");
    const field = (label: string) => [...host.querySelectorAll("label")].find((l) => l.textContent?.startsWith(label))!.querySelector("input") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(field("To"), "2026-10-02");
      field("To").dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Save dates away");
    expect(fake.writes).toEqual([
      {
        op: "set",
        path: "studios/solon/standingWeeks/t-ann",
        options: { merge: true },
        data: { studioId: "solon", trainerUid: "t-ann", trainerId: "t-ann", trainerName: "Ann Park", away: [{ id: expect.any(String), from: "2026-09-28", to: "2026-10-02" }] },
      },
    ]);
  });

  it("follows the trainer's newer proposal while the review is untouched", async () => {
    await mount();
    await click("Review: Sam Lee");
    expect(host.querySelector("[aria-label='Tuesday: starts']")).not.toBeNull();
    // Sam proposes again while the leader is looking: Wednesday, not Tuesday.
    const again = { hours: [{ weekday: 3, from: "12:00", to: "18:00" }], regulars: [] };
    fake.weeks = { ...fake.weeks, docs: [{ ...fake.weeks.docs[0], proposed: again }, fake.weeks.docs[1]] };
    await mount();
    expect(host.querySelector("[aria-label='Tuesday: starts']")).toBeNull();
    expect(host.querySelector("[aria-label='Wednesday: starts']")).not.toBeNull();
    await click("Agree this week");
    expect(fake.writes[0].data).toMatchObject({ final: again });
  });
});

describe("a leader's changes never vanish (voice review follow-up)", () => {
  async function mountGuarded() {
    await act(async () => {
      root.render(
        <StrictMode>
          <UnsavedChangesProvider>
            <StandingWeeksPanel studio={studio} authTrainer={pat} trainers={trainers} clients={clients} />
          </UnsavedChangesProvider>
        </StrictMode>,
      );
    });
  }
  const bodyButton = (label: string) => {
    const b = [...document.body.querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
    if (!b) throw new Error(`No button "${label}" in the page`);
    return b as HTMLButtonElement;
  };
  const question = () => document.body.querySelector("[role='alertdialog']")?.textContent ?? "";

  it("asks before another person's review takes the changes away, and keeps them on Keep editing", async () => {
    await mountGuarded();
    await click("Change: Ann Park");
    await click("Remove Judy Smith from Monday");
    await click("Review: Sam Lee");
    expect(question()).toContain("You have unsaved changes to Ann's standing week. Leave without saving?");
    // Keep editing: Ann's week is still open, still changed.
    await act(async () => {
      bodyButton("Keep editing").click();
    });
    expect(host.querySelector("[aria-label=\"Ann Park's week\"]")).not.toBeNull();
    expect(host.querySelector("[aria-label=\"Sam Lee's week\"]")).toBeNull();
    expect(button("Agree it as changed")).toBeTruthy();
    // Tapping Ann's own button again, to close it, asks too; Leave goes.
    await click("Change: Ann Park");
    expect(question()).toContain("Ann's standing week");
    await act(async () => {
      bodyButton("Leave").click();
    });
    expect(host.querySelector("[aria-label=\"Ann Park's week\"]")).toBeNull();
    expect(fake.writes).toHaveLength(0);
  });

  it("moves between reviews without asking when nothing was changed", async () => {
    await mountGuarded();
    await click("Change: Ann Park");
    await click("Review: Sam Lee");
    expect(question()).toBe("");
    expect(host.querySelector("[aria-label=\"Sam Lee's week\"]")).not.toBeNull();
  });
});

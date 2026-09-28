// @vitest-environment jsdom
/**
 * MY STUDIO → TEAM → STANDING WEEKS (voice-review round, Sep 27 2026),
 * mounted: a leader sees whose week is waiting and how many slots are free
 * in the next 7 days, with a door to Openings, which lists them (Openings
 * round, phase 7); agrees a proposal as it is or changed, and removes a week.
 * A day whose bookings weren't read is never called open, and until the
 * server answers there is no line at all.
 *
 * Today is Monday Sep 28 2026, 7 AM Eastern: Ann's Monday 8:00 regular is
 * still ahead.
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
import { onMyStudioSectionRequest, rememberMyStudioSection, rememberedMyStudioSection } from "../my-studio/section-memory";
import { rememberOpeningsPart, rememberWhoseTimes, rememberedOpeningsPart, rememberedWhoseTimes } from "../openings/ui/part-memory";

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
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-28T07:00:00-04:00") });
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
const door = () => host.querySelector<HTMLButtonElement>("[data-testid='week-openings-door']");
const stateLine = () => host.querySelector("[data-testid='week-check-state']")?.textContent ?? null;

describe("Standing weeks on Team", () => {
  it("says whose week is waiting, and points to Openings for the free slot, naming no client", async () => {
    await mount();
    expect(host.textContent).toContain("Sam has a week waiting to be agreed.");
    // One line, the count Openings' Next 7 days lists, and it is the door.
    expect(door()?.textContent).toBe("1 free slot in the next 7 days · See it on Openings.");
    // The slots themselves are Openings': Team lists none and names no client.
    expect(host.querySelector("[aria-label='Where the bookings differ from the agreed weeks']")).toBeNull();
    expect(host.textContent).not.toContain("Judy Smith");
    expect(host.textContent).not.toContain("Free slot");
    expect(stateLine()).toBeNull();
    // People by name, never ranked: Ann before Sam although Sam's is the one waiting.
    expect([...host.querySelectorAll(".adm-row__name")].map((n) => n.textContent)).toEqual(["Ann Park", "Sam Lee"]);
  });

  it("the door opens Openings on Next 7 days for anyone, through My Studio's own move", async () => {
    rememberOpeningsPart("usual");
    rememberWhoseTimes({ kind: "you" });
    await mount();
    // With My Studio on screen, the door asks the shell (which asks about typing first).
    const asked: string[] = [];
    const stop = onMyStudioSectionRequest((next) => asked.push(next));
    await act(async () => door()!.click());
    stop();
    expect(asked).toEqual(["openings"]);
    expect(rememberedOpeningsPart()).toBe("next");
    expect(rememberedWhoseTimes()).toEqual({ kind: "anyone" });
    // With none on screen, it only remembers, so the next open lands there.
    rememberMyStudioSection("team");
    await act(async () => door()!.click());
    expect(rememberedMyStudioSection()).toBe("openings");
    rememberMyStudioSection("relay");
    rememberOpeningsPart("usual");
    rememberWhoseTimes(null);
  });

  it("counts two trainers' regulars out at one half-hour as two free slots", async () => {
    const bobMon = { id: "r2", weekday: 1, start: "08:00", clientId: "c-bob", clientName: "Bob Jones" };
    const samWeek = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [bobMon] };
    fake.weeks = { ...fake.weeks, docs: [{ ...fake.weeks.docs[0], proposed: samWeek, final: samWeek, finalAt: new Date("2026-09-20T14:00:00Z") }, fake.weeks.docs[1]] };
    await mount();
    expect(door()?.textContent).toBe("2 free slots in the next 7 days · See them on Openings.");
  });

  it("counts what Openings lists, not the check: a slot earlier today is no free slot now", async () => {
    vi.setSystemTime(new Date("2026-09-28T12:00:00-04:00"));
    await mount();
    expect(door()).toBeNull();
    // The check still holds Ann's 8:00 this morning, so it isn't "booked as usual": nothing is said.
    expect(stateLine()).toBeNull();
    expect(host.textContent).not.toContain("free slot");
  });

  it("says nothing is out of place when the regular is booked as usual", async () => {
    fake.schedule = { entries: [booking("2026-09-28", "08:00")], loading: false, failed: false };
    await mount();
    expect(stateLine()).toBe("All 1 agreed slot is booked as usual for the next seven days.");
    expect(door()).toBeNull();
  });

  it("says nothing about free slots until the server answers", async () => {
    fake.schedule = { entries: [], loading: true, failed: false };
    await mount();
    expect(stateLine()).toBe("Reading the week's bookings…");
    expect(door()).toBeNull();
    expect(host.textContent).not.toMatch(/free slot/i);
    // The server answers: now the empty Monday 8:00 is an answer.
    fake.schedule = { entries: [], loading: false, failed: false };
    await mount();
    expect(door()?.textContent).toBe("1 free slot in the next 7 days · See it on Openings.");
  });

  it("never calls a slot open when the bookings weren't read, or can't be", async () => {
    fake.schedule = { entries: [], loading: false, failed: true };
    await mount();
    expect(stateLine()).toContain("nothing here says a slot is open");
    expect(door()).toBeNull();
    act(() => root.unmount());
    root = createRoot(host);
    fake.schedule = { entries: [], loading: false, failed: false };
    await mount({ ...studio, mindbodyMode: "offline" } as Studio);
    expect(stateLine()).toBe("Mindbody isn't connected for this studio, so the week can't be checked against bookings.");
    expect(door()).toBeNull();
  });

  it("agrees a proposal as it stands, signed by the leader", async () => {
    fake.weeks = { ...fake.weeks, docs: [{ ...fake.weeks.docs[0], proposedBy: { id: "t-sam", name: "Sam Lee" } }, fake.weeks.docs[1]] };
    await mount();
    await click("Review: Sam Lee");
    expect(host.querySelector("[aria-label=\"Sam Lee's week\"]")).not.toBeNull();
    // Who proposed it, and when: proposedBy's reader.
    expect(host.querySelector("[data-testid='review-status']")?.textContent?.trim()).toBe("Proposed by Sam Lee on Sep 27. Not agreed yet.");
    expect(host.querySelector("#stw-each-week")?.textContent?.trim()).toBe("Each person's standing week");
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
    // Gone's Monday 10:00 regular is still ahead, and isn't counted: the same who-works-here Openings uses.
    expect(door()?.textContent).toBe("1 free slot in the next 7 days · See it on Openings.");
    expect(host.textContent).not.toContain("Judy Smith");
    // Listed after the staff, so a leader can remove it.
    expect([...host.querySelectorAll(".adm-row__name")].map((n) => n.textContent)).toEqual(["Ann Park", "Sam Lee", "Gone Away"]);
  });

  it("reads the week's bookings only when there is an agreed week to check them against", async () => {
    fake.weeks = { ...fake.weeks, docs: [fake.weeks.docs[0]] }; // Sam's proposal only
    await mount();
    expect(fake.scheduleAsked.every((s) => s === null)).toBe(true);
    expect(stateLine()).toContain("No standing week is agreed yet");
    expect(door()).toBeNull();
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
    expect(door()).toBeNull();
    // Ann's Monday regular falls in the window, on her day away: unchecked, not absent.
    expect(stateLine()).toBe("Nothing else to check: the agreed slots in the next seven days fall on days away.");
  });

  it("says once, not twice, that the weeks are still being read or couldn't be", async () => {
    fake.weeks = { docs: [], loading: true, error: null };
    await mount();
    expect(host.textContent?.split("Reading the standing weeks").length).toBe(2);
    expect(host.querySelector("#stw-each-week")?.parentElement?.textContent).toContain("Listed here once the standing weeks are read.");
    expect(host.querySelectorAll(".adm-row__name")).toHaveLength(0);
    act(() => root.unmount());
    root = createRoot(host);
    fake.weeks = { docs: [], loading: false, error: "Couldn't load the standing weeks. Check the connection." };
    await mount();
    expect(host.textContent?.split("Couldn't load the standing weeks").length).toBe(2);
    expect(host.querySelectorAll(".adm-row__name")).toHaveLength(0);
  });

  it("matches an unlinked booking on a staff id only from this studio's Mindbody site", async () => {
    // Ann's Monday 8:00 regular, booked by the webhook with no trainer id (a guest), under Ann's
    // staff id, and Bob booked with her in Judy's slot: taken, because the id is Solon's site's.
    const guest = { trainerId: undefined, trainerName: "Annie Park", mindbodyStaffId: "42" } as unknown as Partial<ScheduleEntry>;
    fake.schedule = { entries: [booking("2026-09-28", "08:00", { ...guest, clientId: "c-bob", clientName: "Bob Jones" })], loading: false, failed: false };
    const ann = (siteId: string) => ({ ...trainers[1], mindbodyStaffId: "42", mindbody: { staffId: "42", siteId } }) as unknown as Trainer;
    await act(async () => {
      root.render(<StandingWeeksPanel studio={studio} authTrainer={pat} trainers={[trainers[0], ann("5746957")]} clients={clients} />);
    });
    // Taken is no free slot: nothing points to Openings, and nothing claims "booked as usual".
    expect(door()).toBeNull();
    expect(stateLine()).toBeNull();
    // Ann's id from the other site proves nothing here: Judy's slot is simply open.
    await act(async () => {
      root.render(<StandingWeeksPanel studio={studio} authTrainer={pat} trainers={[trainers[0], ann("29068")]} clients={clients} />);
    });
    expect(door()?.textContent).toBe("1 free slot in the next 7 days · See it on Openings.");
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

  it("speaks of when trainers take clients, and a leader agrees three blocks on a day (Openings round)", async () => {
    // Ann proposed a change: two blocks on Monday where there was one.
    const twoBlocks = { ...annWeek, hours: [{ weekday: 1, from: "07:00", to: "10:00" }, { weekday: 1, from: "11:00", to: "13:00" }] };
    fake.weeks = { ...fake.weeks, docs: [fake.weeks.docs[0], { ...fake.weeks.docs[1], proposed: twoBlocks, proposedAt: new Date("2026-09-27T14:00:00Z") }] };
    await mount();
    expect(host.querySelector(".adm-panel__sub")?.textContent).toContain("Each trainer proposes their usual week — when they take clients, and their regulars — on My Profile");
    expect(host.textContent).not.toMatch(/\bhours\b/i);
    await click("Review: Ann Park");
    expect(host.querySelector("[aria-label='What the change does']")?.textContent).toBe(
      "Monday: 7:00 AM – 10:00 AM and 11:00 AM – 1:00 PM, was 7:00 AM – 1:00 PM.",
    );
    // The leader adds a third before agreeing; three is the most a day holds.
    await click("Add another block on Monday");
    expect(host.querySelector("[aria-label='Add another block on Monday']")).toBeNull();
    expect(host.querySelector("[aria-label='Monday, block 3: starts']")).not.toBeNull();
    await click("Agree it as changed");
    expect(fake.writes[0].data).toMatchObject({
      final: {
        hours: [
          { weekday: 1, from: "07:00", to: "10:00" },
          { weekday: 1, from: "11:00", to: "13:00" },
          { weekday: 1, from: "14:00", to: "18:00" },
        ],
      },
    });
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

  it("asks before the Review's Cancel throws a changed week away", async () => {
    await mountGuarded();
    await click("Change: Ann Park");
    await click("Remove Judy Smith from Monday");
    await click("Cancel");
    expect(question()).toContain("Ann's standing week");
    await act(async () => {
      bodyButton("Keep editing").click();
    });
    expect(host.querySelector("[aria-label=\"Ann Park's week\"]")).not.toBeNull();
    expect(button("Agree it as changed")).toBeTruthy();
    await click("Cancel");
    await act(async () => {
      bodyButton("Leave").click();
    });
    expect(host.querySelector("[aria-label=\"Ann Park's week\"]")).toBeNull();
    expect(fake.writes).toHaveLength(0);
  });

  it("asks before Agree closes the Review over dates away still being typed", async () => {
    await mountGuarded();
    await click("Review: Sam Lee");
    await click("Dates away");
    const from = [...host.querySelectorAll("label")].find((l) => l.textContent?.startsWith("From"))!.querySelector("input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(from, "2026-10-05");
      from.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Agree this week");
    // The week is agreed; the dates typed below it are what the question is about.
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].data).toMatchObject({ final: samProposal });
    expect(question()).toContain("You have unsaved changes to Sam's dates away.");
    await act(async () => {
      bodyButton("Keep editing").click();
    });
    // Still open, and usable: the dates can be saved.
    expect(host.querySelector("[aria-label=\"Sam Lee's week\"]")).not.toBeNull();
    expect(button("Save dates away").disabled).toBe(false);
    await click("Save dates away");
    expect(fake.writes[1].data).toMatchObject({ away: [{ from: "2026-10-05", to: "2026-10-05" }] });
  });

  it("asks before the dates-away adder's own Cancel throws typed dates away", async () => {
    await mountGuarded();
    await click("Change: Ann Park");
    await click("Dates away");
    const to = [...host.querySelectorAll("label")].find((l) => l.textContent?.startsWith("To"))!.querySelector("input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(to, "2026-10-02");
      to.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const adderCancel = host.querySelector("[aria-label='Add dates away'] .stw-btn--quiet") as HTMLButtonElement;
    await act(async () => adderCancel.click());
    expect(question()).toContain("Ann's dates away");
    await act(async () => {
      bodyButton("Leave").click();
    });
    expect(host.querySelector("[aria-label='Add dates away']")).toBeNull();
    // The Review itself stays open: only the adder closed.
    expect(host.querySelector("[aria-label=\"Ann Park's week\"]")).not.toBeNull();
  });

  it("moves between reviews without asking when nothing was changed", async () => {
    await mountGuarded();
    await click("Change: Ann Park");
    await click("Review: Sam Lee");
    expect(question()).toBe("");
    expect(host.querySelector("[aria-label=\"Sam Lee's week\"]")).not.toBeNull();
  });
});

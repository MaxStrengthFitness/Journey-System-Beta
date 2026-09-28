// @vitest-environment jsdom
/**
 * THE TRAINER PAGE'S "UPCOMING" LISTS WHAT IS AHEAD — and only that.
 *
 * The schedule the app holds starts yesterday, and a Mindbody booking never
 * comes back "Completed", so the card used to list yesterday's and this
 * morning's clients as upcoming. Since Sep 24 2026 a booking leaves the list
 * when its slot is over, or when a Journey session was completed for that
 * client that day (AJ: that is what done means). The one in its slot right
 * now stays — it is who this trainer is with.
 *
 * Mounts the real page with the real Upcoming card; the roster, the edit
 * dialog and My renewals (their own reads, their own tests) are stubbed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t1" } }, functions: {} }));
vi.mock("firebase/firestore", () => {
  const empty = { docs: [], size: 0, empty: true, forEach: () => {} };
  return {
    collection: () => ({}),
    doc: () => ({}),
    query: () => ({}),
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    Timestamp: { fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms), now: () => new Date() },
    getDocs: async () => empty,
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    onSnapshot: () => () => {},
    setDoc: async () => {},
    updateDoc: async () => {},
  };
});
vi.mock("./KaizenRoster", () => ({ KaizenRoster: () => <section data-testid="kaizen-roster" /> }));
vi.mock("./EditTrainerModal", () => ({ EditTrainerModal: () => null }));
vi.mock("../renewals/MyRenewals", () => ({ MyRenewals: () => null }));
// The standing week (voice-review round, Sep 27 2026) has its own render
// test; here only WHERE it shows is checked, so it is a marker.
const activeHolder = vi.hoisted(() => ({ value: null as null | { activeStudioId: string; activeStudio: { name: string } } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({ useOptionalActiveStudio: () => activeHolder.value }));
vi.mock("../standing-week/MyStandingWeek", () => ({
  MyStandingWeek: ({ studioName, authUid }: { studioName: string; authUid: string }) => (
    <section data-testid="standing-week" data-uid={authUid}>
      {studioName}
    </section>
  ),
}));
// Your week (Openings round, phase 11) has its own render test too; here it
// is a marker carrying what the page handed it.
vi.mock("./YourWeek", () => ({
  YourWeek: ({ studioName, trainerId, studioId }: { studioName: string; trainerId: string; studioId: string }) => (
    <section data-testid="your-week" data-trainer={trainerId} data-studio={studioId}>
      {studioName}
    </section>
  ),
}));

import { TrainerProfileView } from "./TrainerProfileView";
import type { Client, ScheduleEntry, Studio, Trainer, WorkoutSession } from "../../types";

const NOW = new Date("2026-09-24T12:00:00-04:00"); // Thursday, noon Eastern
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

const trainer = { id: "t1", fullName: "Sara Kim", initials: "SK", role: "Trainer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const studios = [{ id: "solon", name: "Solon", timezone: "America/New_York" }] as unknown as Studio[];

const booking = (id: string, clientId: string, clientName: string, day: string, hm: string): ScheduleEntry =>
  ({
    id,
    clientId,
    clientName,
    trainerId: "t1",
    trainerName: "Sara Kim",
    studioId: "solon",
    startTime: at(day, hm),
    endTime: new Date(at(day, hm).getTime() + 30 * 60_000),
    status: "Scheduled",
    serviceName: "Training Session",
    source: "MindBody",
    createdAt: null,
  }) as ScheduleEntry;

const schedules = [
  booking("b1", "c1", "Yesterday Yara", "2026-09-23", "15:00"),
  booking("b2", "c2", "Morning Mo", "2026-09-24", "08:00"), // over, never logged
  booking("b3", "c3", "Logged Lou", "2026-09-24", "11:40"), // still in its slot, but Sara ran it early and pressed End Session
  booking("b4", "c4", "Now Nia", "2026-09-24", "11:45"), // in its slot right now
  booking("b5", "c5", "Later Lee", "2026-09-24", "15:00"),
  booking("b6", "c6", "Tomorrow Tam", "2026-09-25", "10:00"),
];
const sessions = [{ id: "s3", clientId: "c3", status: "Completed", trainerId: "t1", hostedAtStudioId: "solon", startTime: at("2026-09-24", "11:05"), date: "2026-09-24" }] as unknown as WorkoutSession[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

async function mount() {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <TrainerProfileView
          trainer={trainer}
          authTrainer={trainer}
          schedules={schedules}
          sessions={sessions}
          clients={[] as Client[]}
          studios={studios}
          onSelectClient={() => {}}
          setView={() => {}}
          rosterStatus="ready"
        />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

describe("the trainer page's Upcoming", () => {
  it("lists the booking in its slot and what is ahead; drops yesterday, the finished and the logged", async () => {
    const el = await mount();
    const card = [...el.querySelectorAll("section.tp-card")].find((s) => s.querySelector(".tp-card__title")?.textContent === "Upcoming");
    expect(card).toBeTruthy();
    const names = [...card!.querySelectorAll(".tp-row__name")].map((n) => n.textContent);
    expect(names).toEqual(["Now Nia", "Later Lee", "Tomorrow Tam"]);
    expect(card!.textContent).toContain("3 booked");
  });
});

describe("My standing week on the trainer page", () => {
  const render = async (
    viewer: Trainer,
    studioId: string,
    extra: { clients?: Client[]; rosterStatus?: "loading" | "ready" | "error" } = {},
  ) => {
    activeHolder.value = { activeStudioId: studioId, activeStudio: { name: studioId === "solon" ? "Solon" : "Westlake" } };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <TrainerProfileView
          trainer={trainer}
          authTrainer={viewer}
          schedules={[]}
          sessions={[]}
          clients={extra.clients ?? ([] as Client[])}
          studios={studios}
          onSelectClient={() => {}}
          setView={() => {}}
          rosterStatus={extra.rosterStatus ?? "ready"}
        />,
      );
    });
    return host;
  };
  afterEach(() => {
    activeHolder.value = null;
  });

  it("shows on your own page, at a studio you work at, keyed by your Auth uid", async () => {
    const el = await render(trainer, "solon");
    const card = el.querySelector("[data-testid='standing-week']");
    expect(card?.textContent).toBe("Solon");
    expect(card?.getAttribute("data-uid")).toBe("t1");
  });

  it("stays off a colleague's page, and off a studio you don't work at", async () => {
    const colleague = { ...trainer, id: "t2", fullName: "Pat Doe" } as Trainer;
    expect((await render(colleague, "solon")).querySelector("[data-testid='standing-week']")).toBeNull();
    act(() => root?.unmount());
    host?.remove();
    expect((await render(trainer, "westlake")).querySelector("[data-testid='standing-week']")).toBeNull();
  });

  it("puts Your week after My standing week on your own page, for the studio the iPad is in", async () => {
    const el = await render(trainer, "solon");
    const week = el.querySelector("[data-testid='your-week']");
    expect(week?.textContent).toBe("Solon");
    expect(week?.getAttribute("data-trainer")).toBe("t1");
    expect(week?.getAttribute("data-studio")).toBe("solon");
    const standing = el.querySelector("[data-testid='standing-week']")!;
    expect(standing.compareDocumentPosition(week!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps Your week off a colleague's page: it is the trainer's own", async () => {
    const colleague = { ...trainer, id: "t2", fullName: "Pat Doe" } as Trainer;
    expect((await render(colleague, "solon")).querySelector("[data-testid='your-week']")).toBeNull();
  });

  it("puts My clients right after the Kaizen Roster on your own page, from the client list the page holds", async () => {
    const judy = { id: "judy", firstName: "Judy", lastName: "Daus", homeStudioId: "solon", isActive: true, trainerTally: { t1: 42 } } as unknown as Client;
    const el = await render(trainer, "solon", { clients: [judy], rosterStatus: "ready" });
    const roster = el.querySelector("[data-testid='kaizen-roster']")!;
    const mine = el.querySelector("[data-testid='my-clients']")!;
    expect(roster.nextElementSibling).toBe(mine);
    expect(mine.textContent).toContain("Judy Daus");
    expect(mine.textContent).toContain("42 sessions with you in Journey");
  });

  it("passes the client list's state through: loading says it can't read, not that you trained nobody", async () => {
    const judy = { id: "judy", firstName: "Judy", lastName: "Daus", homeStudioId: "solon", isActive: true, trainerTally: { t1: 42 } } as unknown as Client;
    const el = await render(trainer, "solon", { clients: [judy], rosterStatus: "loading" });
    expect(el.querySelector("[data-testid='my-clients']")?.textContent).toContain("Can't read the client list just now.");
  });

  it("after the roster's read failed, a booked client read by id is not the list: it says it can't read", async () => {
    const judy = { id: "judy", firstName: "Judy", lastName: "Daus", homeStudioId: "solon", isActive: true, trainerTally: { t1: 42 } } as unknown as Client;
    const el = await render(trainer, "solon", { clients: [judy], rosterStatus: "error" });
    const mine = el.querySelector("[data-testid='my-clients']")!;
    expect(mine.querySelectorAll("[data-testid='my-client-row']")).toHaveLength(0);
    expect(mine.textContent).toContain("Can't read the client list just now.");
    expect(mine.textContent).not.toContain("Judy Daus");
  });

  it("keeps My clients off a colleague's page: it is the trainer's own", async () => {
    const colleague = { ...trainer, id: "t2", fullName: "Pat Doe" } as Trainer;
    expect((await render(colleague, "solon")).querySelector("[data-testid='my-clients']")).toBeNull();
  });
});

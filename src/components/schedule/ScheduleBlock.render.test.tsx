// @vitest-environment jsdom
/**
 * THE HUB CARD STAYS LIVE UNTIL THE BOOKING IS DONE — and keeps its flags.
 *
 * The card used to fade the minute its start time passed, and a faded card
 * hides the red priority-note flag, the Pulse flag and the clinical dot. No
 * booking is ever "Completed" in Firestore, so a trainer a few minutes late
 * lost the flags while walking up to read them. Since Sep 24 2026 the card
 * fades when a Journey session was completed for that client that day, or
 * when the slot is over (AJ: done means logged) — and a finished slot nobody
 * logged says so, quietly. lib/hub-card-state is the rule; this mounts the
 * real card over it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ScheduleBlock } from "./ScheduleBlock";
import { loggedSessions, type LoggedSessions } from "../../lib/booking-state";
import type { Client, WorkoutSession } from "../../types";

const DAY = "2026-09-24";
const at = (hm: string) => new Date(`${DAY}T${hm}:00-04:00`);
const NOW = at("12:00"); // Thursday, noon Eastern

const PRIORITY = "Left shoulder: no overhead press";
const PULSE = "Sleep & Recovery is Red";

const client = {
  id: "c1",
  firstName: "Maria",
  lastName: "Kowalski",
  priorityNote: PRIORITY,
  clinicalNotes: "Hip replacement, 2024",
  subjectiveSnapshot: { flags: [{ severity: "red", label: PULSE }] },
} as unknown as Client;

const booking = (hm: string) => ({
  id: `b-${hm}`,
  clientId: "c1",
  clientName: "Maria Kowalski",
  trainerId: "t1",
  trainerName: "Sara Kim",
  studioId: "solon",
  startTime: at(hm),
  endTime: new Date(at(hm).getTime() + 30 * 60_000),
  status: "Scheduled",
  serviceName: "Training Session",
});

const session = (status: WorkoutSession["status"], hm: string) =>
  ({ id: `s-${hm}`, clientId: "c1", status, hostedAtStudioId: "solon", startTime: at(hm), date: DAY }) as WorkoutSession;

const NOTHING_LOGGED = loggedSessions([]);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount({
  hm,
  logged = NOTHING_LOGGED,
  workoutSession = null,
  withClient = true,
  onOpenClient = () => {},
}: {
  hm: string;
  logged?: LoggedSessions | null;
  workoutSession?: WorkoutSession | null;
  withClient?: boolean;
  onOpenClient?: (id: string) => void;
}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <ScheduleBlock
          session={booking(hm)}
          client={withClient ? client : null}
          workoutSession={workoutSession}
          logged={logged}
          now={NOW}
          onOpenClient={onOpenClient}
        />
      </StrictMode>,
    );
  });
  const card = host.firstElementChild as HTMLElement;
  return {
    card,
    faded: card.className.includes("opacity-70"),
    flags: {
      priority: !!card.querySelector(`[aria-label="${PRIORITY}"]`),
      pulse: !!card.querySelector(`[aria-label="${PULSE}"]`),
      clinical: !!card.querySelector('[aria-label="Clinical history on file"]'),
    },
    notLogged: (card.textContent || "").includes("Not logged"),
    inSession: !!card.querySelector('[aria-label="Session in progress"]'),
  };
}

const ALL_FLAGS = { priority: true, pulse: true, clinical: true };
const NO_FLAGS = { priority: false, pulse: false, clinical: false };

describe("the Hub card on the floor", () => {
  it("is live, with every flag, in its slot before the session has started — the trainer is a few minutes late", () => {
    // 11:45 to 12:15, now noon, nothing started. The old card was already grey.
    const c = mount({ hm: "11:45" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
    expect(c.notLogged).toBe(false);
  });

  it("is live, with every flag, before its start", () => {
    const c = mount({ hm: "15:00" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("is in session while a Journey session is open, and keeps its flags", () => {
    const c = mount({ hm: "11:45", workoutSession: session("In-Progress", "11:50") });
    expect(c.inSession).toBe(true);
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("stays in session past the slot while the session is still open", () => {
    const c = mount({ hm: "11:00", workoutSession: session("In-Progress", "11:10") });
    expect(c.inSession).toBe(true);
    expect(c.faded).toBe(false);
  });

  it("fades and drops its flags once a session was completed for the client today", () => {
    const done = session("Completed", "11:02");
    const c = mount({ hm: "11:00", logged: loggedSessions([done]), workoutSession: done });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(false);
  });

  it("fades as soon as End Session is pressed, even inside the slot", () => {
    const done = session("Completed", "11:40");
    const c = mount({ hm: "11:45", logged: loggedSessions([done]), workoutSession: done });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("fades with a quiet 'Not logged' when the slot is over and nothing was logged", () => {
    const c = mount({ hm: "11:00" });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(true);
  });

  it("says nothing when the sessions could not be read: faded, never 'Not logged'", () => {
    const c = mount({ hm: "11:00", logged: null });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("keeps a slot in progress live while the sessions are still loading", () => {
    const c = mount({ hm: "11:45", logged: null });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("booked twice: the later card keeps its flags until it starts, though the morning session was logged", () => {
    const c = mount({ hm: "16:00", logged: loggedSessions([session("Completed", "09:02")]) });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("a card with no profile never says 'Not logged': the cloud mark already says why", () => {
    const c = mount({ hm: "11:00", withClient: false });
    expect(c.notLogged).toBe(false);
    expect(c.card.querySelector('[aria-label="Not synced to a Max Strength profile yet"]')).toBeTruthy();
  });

  it("a 'Not logged' card still opens the client, where the session can be logged", () => {
    const onOpenClient = vi.fn();
    const c = mount({ hm: "11:00", onOpenClient });
    act(() => c.card.click());
    expect(onOpenClient).toHaveBeenCalledWith("c1");
  });
});

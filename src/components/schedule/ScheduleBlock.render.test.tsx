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
import type { JournalEntry } from "../../types/journal";

const DAY = "2026-09-24";
const FRIDAY = "2026-09-25";
const at = (hm: string, day = DAY) => new Date(`${day}T${hm}:00-04:00`);
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

const booking = (hm: string, day = DAY) => ({
  id: `b-${hm}`,
  clientId: "c1",
  clientName: "Maria Kowalski",
  trainerId: "t1",
  trainerName: "Sara Kim",
  studioId: "solon",
  startTime: at(hm, day),
  endTime: new Date(at(hm, day).getTime() + 30 * 60_000),
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
  day = DAY,
  logged = NOTHING_LOGGED,
  workoutSession = null,
  withClient = true,
  who = client,
  criticalNotes = null,
  onOpenClient = () => {},
}: {
  hm: string;
  day?: string;
  logged?: LoggedSessions | null;
  workoutSession?: WorkoutSession | null;
  withClient?: boolean;
  who?: Client;
  criticalNotes?: readonly JournalEntry[] | null;
  onOpenClient?: (id: string) => void;
}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <ScheduleBlock
          session={booking(hm, day)}
          client={withClient ? who : null}
          workoutSession={workoutSession}
          logged={logged}
          criticalNotes={criticalNotes}
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
    /** The triangle's words, when a Critical note put it there. */
    critical: card.querySelector('[aria-label^="Critical:"]')?.getAttribute("aria-label") ?? null,
    redEdge: card.className.includes("border-l-red"),
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

/* ------------------------------------------------------------------ *
 * A Critical note written in Journey marks the card (question 12 of the
 * Sep 20 audit, AJ Sep 24 2026): the red triangle only, for every trainer,
 * from one read of the day's notes — and only a note that matters on the
 * booking's day.
 * ------------------------------------------------------------------ */

/** A client with nothing on the record: whatever lights, a note lit it. */
const plain = { id: "c1", firstName: "Maria", lastName: "Kowalski" } as Client;

const SHOULDER = "Left shoulder: no overhead pressing until the MRI";
let seq = 0;
const critical = (over: Partial<JournalEntry> = {}) =>
  ({
    id: `note-${++seq}`,
    clientId: "c1",
    studioId: "solon",
    kind: "injury",
    body: SHOULDER,
    importance: "critical",
    threadId: null,
    occurredAt: at("09:00", "2026-09-10"),
    effectiveFrom: null,
    effectiveUntil: null,
    repeat: null,
    resolvedAt: null,
    isArchived: false,
    ...over,
  }) as JournalEntry;

describe("the Hub card and a Critical note", () => {
  it("shows the red triangle for a Critical note that matters today, with its words whole", () => {
    const c = mount({ hm: "15:00", who: plain, criticalNotes: [critical()] });
    expect(c.critical).toBe(`Critical: ${SHOULDER}`);
    expect(c.card.getAttribute("title")).toBe(`Critical: ${SHOULDER}`);
  });

  it("never turns the left edge red — the triangle is the one mark, a legacy priority note included", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical()] }).redEdge).toBe(false);
    act(() => root?.unmount());
    root = null;
    const legacy = mount({ hm: "15:00" });
    expect(legacy.flags.priority).toBe(true);
    expect(legacy.redEdge).toBe(false);
  });

  it("stays dark for a closed thread", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ resolvedAt: at("08:00") })] }).critical).toBeNull();
  });

  it("stays dark for an archived thread", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ isArchived: true })] }).critical).toBeNull();
  });

  it("stays dark once the note's window has run out", () => {
    const ended = critical({ effectiveUntil: at("23:59", "2026-09-23") });
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [ended] }).critical).toBeNull();
  });

  it("a window that opens tomorrow leaves today's card alone and marks tomorrow's", () => {
    const fromFriday = critical({ occurredAt: at("08:00"), effectiveFrom: at("12:00", FRIDAY) });
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [fromFriday] }).critical).toBeNull();
    act(() => root?.unmount());
    root = null;
    expect(mount({ hm: "09:00", day: FRIDAY, who: plain, criticalNotes: [fromFriday] }).critical).toBe(`Critical: ${SHOULDER}`);
  });

  it("a Heads up does not mark the Hub card", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ importance: "elevated" })] }).critical).toBeNull();
  });

  it("claims nothing while the notes are unknown", () => {
    const c = mount({ hm: "15:00", who: plain, criticalNotes: null });
    expect(c.critical).toBeNull();
    expect(c.flags.priority).toBe(false);
  });

  it("keeps the triangle while the trainer is late, and drops it once the session is logged", () => {
    expect(mount({ hm: "11:45", who: plain, criticalNotes: [critical()] }).critical).not.toBeNull();
    act(() => root?.unmount());
    root = null;
    const done = session("Completed", "11:02");
    const c = mount({ hm: "11:00", who: plain, criticalNotes: [critical()], logged: loggedSessions([done]), workoutSession: done });
    expect(c.faded).toBe(true);
    expect(c.critical).toBeNull();
  });

  it("says every live Critical note, newest first", () => {
    const older = critical({ body: "Pacemaker: no chest-compression machines", occurredAt: at("09:00", "2026-08-01") });
    const c = mount({ hm: "15:00", who: plain, criticalNotes: [older, critical()] });
    expect(c.critical).toBe(`Critical: ${SHOULDER} · Critical: Pacemaker: no chest-compression machines`);
  });
});

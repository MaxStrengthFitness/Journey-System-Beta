// @vitest-environment jsdom
/**
 * THE HUB CARD, MOUNTED (calm Hub round, Sep 28 2026). It carries over every
 * promise the old card's test held (components/schedule, deleted with it):
 *
 *   - it stays live, with every mark, until the booking is done (AJ, Sep 24:
 *     done means logged), and a finished slot nobody logged says so quietly;
 *   - once it is over it recedes and drops its marks, the triangle included
 *     (AJ, Sep 28: "once the session is done it should make a lot less noise");
 *   - a Critical note that matters on the BOOKING's day is the red triangle,
 *     its words whole in the label — and the edge never turns red;
 *
 * and adds the round's own: the marks come from the Hub's one engine (the
 * same moments the Opportunities list reads), the Pulse flag is a plum glyph,
 * "No waiver signed" is a plum glyph, the clinical dot is gone, the name is
 * the floor name whole, the number shows from #4 and only when it may be
 * quoted, and Mindbody's "Unavailable" is time that isn't a session.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HubCard } from "./HubCard";
import { loggedSessions, type LoggedSessions } from "../../lib/booking-state";
import { momentsToday, type MomentsTodayInput } from "../hub-opportunities/moments-today";
import type { Client, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

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

const booking = (hm: string, day = DAY, over: Record<string, unknown> = {}) => ({
  id: `b-${day}-${hm}`,
  clientId: "c1",
  clientName: "Maria Kowalski",
  trainerId: "t1",
  trainerName: "Sara Kim",
  studioId: "solon",
  startTime: at(hm, day),
  endTime: new Date(at(hm, day).getTime() + 30 * 60_000),
  status: "Scheduled",
  serviceName: "Training Session",
  ...over,
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
  sessionNumber = null,
  newToJourney = false,
  usualService = null,
  bookingOver = {},
  onOpen = () => {},
}: {
  hm: string;
  day?: string;
  logged?: LoggedSessions | null;
  workoutSession?: WorkoutSession | null;
  withClient?: boolean;
  who?: Client;
  criticalNotes?: readonly JournalEntry[] | null;
  sessionNumber?: number | null;
  newToJourney?: boolean;
  usualService?: string | null;
  bookingOver?: Record<string, unknown>;
  onOpen?: (id: string, anchor: HTMLElement) => void;
}) {
  // One card at a time: a second mount in a test replaces the first.
  if (root) {
    act(() => root!.unmount());
    host?.remove();
    root = null;
    host = null;
  }
  const b = booking(hm, day, bookingOver);
  const c = withClient ? who : null;
  // The Hub's one engine, asked about the booking's day: the card reads its moments.
  const input: MomentsTodayInput = {
    day,
    today: DAY,
    now: NOW,
    schedules: [b as never],
    clientsById: new Map(c ? [[c.id as string, c]] : []),
    rowsById: new Map(),
    studios: [],
    logged,
    criticalFor: () => criticalNotes,
    myIds: [],
  };
  const entry = c ? momentsToday(input).find((e) => e.clientId === c.id) ?? null : null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <HubCard
          booking={b}
          client={c}
          entry={entry}
          sessionNumber={sessionNumber}
          newToJourney={newToJourney}
          usualService={usualService}
          workoutSession={workoutSession}
          logged={logged}
          now={NOW}
          onOpen={onOpen}
        />
      </StrictMode>,
    );
  });
  const card = host.firstElementChild as HTMLElement;
  return {
    card,
    text: card.textContent || "",
    faded: card.dataset.recede === "true",
    flags: {
      priority: !!card.querySelector(`[aria-label="${PRIORITY}"]`),
      pulse: !!card.querySelector(`[aria-label="${PULSE}"]`),
      clinical: !!card.querySelector('[aria-label="Clinical history on file"]'),
    },
    notLogged: (card.textContent || "").includes("Not logged"),
    inSession: !!card.querySelector('[aria-label="Session in progress"]'),
    /** The triangle's words, when a Critical note put it there. */
    critical: card.querySelector('.hs-tri[aria-label^="Critical:"]')?.getAttribute("aria-label") ?? null,
  };
}

/** Every mark a live card shows for Maria: the triangle and the plum Pulse glyph. The clinical dot is gone. */
const ALL_FLAGS = { priority: true, pulse: true, clinical: false };
const NO_FLAGS = { priority: false, pulse: false, clinical: false };

describe("the Hub card on the floor", () => {
  it("is live, with every mark, in its slot before the session has started — the trainer is a few minutes late", () => {
    const c = mount({ hm: "11:45" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
    expect(c.notLogged).toBe(false);
  });

  it("is live, with every mark, before its start", () => {
    const c = mount({ hm: "15:00" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("is in session while a Journey session is open, and keeps its marks", () => {
    const c = mount({ hm: "11:45", workoutSession: session("In-Progress", "11:46") });
    expect(c.inSession).toBe(true);
    expect(c.text).toContain("In session");
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("stays in session past the slot while the session is still open", () => {
    const c = mount({ hm: "10:00", workoutSession: session("In-Progress", "10:01") });
    expect(c.inSession).toBe(true);
    expect(c.faded).toBe(false);
  });

  it("recedes and drops its marks once a session was completed for the client today", () => {
    const logged = loggedSessions([session("Completed", "10:05")]);
    const c = mount({ hm: "10:00", logged });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(false);
    expect(c.card.querySelector('[aria-label="Done"]')).toBeTruthy();
  });

  it("recedes as soon as End Session is pressed, even inside the slot", () => {
    const logged = loggedSessions([session("Completed", "11:55")]);
    const c = mount({ hm: "11:45", logged, workoutSession: session("Completed", "11:55") });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("recedes with a quiet 'Not logged' when the slot is over and nothing was logged", () => {
    const c = mount({ hm: "10:00" });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(true);
  });

  it("says nothing when the sessions could not be read: receded, never 'Not logged'", () => {
    const c = mount({ hm: "10:00", logged: null });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("keeps a slot in progress live while the sessions are still loading", () => {
    const c = mount({ hm: "11:45", logged: null });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("booked twice: the later card keeps its marks until it starts, though the morning session was logged", () => {
    const logged = loggedSessions([session("Completed", "09:05")]);
    const c = mount({ hm: "15:00", logged });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("a card with no profile never says 'Not logged': the cloud mark already says why, and it opens nothing", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "10:00", withClient: false, onOpen });
    expect(c.notLogged).toBe(false);
    expect(c.card.querySelector('[aria-label="Not synced to a Max Strength profile yet"]')).toBeTruthy();
    expect(c.text).toContain("Not synced yet");
    expect(c.card.getAttribute("role")).toBeNull();
    act(() => c.card.click());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("a 'Not logged' card still opens: its client is where the session can be logged", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "10:00", onOpen });
    act(() => c.card.click());
    expect(onOpen).toHaveBeenCalledWith("c1", c.card);
  });
});

describe("the card's words and marks come from the Hub's one engine", () => {
  it("the Pulse flag is a plum glyph with its words, and the clinical dot has left the card", () => {
    const c = mount({ hm: "15:00" });
    expect(c.card.querySelector(`.hs-g[aria-label="${PULSE}"]`)?.getAttribute("data-family")).toBe("watch");
    expect(c.flags.clinical).toBe(false);
  });

  it("'No waiver signed' is a plum glyph, only for a definite 'not signed'", () => {
    const unsigned = { id: "c1", firstName: "Estella", lastName: "Bolger", isLiabilityReleased: false } as unknown as Client;
    const c = mount({ hm: "15:00", who: unsigned });
    expect(c.card.querySelector('.hs-g[aria-label="No waiver signed"]')?.getAttribute("data-family")).toBe("watch");
    const unknown = { id: "c1", firstName: "Estella", lastName: "Bolger" } as unknown as Client;
    expect(mount({ hm: "15:00", who: unknown }).card.querySelector('[aria-label="No waiver signed"]')).toBeNull();
  });

  it("names the client by her floor name, whole", () => {
    const judy = { id: "c1", firstName: "Judith", nickname: "Judy", lastName: "Sackville-Baggins" } as unknown as Client;
    expect(mount({ hm: "15:00", who: judy }).card.querySelector(".hs-card-name")?.textContent).toBe("Judy Sackville-Baggins");
  });

  it("shows her number from #4, and only when it may be quoted; 1 to 3 are the Welcome glyph's to say", () => {
    expect(mount({ hm: "15:00", sessionNumber: 264 }).text).toContain("#264");
    expect(mount({ hm: "15:00", sessionNumber: 2 }).text).not.toContain("#2");
    expect(mount({ hm: "15:00", sessionNumber: null }).text).not.toContain("#");
  });

  it("says 'New to Journey' in the number's place when her story began before the cutover", () => {
    expect(mount({ hm: "15:00", newToJourney: true }).text).toContain("New to Journey");
  });

  it("names its service only when it isn't the day's usual one", () => {
    const usual = "1:1 Strength Training";
    expect(mount({ hm: "15:00", usualService: usual, bookingOver: { serviceName: usual } }).text).not.toContain(usual);
    expect(mount({ hm: "15:00", usualService: usual, bookingOver: { serviceName: "InBody Scan" } }).text).toContain("InBody Scan");
  });

  it("gives a booking that isn't the usual half hour its span (a 45-minute consult)", () => {
    const c = mount({ hm: "15:00", bookingOver: { endTime: at("15:45"), serviceName: "New Client Consultation" } });
    expect(c.text).toContain("3:00 – 3:45 PM");
    expect(c.card.querySelector('.hs-g[aria-label="Consultation"]')).toBeTruthy();
  });

  it("draws Mindbody's 'Unavailable' as time that isn't a session: never a button, never counted as her", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "12:00", withClient: false, bookingOver: { clientId: "", clientName: "Unavailable", endTime: at("12:30") }, onOpen });
    expect(c.card.dataset.kind).toBe("staff");
    expect(c.text).toContain("Unavailable");
    expect(c.text).toContain("12:00 – 12:30 PM");
    expect(c.card.getAttribute("role")).toBeNull();
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

  it("the triangle is the one red mark — a legacy priority note included — and spends no glyph", () => {
    const legacy = mount({ hm: "15:00", who: { ...plain, priorityNote: "Pacemaker" } as Client });
    expect(legacy.card.querySelectorAll(".hs-tri")).toHaveLength(1);
    expect(legacy.card.querySelectorAll(".hs-g")).toHaveLength(0);
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
